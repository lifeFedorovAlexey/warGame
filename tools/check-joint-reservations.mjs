import assert from 'node:assert/strict';
import {progressMission} from './check-navigation-public-progress.mjs';
import {checkManeuver} from '../campaign/vehicle-motion.js';
import {jointIntent,jointPose,jointTopology,stepJointTraffic} from '../campaign/traffic-joint.js';
import {recordYieldStep,rememberYieldHome} from '../campaign/traffic-start.js';
import {reserveManeuverCorridor,corridorBlocker,invalidateTrafficCorridors} from '../campaign/traffic-corridor.js';

// Reservation lifecycle contract. Three separated lanes make it unambiguous
// which swept space is physically free after each completed phase.
const m=progressMission(),owner=m.addUnit('bukhanka','rai',{x:0,y:0}),
 donor=m.addUnit('bukhanka','rai',{x:80,y:0}),helper=m.addUnit('bukhanka','rai',{x:-80,y:0});
owner.path=[{x:0,y:20}];owner.task={type:'move',x:0,y:20};owner.routeOrder={destination:{x:0,y:20}};
for(const u of [donor,helper])u.routeOrder={destination:{x:u.x,y:u.y}};
const members=[owner,donor,helper],token='reservation-contract',poses=new Map(members.map(u=>[u.id,{...u}]));
const schedule=[[helper,1,false],[donor,1,false],[helper,-1,true],[owner,1,false],[donor,-1,true]];
const phases=schedule.map(([body,direction,returning])=>{
 const from=poses.get(body.id),legs=[{direction,curve:0,remaining:20}],
  corridor=reserveManeuverCorridor(m,from,legs,(a,b)=>m.vehicleMotionClear(body,a,b));
 assert(corridor);poses.set(body.id,checkManeuver(from,legs,m.config.worldScale,()=>true));
 return {id:body.id,legs,returning,arrival:body===owner,corridor};
});
for(const body of [donor,helper]){rememberYieldHome(body,[owner],false,m.state.time,m);body.yieldReturn.jointToken=token;}
for(const body of members)body.jointTraffic={owner:owner.id,token,revision:body.commandRevision};
owner.detour={legs:[],reservedCorridor:phases.flatMap(p=>p.corridor),joint:{token,goal:{x:0,y:20},topology:jointTopology(m),
 cursor:0,members:members.map(u=>({id:u.id,intent:jointIntent(u),pose:jointPose(u)})),phases}};
invalidateTrafficCorridors(m);
const driveUntil=phase=>{
 for(let i=0;i<300&&owner.detour?.joint&&owner.detour.joint.cursor<phase;i++){
  m.state.time+=.1;stepJointTraffic(m,m.entity(owner.detour.joint.phases[owner.detour.joint.cursor].id),.1,recordYieldStep);
 }
};
const outsider={id:'outsider',kind:owner.kind,owner:owner.owner},vacated={x:-80,y:30,heading:0,kind:owner.kind};
assert.equal(corridorBlocker(m,outsider,vacated,vacated)?.id,owner.id);
driveUntil(3);assert.equal(owner.detour.joint.cursor,3);assert(Math.abs(helper.y)<1e-6);
assert.equal(corridorBlocker(m,outsider,vacated,vacated)?.id,undefined,'Completed helper travel cannot keep an empty lane reserved');
assert(m.vehicleMotionClear(outsider,vacated,vacated),'The released space is physically free too');
const future={...vacated,x:0};assert.equal(corridorBlocker(m,outsider,future,future)?.id,owner.id,'The next phase stays protected');
driveUntil(4);assert.equal(owner.detour.joint.cursor,4);
assert(!owner.path.length&&!owner.task,'An arrived requester must stop advertising its old route while donors return');
assert.equal(corridorBlocker(m,outsider,{...future,x:80},{...future,x:80})?.id,owner.id,'The outstanding donor return is still protected');
driveUntil(5);assert(members.every(u=>!u.jointTraffic&&!u.detour&&!u.yieldReturn));
console.log(JSON.stringify({passed:true,checks:8}));
