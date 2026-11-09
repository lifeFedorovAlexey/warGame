import {driveStep,checkManeuver} from './vehicle-motion.js';
import {vehicleEnvelope} from './vehicle-collision.js';
import {vehicleDynamics} from './vehicle-dynamics.js';
import {maneuverAdmissionRadius} from './maneuver-admission.js';
import {SEARCH_OUTCOME,LOCAL_RETRY_SECONDS,trafficConditionKey,reserveIntersects} from './traffic-context.js';

// Prove a shortcut using the actual steering, acceleration and full-body
// sweep. A straight grid ray alone cannot prove that a van can make a turn.
// This never moves the real unit or reserves moving neighbours in time.
const failures=new WeakMap();
const recoveryFailures=new WeakMap();
const progressTurnFailures=new WeakMap();
const blockedDetourFailures=new WeakMap();
const routeRejoinFailures=new WeakMap();
const arrivalFailures=new WeakMap();
export function recoveryConditions(mission,unit,radius=mission.config.worldScale*22){
 const neighbours=mission.nearbyUnits(unit,radius).filter(other=>other.hp>0),seen=new Set(neighbours.map(u=>u.id));
 const box={left:unit.x-radius,right:unit.x+radius,bottom:unit.y-radius,top:unit.y+radius};
 for(const other of mission.state.units)if(other.hp>0&&!seen.has(other.id)&&reserveIntersects(mission,other,box))neighbours.push(other);
 return JSON.stringify([mission.nav.topologyRevision,trafficConditionKey(mission,unit),
  neighbours.map(other=>[other.id,trafficConditionKey(mission,other)])]);
}
const retainedFailure=(cache,key,signature,time)=>{const record=cache.get(key);return record?.signature===signature&&time<record.retryAt;};
const retainFailure=(cache,key,signature,time)=>cache.set(key,{signature,retryAt:time+LOCAL_RETRY_SECONDS,outcome:SEARCH_OUTCOME.LOCAL_SEARCH_EXHAUSTED});
export function unchangedRecoveryFailure(unit,conditions,time){
 const failed=recoveryFailures.get(unit);return failed?.conditions===conditions&&time<failed.retryAt;
}
export function rememberRecoveryFailure(unit,conditions,time){recoveryFailures.set(unit,{conditions,retryAt:time+2});}
// Near an accepted destination, prove the whole parking manoeuvre. A partial
// turn which merely faces the target can repeat forever between parked cars.
// The finite reverse allowance belongs to this complete arrival proof; it
// does not reset historical debt or move the accepted destination.
export function* checkedGoalArrival(mission,unit,allowed,accept){
 const goal=unit.routeOrder?.destination,scale=mission.config.worldScale;
 const maximumLegs=14,maximumTravel=maximumLegs*1.2*scale;
 if(!goal||unit.pendingOrder||unit.detour||(unit.driveSpeed??0)>.01
  ||Math.hypot(unit.x-goal.x,unit.y-goal.y)>maximumTravel)return null;
 const world=mission.state,revision=unit.commandRevision,origin={x:unit.x,y:unit.y,heading:unit.heading};
 const condition=()=>recoveryConditions(mission,unit)+'|arrival:'+JSON.stringify(unit.routeOrder?.destination);
 const signature=condition();if(retainedFailure(arrivalFailures,unit,signature,mission.state.time))return null;
 const legs=yield* mission.planManeuverSteps(unit,goal,{scale,allowed,attempts:2,tolerance:.5,
  // The bounded search must reach the accepted goal in full. Its own finite
  // travel bound also bounds reverse travel; a separate shorter reverse/range
  // cutoff strands reachable slots just outside that arbitrary threshold.
  maximumLegs,reverseBudget:maximumTravel,
  accept:pose=>Math.hypot(pose.x-goal.x,pose.y-goal.y)<.65&&accept(pose)});
 if(mission.state!==world||unit.pendingOrder||unit.commandRevision!==revision
  ||unit.x!==origin.x||unit.y!==origin.y||unit.heading!==origin.heading||condition()!==signature)return null;
 if(!legs)retainFailure(arrivalFailures,unit,signature,mission.state.time);
 return legs;
}
function boundedRecoveryConditions(mission,unit,extent,goal,dt){
 const radius=Math.max(mission.config.worldScale*22,extent+maneuverAdmissionRadius(mission,unit,dt));
 return radius+'|'+recoveryConditions(mission,unit,radius)+'|'+goal.x+','+goal.y+'|'
  +mission.nearbyUnits(unit,radius).filter(other=>other.hp>0&&(other.driveSpeed??0)>0)
   .map(other=>[other.id,other.driveSpeed,other.steering,other.reversing].join(',')).join(';');
}
// A previously valid local manoeuvre can become blocked by a newly parked
// body. Try the bounded alternatives on that geometry change, rather than
// waiting for the old plan's one-second timeout. Special cooperative/arrival
// plans have their own contracts and are never replaced here.
export function* checkedDetourAlternative(mission,unit,plan,goal,allowed,dt=.1){
 if(plan.parking||plan.idleYield||plan.yieldReturning||plan.departure||plan.passageExit
  ||plan.progressRecovery||plan.pickup||plan.arrival||plan.rough||unit.pendingOrder)return null;
 const scale=mission.config.worldScale,state=mission.state,revision=unit.commandRevision;
 // Include all nine legs, their continuation and neighbours' braking paths.
 const condition=()=>boundedRecoveryConditions(mission,unit,scale*(9*1.2+2.5),goal,dt);
 const signature=condition();
 if(retainedFailure(blockedDetourFailures,plan,signature,mission.state.time))return null;
 const legs=yield* mission.planManeuverSteps(unit,goal,{scale,allowed,attempts:2,maximumLegs:9,
  reverseBudget:Math.max(0,scale*4-(unit.reverseDebt??0))});
 // A sliced search may outlive a replacement command or a changed obstacle.
 // Do not publish its old proof into that new state.
 if(mission.state!==state||mission.entity(unit.id)!==unit||unit.hp<=0||unit.detour!==plan
  ||unit.pendingOrder||unit.commandRevision!==revision||condition()!==signature)return null;
 if(!legs)retainFailure(blockedDetourFailures,plan,signature,mission.state.time);
 return legs;
}
// Exhausted historical reverse allowance must not strand a car against a
// stationary body forever. Grant only a completely checked finite rejoin:
// at most half its own length backwards, then forward onto the same route.
// The remaining route length must decrease by at least that half-length.
// No waypoint, accepted goal or accumulated reverse debt is rewritten.
export function* checkedRouteRejoin(mission,unit,point,allowed,dt){
 const goal=unit.routeOrder?.destination,scale=mission.config.worldScale;
 if(!goal||unit.pendingOrder||unit.detour||unit.routeContinuation||!unit.path.length
  ||Math.hypot(unit.path.at(-1).x-goal.x,unit.path.at(-1).y-goal.y)>.01)return null;
 const halfLength=vehicleEnvelope(unit,scale,mission.field).depth;
 if(scale*4-(unit.reverseDebt??0)>=halfLength)return null;
 const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),initial=distance(unit,point);
 if(initial<halfLength+.1)return null;
 const state=mission.state,field=mission.field,nav=mission.nav,revision=unit.commandRevision,
  kind=unit.kind,start={x:unit.x,y:unit.y,heading:unit.heading},limit=vehicleDynamics(unit).steeringLimit,curve=Math.tan(limit);
 const condition=()=>boundedRecoveryConditions(mission,unit,halfLength*2+scale*5*1.2,point,dt)
  +'|accepted:'+unit.routeOrder?.destination?.x+','+unit.routeOrder?.destination?.y;
 const signature=condition(),failed=routeRejoinFailures.get(unit);
 if(failed?.signature===signature&&failed.field===field&&failed.nav===nav&&failed.kind===kind&&mission.state.time<failed.retryAt)return null;
 const ownerValid=()=>mission.state===state&&mission.field===field&&mission.nav===nav&&mission.entity(unit.id)===unit&&unit.hp>0
  &&unit.kind===kind&&unit.x===start.x&&unit.y===start.y&&unit.heading===start.heading
  &&!unit.pendingOrder&&!unit.detour&&unit.commandRevision===revision;
 for(const reverse of [halfLength*.5,halfLength])for(const steering of [0,curve/2,-curve/2,curve,-curve]){
  if(performance.now()>=(mission.nav.workDeadline??Infinity)){yield;if(!ownerValid())return null;}
  const first={direction:-1,curve:steering,remaining:reverse},exit=checkManeuver(unit,[first],scale,allowed);
  if(!exit)continue;
  let continuation;
  const search=mission.planManeuverSteps(exit,point,{scale,allowed,attempts:2,reverseBudget:0,maximumLegs:5,
   accept:pose=>{
    const remaining=distance(pose,point),angle=Math.atan2(Math.sin(Math.atan2(pose.x-point.x,point.y-pose.y)-pose.heading),
     Math.cos(Math.atan2(pose.x-point.x,point.y-pose.y)-pose.heading));
    if(remaining>.1&&Math.abs(angle)>.65)return false;
    const leg={direction:1,curve:Math.tan(Math.max(-limit,Math.min(limit,angle*1.55))),remaining:Math.min(halfLength,remaining)};
    const end=checkManeuver(pose,[leg],scale,allowed);
    if(!end||distance(end,point)>initial-halfLength)return false;
    continuation=leg.remaining>1e-6?leg:null;return true;
   }});
  let result;
  do{result=search.next();if(!result.done){yield;if(!ownerValid()){search.return();return null;}}}while(!result.done);
  if(!ownerValid()||condition()!==signature)return null;
  if(result.value)return [first,...result.value,...(continuation?[continuation]:[])];
 }
 if(ownerValid()&&condition()===signature)routeRejoinFailures.set(unit,{signature,field,nav,kind,retryAt:mission.state.time+LOCAL_RETRY_SECONDS,outcome:SEARCH_OUTCOME.LOCAL_SEARCH_EXHAUSTED});
 return null;
}
export function* checkedProgressTurn(mission,unit,waypoint,destination,allowed){
 const scale=mission.config.worldScale,depth=vehicleEnvelope(unit,scale,mission.field).depth,
  distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),initial=distance(unit,destination),toWaypoint=distance(unit,waypoint);
 if(initial<depth*2||toWaypoint<depth*2)return null;
 const signature=recoveryConditions(mission,unit)+'|'+destination.x+','+destination.y;
 if(retainedFailure(progressTurnFailures,unit,signature,mission.state.time))return null;
 let continuation;
 const legs=yield* mission.planManeuverSteps(unit,waypoint,{scale,allowed,attempts:2,maximumLegs:14,reverseBudget:depth,
  accept:pose=>{
   if(distance(pose,destination)>initial-depth||distance(pose,waypoint)>toWaypoint-depth*.5)return false;
   const turn=Math.atan2(Math.sin(Math.atan2(pose.x-waypoint.x,waypoint.y-pose.y)-pose.heading),
    Math.cos(Math.atan2(pose.x-waypoint.x,waypoint.y-pose.y)-pose.heading));
   if(Math.abs(turn)>.65)return false;
   const limit=vehicleDynamics(unit).steeringLimit,
    forward={direction:1,curve:Math.tan(Math.max(-limit,Math.min(limit,turn*1.55))),remaining:depth},
    end=checkManeuver(pose,[forward],scale,allowed);
   if(!end||distance(end,destination)>initial-depth||distance(end,waypoint)>=distance(pose,waypoint))return false;
   continuation=forward;return true;
  }});
 // This is a complete finite escape, including its actual forward continuation.
 // It neither resets historical reverse debt nor grants an unproved extra reverse.
 if(legs&&continuation)return [...legs,continuation];
 retainFailure(progressTurnFailures,unit,signature,mission.state.time);return null;
}
// The optional distance cap proves a finite continuation for a cooperative
// yield. It only reports the simulated endpoint; it never consumes a waypoint.
export function* checkedRouteShortcut(mission,unit,goal,{allowed,tolerance=2,endpoint,maximumDistance=Infinity,stopWhen}){
 const scale=mission.config.worldScale,distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 const initial=distance(unit,goal),radius=2.6*scale/Math.tan(.67);
 const maximumTravel=initial*2+Math.PI*radius*2,speed=mission.unitSpec(unit).speed;
 // A distant route vertex supplies direction, not the extent of a capped
 // passage. Include its finite travel, one possible final integration step,
 // body width and neighbours' braking paths. The actual arc probes still
 // expand the dependency region and execution retains live collision checks.
 const scene=allowed.trafficView??mission;
 const extent=Math.min(maximumTravel,maximumDistance)+Math.max(unit.driveSpeed??0,speed*1.18)*.1
  +Math.max(scale*7,maneuverAdmissionRadius(scene,unit,mission.config.simulationStep));
 const signature=JSON.stringify([mission.nav.topologyRevision,goal.x,goal.y,maximumDistance,tolerance,
  recoveryConditions(scene,unit,extent)]);
 let failed=failures.get(unit);
 if(!stopWhen&&mission.state.time<(failed?.get(signature)?.retryAt??-Infinity))return false;
 let pose={...unit},travelled=0;const legs=[];
 for(let step=0;step<384&&travelled<maximumTravel;step++){
  if(performance.now()>=(mission.nav.workDeadline??Infinity))yield;
  const remaining=distance(pose,goal);
  if(remaining<tolerance||travelled>=maximumDistance||travelled>0&&stopWhen?.(pose)){if(endpoint){endpoint.pose=pose;endpoint.travelled=travelled;endpoint.legs=legs;endpoint.reached=remaining<tolerance;}return true;}
  const next=driveStep(pose,goal,.1,{speed,scale,tolerance,allowed});
  if(!next||next.impactSpeed)break;
  if(endpoint){
   const direction=next.reversing?-1:1,curve=Math.tan(next.steering)*direction;
   const length=Math.abs(next.wheelDistance-(pose.wheelDistance??0)),last=legs.at(-1);
   if(last?.direction===direction&&Math.abs(last.curve-curve)<1e-12)last.remaining+=length;
   else legs.push({direction,curve,remaining:length});
  }
  travelled+=distance(pose,next);pose=next;
 }
 if(!stopWhen){
  if(!failed){failed=new Map();failures.set(unit,failed);}
  failed.set(signature,{retryAt:mission.state.time+LOCAL_RETRY_SECONDS,outcome:SEARCH_OUTCOME.LOCAL_SEARCH_EXHAUSTED});
  if(failed.size>6)failed.delete(failed.keys().next().value);
 }
 return false;
}
