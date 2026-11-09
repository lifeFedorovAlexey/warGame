import {checkManeuver} from './vehicle-motion.js';
import {checkedRouteShortcut} from './traffic-shortcut.js';
import {navigationDecision,navigationRouteKey} from './navigation-state.js';
import {isInfantry} from './scav-unit-profiles.js';
import {vehicleEnvelope,footprintSupport} from './vehicle-collision.js';
import {maneuverAdmissionBlocker} from './maneuver-admission.js';
import {routeYieldHome} from './traffic-start.js';
import {SEARCH_OUTCOME,LOCAL_RETRY_SECONDS,trafficConditionKey,trafficRequestKey,localTrafficContext} from './traffic-context.js';

const failed=new WeakMap();
const failedParking=new WeakMap();
const parkingPlans=new WeakMap();
// A failed parking search depends on the bodies which actually rejected its
// arcs. Movement elsewhere must not restart the same thousands of probes on
// every tick. A changed rejecting body, reservation, admission or route retries
// immediately; successful plans are always checked against the live world.
function parkingFailureKey(mission,unit,requester,rejected){
 return JSON.stringify([trafficConditionKey(mission,unit),trafficConditionKey(mission,requester),unit.passingLane,routeFor(unit),routeFor(requester),rejected,
  mission.trafficCoordinator.passageDecisions.get(unit.id),unit.passage]);
}
function sameParkingRecord(mission,record,key){
 return record&&record.world===mission.state&&record.field===mission.field&&record.scale===mission.config.worldScale
  &&record.topology===mission.nav.topologyRevision&&record.key===key&&(!record.context||record.context.valid())&&record.blockers.every(saved=>
   mission.entity(saved.body.id)===saved.body&&trafficConditionKey(mission,saved.body)===saved.key);
}
function parkingRecord(mission,key,blockers){
 return {world:mission.state,field:mission.field,scale:mission.config.worldScale,topology:mission.nav.topologyRevision,key,
  blockers:[...blockers].map(body=>({body,key:trafficConditionKey(mission,body)}))};
}
function rememberParkingFailure(mission,unit,requester,key,blockers,context){
 let cache=failedParking.get(unit);if(!cache){cache=new Map();failedParking.set(unit,cache);}
 cache.set(requester.id,{...parkingRecord(mission,key,blockers),context,retryAt:mission.state.time+LOCAL_RETRY_SECONDS});
 if(cache.size>12)cache.delete(cache.keys().next().value);
}
const copyParking=plan=>({...plan,legs:plan.legs.map(leg=>({...leg}))});
function cachedParking(mission,unit,key,allowed){
 const record=parkingPlans.get(unit)?.get(key);
 // Reuse only the geometric candidate, never its permission to move. Every
 // reuse checks the complete arc against today's bodies and reservations.
 if(sameParkingRecord(mission,record,key)&&checkManeuver(unit,record.plan.legs,mission.config.worldScale,allowed))
  return copyParking(record.plan);
 return null;
}
function rememberParking(mission,unit,key,plan){
 let cache=parkingPlans.get(unit);if(!cache){cache=new Map();parkingPlans.set(unit,cache);}
 // Rejecting bodies explain a failed search, not a successful candidate.
 // An obstacle may reject some alternatives while the chosen arc stays
 // clear. cachedParking rechecks that complete arc and braking admission;
 // unrelated changes cannot require repeating the search which found it.
 cache.set(key,{...parkingRecord(mission,key,[]),plan:copyParking(plan)});
 if(cache.size>12)cache.delete(cache.keys().next().value);
}
const routeKey=unit=>JSON.stringify([unit.task,unit.path]);
const requestKey=unit=>JSON.stringify([unit.commandRevision,unit.task,unit.path.at(-1)]);
const replaceable=plan=>plan?.blocked>0&&!plan.parking&&!plan.idleYield&&!plan.yieldReturning
 &&!plan.departure&&!plan.passageExit&&!plan.progressRecovery;
const routeFor=unit=>unit.path.length?unit.path:unit.yieldReturn?[unit.routeOrder?.destination??unit.yieldReturn.home]:[];
export function checkedCycleActive(mission,unit){
 if(unit.traffic?.cycle)return true;
 const moving=unit.trafficHold&&mission.entity(unit.trafficHold);
 if(moving?.traffic?.cycle&&moving.detour?.cycleRecovery)return true;
 const yielding=unit.cycleContinuation&&mission.entity(unit.cycleContinuation),state=yielding?.traffic;
 if(state?.cycle&&state.leader===unit.id&&state.requesterKey===requestKey(unit))return true;
 delete unit.cycleContinuation;return false;
}
function releaseCycle(mission,unit,state){
 const requester=mission.entity(state.leader);
 if(requester?.cycleContinuation===unit.id)delete requester.cycleContinuation;
 for(const id of state.members??[]){const member=mission.entity(id);if(member?.trafficHold===unit.id)delete member.trafficHold;}
 delete unit.traffic;
}
function rearBeyondRelease(mission,unit,release){
 const direction={x:-Math.sin(release.heading),y:Math.cos(release.heading)},scale=mission.config.worldScale;
 const actual=vehicleEnvelope(unit,scale,mission.field),planned=vehicleEnvelope(release,scale,mission.field);
 return (actual.x-planned.x)*direction.x+(actual.y-planned.y)*direction.y
  -footprintSupport(actual,direction.x,direction.y)+footprintSupport(planned,direction.x,direction.y);
}

