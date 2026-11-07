import {driveStep,checkManeuver} from './vehicle-motion.js';
import {vehicleEnvelope} from './vehicle-collision.js';
import {vehicleDynamics} from './vehicle-dynamics.js';
import {maneuverAdmissionRadius} from './maneuver-admission.js';

// Prove a shortcut using the actual steering, acceleration and full-body
// sweep. A straight grid ray alone cannot prove that a van can make a turn.
// This never moves the real unit or reserves moving neighbours in time.
const failures=new WeakMap();
const recoveryFailures=new WeakMap();
const progressTurnFailures=new WeakMap();
const blockedDetourFailures=new WeakMap();
export function recoveryConditions(mission,unit,radius=mission.config.worldScale*22){
 const neighbours=mission.nearbyUnits(unit,radius).filter(other=>other.hp>0);
 const admission=mission.trafficCoordinator.passageDecisions.get(unit.id);
 return [mission.nav.topologyRevision,unit.routeOrder?.revision,unit.task?.type,
  unit.path.map(point=>point.x+','+point.y).join(';'),unit.reverseDebt,admission?.key,admission?.admitted,
  ...neighbours.map(other=>[other.id,other.x,other.y,other.heading,
   other.path.length?other.path.at(-1).x+','+other.path.at(-1).y:'idle',other.detour?.legs[0]?.direction,
   other.traffic?.phase,other.trafficHold,other.trafficRest>mission.state.time].join(','))].join('|');
}
export function unchangedRecoveryFailure(unit,conditions){return recoveryFailures.get(unit)===conditions;}
export function rememberRecoveryFailure(unit,conditions){recoveryFailures.set(unit,conditions);}
// A previously valid local manoeuvre can become blocked by a newly parked
// body. Try the bounded alternatives on that geometry change, rather than
// waiting for the old plan's one-second timeout. Special cooperative/arrival
// plans have their own contracts and are never replaced here.
export function* checkedDetourAlternative(mission,unit,plan,goal,allowed,dt=.1){
 if(plan.parking||plan.idleYield||plan.yieldReturning||plan.departure||plan.passageExit
  ||plan.progressRecovery||plan.pickup||plan.arrival||plan.rough||unit.pendingOrder)return null;
 const scale=mission.config.worldScale,state=mission.state,revision=unit.commandRevision;
 const condition=()=>{
  // A fast neighbour beyond the old fixed local radius can still brake
  // through any of the nine 1.2-scale legs or their 2.5-scale continuation.
  const radius=Math.max(scale*22,scale*(9*1.2+2.5)+maneuverAdmissionRadius(mission,unit,dt));
  return radius+'|'+recoveryConditions(mission,unit,radius)+'|'+goal.x+','+goal.y+'|'
   +mission.nearbyUnits(unit,radius).filter(other=>other.hp>0&&(other.driveSpeed??0)>0)
    .map(other=>[other.id,other.driveSpeed,other.steering,other.reversing].join(',')).join(';');
 };
 const signature=condition();
 if(blockedDetourFailures.get(plan)===signature)return null;
 const legs=yield* mission.planManeuverSteps(unit,goal,{scale,allowed,attempts:2,maximumLegs:9,
  reverseBudget:Math.max(0,scale*4-(unit.reverseDebt??0))});
 // A sliced search may outlive a replacement command or a changed obstacle.
 // Do not publish its old proof into that new state.
 if(mission.state!==state||mission.entity(unit.id)!==unit||unit.hp<=0||unit.detour!==plan
  ||unit.pendingOrder||unit.commandRevision!==revision||condition()!==signature)return null;
 if(!legs)blockedDetourFailures.set(plan,signature);
 return legs;
}
export function* checkedProgressTurn(mission,unit,waypoint,destination,allowed){
 const scale=mission.config.worldScale,depth=vehicleEnvelope(unit,scale,mission.field).depth,
  distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),initial=distance(unit,destination),toWaypoint=distance(unit,waypoint);
 if(initial<depth*2||toWaypoint<depth*2)return null;
 const signature=recoveryConditions(mission,unit)+'|'+destination.x+','+destination.y;
 if(progressTurnFailures.get(unit)===signature)return null;
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
 progressTurnFailures.set(unit,signature);return null;
}
// The optional distance cap proves a finite continuation for a cooperative
// yield. It only reports the simulated endpoint; it never consumes a waypoint.
export function* checkedRouteShortcut(mission,unit,goal,{allowed,tolerance=2,endpoint,maximumDistance=Infinity}){
 const scale=mission.config.worldScale,distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 const initial=distance(unit,goal),radius=2.6*scale/Math.tan(.67);
 const nearby=mission.nearbyUnits(unit,initial+radius*2+scale*7);
 const signature=[mission.nav.topologyRevision,goal.x,goal.y,maximumDistance,
  Math.round(unit.x*2),Math.round(unit.y*2),Math.round(unit.heading*20),
  ...nearby.filter(other=>other!==unit&&other.hp>0).map(other=>
   [other.id,Math.round(other.x*2),Math.round(other.y*2),Math.round(other.heading*20)].join(','))].join('|');
 let failed=failures.get(unit);
 if(failed?.has(signature))return false;
 let pose={...unit},travelled=0;
 const maximumTravel=initial*2+Math.PI*radius*2,speed=mission.unitSpec(unit).speed;
 for(let step=0;step<384&&travelled<maximumTravel;step++){
  const remaining=distance(pose,goal);
  if(remaining<tolerance||travelled>=maximumDistance){if(endpoint){endpoint.pose=pose;endpoint.travelled=travelled;}return true;}
  const slope=mission.field.gradientAt(pose.x,pose.y);
  const grade=(slope.x*(goal.x-pose.x)+slope.y*(goal.y-pose.y))/Math.max(1,remaining);
  const next=driveStep(pose,goal,.1,{speed,grade,scale,tolerance,allowed});
  if(!next)break;
  travelled+=distance(pose,next);pose=next;
  if(step%8===7&&performance.now()>=(mission.nav.workDeadline??Infinity))yield;
 }
 if(!failed){failed=new Set();failures.set(unit,failed);}
 failed.add(signature);if(failed.size>6)failed.delete(failed.values().next().value);
 return false;
}
