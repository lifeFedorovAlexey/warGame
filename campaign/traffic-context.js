import {vehicleRadiusBound,vehicleSweep,footprintSupport} from './vehicle-collision.js';
import {damageMobility} from './damage-state.js';

export const SEARCH_OUTCOME=Object.freeze({FOUND:'FOUND',LOCAL_SEARCH_EXHAUSTED:'LOCAL_SEARCH_EXHAUSTED',
 BLOCKED_DYNAMIC:'BLOCKED_DYNAMIC',STALE:'STALE',STATIC_UNREACHABLE:'STATIC_UNREACHABLE'});
// A bounded local search cannot establish STATIC_UNREACHABLE. Only a static
// connectivity proof may produce that outcome. Local failures get a retry.
export const LOCAL_RETRY_SECONDS=2;
const retreatIntent=u=>{if(!u.combatRetreat)return null;const {threat,...intent}=u.combatRetreat;return intent;};
export const trafficPoseKey=u=>JSON.stringify([u.x,u.y,u.heading,u.kind,u.owner,u.hp>0,u.trafficOnScreen??true]);
export const trafficBodyKey=u=>JSON.stringify([trafficPoseKey(u),u.hp>=u.maxHp,
 !u.retreatSuppressed&&u.hp<=u.maxHp*({light:.8,heavy:.35}[u.combatPolicy?.retreat]??0),
 damageMobility(u.damage),u.steeringFault?.since??null,!!u.damage?.wreck,u.commandRevision,u.pendingOrder,u.path,u.task,u.routeOrder,u.reverseDebt,
 (u.driveSpeed??0)>.01?[u.driveSpeed,u.reversing,u.steering]:null,u.detour&&{...u.detour,blocked:undefined},
 u.traffic,u.trafficHold,u.passage,u.passingLane,u.yieldReturn,u.jointTraffic,u.cycleContinuation,u.tool,u.foldTime,
 u.builderWorking,u.combatPolicy,retreatIntent(u),u.combatDeployment,u.combatResume]);
export const trafficReservationKey=(mission,u)=>JSON.stringify([
 u.detour?.reservedCorridor,u.traffic,u.jointTraffic,u.passage,
 mission.trafficCoordinator?.decisions?.get(u.id),mission.trafficCoordinator?.passageDecisions?.get(u.id)]);
