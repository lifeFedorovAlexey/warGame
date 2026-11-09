import {checkManeuverSteps} from './vehicle-motion.js';
import {checkedRouteShortcut} from './traffic-shortcut.js';
import {maneuverAdmissionBlocker} from './maneuver-admission.js';
import {commandPathFromLive} from './command-motion.js';
import {SEARCH_OUTCOME,LOCAL_RETRY_SECONDS,trafficConditionKey,localTrafficContext,projectedTrafficView} from './traffic-context.js';

const failed=new WeakMap();
const replaceable=unit=>unit.detour?.blocked>0&&!unit.detour.idleYield&&!unit.detour.yieldReturning&&!unit.detour.departure
 &&!unit.detour.passageExit&&!unit.detour.progressRecovery&&!unit.detour.cooperativeYield&&!unit.detour.cooperativeBackoff
 &&(!unit.detour.parking||unit.traffic&&!unit.traffic.cycle);
// Moving opponents share a checked pull-aside and passage, retaining their
// routes. A stationary donor additionally retains its borrowed parking home.
// This helper proposes geometry; only the coordinator publishes movement.
export function* planMovingPassage(mission,leader,follower,{parkingLegs,rough=false,replaceBlocked=false,diagnostics={}}={}){
 const members=[leader,follower],scale=mission.config.worldScale;
 Object.assign(diagnostics,{stage:'eligibility',parking:0,passage:0,return:0,passageBlockers:[],outcome:SEARCH_OUTCOME.BLOCKED_DYNAMIC});
 // Evacuating vehicles can block each other. A moving retreat keeps its
 // original route/service order through the same two-phase exchange.
 if(!leader.path.length||follower.combatRetreat&&!follower.path.length||members.some(u=>u.hp<=0||u.pendingOrder||u.detour&&!(replaceBlocked&&replaceable(u))||u.jointTraffic
  ||u.builderWorking||u.foldTime>0||u.tool>0||(u.driveSpeed??0)>.1))return null;
 // A healthy car holding a firing position can lend that position as well.
 // Its return is proved as part of this same transaction, preserving its order.
 const followerRoute=follower.path.length?follower.path:[{x:follower.x,y:follower.y}];
 const key=JSON.stringify([members.map(u=>trafficConditionKey(mission,u)),parkingLegs,rough,replaceBlocked]),cached=failed.get(follower)?.get(key);
 if(cached&&mission.state.time<cached.retryAt&&cached.context.valid()){
  Object.assign(diagnostics,{outcome:cached.outcome,negativeCacheHit:true,retryAt:cached.retryAt});return null;
 }
 const context=localTrafficContext(mission,members),rejectedBodies=new Set();mission=context.view;
 const valid=()=>{const ok=context.valid();if(!ok)diagnostics.outcome=SEARCH_OUTCOME.STALE;return ok;};
 const clearance=(actor,projected=new Map(),grade=.52,passageBlockers=null)=>{
  const phaseMission=projectedTrafficView(mission,projected),phaseActor=phaseMission.entity(actor.id);
  const allowed=(from,to)=>{
  const obstacles=phaseMission.vehicleMotionNeighbours(phaseActor,from,to);
  const blockers=new Set();
  if(!phaseMission.vehicleMotionClear(phaseActor,from,to,grade,blockers,obstacles)){
   for(const body of blockers){const actual=mission.entity(body.id);if(actual)rejectedBodies.add(actual);passageBlockers?.add(body.id);}
   if(!blockers.size&&phaseMission.trafficCoordinator.passageDecisions.get(actor.id)?.admitted===false)rejectedBodies.add(actor);
   return false;
  }
  const braking=maneuverAdmissionBlocker(phaseMission,phaseActor,from,to,mission.config.simulationStep);
  if(braking){rejectedBodies.add(braking);passageBlockers?.add(braking.id);}
  return !braking;
  };
  // commitJointPlan must use this same projection in its final admission.
  allowed.trafficView=phaseMission;return allowed;
 };
 const rejected=[],parkingClear=clearance(follower,new Map(),rough?.60:.52);
 if(diagnostics)diagnostics.stage='parking';
 for(let attempt=0;attempt<(parkingLegs?1:3);attempt++){
  diagnostics.stage='parking';
  const parking=parkingLegs?{legs:parkingLegs}:yield* mission.parkingManeuverSteps(follower,leader,parkingClear,{requireInverse:false,
   accept:pose=>rejected.every(p=>Math.hypot(p.x-pose.x,p.y-pose.y)>scale||Math.cos(p.heading-pose.heading)<.98)});
  if(!valid())return null;if(!parking)break;
  const parked=yield* checkManeuverSteps(follower,parking.legs,scale,parkingClear,()=>mission.nav.workDeadline??Infinity);
  if(!valid())return null;if(!parked)continue;rejected.push(parked);
  if(diagnostics){diagnostics.parking++;diagnostics.stage='passage';}
  const passageBlockers=new Set();
  const parkedBody={...follower,...parked,driveSpeed:0},passClear=clearance(leader,new Map([[follower,parkedBody]]),.52,passageBlockers);
  // Clear the complete borrowed corridor before proving the return. A fixed
  // short pass can stop alongside the donor's outward arc and reject every
  // otherwise valid exchange, even on an empty straight road.
  const passageLength=Math.hypot(leader.x-follower.x,leader.y-follower.y)
   +parking.legs.reduce((sum,leg)=>sum+leg.remaining,0)+scale*12;
  for(let i=0;i<Math.min(3,leader.path.length);i++){
   const passing={};
   const passed=yield* checkedRouteShortcut(mission,{...leader,driveSpeed:0},leader.path[i],{allowed:passClear,endpoint:passing,maximumDistance:passageLength});
   if(!valid())return null;
   if(!passed||!passing.legs.length||!passing.reached&&passing.travelled<scale*4){
    // A third body can block the requester even after the selected donor
    // has cleared its lane. Feed that observed dependency back to dispatch;
    // retrying the old pair cannot remove this obstruction.
    diagnostics.passageBlockers=[...new Set([...diagnostics.passageBlockers,
     ...[...passageBlockers].filter(id=>!members.some(body=>body.id===id))])];
    continue;
   }
   if(diagnostics){diagnostics.passage++;diagnostics.stage='return';}
   // A moving donor owns a destination, not the spot where traffic stopped
   // it. Prove the pull-aside and passage, then reconnect its original order
   // from the parked pose. Requiring an immediate return arc as a third phase
   // made an otherwise clear passage fail repeatedly in the live attack.
   // An actual borrowed parking space still keeps the complete return proof.
   if(follower.path.length&&!follower.yieldReturn){
    const onward=commandPathFromLive(mission,parkedBody,follower,follower.path);
    if(!valid())return null;
    if(onward?.length){Object.assign(diagnostics,{stage:'ready',outcome:SEARCH_OUTCOME.FOUND});return {valid,continuations:[{body:follower,path:onward}],phases:[
     {body:follower,from:follower,legs:parking.legs,allowed:parkingClear,arrival:false,continuous:true,rough},
     {body:leader,from:leader,legs:passing.legs,allowed:passClear,arrival:false,continuous:true,
      passedWaypoints:leader.path.slice(0,i+(passing.reached?1:0))}
    ]};}
   }
   const released={...leader,...passing.pose,driveSpeed:0},returnClear=clearance(follower,new Map([[leader,released],[follower,parkedBody]]),rough?.60:.52);
   const proposal=(legs,passed=[])=>({valid,phases:[
    {body:follower,from:follower,legs:parking.legs,allowed:parkingClear,arrival:false,rough},
    {body:leader,from:leader,legs:passing.legs,allowed:passClear,arrival:false,continuous:true,passedWaypoints:leader.path.slice(0,i+(passing.reached?1:0))},
    {body:follower,from:parkedBody,legs,allowed:returnClear,arrival:false,continuous:!rough,rough,passedWaypoints:passed}
   ]});
   // A stationary holder returns to its original pose by reversing the
   // actual outward arcs. A forward-only shortcut cannot prove that return.
   if(!follower.path.length){
    const inverse=parking.legs.toReversed().map(leg=>({direction:-leg.direction,curve:-leg.curve,remaining:leg.remaining}));
    const home=yield* checkManeuverSteps(parkedBody,inverse,scale,returnClear,()=>mission.nav.workDeadline??Infinity);
    if(!valid())return null;
    if(home&&Math.hypot(home.x-follower.x,home.y-follower.y)<.65&&valid()){
     diagnostics.return++;Object.assign(diagnostics,{stage:'ready',outcome:SEARCH_OUTCOME.FOUND});return proposal(inverse);
    }
   }
   for(let j=0;j<Math.min(3,followerRoute.length);j++){
    const returning={};
    // A route vertex may be passed loosely; borrowed parking must be reached
    // to the same precision as the inverse return before releasing its home.
    const returns=yield* checkedRouteShortcut(mission,{...parkedBody},followerRoute[j],{allowed:returnClear,endpoint:returning,
     tolerance:follower.path.length?2:.5,maximumDistance:scale*12});
    if(!valid())return null;if(!returns||!returning.legs.length||!follower.path.length&&!returning.reached)continue;
    diagnostics.return++;Object.assign(diagnostics,{stage:'ready',outcome:SEARCH_OUTCOME.FOUND});
    return proposal(returning.legs,follower.path.slice(0,j+(returning.reached?1:0)));
   }
  }
 }
 if(valid()){
  let cache=failed.get(follower);if(!cache){cache=new Map();failed.set(follower,cache);}
  diagnostics.outcome=rejectedBodies.size?SEARCH_OUTCOME.BLOCKED_DYNAMIC:SEARCH_OUTCOME.LOCAL_SEARCH_EXHAUSTED;
  diagnostics.retryAt=mission.state.time+LOCAL_RETRY_SECONDS;
  cache.set(key,{context,retryAt:diagnostics.retryAt,outcome:diagnostics.outcome});
  if(cache.size>12)cache.delete(cache.keys().next().value);
 }
 return null;
}
