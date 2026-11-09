import assert from 'node:assert/strict';
import fs from 'node:fs';
import {progressMission} from './check-navigation-public-progress.mjs';
import {checkedCooperativeArrival} from '../campaign/traffic-start.js';
import {checkManeuver,clearOfVehicles} from '../campaign/vehicle-motion.js';
import {vehicleClearance} from '../campaign/vehicle-collision.js';
import {invalidateTrafficCorridors,reserveManeuverCorridor} from '../campaign/traffic-corridor.js';

const m=progressMission(),unit=m.addUnit('bukhanka','rai',{x:0,y:0}),donor=m.addUnit('bukhanka','rai',{x:0,y:22}),
 unrelated=m.addUnit('bukhanka','rai',{x:70,y:70});
assert(m.submitOrder([unit.id],'move',{x:0,y:100}).ok);
assert(m.submitOrder([donor.id],'move',{x:0,y:22}).ok);
for(let i=0;i<100&&(unit.pendingOrder||donor.pendingOrder);i++)m.advance(0);
assert(!unit.pendingOrder&&!donor.pendingOrder);m.tick(.1);m.tick(.1);
assert(!donor.task&&!donor.path.length,'The blocking donor has completed its own public order');
for(const [x,y,halfWidth,halfDepth] of [[-9,10,2,40],[9,10,2,40],[0,-14,11,2],[0,38,11,2]])
 m.addStructure('generator','rai',{x,y},{halfWidth,halfDepth});
m.rebuildNavigation();
let searches=0;const original=m.planManeuverSteps;
m.planManeuverSteps=function*(...args){searches++;return yield* original.apply(this,args);};
const recover=()=>{const it=checkedCooperativeArrival(m,unit,unit.routeOrder.destination,{cooperate:true});let step;do{step=it.next();}while(!step.done);return step.value;};
assert.equal(recover(),null);const first=searches;assert(first>0);
const route=unit.path;unit.path=[{x:unit.x+3,y:unit.y},...route];
assert.equal(recover(),null);assert.equal(searches,first,'Changing only bypass waypoints does not change a rejected complete arrival to the same accepted destination');
unit.path=route;
unrelated.x++;unit.steering=.1;donor.steering=-.1;
assert.equal(recover(),null);assert.equal(searches,first,'Unrelated movement must not restart a rejected full arrival');
donor.y+=.1;
assert.equal(recover(),null);assert(searches>first,'Moving an actual rejecting body immediately invalidates the proof');
const afterBody=searches;m.addStructure('generator','rai',{x:300,y:300},{halfWidth:3,halfDepth:3});m.rebuildNavigation();
assert.equal(recover(),null);assert(searches>afterBody,'Topology changes invalidate the failed proof');
console.log(JSON.stringify({passed:true,firstSearches:first,afterBodySearches:afterBody,afterTopologySearches:searches}));

// A stationary active neighbour can receive a new bypass from its recovery
// controller without moving its body or changing its accepted command.
// That route rewrite does not change the failed physical arrival proof.
{
 const scene=progressMission(),waiting=scene.addUnit('bukhanka','rai',{x:0,y:0}),
  ahead=scene.addUnit('bukhanka','rai',{x:0,y:22});
 scene.submitOrder([waiting.id],'move',{x:0,y:100});
 scene.submitOrder([ahead.id],'move',{x:0,y:130});
 for(let i=0;i<100&&(waiting.pendingOrder||ahead.pendingOrder);i++)scene.advance(0);
 assert(!waiting.pendingOrder&&!ahead.pendingOrder&&ahead.path.length);
 for(const [x,y,halfWidth,halfDepth] of [[-9,10,2,40],[9,10,2,40],[0,-14,11,2],[0,38,11,2]])
  scene.addStructure('generator','rai',{x,y},{halfWidth,halfDepth});
 scene.rebuildNavigation();
 let calls=0;const search=scene.planManeuverSteps;
 scene.planManeuverSteps=function*(...args){calls++;return yield* search.apply(this,args);};
 const prove=()=>{const it=checkedCooperativeArrival(scene,waiting,waiting.routeOrder.destination,{cooperate:true});let r;do{r=it.next();}while(!r.done);return r.value;};
 assert.equal(prove(),null);const first=calls;
 ahead.path=[{x:ahead.x+3,y:ahead.y},...ahead.path];
 assert.equal(prove(),null);
 assert.equal(calls,first,'A blocker changing only its intermediate route cannot release physical space');
 ahead.y+=.1;
 assert.equal(prove(),null);assert(calls>first,'A physical blocker moving still invalidates the proof');
 const moved=calls;
 ahead.path=[];ahead.task=null;
 assert.equal(prove(),null);assert(calls>moved,'A newly idle blocker must become eligible to lend space');
 console.log(JSON.stringify({passed:true,activeBlockerSearches:first,afterMotion:moved,afterIdle:calls}));
}

