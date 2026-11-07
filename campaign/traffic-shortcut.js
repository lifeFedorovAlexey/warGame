import {driveStep} from './vehicle-motion.js';

// Prove a shortcut using the actual steering, acceleration and full-body
// sweep. A straight grid ray alone cannot prove that a van can make a turn.
// This never moves the real unit or reserves moving neighbours in time.
const failures=new WeakMap();
const recoveryFailures=new WeakMap();
export function recoveryConditions(mission,unit){
 const neighbours=mission.nearbyUnits(unit,mission.config.worldScale*22).filter(other=>other.hp>0);
 const admission=mission.trafficCoordinator.passageDecisions.get(unit.id);
 return [mission.nav.topologyRevision,unit.routeOrder?.revision,unit.task?.type,
  unit.path.map(point=>point.x+','+point.y).join(';'),unit.reverseDebt,admission?.key,admission?.admitted,
  ...neighbours.map(other=>[other.id,other.x,other.y,other.heading,
   other.path.length?other.path.at(-1).x+','+other.path.at(-1).y:'idle',other.detour?.legs[0]?.direction,
   other.traffic?.phase,other.trafficHold,other.trafficRest>mission.state.time].join(','))].join('|');
}
export function unchangedRecoveryFailure(unit,conditions){return recoveryFailures.get(unit)===conditions;}
export function rememberRecoveryFailure(unit,conditions){recoveryFailures.set(unit,conditions);}
export function* checkedRouteShortcut(mission,unit,goal,{allowed,tolerance=2}){
 const scale=mission.config.worldScale,distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 const initial=distance(unit,goal),radius=2.6*scale/Math.tan(.67);
 const nearby=mission.nearbyUnits(unit,initial+radius*2+scale*7);
 const signature=[mission.nav.topologyRevision,goal.x,goal.y,
  Math.round(unit.x*2),Math.round(unit.y*2),Math.round(unit.heading*20),
  ...nearby.filter(other=>other!==unit&&other.hp>0).map(other=>
   [other.id,Math.round(other.x*2),Math.round(other.y*2),Math.round(other.heading*20)].join(','))].join('|');
 let failed=failures.get(unit);
 if(failed?.has(signature))return false;
 let pose={...unit},travelled=0;
 const maximumTravel=initial*2+Math.PI*radius*2,speed=mission.unitSpec(unit).speed;
 for(let step=0;step<384&&travelled<maximumTravel;step++){
  const remaining=distance(pose,goal);
  if(remaining<tolerance)return true;
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
