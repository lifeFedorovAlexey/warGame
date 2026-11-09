import {vehicleSweep,footprintSupport,vehicleRadiusBound,footprintGap,footprintCast,trafficCollisionRequired} from './vehicle-collision.js';
import {vehicleDynamics} from './vehicle-dynamics.js';
import {checkManeuverSteps} from './vehicle-motion.js';
import {maneuverAdmissionBlocker} from './maneuver-admission.js';
import {jointPlanFor} from './traffic-joint.js';

// A checked cooperative passage owns a finite swept corridor until it is
// executed or cancelled. Ordinary routing and local manoeuvres consult the
// same reservation, including cars outside the original wait component.
const prepared=new WeakMap();
const active=new WeakMap();
export function invalidateTrafficCorridors(mission){active.delete(mission);}
export function reserveManeuverCorridor(...args){
 const iterator=reserveManeuverCorridorSteps(...args);let step;do{step=iterator.next();}while(!step.done);return step.value;
}
export function* reserveManeuverCorridorSteps(mission,unit,legs,allowed=(from,to)=>mission.vehicleMotionClear(unit,from,to)){
 const corridor=[],pose=p=>({x:p.x,y:p.y,heading:p.heading,kind:unit.kind});
 const end=yield* checkManeuverSteps(unit,legs,mission.config.worldScale,(from,to)=>{
  if(!allowed(from,to)
   ||maneuverAdmissionBlocker(mission,unit,from,to,mission.config.simulationStep))return false;
  corridor.push({from:pose(from),to:pose(to)});return true;
 },()=>mission.nav.workDeadline??Infinity);
 if(!end)return null;
 invalidateTrafficCorridors(mission);return corridor;
}
const poses=sweep=>[sweep.start,sweep.middle,sweep.end];
function interval(sweep,x,y){
 const list=poses(sweep);
 return [Math.min(...list.map(p=>p.x*x+p.y*y-footprintSupport(p,x,y)))-sweep.padding,
  Math.max(...list.map(p=>p.x*x+p.y*y+footprintSupport(p,x,y)))+sweep.padding];
}
const bounds=sweep=>{const x=interval(sweep,1,0),y=interval(sweep,0,1);return {left:x[0],right:x[1],bottom:y[0],top:y[1]};};
const overlaps=(a,b,skin)=>a.left<b.right+skin&&b.left<a.right+skin&&a.bottom<b.top+skin&&b.bottom<a.top+skin;
const samePose=(a,b)=>a.x===b.x&&a.y===b.y&&(a.heading??0)===(b.heading??0)&&a.kind===b.kind;
function prepareCorridor(mission,corridor){
 let cached=prepared.get(corridor);
 if(!cached||cached.field!==mission.field||cached.scale!==mission.config.worldScale){
  cached={field:mission.field,scale:mission.config.worldScale,segments:[]};prepared.set(corridor,cached);
 }
 let changed=cached.segments.length!==corridor.length;
 for(let i=0;i<corridor.length;i++){
  const {from,to}=corridor[i],old=cached.segments[i];
  // Numeric checks also detect in-place reservation edits while owners stand
  // still. Avoid serializing the whole corridor on every collision probe.
  if(old&&samePose(old.from,from)&&samePose(old.to,to))continue;
  const radius=Math.max(vehicleRadiusBound(from.kind,cached.scale),vehicleRadiusBound(to.kind??from.kind,cached.scale));
  const delta=(to.heading??0)-(from.heading??0),turn=Math.atan2(Math.sin(delta),Math.cos(delta));
  const padding=.012+radius*(1-Math.cos(turn/4))+
   .5*Math.hypot(to.x-from.x,to.y-from.y)*Math.tan(Math.abs(turn)/4),reach=radius+padding;
  cached.segments[i]={from:{...from},to:{...to},bounds:{left:Math.min(from.x,to.x)-reach,right:Math.max(from.x,to.x)+reach,
   bottom:Math.min(from.y,to.y)-reach,top:Math.max(from.y,to.y)+reach},sweep:null};changed=true;
 }
 cached.segments.length=corridor.length;
 if(changed||!cached.bounds){
  cached.bounds={left:Infinity,right:-Infinity,bottom:Infinity,top:-Infinity};
  for(const segment of cached.segments){const b=segment.bounds,all=cached.bounds;
   all.left=Math.min(all.left,b.left);all.right=Math.max(all.right,b.right);all.bottom=Math.min(all.bottom,b.bottom);all.top=Math.max(all.top,b.top);}
 }
 return cached;
}
function preparedSweep(mission,segment){
 if(!segment.sweep){
  const sweep=vehicleSweep(segment.from,segment.to,mission.config.worldScale,mission.field);
  sweep.bounds=bounds(sweep);segment.sweep=sweep;
 }
 return segment.sweep;
}
function* reservations(mission,unit){
 let index=active.get(mission);
 if(!index||index.state!==mission.state||index.time!==mission.state.time){
  index={state:mission.state,time:mission.state.time,owners:mission.state.units.filter(u=>u.detour?.reservedCorridor||u.traffic?.cycle&&u.traffic.passageCorridor)};
  active.set(mission,index);
 }
 for(const owner of index.owners){
  const state=owner.traffic,local=owner.detour?.reservedCorridor,corridor=local??state?.passageCorridor;
  if(!corridor||!local&&(!state?.cycle||state.passageComplete)||owner.hp<=0||owner.pendingOrder||owner.owner!==unit.owner
   ||owner.id===unit.id||!local&&state.leader===unit.id)continue;
  if(owner.detour?.joint){
   const joint=jointPlanFor(mission,owner);
   if(!joint||joint.plan.members.some(member=>member.id===unit.id))continue;
  }
  if(local&&owner.detour.cooperativeYield===unit.id&&(owner.detour.cooperativeBackoff||unit.detour?.idleYield&&!unit.detour.yieldReturning)
   &&unit.yieldReturn?.cooperativeRequester?.id===owner.id)continue;
  const leader=local?owner:mission.entity(state.leader);
  if(!leader||leader.hp<=0||leader.pendingOrder||!local&&leader.cycleContinuation!==owner.id)continue;
  if(!trafficCollisionRequired(unit,owner)&&!trafficCollisionRequired(unit,leader))continue;
  const cached=prepareCorridor(mission,corridor);
  yield {owner,corridor,leader,segments:cached.segments,bounds:cached.bounds};
 }
}
export function corridorReservationActive(mission,unit,owner,corridor){
 if(mission.entity(owner.id)!==owner)return false;
 for(const reserved of reservations(mission,unit))if(reserved.owner===owner&&reserved.corridor===corridor)return true;
 return false;
}
export function corridorBlocker(mission,unit,from,to,witness){
 let own,ownBounds;const skin=mission.config.worldScale*.055;
 for(const {owner,corridor,leader,segments,bounds:reservedBounds} of reservations(mission,unit)){
  own??=vehicleSweep({...from,kind:unit.kind},{...to,kind:unit.kind},mission.config.worldScale,mission.field);
  ownBounds??=bounds(own);if(!overlaps(ownBounds,reservedBounds,skin))continue;
  for(const segment of segments){
   if(!overlaps(ownBounds,segment.bounds,skin))continue;
   const other=preparedSweep(mission,segment);
   if(!overlaps(ownBounds,other.bounds,skin))continue;
   const separated=footprintGap(own,other,skin)>=skin;
   if(!separated){if(witness)Object.assign(witness,{owner,corridor,leader});return leader;}
  }
 }
 return null;
}
export function corridorWithinReach(mission,unit,radius){
 for(const {bounds} of reservations(mission,unit))
  if(unit.x+radius>=bounds.left&&unit.x-radius<=bounds.right&&unit.y+radius>=bounds.bottom&&unit.y-radius<=bounds.top)return true;
 return false;
}
export function corridorSpeedLimit(mission,plan){
 let result=null;const scale=mission.config.worldScale,braking=vehicleDynamics(plan.unit).braking,reaction=braking*mission.config.simulationStep;
 const rx=footprintSupport(plan.shape,1,0),ry=footprintSupport(plan.shape,0,1),endX=plan.shape.x+plan.course.x*plan.length,endY=plan.shape.y+plan.course.y*plan.length;
 const region={left:Math.min(plan.shape.x,endX)-rx,right:Math.max(plan.shape.x,endX)+rx,bottom:Math.min(plan.shape.y,endY)-ry,top:Math.max(plan.shape.y,endY)+ry};
 for(const {leader,segments,bounds:reservedBounds} of reservations(mission,plan.unit)){
 if(!overlaps(region,reservedBounds,scale*.055))continue;
 for(const segment of segments){
  if(!overlaps(region,segment.bounds,scale*.055))continue;
  const sweep=preparedSweep(mission,segment);
  const enter=footprintCast(plan.shape,plan.course,plan.length,sweep,scale*.055);
  if(!Number.isFinite(enter))continue;
  const limit=Math.max(0,Math.sqrt(2*braking*Math.max(0,enter-.02)+reaction*reaction)-reaction);
  if(limit<(result?.limit??Infinity))result={limit,yieldTo:leader.id,checkedCorridor:true};
 }
 }
 return result;
}