export const trafficConditionKey=(mission,u)=>trafficBodyKey(u)+'|'+trafficReservationKey(mission,u);
export function trafficRequestKey(mission,type,ids){
 return JSON.stringify([type,[...ids].sort().map(id=>[id,
  [...(mission.navigationDiagnostics?.dependencies?.get(id)??mission.entity(id)?.navigation?.blockerIds??[])].sort()])]);
}
const overlap=(a,b)=>a.left<=b.right&&b.left<=a.right&&a.bottom<=b.top&&b.bottom<=a.top;
// Test the swept hull, not its endpoints/centre line. In particular a long
// corridor can cross the region while both endpoint centres are outside it.
export function reserveIntersects(mission,body,box){
 const corridors=[body.detour?.reservedCorridor,body.traffic?.passageCorridor];
 const scale=mission.config.worldScale,skin=scale*.055+.02;
 for(const corridor of corridors)for(const segment of corridor??[]){
  const sweep=vehicleSweep({...segment.from,kind:segment.from.kind??body.kind},
   {...segment.to,kind:segment.to.kind??body.kind},scale,mission.field);
  const poses=[sweep.start,sweep.middle,sweep.end],padding=sweep.padding+skin;
  const bounds={left:Math.min(...poses.map(p=>p.x-footprintSupport(p,1,0)))-padding,
   right:Math.max(...poses.map(p=>p.x+footprintSupport(p,1,0)))+padding,
   bottom:Math.min(...poses.map(p=>p.y-footprintSupport(p,0,1)))-padding,
   top:Math.max(...poses.map(p=>p.y+footprintSupport(p,0,1)))+padding};
  if(overlap(bounds,box))return true;
 }
 return false;
}
export function bodyInTrafficRegion(mission,body,box){
 const r=vehicleRadiusBound(body.kind,mission.config.worldScale);
 const home=body.yieldReturn?.home;
 return overlap(box,{left:body.x-r,right:body.x+r,bottom:body.y-r,top:body.y+r})
  ||home&&overlap(box,{left:home.x-r,right:home.x+r,bottom:home.y-r,top:home.y+r})||reserveIntersects(mission,body,box);
}
export function captureTrafficBodies(mission){
 return mission.state.units.map(u=>({id:u.id,x:u.x,y:u.y,kind:u.kind,key:trafficConditionKey(mission,u),
  poseKey:trafficPoseKey(u),reservationKey:trafficReservationKey(mission,u),
  detour:{reservedCorridor:structuredClone(u.detour?.reservedCorridor)},
  traffic:{passageCorridor:structuredClone(u.traffic?.passageCorridor)},yieldReturn:structuredClone(u.yieldReturn)}));
}
export function trafficWitness(mission,region,ids,baseline,onlyIds=false){
 return JSON.stringify((baseline??mission.state.units).filter(u=>ids.includes(u.id)||!onlyIds&&bodyInTrafficRegion(mission,u,region))
  .map(u=>[u.id,baseline?u.key:trafficConditionKey(mission,u)]).sort((a,b)=>a[0].localeCompare(b[0])));
}
// Explain a changed witness only when rejecting/revisiting a result. The
// regular collision probes do not build diagnostic diffs or emit events.
export function trafficDependencyChanges(mission,region,ids,baseline,onlyIds=false){
 const included=u=>ids.includes(u.id)||!onlyIds&&bodyInTrafficRegion(mission,u,region);
 const before=new Map((baseline??[]).filter(included).map(u=>[u.id,u]));
 const after=new Map(mission.state.units.filter(included).map(u=>[u.id,u]));
 const changes=[];
 for(const id of new Set([...before.keys(),...after.keys()])){
  const a=before.get(id),b=after.get(id);
  if(!a||!b){changes.push({id,change:a?'left-region':'entered-region'});continue;}
  if(a.key===trafficConditionKey(mission,b))continue;
  const poseChanged=a.poseKey!==trafficPoseKey(b),reservationChanged=a.reservationKey!==trafficReservationKey(mission,b);
  changes.push({id,change:poseChanged?'pose':reservationChanged?'reservation':'navigation-or-service',poseChanged,reservationChanged});
 }
 return changes;
}
export function expandTrafficRegion(region,point,radius){
 region.left=Math.min(region.left,point.x-radius);region.right=Math.max(region.right,point.x+radius);
 region.bottom=Math.min(region.bottom,point.y-radius);region.top=Math.max(region.top,point.y+radius);
}
// Track the area actually inspected by this local search. New entrants and
// changed reservations in that area invalidate it; distant motion does not.
export function localTrafficContext(mission,members){
 const world=mission.state,topology=mission.nav.topologyRevision,field=mission.field,scale=mission.config.worldScale;
 const ids=members.map(u=>u.id),baseline=captureTrafficBodies(mission);
 const region={left:Infinity,right:-Infinity,bottom:Infinity,top:-Infinity};
 const observe=(point,radius)=>expandTrafficRegion(region,point,radius+scale*8);
 for(const member of members)observe(member,scale*20);
 const view=Object.create(mission);
 view.id=(...args)=>mission.id(...args);view.emit=(...args)=>mission.emit(...args);
 view.nearbyUnits=function(point,radius,...args){observe(point,radius);return mission.nearbyUnits.call(this,point,radius,...args);};
 view.vehicleMotionNeighbours=function(actor,from,to){observe(from,Math.hypot(to.x-from.x,to.y-from.y)+scale*8);return mission.vehicleMotionNeighbours.call(this,actor,from,to);};
 view.vehicleMotionClear=function(actor,from,to,...args){observe(from,Math.hypot(to.x-from.x,to.y-from.y)+scale*8);return mission.vehicleMotionClear.call(this,actor,from,to,...args);};
 const valid=()=>mission.state===world&&mission.field===field&&mission.config.worldScale===scale&&mission.nav.topologyRevision===topology
  &&trafficWitness(mission,region,ids)===trafficWitness(mission,region,ids,baseline);
 return {view,valid,region,baseline,ids,world,topology,field,scale};
}
// Every phase uses one world view for body collisions, braking admission and
// reservations. Replace participants by their projected FULL bodies; never
// remove them from collision checks. Reservations remain attached to owners.
export function projectedTrafficView(mission,projected){
 const byId=new Map([...projected].map(([key,pose])=>[typeof key==='string'?key:key.id,pose]));
 if(!byId.size)return mission;
 const view=Object.create(mission),replace=list=>{
  const result=list.filter(body=>!byId.has(body.id));
  for(const body of byId.values())result.push(body);
  return result;
 };
 view.state={...mission.state,units:mission.state.units.map(body=>byId.get(body.id)??body)};
 view.entity=id=>byId.get(id)??mission.entity(id);
 view.nearbyUnits=(point,radius,excludeOwner)=>replace(mission.nearbyUnits(point,radius,excludeOwner))
  .filter(body=>(excludeOwner===undefined||body.owner!==excludeOwner)&&Math.abs(body.x-point.x)<=radius&&Math.abs(body.y-point.y)<=radius);
 view.vehicleMotionNeighbours=(actor,from,to)=>replace(mission.vehicleMotionNeighbours(actor,from,to));
 return view;
}
export function trafficViewForObstacles(mission,obstacles){
 return projectedTrafficView(mission,new Map((obstacles??[]).filter(body=>mission.entity(body.id)!==body).map(body=>[body.id,body])));
}
