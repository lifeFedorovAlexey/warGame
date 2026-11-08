import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createMapSampleMission,disableMapSampleBattle} from './check-navigation-map-samples.mjs';
import {turningHeadway} from '../campaign/turning-headway.js';
import {driveStep} from '../campaign/vehicle-motion.js';
import {vehicleDynamics} from '../campaign/vehicle-dynamics.js';

// Preserved seeded production failure: stationary u45 spent 42.5 seconds
// facing an occupied requested curve even though two alternative arcs were
// physically clear. All original vehicles/buildings remain in the replay.
const path='tools/fixtures/stopped-curve.json';
const data=JSON.parse(fs.readFileSync(path)),m=createMapSampleMission(data.config);
m.load(data.finalSave);m.state.bounds=data.finalSave.state.bounds.slice();m.rebuildNavigation();disableMapSampleBattle(m);
const unit=m.entity('u45'),point=unit.path[0],scale=m.config.worldScale,dt=.1;
const start={x:unit.x,y:unit.y},goal={...unit.routeOrder.destination};
assert.equal(unit.driveSpeed,0);m.unitIndex.rebuild(m.state.units);m.unitIndexActive=true;m.trafficCoordinator.update(m);
const requested=Math.tan(Math.max(-vehicleDynamics(unit).steeringLimit,Math.min(vehicleDynamics(unit).steeringLimit,
 Math.atan2(Math.sin(Math.atan2(unit.x-point.x,point.y-unit.y)-unit.heading),
 Math.cos(Math.atan2(unit.x-point.x,point.y-unit.y)-unit.heading))*1.55)));
const blockers=new Set(),limit=curve=>turningHeadway(m,unit,point,dt,scale,blockers,.52,curve),requestedLimit=limit(requested);
assert.equal(requestedLimit,0);assert.equal(m.trafficCoordinator.limit(unit),Infinity);
const slope=m.field.gradientAt(unit.x,unit.y),d=Math.hypot(point.x-unit.x,point.y-unit.y),
 grade=(slope.x*(point.x-unit.x)+slope.y*(point.y-unit.y))/d;
const options={speed:m.unitSpec(unit).speed,grade,scale,tolerance:2,allowed:(a,b)=>m.vehicleMotionClear(unit,a,b),curveLimit:limit};
const pose=driveStep(unit,point,dt,{...options,trafficLimit:Infinity});
assert(pose&&Math.hypot(pose.x-unit.x,pose.y-unit.y)>.01,'Blocked main curve must not suppress a safe checked alternative from rest');
assert.equal(driveStep(unit,point,dt,{...options,trafficLimit:0}),null,'A real common reservation still blocks every alternative');
let predictions=0;
assert.equal(driveStep(unit,point,dt,{...options,trafficLimit:0,curveLimit:()=>{predictions++;return Infinity;}}),null);
assert.equal(predictions,0,'No curve can move under the shared zero limit: do not compute three futile braking forecasts');
m.unitIndexActive=false;
let contacts=0,first=null;const collision=m.vehicleCollision;
m.vehicleCollision=function(...args){if(args[2]?.size)contacts++;return collision.apply(this,args);};
for(let i=0;i<10;i++){
 m.tick(dt);
 if(first===null&&Math.hypot(unit.x-start.x,unit.y-start.y)>.01)first=(i+1)*dt;
 assert.deepEqual(unit.routeOrder.destination,goal,'The escape cannot change its accepted destination');
}
assert(first!==null&&first<=.5,'Production Mission must permit the same safe departure within .5 sim seconds');
// Continue the actual frozen scene all the way to the original destination.
// No extra order, pose correction or replacement route is injected.
const arrived=()=>!unit.task&&!unit.path.length&&!unit.detour&&!unit.yieldReturn&&Math.hypot(unit.x-goal.x,unit.y-goal.y)<2;
const began=m.state.time;
while(!arrived()&&m.state.time-began<180){m.tick(dt);assert.deepEqual(unit.routeOrder.destination,goal);}
assert(arrived(),'Starting to move is insufficient: the frozen car must reach its original accepted destination');
assert.equal(contacts,0);
console.log(JSON.stringify({passed:true,first,requested,requestedLimit,executedCurve:Math.tan(pose.steering),
 originalGoal:goal,position:{x:unit.x,y:unit.y},arrivalSeconds:m.state.time-began+1,contacts},null,2));
