import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture,config} from './check-start-latency-coordinator.mjs';
import {vehicleClearance} from '../campaign/vehicle-collision.js';

// Physical snapshot from the actual twenty-car attack, t=22.9 s. Previously
// u62 left its yielding manoeuvre, turned back across u55's approach, and
// produced a physical callback at t=23.5 s (speed 6.0656, hull gap .5487).
// This isolates execution of those accepted routes from combat allocation.
const m=fixture(),car=(pose,path)=>m.addUnit('bukhanka','rai',pose,{...pose,path,
 task:{type:'move',...path.at(-1)}});
const a=car({x:81.83516634703419,y:5.609311547999546,heading:.009782832673401257,driveSpeed:4.4,steering:.008544326578818297,reversing:false},
 [{x:80,y:128},{x:69.4649175233779,y:182.81571246015073}]);
const b=car({x:101.76986355268106,y:26.198006533739477,heading:1.8311202536530018,driveSpeed:2.2,steering:.72,reversing:false},
 [{x:128,y:24},{x:152,y:104},{x:144,y:128},{x:120,y:152},{x:80.47375921874037,y:153.51051728114805}]);
const units=[a,b],goals=units.map(u=>({...u.path.at(-1)})),contacts=[],collision=m.vehicleCollision.bind(m);
m.vehicleCollision=(u,speed,blockers)=>{if(blockers.size)contacts.push({time:m.state.time,unit:u.id,speed,blockers:[...blockers].map(b=>b.id)});return collision(u,speed,blockers);};
let minimum=Infinity;
for(let tick=0;tick<900&&units.some(u=>u.task||u.path.length||u.detour);tick++){
 m.advance(.1);m.effects=[];minimum=Math.min(minimum,vehicleClearance(a,b,config.worldScale,m.field));
}
const errors=units.map((u,i)=>Math.hypot(u.x-goals[i].x,u.y-goals[i].y));
const result={passed:!contacts.length&&minimum>=0&&errors.every(e=>e<2.5)&&units.every(u=>!u.task&&!u.path.length&&!u.detour&&u.hp===u.maxHp),
 seconds:m.state.time,minimum,errors,contacts,hp:units.map(u=>u.hp)};
fs.writeFileSync('campaign/reports/turning-admission.json',JSON.stringify(result,null,2));
if(!result.passed)fs.writeFileSync('tools/fixtures/turning-admission-failed.json',m.save());
console.log(JSON.stringify(result));assert(result.passed,'Turning admission must prevent contact and preserve both original destinations');
