import {trafficCollisionRequired} from './vehicle-collision.js';
import {maneuverStep,maneuverPlanStep} from './vehicle-motion.js';
import {vehicleDynamics} from './vehicle-dynamics.js';
import {maneuverAdmissionBlocker} from './maneuver-admission.js';
import {invalidateTrafficCorridors,reserveManeuverCorridorSteps} from './traffic-corridor.js';
import {navigationDecision} from './navigation-state.js';

const topologyCache=new WeakMap();
export function jointTopology(mission){
 let cached=topologyCache.get(mission);
 if(!cached||cached.state!==mission.state||cached.nav!==mission.nav||cached.revision!==mission.nav.topologyRevision){
  cached={state:mission.state,nav:mission.nav,revision:mission.nav.topologyRevision,
   key:JSON.stringify([mission.nav.bounds,mission.config.worldScale,
    mission.nav.solids.map(body=>[body.id,body.x,body.y,body.halfWidth,body.halfDepth])])};
  topologyCache.set(mission,cached);
 }
 return cached.key;
}
export const jointIntent=unit=>JSON.stringify([unit.kind,unit.owner,unit.commandRevision,unit.task,unit.routeOrder]);
export const jointPose=unit=>({x:unit.x,y:unit.y,heading:unit.heading});
// A single commit owns every participant and every future phase, including
// returning borrowed cars. No planner may publish only its outward half.
export function commitJointPlan(...args){
 const iterator=commitJointPlanSteps(...args);let step;do{step=iterator.next();}while(!step.done);return step.value;
}
export function* commitJointPlanSteps(mission,owner,goal,phases,rememberYieldHome,valid,{preserveLoans=false}={}){
 if(!valid())return null;
 const corridors=[];
 for(const p of phases){
  corridors.push(yield* reserveManeuverCorridorSteps(p.allowed?.trafficView??mission,p.from,p.legs,p.allowed));
  if(!corridors.at(-1)||!valid())return null;
 }
 if(corridors.some(c=>!c)||!valid())return null;
 const token=owner.id+':'+owner.commandRevision+':'+mission.state.time;
 const members=[...new Set([owner,...phases.map(p=>p.body)])];
 // Preserve an existing loan's history, but still create a loan for a newly
 // borrowed idle car. Otherwise cancelling only the leader strands its donor.
 for(const body of members)if(body!==owner&&(!preserveLoans||!body.yieldReturn)){
  rememberYieldHome(body,[owner],phases.some(p=>p.body===body&&p.rough),mission.state.time,mission);if(body.yieldReturn)body.yieldReturn.jointToken=token;
 }
 for(const body of members)body.jointTraffic={owner:owner.id,token,revision:body.commandRevision};
 mission.emit('navigation-joint-started',{owner:owner.id,token,members:members.map(body=>({id:body.id,
  pose:jointPose(body),hp:body.hp,revision:body.commandRevision,home:body.yieldReturn?.home,
  destination:body.routeOrder?.destination})),phases:phases.map(phase=>({id:phase.body.id,returning:!!phase.returning}))});
 return {legs:[],parking:false,preciseArrival:true,reservedCorridor:corridors.flat(),joint:{token,topology:jointTopology(mission),
  goal:{...goal},cursor:0,members:members.map(body=>({id:body.id,intent:jointIntent(body),pose:jointPose(body)})),
  phases:phases.map((p,index)=>({id:p.body.id,legs:p.legs.map(l=>({...l})),returning:!!p.returning,alternative:!!p.alternative,
   arrival:p.arrival??p.body===owner,corridor:corridors[index],continuous:p.continuous,rough:p.rough,trackHistory:!!p.body.yieldReturn,
   passedWaypoints:p.passedWaypoints?.map(point=>({...point}))}))}};
}
// Only members of the still-valid transaction may enter its reserved sweeps.
// Expected poses also revoke the proof after a collision or external relocation.
export function jointPlanFor(mission,unit){
 const marker=unit.jointTraffic,owner=marker&&mission.entity(marker.owner),plan=owner?.detour?.joint;
 if(!plan||plan.token!==marker.token||plan.topology!==jointTopology(mission))return null;
 for(const member of plan.members){
  const body=mission.entity(member.id);
  if(!body||body.hp<=0||body.pendingOrder||body.jointTraffic?.token!==plan.token||body.jointTraffic.owner!==owner.id
   ||body.combatRetreat?.forced||jointIntent(body)!==member.intent
   ||Math.hypot(body.x-member.pose.x,body.y-member.pose.y)>1e-5||Math.abs(body.heading-member.pose.heading)>1e-5)return null;
 }
 return {owner,plan};
}
function release(mission,ownerId,token,complete=false){
 const owner=mission.entity(ownerId);
 const members=[];
 if(owner?.detour?.joint?.token===token)delete owner.detour;
 for(const body of mission.state.units){
  if(body.jointTraffic?.owner!==ownerId||body.jointTraffic.token!==token)continue;
  members.push({id:body.id,pose:jointPose(body),hp:body.hp,revision:body.commandRevision,
   home:body.yieldReturn?.home,destination:body.routeOrder?.destination});
  const unchanged=body.commandRevision===body.jointTraffic.revision;
  delete body.jointTraffic;
  if(body.yieldReturn?.jointToken===token){
   delete body.yieldReturn.jointToken;
   // Preserve the actually travelled arcs for ordinary return recovery.
   // Explicit replacement commands retain their own state and destination.
   if(complete||!unchanged||!body.yieldReturn.legs.length)delete body.yieldReturn;
   else body.yieldReturn.phase='waiting';
  }
 }
 invalidateTrafficCorridors(mission);
 if(members.length)mission.emit('navigation-joint-finished',{owner:ownerId,token,complete,members});
}
// All phases use the normal vehicle dynamics and live swept-body checks.
// A single actor moves at a time; waiting members name that actual dependency.
export function stepJointTraffic(mission,unit,dt,recordYieldStep){
 const marker=unit.jointTraffic;if(!marker)return false;
 const transaction=jointPlanFor(mission,unit);
 if(!transaction){release(mission,marker.owner,marker.token);return false;}
 const {owner,plan}=transaction,phase=plan.phases[plan.cursor];
 if(plan.members.every(member=>!trafficCollisionRequired(owner,mission.entity(member.id)))){
  release(mission,owner.id,plan.token);return false;
 }
 if(phase.id!==unit.id){
  unit.driveSpeed=0;
  navigationDecision(unit,'WAITING_RESERVATION','joint-passage-phase',phase.id,'finish-checked-phase');return true;
 }
 const blockers=new Set(),leg=phase.legs[0],scale=mission.config.worldScale;
 const allowed=(from,to)=>{
  if(!mission.vehicleMotionClear(unit,from,to,phase.rough?.60:.52,blockers))return false;
  const blocker=maneuverAdmissionBlocker(mission,unit,from,to,dt);
  if(blocker)blockers.add(blocker);return !blocker;
 };
 const step=phase.continuous?maneuverPlanStep(unit,phase.legs,dt,{scale,allowed}):maneuverStep(unit,leg,dt,{scale,allowed,crawl:!!phase.rough,
  throughSpeed:phase.legs[1]?.direction===leg.direction?vehicleDynamics(unit).maneuverForward:0,
  forwardSpeed:vehicleDynamics(unit).maneuverForward});
 if(!step){
  unit.driveSpeed=0;plan.blocked=(plan.blocked??0)+dt;
  navigationDecision(unit,'BLOCKED','joint-passage-obstructed',[...blockers].map(b=>b.id),'recheck-or-release-joint-plan');
  if(plan.blocked>=3)release(mission,owner.id,plan.token);
  return true;
 }
 const travelled=Math.hypot(unit.x-step.pose.x,unit.y-step.pose.y);
 unit.reverseDebt=Math.max(0,(unit.reverseDebt??0)+(step.pose.reversing?travelled:-travelled*.33));
 Object.assign(unit,step.pose);plan.members.find(m=>m.id===unit.id).pose=jointPose(unit);
 for(const part of step.consumed??[{leg,length:step.length}]){
  recordYieldStep(unit,{idleYield:phase.trackHistory||unit.id!==owner.id,yieldReturning:phase.returning,returnAlternative:phase.alternative},part.leg,part.length);
  part.leg.remaining-=part.length;
  if(part.leg.remaining<1e-6)phase.legs.shift();
 }
 plan.blocked=0;
 if(leg.remaining<1e-6&&phase.legs[0]?.direction!==leg.direction)unit.driveSpeed=0;
 if(!phase.legs.length){
  for(const point of phase.passedWaypoints??[]){
   if(unit.path[0]?.x!==point.x||unit.path[0]?.y!==point.y)break;
   unit.path.shift();
  }
  if(phase.returning)delete unit.yieldReturn;
  if(phase.arrival&&unit.id===owner.id&&Math.hypot(unit.x-plan.goal.x,unit.y-plan.goal.y)<.65){
   // Other traffic must see the completed arrival now, rather than predict
   // another trip down the requester's obsolete path during the final return.
   unit.path=[];unit.task=null;delete unit.driveWatch;
   plan.members.find(member=>member.id===unit.id).intent=jointIntent(unit);
  }
  plan.cursor++;
  if(plan.cursor===plan.phases.length){
   // The final arrival was proved before committing any borrowed space.
   // Leave an interrupted or externally replaced order to its own controller.
   if(Math.hypot(owner.x-plan.goal.x,owner.y-plan.goal.y)<.65){owner.path=[];owner.task=null;delete owner.driveWatch;}
   release(mission,owner.id,plan.token,true);
  }else if(plan.phases.every(p=>Array.isArray(p.corridor))){
   // Preserve every future sweep, including returns, while releasing phases
   // already executed. Older saves without phase corridors retain their full
   // reservation until completion instead of accidentally freeing the future.
   owner.detour.reservedCorridor=plan.phases.slice(plan.cursor).flatMap(p=>p.corridor);
   invalidateTrafficCorridors(mission);
  }
 }
 return true;
}
