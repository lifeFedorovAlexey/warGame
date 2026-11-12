import {driveStep} from './vehicle-motion.js';
import {turningHeadway} from './turning-headway.js';
import {damageMobility} from './damage-state.js';
import {navigationDecision} from './navigation-state.js';
import {isInfantry} from './scav-unit-profiles.js';
import {cancelCombatRetreat} from './combat-policy.js';
import {cancelCombatDeployment} from './combat-deployment.js';
import {stepJointTraffic} from './traffic-joint.js';

export const immediateCommand=unit=>unit.pendingOrder?.status==='planning'
 &&unit.pendingOrder.steeringTarget&&['move','attack-move'].includes(unit.pendingOrder.type)&&!unit.pendingOrder.holdForRoute&&!isInfantry(unit);
export const commandSteeringTarget=unit=>unit.pendingOrder?.steeringTarget??unit.pendingOrder?.target;

// The dispatcher publishes intent; this executor only integrates the ordinary
// car arc and its stopping corridor. No route or manoeuvre search runs here.
export function stepCommandIntent(mission,unit,spec,dt){
 if(!immediateCommand(unit))return false;
 const pending=unit.pendingOrder,intent=mission.trafficCoordinator.intents.get(unit.id);
 if(intent?.revision!==pending.revision)return false;
 if(!pending.started){
  // Release an obsolete joint transaction before clearing its owner's state.
  stepJointTraffic(mission,unit,dt);
  cancelCombatRetreat(unit,unit.retreatSuppressed);cancelCombatDeployment(unit);
  for(const key of ['detour','traffic','trafficHold','passage','passingLane','yieldReturn','driveWatch','failedArcs','reverseDebt'])delete unit[key];
  pending.started=true;
 }
 if(unit.foldTime>0||unit.tool>0){
  unit.foldTime=Math.max(0,(unit.foldTime??0)-dt);unit.tool=Math.max(0,(unit.tool??0)-dt/2.6);unit.driveSpeed=0;
  navigationDecision(unit,'WAITING_RESERVATION','folding-before-move',null,'finish-folding');return true;
 }
 const target=commandSteeringTarget(unit),remaining=Math.hypot(target.x-unit.x,target.y-unit.y),scale=mission.config.worldScale;
 if(remaining<.65){unit.driveSpeed=0;navigationDecision(unit,'GLOBAL_REPLAN','await-destination-slot',null,'apply-current-order-result');return true;}
 const blockers=new Set(),speed=spec.speed*mission.nav.roads.factor(unit.x,unit.y)*damageMobility(unit.damage);
 const pose=driveStep(unit,target,dt,{speed,scale,tolerance:.65,
  trafficLimit:mission.trafficCoordinator.limit(unit),
  allowed:(from,to)=>mission.vehicleMotionClear(unit,from,to,.52,blockers),
  curveLimit:curve=>turningHeadway(mission,unit,target,dt,scale,blockers,.52,curve)});
 if(pose&&!pose.impactSpeed){
  Object.assign(unit,pose);
  navigationDecision(unit,'MOVING','command-intent',null,'follow-intent-until-route-ready',speed);
 }else{
  unit.driveSpeed=0;
  const decision=mission.trafficCoordinator.decisions.get(unit.id);
  navigationDecision(unit,'YIELDING','command-intent-obstructed',[...blockers].map(b=>b.id).concat(decision?.yieldTo??[]),'await-clearance-or-route',speed);
 }
 return true;
}

// Search snapshots never own physical pose. Rejoin the nearby suffix from the
// current position; a pose-relative escape must be replanned once at rest.
export function commandPathFromLive(mission,unit,source,path,relativePlan=false){
 const moved=Math.hypot(unit.x-source.x,unit.y-source.y);
 if(moved<1e-6&&Math.abs(unit.heading-source.heading)<1e-6)return path;
 if(relativePlan)return null;
 // An in-range attack can legitimately return no movement. After the owner
 // moves there is no segment to rejoin: let the existing rest/retry handoff
 // check that command from its current position instead of reading path[0].
 if(!path?.length)return null;
 let best=0,bestDistance=Infinity,from=source;
 for(let i=0;i<Math.min(path.length,8);i++){
  const to=path[i],dx=to.x-from.x,dy=to.y-from.y,length=dx*dx+dy*dy;
  const t=length?Math.max(0,Math.min(1,((unit.x-from.x)*dx+(unit.y-from.y)*dy)/length)):0;
  const gap=Math.hypot(unit.x-from.x-t*dx,unit.y-from.y-t*dy);
  if(gap<bestDistance){best=i;bestDistance=gap;}
  if(Math.hypot(to.x-source.x,to.y-source.y)>moved+mission.nav.cell*2)break;
  from=to;
 }
 for(let i=best;i>=0;i--)if(mission.nav.lineClear(unit,path[i],false,true))return path.slice(i);
 return null;
}

export function retryCommandFromRest(job,unit,destination){
 // This handoff is reached only after a complete replacement path was found.
 // A pose-relative departure now needs rest to reconnect that valid route.
 if(unit.proposedOrder){unit.pendingOrder=unit.proposedOrder;delete unit.proposedOrder;
  unit.commandRevision=unit.pendingOrder.revision;unit.retreatSuppressed=unit.pendingOrder.type==='move';delete unit.routeContinuation;}
 unit.pendingOrder.holdForRoute=true;
 if(destination)unit.pendingOrder.destination={...destination};
 (job.retryIds??=new Set()).add(unit.id);
}
