import fs from 'node:fs';
import {fixture} from './check-start-latency-coordinator.mjs';
import {vehicleClearance} from '../campaign/vehicle-collision.js';
const m=fixture(),units=Array.from({length:20},(_,i)=>m.addUnit('bukhanka','rai',{x:(i%4-1.5)*35,y:-Math.floor(i/4)*35-55},{heading:0}));
m.addStructure('factory','rai',{x:0,y:40},{completed:true,progress:1});
const target=m.addStructure('camp-core','scavs',{x:0,y:140},{completed:true,progress:1,hp:100000,maxHp:100000});
m.rebuildNavigation();m.visible.fill(1);m.explored.fill(1);
const contacts=[],history=[],limits=[],clearFailures=[];
const pose=u=>structuredClone({id:u.id,x:u.x,y:u.y,heading:u.heading,v:u.driveSpeed,steering:u.steering,reversing:u.reversing,
 path:u.path,task:u.task,detour:u.detour,passingLane:u.passingLane,watch:u.driveWatch,navigation:u.navigation});
const collision=m.vehicleCollision.bind(m);m.vehicleCollision=(u,speed,blockers)=>{
 contacts.push({time:m.state.time,speed,unit:pose(u),obstacles:[...blockers].map(b=>({...pose(b),gap:vehicleClearance(u,b,m.config.worldScale,m.field)}))});
 return collision(u,speed,blockers);
};
const traffic=m.trafficSpeed.bind(m);m.trafficSpeed=(u,...args)=>{
 const result=traffic(u,...args);if(u.id==='u49'&&m.state.time>4&&m.state.time<9)limits.push({time:m.state.time,result,unit:pose(u),course:args[0]});return result;
};
const clear=m.vehicleMotionClear.bind(m);m.vehicleMotionClear=(u,from,to,...args)=>{
 const result=clear(u,from,to,...args);if(!result&&u.id==='u49'&&m.state.time>4&&m.state.time<9)
  clearFailures.push({time:m.state.time,from:{x:from.x,y:from.y,heading:from.heading},to:{x:to.x,y:to.y,heading:to.heading},caller:new Error().stack.split('\n')[2]?.trim()});
 return result;
};
m.submitOrder(units.map(u=>u.id),'attack',target);let previous=-1;
for(let i=0;i<12*80;i++){
 m.advance(1/80,{budgetMs:6});m.effects=[];
 if(m.state.time!==previous){previous=m.state.time;history.push({time:previous,units:units.filter(u=>['u49','u53'].includes(u.id)).map(pose)});}
}
fs.writeFileSync('campaign/reports/contact-timeline.json',JSON.stringify({contacts,history,limits,clearFailures},null,2));
console.log(JSON.stringify({contacts,report:'campaign/reports/contact-timeline.json'}));
