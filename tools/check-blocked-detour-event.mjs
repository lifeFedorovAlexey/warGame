import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createMapSampleMission,disableMapSampleBattle} from './check-navigation-map-samples.mjs';
import {checkedDetourAlternative} from '../campaign/traffic-shortcut.js';
import {fixture} from './check-start-latency-coordinator.mjs';

const data=JSON.parse(fs.readFileSync('tools/fixtures/map-blocked-detour.json'));
const m=createMapSampleMission(data.config),saved=structuredClone(data.save),bounds=saved.state.bounds.slice();
m.load(saved);m.state.bounds=bounds;m.rebuildNavigation();m.updateFog();disableMapSampleBattle(m);
const u=m.entity(data.unitId),start={x:u.x,y:u.y},goal=structuredClone(u.routeOrder.destination),began=m.state.time;
const originalGoals=new Map(m.state.units.filter(v=>v.routeOrder).map(v=>[v.id,structuredClone(v.routeOrder.destination)]));
const hp=new Map(m.state.units.map(v=>[v.id,v.hp]));let contacts=0,first=null,complete=null;
const collision=m.vehicleCollision.bind(m);m.vehicleCollision=(...args)=>{contacts++;return collision(...args);};
const displacement={};
for(let tick=1;tick<=600;tick++){
 m.advance(.1);const elapsed=m.state.time-began,d=Math.hypot(u.x-start.x,u.y-start.y);
 if(first===null&&d>.1)first=elapsed;
 if([10,30,100].includes(tick))displacement[tick/10]=d;
 for(const[id,destination]of originalGoals)assert.deepEqual(m.entity(id).routeOrder?.destination,destination,'Accepted goals stay immutable');
 if(!u.task&&Math.hypot(u.x-goal.x,u.y-goal.y)<2){complete=elapsed;break;}
}
assert(first!==null&&first<=.50001,'An already feasible alternative cannot wait for the expired detour');
assert(displacement[1]>2&&displacement[3]>4&&displacement[10]>30,'Movement must continue beyond the first tiny offset');
assert(complete!==null&&complete<40,'The real controller reaches the original goal');
assert.equal(contacts,0);for(const[id,previous]of hp)assert.equal(m.entity(id).hp,previous);

// A failed local alternative is cached by physical conditions. This helper
// cannot bypass a blocked hull, a newer command or a cooperative manoeuvre.
const blocked=fixture(),v=blocked.addUnit('bukhanka','rai',{x:0,y:0});
v.path=[{x:0,y:200}];v.task={type:'move',x:0,y:200};
const obstacles=[[-12,0],[12,0],[0,24],[0,-24]].map(([x,y])=>blocked.addUnit('bukhanka','scav',{x,y}));
v.detour={legs:[{direction:1,curve:0,remaining:5.4}],parking:false,blocked:.1};
const plan=blocked.planManeuverSteps.bind(blocked);let searches=0;
blocked.planManeuverSteps=function*(...args){searches++;return yield* plan(...args);};
const finish=iterator=>{let s;do{s=iterator.next();}while(!s.done);return s.value;};
const allowed=(a,b)=>blocked.vehicleMotionClear(v,a,b);
for(let i=0;i<5;i++)assert.equal(finish(checkedDetourAlternative(blocked,v,v.detour,v.path[0],allowed)),null);
assert.equal(searches,1,'Five unchanged probes use one negative geometric result');
const savedBlocked=blocked.save();obstacles.find(other=>other.y>0).hp=0;
assert(finish(checkedDetourAlternative(blocked,v,v.detour,v.path[0],allowed)),'An opening invalidates the failed result immediately');
assert.equal(searches,2);
const loaded=fixture(),loadedBounds=blocked.state.bounds.slice();loaded.load(savedBlocked);loaded.state.bounds=loadedBounds;loaded.rebuildNavigation();
loaded.entity(obstacles.find(other=>other.y>0).id).hp=0;
const loadedUnit=loaded.entity(v.id);
assert(finish(checkedDetourAlternative(loaded,loadedUnit,loadedUnit.detour,loadedUnit.path[0],(a,b)=>loaded.vehicleMotionClear(loadedUnit,a,b))),
 'Loading cannot preserve an obsolete failure');
for(const flag of ['parking','idleYield','yieldReturning','departure','passageExit','progressRecovery','pickup','arrival','rough']){
 const protectedPlan={...v.detour,[flag]:true};v.detour=protectedPlan;
 assert.equal(finish(checkedDetourAlternative(blocked,v,protectedPlan,v.path[0],allowed)),null);
 delete protectedPlan[flag];
}
for(const change of ['pending-command','revision','topology','body-pose','replacement-plan']){
 delete v.pendingOrder;v.detour={legs:[{direction:1,curve:0,remaining:5.4}],blocked:.1};
 blocked.nav.workDeadline=-Infinity;
 const stale=checkedDetourAlternative(blocked,v,v.detour,v.path[0],allowed);
 assert.equal(stale.next().done,false,'The bounded search yields under the shared navigation deadline');
 if(change==='pending-command')v.pendingOrder={revision:9};
 if(change==='revision')v.commandRevision=(v.commandRevision??0)+1;
 if(change==='topology')blocked.nav.topologyRevision++;
 if(change==='body-pose')obstacles[0].x-=1;
 if(change==='replacement-plan')v.detour={legs:[],arrival:true};
 blocked.nav.workDeadline=Infinity;
 assert.equal(finish(stale),null,`A sliced proof must be invalidated by ${change}`);
}
// Admission may see a fast legacy vehicle far beyond 22*scale. Its change
// must invalidate the same cached proof even with the live spatial index.
const distant=fixture(),car=distant.addUnit('bukhanka','rai',{x:0,y:0});
car.path=[{x:0,y:200}];car.task={type:'move',x:0,y:200};
car.detour={legs:[{direction:1,curve:0,remaining:5.4}],blocked:.1};
[[-12,0],[12,0],[0,24],[0,-24]].forEach(([x,y])=>distant.addUnit('bukhanka','scav',{x,y}));
const fast=distant.addUnit('bukhanka','scav',{x:0,y:140},{heading:Math.PI,driveSpeed:90});
distant.unitIndex.rebuild(distant.state.units);distant.unitIndexActive=true;
let farSearches=0;const farPlan=distant.planManeuverSteps.bind(distant);
distant.planManeuverSteps=function*(...args){farSearches++;return yield* farPlan(...args);};
const farAllowed=(a,b)=>distant.vehicleMotionClear(car,a,b);
assert.equal(finish(checkedDetourAlternative(distant,car,car.detour,car.path[0],farAllowed,.1)),null);
assert.equal(finish(checkedDetourAlternative(distant,car,car.detour,car.path[0],farAllowed,.1)),null);
assert.equal(farSearches,1);
fast.driveSpeed=80;distant.unitIndex.update(fast);
assert.equal(finish(checkedDetourAlternative(distant,car,car.detour,car.path[0],farAllowed,.1)),null);
assert.equal(farSearches,2,'A changed far braking body invalidates the negative cache');
console.log(JSON.stringify({first,displacement,complete,contacts,goalError:Math.hypot(u.x-goal.x,u.y-goal.y),
 negativeSearches:2,saveLoad:'invalidated',staleProofs:5,specialPlans:'preserved',farBrakingChange:'invalidated'}));