// A deferred global approach is waiting for a region to settle, not for each
// intermediate pose of unrelated traffic. Its unchanged local obstruction
// must not restart the expensive local search on every one of those poses.
{
 const scene=progressMission(),waiting=scene.addUnit('bukhanka','rai',{x:0,y:0}),
  remote=scene.addUnit('bukhanka','rai',{x:150,y:100},{heading:-Math.PI/2});
 scene.submitOrder([waiting.id],'move',{x:0,y:30});scene.submitOrder([remote.id],'move',{x:300,y:100});
 for(let i=0;i<100&&(waiting.pendingOrder||remote.pendingOrder);i++)scene.advance(0);
 for(const [x,y,halfWidth,halfDepth] of [[-9,0,2,30],[9,0,2,30],[0,-14,11,2],[0,14,11,2]])
  scene.addStructure('generator','rai',{x,y},{halfWidth,halfDepth});
 scene.rebuildNavigation();remote.driveSpeed=1;
 let calls=0;const search=scene.planManeuverSteps;
 scene.planManeuverSteps=function*(...args){calls++;return yield* search.apply(this,args);};
 const prove=()=>{const it=checkedCooperativeArrival(scene,waiting,waiting.routeOrder.destination,{cooperate:true});let r;do{r=it.next();}while(!r.done);return r.value;};
 assert.equal(prove(),null);const first=calls;
 remote.x+=1;remote.driveSpeed=2;
 assert.equal(prove(),null);assert.equal(calls,first,'Unrelated movement in a deferred global region cannot invalidate a local failure');
 remote.driveSpeed=0;
 assert.equal(prove(),null);assert(calls>first,'A settled region must immediately permit a fresh global proof');
 const settled=calls;remote.x+=1;
 assert.equal(prove(),null);assert.equal(calls,settled,'A remote body outside the failed static search is not a physical witness');
 console.log(JSON.stringify({passed:true,deferredGlobalSearches:first,afterRegionSettled:settled}));
}

// An immutable reserved sweep stays obstructed while its owner drives inside
// it. The owner's changing pose must not restart the same complete search.
{
 const scene=progressMission(),waiting=scene.addUnit('bukhanka','rai',{x:0,y:0}),
  owner=scene.addUnit('bukhanka','rai',{x:-150,y:20},{heading:-Math.PI/2});
 scene.submitOrder([waiting.id],'move',{x:0,y:30});
 scene.submitOrder([owner.id],'move',{x:150,y:20});
 for(let i=0;i<100&&(waiting.pendingOrder||owner.pendingOrder);i++)scene.advance(0);
 const legs=[{direction:1,curve:0,remaining:300}],corridor=reserveManeuverCorridor(scene,owner,legs);
 assert(corridor,'The reserved passage starts clear of the waiting body');
 owner.detour={legs,reservedCorridor:corridor,blocked:0};invalidateTrafficCorridors(scene);
 let calls=0;const search=scene.planManeuverSteps;
 scene.planManeuverSteps=function*(...args){calls++;return yield* search.apply(this,args);};
 const prove=()=>{const it=checkedCooperativeArrival(scene,waiting,waiting.routeOrder.destination,{cooperate:true});let r;do{r=it.next();}while(!r.done);return r.value;};
 assert.equal(prove(),null);const first=calls;
 owner.x+=1;owner.driveSpeed=2;
 assert.equal(prove(),null);assert.equal(calls,first,'Driving inside the unchanged blocking reservation does not invalidate failure');
 delete owner.detour;invalidateTrafficCorridors(scene);
 assert(prove(),'Releasing that reservation immediately permits a fresh arrival');
 assert(calls>first);
 console.log(JSON.stringify({passed:true,reservedFailureSearches:first,afterRelease:calls}));
}

