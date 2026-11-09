import assert from 'node:assert/strict';
import fs from 'node:fs';
import {progressMission} from './check-navigation-public-progress.mjs';
import {cooperativeArrivalReady} from '../campaign/traffic-start.js';
import {vehicleClearance} from '../campaign/vehicle-collision.js';

// Unmodified save from a public 50-car command. A complete checked arrival
// existed here, but unrelated moving neighbours disabled its controller.
const m=progressMission();m.load(JSON.parse(fs.readFileSync('tools/fixtures/navigation-cooperative-arrival.json')));
m.state.bounds=[0,0,127,127];m.rebuildNavigation();
const subject=m.entity('u177'),units=m.state.units,goal=structuredClone(subject.routeOrder.destination);
const goals=new Map(units.filter(u=>u.routeOrder).map(u=>[u.id,structuredClone(u.routeOrder.destination)]));
const health=new Map(units.map(u=>[u.id,u.hp])),start=m.state.time,wall=performance.now();
assert(units.some(u=>u!==subject&&(u.driveSpeed??0)>.01),'The fixture must retain the surrounding moving traffic');
assert(cooperativeArrivalReady(m,{...subject,driveWatch:{...subject.driveWatch,attempts:3}},goal),
 'Unrelated movement cannot prohibit recovery after repeated failed attempts');
const contacts=[],hit=m.vehicleCollision.bind(m);
m.vehicleCollision=(u,s,b)=>{if(b.size)contacts.push({id:u.id,time:m.state.time,blockers:[...b].map(v=>v.id)});return hit(u,s,b);};
const done=()=>!subject.task&&!subject.path.length&&!subject.detour&&!subject.yieldReturn&&!subject.pendingOrder;
let minGap=Infinity;
for(let i=0;i<120&&!done();i++){
 m.tick(.1);
 for(const u of units){assert.equal(u.hp,health.get(u.id));if(goals.has(u.id))assert.deepEqual(u.routeOrder.destination,goals.get(u.id));}
 for(let a=0;a<units.length;a++)for(let b=0;b<a;b++)minGap=Math.min(minGap,vehicleClearance(units[a],units[b],m.config.worldScale,m.field));
}
assert(done()&&Math.hypot(subject.x-goal.x,subject.y-goal.y)<.65,'The normal controller must execute the accepted arrival without another click');
assert(minGap>0&&contacts.length===0,JSON.stringify({minGap,contacts}));
console.log(JSON.stringify({passed:true,seconds:m.state.time-start,wallSeconds:(performance.now()-wall)/1000,minGap,contacts}));
