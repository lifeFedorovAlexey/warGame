import fs from 'node:fs';
import {fixture} from './check-start-latency-coordinator.mjs';
import {vehicleClearance} from '../campaign/vehicle-collision.js';
const count=Number(process.argv.find(x=>x.startsWith('--count='))?.split('=')[1]??3);
const m=fixture(),units=Array.from({length:count},(_,i)=>m.addUnit('bukhanka','rai',{x:(i-(count-1)/2)*30,y:0},{heading:0}));
const target=m.addStructure('camp-core','scavs',{x:0,y:90},{completed:true,hp:100000,maxHp:100000});
m.rebuildNavigation();m.visible.fill(1);m.explored.fill(1);
m.submitOrder(units.map(u=>u.id),'attack',target);
for(let i=0;i<160;i++)m.advance(1/80,{budgetMs:6});
const contacts=[],history=[],collision=m.vehicleCollision.bind(m);
m.vehicleCollision=(u,speed,blockers)=>{if(blockers.size)contacts.push({time:m.state.time,speed,unit:structuredClone(u),
 blockers:[...blockers].map(b=>({...structuredClone(b),gap:vehicleClearance(u,b,m.config.worldScale,m.field)}))});return collision(u,speed,blockers);};
m.submitOrder(units.map(u=>u.id),'attack-move',{x:0,y:-180});let last=-1;
for(let i=0;i<80*6;i++){
 m.advance(1/80,{budgetMs:6});m.effects=[];
 if(last!==m.state.time){last=m.state.time;history.push({time:last,units:structuredClone(units),decisions:[...m.trafficCoordinator.decisions]});}
}
fs.writeFileSync('campaign/reports/interruption-contact.json',JSON.stringify({contacts,history},null,2));
console.log(JSON.stringify({contacts:contacts.map(c=>({time:c.time,id:c.unit.id,speed:c.speed,blockers:c.blockers.map(b=>({id:b.id,gap:b.gap}))}))}));
