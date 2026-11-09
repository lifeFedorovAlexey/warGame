import assert from 'node:assert/strict';
import fs from 'node:fs';
import {progressMission} from './check-navigation-public-progress.mjs';
import {vehicleClearance} from '../campaign/vehicle-collision.js';

// Unmodified public-order failure: the first donor parking candidate cleared
// a straight ray but prevented the complete requester arrival or donor return.
const m=progressMission();m.load(JSON.parse(fs.readFileSync('tools/fixtures/navigation-arrival-alternatives.json')));
m.state.bounds=[0,0,127,127];m.rebuildNavigation();
const units=m.state.units,subject=m.entity('u175'),start=m.state.time,wall=performance.now();
const goals=new Map(units.filter(u=>u.routeOrder).map(u=>[u.id,structuredClone(u.routeOrder.destination)]));
const health=new Map(units.map(u=>[u.id,u.hp])),donors=new Set();let contacts=0,minGap=Infinity,arrivedAt=null;
const hit=m.vehicleCollision;m.vehicleCollision=function(u,s,b){if(b.size)contacts++;return hit.call(this,u,s,b);};
const done=u=>!u.path.length&&!u.task&&!u.detour&&!u.yieldReturn&&!u.pendingOrder;
for(let i=0;i<200&&performance.now()-wall<60000;i++){
 m.tick(.1);if(subject.detour?.cooperativeYield)donors.add(subject.detour.cooperativeYield);
 for(const u of units){assert.equal(u.hp,health.get(u.id));if(goals.has(u.id))assert.deepEqual(u.routeOrder.destination,goals.get(u.id));}
 for(let a=0;a<units.length;a++)for(let b=0;b<a;b++)minGap=Math.min(minGap,vehicleClearance(units[a],units[b],m.config.worldScale,m.field));
 if(done(subject)&&[...donors].every(id=>done(m.entity(id)))){arrivedAt=m.state.time-start;break;}
}
assert(arrivedAt!==null&&donors.size,'Normal recovery must complete both arrival and borrowed-space return: '+JSON.stringify({seconds:m.state.time-start,donors:[...donors],subject:subject.navigation,returning:[...donors].filter(id=>!done(m.entity(id)))}));
for(const id of [subject.id,...donors]){const u=m.entity(id),g=goals.get(id);assert(Math.hypot(u.x-g.x,u.y-g.y)<2.01);}
assert(minGap>0&&contacts===0,JSON.stringify({minGap,contacts}));
console.log(JSON.stringify({passed:true,subject:subject.id,donors:[...donors],seconds:arrivedAt,wallSeconds:(performance.now()-wall)/1000,minGap,contacts}));