// A wait cycle is evidence that priority alone cannot release these bodies.
// Search one physical yield, followed by two checked continuations: the
// requester first, then the yielding car back onto its unchanged route.
export function* recoverWaitCycle(mission,owner,result={}){
 result.outcome=SEARCH_OUTCOME.STALE;
 const diagnostics=mission.navigationDiagnostics;
 const ids=(diagnostics?.recoveryCycles??diagnostics?.cycles)?.find(cycle=>cycle.slice().sort()[0]===owner.id);
 if(!ids||ids.length<2)return false;
 const members=ids.map(id=>mission.entity(id));
 // The dispatcher has already renegotiated this tick's reservations. A
 // dependency from the preceding controller is obsolete if its reservation
 // was released/transferred. Let that car drive before searching a physical
 // yield for a cycle that no longer exists.
 if(mission.trafficCoordinator.updatedState===mission.state&&mission.trafficCoordinator.updatedAt===mission.state.time
  &&members.some(unit=>unit?.navigation?.reason==='junction-reservation'
  &&(mission.trafficCoordinator.decisions.get(unit.id)?.limit>.01
   ||!(diagnostics.dependencies?.get(unit.id)??[unit.navigation.blockerId])
    .includes(mission.trafficCoordinator.decisions.get(unit.id)?.yieldTo))))return false;
 const legacy=unit=>unit?.traffic&&!unit.traffic.cycle;
 result.outcome=SEARCH_OUTCOME.BLOCKED_DYNAMIC;
 const replaceablePlan=unit=>replaceable(unit.detour)||legacy(unit)&&unit.detour?.parking&&unit.detour.blocked>0&&!unit.detour.idleYield;
 if(members.some(unit=>!unit||unit.hp<=0||isInfantry(unit)||unit.owner!==owner.owner||!routeFor(unit).length
  ||unit.detour&&!replaceablePlan(unit)||unit.jointTraffic||unit.traffic?.cycle
  ||unit.trafficHold&&mission.entity(unit.trafficHold)?.detour?.parking&&!members.some(other=>other?.id===unit.trafficHold)
  ||unit.pendingOrder||unit.builderWorking
  ||unit.foldTime>0||unit.tool>0||(unit.driveSpeed??0)>.1))return false;
 if(diagnostics.recoveryRoutes&&members.some(unit=>diagnostics.recoveryRoutes.get(unit.id)
  !==navigationRouteKey(unit))){Object.assign(result,{outcome:SEARCH_OUTCOME.STALE,reason:'cycle-route-changed'});return false;}
 // A return waiting for this very component cannot keep using an inverse
 // corridor as its only route. Materialise its original goal through the
 // ordinary navigator, then let the next completed step report real edges.
 let routed=false;
 for(const unit of members)if(!unit.path.length&&unit.yieldReturn)routed=(yield* routeYieldHome(mission,unit))||routed;
 if(routed){result.outcome=SEARCH_OUTCOME.FOUND;return true;}
 // beginNavigationStep clears the current controller's previous blocker.
 // The cycle itself is the preceding tick's ordered, audited dependency path.
 const scale=mission.config.worldScale,requestKey=trafficRequestKey(mission,'cycle',ids),
  signature=JSON.stringify([requestKey,members.map(unit=>trafficConditionKey(mission,unit))]);
 const previousFailure=failed.get(owner);
 if(previousFailure?.signature===signature&&mission.state.time<previousFailure.retryAt&&previousFailure.context.valid()){
  Object.assign(result,{outcome:previousFailure.outcome,negativeCacheHit:true,retryAt:previousFailure.retryAt});return false;
 }
 const context=localTrafficContext(mission,members);mission=context.view;
 const valid=()=>{const ok=context.valid();
  if(!ok)result.outcome=SEARCH_OUTCOME.STALE;return ok;};
 let dynamicBlocked=false;
 for(const unit of members.slice().sort((a,b)=>a.id.localeCompare(b.id))){
  if(!valid())return false;
  const requesters=members.filter(other=>(diagnostics.dependencies?.get(other.id)??[other.navigation?.blockerId]).includes(unit.id));
  for(const requester of requesters){
  Object.assign(result,{stage:'parking',actorId:unit.id,requesterId:requester.id});
  const blockers=new Set();
  const allowed=(from,to)=>{
   if(!mission.vehicleMotionClear(unit,from,to,.52,blockers))return false;
   const incoming=maneuverAdmissionBlocker(mission,unit,from,to,mission.config.simulationStep);
   if(incoming){blockers.add(incoming);return false;}return true;
  };
  const rejected=[];
  for(let attempt=0;attempt<3;attempt++){
  const parkingKey=parkingFailureKey(mission,unit,requester,rejected);
  const previousParking=failedParking.get(unit)?.get(requester.id);
  if(mission.state.time<previousParking?.retryAt&&sameParkingRecord(mission,previousParking,parkingKey)){
   result.negativeCacheHit=true;dynamicBlocked||=previousParking.blockers.length>0;break;
  }
  let park=cachedParking(mission,unit,parkingKey,allowed);
  if(!park){
   park=yield* mission.parkingManeuverSteps(unit,{...requester,path:routeFor(requester)},allowed,{requireInverse:false,accept:pose=>rejected.every(other=>
    Math.hypot(pose.x-other.x,pose.y-other.y)>scale||Math.cos(pose.heading-other.heading)<.98)});
   if(park&&valid())rememberParking(mission,unit,parkingKey,park);
  }
  if(!valid())return false;
  if(!park){dynamicBlocked||=blockers.size>0;rememberParkingFailure(mission,unit,requester,parkingKey,blockers,context);break;}
  const end=checkManeuver(unit,park.legs,scale,allowed);if(!end)continue;
  rejected.push(end);
  // Reuse the checked parking candidate, but publish only through the common
  // three-phase controller. It also protects the yielding car's future route
  // connector; a separate parked lease could lose that space to a third car.
  const passageResult={};
  result.stage='passage';
  if(yield* mission.trafficCoordinator.movingPassageSteps(mission,requester,unit,{parkingLegs:park.legs,replaceBlocked:true,diagnostics:passageResult})){
   for(const member of members){
    if(member!==unit&&member!==requester&&legacy(member)){
     delete member.traffic;
     if(member.detour?.parking&&member.detour.blocked>0&&!member.detour.idleYield)delete member.detour;
    }
    if(ids.includes(member.trafficHold))delete member.trafficHold;
   }
   result.outcome=SEARCH_OUTCOME.FOUND;mission.emit('navigation-cycle-recovery',{units:ids,unit:unit.id,requester:requester.id});return true;
  }
  dynamicBlocked||=passageResult.outcome===SEARCH_OUTCOME.BLOCKED_DYNAMIC;
  result.passage={...passageResult};
  if(!valid())return false;
  }
  }
 }
 if(valid()){
  result.outcome=dynamicBlocked?SEARCH_OUTCOME.BLOCKED_DYNAMIC:SEARCH_OUTCOME.LOCAL_SEARCH_EXHAUSTED;
  result.retryAt=mission.state.time+LOCAL_RETRY_SECONDS;
  failed.set(owner,{signature,context,outcome:result.outcome,retryAt:result.retryAt});
 }return false;
}