// Successful geometry can be reused, but its old permission to move cannot.
// Keep the same live objects between proofs so this really exercises reuse.
const open=progressMission();open.load(JSON.parse(fs.readFileSync('tools/fixtures/navigation-cooperative-arrival.json')));
open.state.bounds=[0,0,127,127];open.rebuildNavigation();
const requester=open.entity('u177'),parking=open.parkingManeuverSteps;
let parkingCalls=0;
open.parkingManeuverSteps=function*(...args){parkingCalls++;return yield* parking.apply(this,args);};
const prove=()=>{const it=checkedCooperativeArrival(open,requester,requester.routeOrder.destination,{cooperate:true});let step;do{step=it.next();}while(!step.done);return step.value;};
const firstPlan=prove();assert.equal(firstPlan?.joint?.phases.length,3);
const borrowed=open.entity(firstPlan.joint.phases[0].id),oldPark=structuredClone(firstPlan.joint.phases[0].legs),
 parked=checkManeuver(borrowed,oldPark,open.config.worldScale,()=>true);
const reset=()=>{
 delete borrowed.yieldReturn;delete borrowed.detour;delete requester.trafficHold;delete requester.detour;
 delete borrowed.jointTraffic;delete requester.jointTraffic;invalidateTrafficCorridors(open);
};
reset();const initialCalls=parkingCalls,secondPlan=prove();
assert(secondPlan?.joint?.phases[0].id===borrowed.id);assert.equal(parkingCalls,initialCalls,'Unchanged geometry must reuse the parking candidate');
const markers=[borrowed,requester].map(body=>[body,body.jointTraffic]),loan=borrowed.yieldReturn;
reset();let addedPose;
// Occupy the edge of the promised arc without creating an impossible initial
// overlap with the donor. Legacy overlap escape has a different contract.
for(let x=-30;x<=30&&!addedPose;x+=2)for(let y=-30;y<=30&&!addedPose;y+=2){
 const pose={x:parked.x+x,y:parked.y+y,heading:parked.heading,kind:'bukhanka'};
 if(vehicleClearance(parked,pose,open.config.worldScale,open.field)<.2
  &&open.state.units.every(u=>u.hp<=0||vehicleClearance(u,pose,open.config.worldScale,open.field)>.3)
  &&checkManeuver(requester,secondPlan.joint.phases[1].legs,open.config.worldScale,(a,b)=>
   clearOfVehicles(requester,b,[{...pose,hp:1}],open.config.worldScale,false,a,open.field)))addedPose=pose;
}
assert(addedPose,'The new obstacle must start clear of every current body');
const entrant={...addedPose,id:'incoming',owner:'rai',hp:1};
assert(open.vehicleMotionClear(entrant,entrant,entrant),'The incoming position is physically free before reserving the transaction');
requester.detour=secondPlan;borrowed.yieldReturn=loan;
for(const [body,marker]of markers)body.jointTraffic=marker;
invalidateTrafficCorridors(open);
assert(!open.vehicleMotionClear(entrant,entrant,entrant),'The donor parking arc must be reserved along with the requester arrival');
delete requester.detour;reset();invalidateTrafficCorridors(open);
const added=open.addUnit('bukhanka','rai',addedPose,{heading:addedPose.heading});
assert(!checkManeuver(borrowed,oldPark,open.config.worldScale,(a,b)=>open.vehicleMotionClear(borrowed,a,b)),
 'The newly occupied arc must reject the formerly cached candidate');
const changed=prove();
if(changed?.joint){
 const yielding=open.entity(changed.joint.phases[0].id);
 const end=checkManeuver(yielding,changed.joint.phases[0].legs,open.config.worldScale,(a,b)=>open.vehicleMotionClear(yielding,a,b));
 assert(end,
  'A cached parking candidate must remain physically clear of the newly added body');
 assert(vehicleClearance(end,added,open.config.worldScale,open.field)>0,'The formerly accepted endpoint is now occupied');
}
console.log(JSON.stringify({passed:true,initialParkingCalls:initialCalls,recheckedParkingCalls:parkingCalls-initialCalls}));
