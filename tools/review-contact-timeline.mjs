import fs from 'node:fs';
import {fixture} from './check-start-latency-coordinator.mjs';
import {vehicleClearance} from '../campaign/vehicle-collision.js';
if(process.argv.includes('--warmup')){
 const warm=fixture(),cars=Array.from({length:6},(_,i)=>warm.addUnit('bukhanka','rai',{x:(i%3-1)*35,y:-Math.floor(i/3)*35-55}));
 warm.addStructure('factory','rai',{x:0,y:40},{completed:true,progress:1});
 const target=warm.addStructure('camp-core','scavs',{x:0,y:140},{completed:true,progress:1,hp:100000,maxHp:100000});
 warm.rebuildNavigation();warm.visible.fill(1);warm.explored.fill(1);const fired=new Set(),attack=warm.attack.bind(warm);
 warm.attack=(u,...args)=>{const result=attack(u,...args);if(result&&u.owner==='rai')fired.add(u.id);return result;};
 warm.submitOrder(cars.map(u=>u.id),'attack',target);
 for(let frame=0;frame<6400&&fired.size<6;frame++){warm.advance(1/80,{budgetMs:6});warm.effects=[];}
}
const m=fixture(),units=Array.from({length:20},(_,i)=>m.addUnit('bukhanka','rai',{x:(i%4-1.5)*35,y:-Math.floor(i/4)*35-55},{heading:0}));
m.addStructure('factory','rai',{x:0,y:40},{completed:true,progress:1});
const target=m.addStructure('camp-core','scavs',{x:0,y:140},{completed:true,progress:1,hp:100000,maxHp:100000});
m.rebuildNavigation();m.visible.fill(1);m.explored.fill(1);
const seconds=Number(process.argv.find(v=>v.startsWith('--seconds='))?.split('=')[1]??80);
const contacts=[],history=[],defects=[];let firstContact=null;
const pose=u=>structuredClone({id:u.id,x:u.x,y:u.y,heading:u.heading,v:u.driveSpeed,steering:u.steering,reversing:u.reversing,
 path:u.path,task:u.task,detour:u.detour,passingLane:u.passingLane,watch:u.driveWatch,navigation:u.navigation});
const collision=m.vehicleCollision.bind(m);m.vehicleCollision=(u,speed,blockers)=>{
 if(blockers.size){
  const event={time:m.state.time,speed,unit:pose(u),obstacles:[...blockers].map(b=>({...pose(b),gap:vehicleClearance(u,b,m.config.worldScale,m.field)}))};
  contacts.push(event);firstContact??={event,history:structuredClone(history),stateAtContact:structuredClone(m.state)};
 }
 return collision(u,speed,blockers);
};
m.submitOrder(units.map(u=>u.id),'attack',target);let previous=-1;
for(let i=0;i<seconds*80;i++){
 m.advance(1/80,{budgetMs:6});m.effects=[];
 if(m.state.time!==previous){previous=m.state.time;history.push({time:previous,units:units.map(u=>({...pose(u),decision:m.trafficCoordinator.decisions.get(u.id)}))});if(history.length>50)history.shift();
  const affected=units.filter(u=>u.navigation?.potentialDefect);
  if(affected.length)defects.push({time:previous,units:affected.map(pose),cycles:m.navigationDiagnostics?.cycles,traffic:structuredClone(m.trafficCoordinator.statistics)});
 }
}
fs.writeFileSync('campaign/reports/contact-timeline.json',JSON.stringify({contacts,firstContact,history,defects},null,2));
console.log(JSON.stringify({contacts:contacts.map(c=>({time:c.time,unit:c.unit.id,speed:c.speed,obstacles:c.obstacles.map(o=>({id:o.id,gap:o.gap}))})),defectTicks:defects.length,report:'campaign/reports/contact-timeline.json'}));