export function* resumeCycleRoute(mission,unit){
 const state=unit.traffic;if(!state?.cycle||state.phase!=='parked')return false;
 if(state.route!==routeKey(unit)){releaseCycle(mission,unit,state);return false;}
 const requester=mission.entity(state.leader),release=state.releaseGoal;
 // The checked passage is an executed local plan. If a changed obstruction
 // cancelled it, release the coupled transaction so the actual new wait
 // graph can recover again; never keep an obsolete promise indefinitely.
 if(state.checkedPassage&&!state.passageComplete&&requester&&state.requesterKey===requestKey(requester)
  &&requester.detour?.cyclePassage!==unit.id){releaseCycle(mission,unit,state);return false;}
 if(requester&&release&&state.requesterKey===requestKey(requester)){
  const rear=rearBeyondRelease(mission,requester,release);
  if(rear<-.05){
   navigationDecision(unit,'YIELDING','cycle-requester-crossing',requester.id,'wait-for-actual-release-sector');
   unit.driveSpeed=0;return true;
  }
 }
 const context=localTrafficContext(mission,[unit]);mission=context.view;
 const allowed=(from,to)=>mission.vehicleMotionClear(unit,from,to);
 const clear=yield* checkedRouteShortcut(mission,unit,unit.path[0],{allowed});
 // The return connector is also a suspended proof. A newer command must
 // retain its own state; construction/body changes require a fresh proof.
 if(!context.valid()||unit.traffic!==state)return true;
 // After the promised passage was actually executed, a changed obstruction
 // belongs to ordinary route recovery. Keeping a completed reservation here
 // would freeze its old participants and hide the new physical dependency.
 if(clear||state.passageComplete){
  releaseCycle(mission,unit,state);delete unit.driveWatch;return false;
 }
 navigationDecision(unit,'YIELDING','cycle-passage-occupied',state.leader,'resume-after-checked-connector');
 unit.driveSpeed=0;return true;
}
