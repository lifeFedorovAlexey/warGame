import {firingSlots,firingPose,validPosition} from './firing-positions.js';
import {projectedTrafficView} from './traffic-context.js';
import {canReceiveAttack} from './combat-retreat-state.js';
import {canFillBefore,reuseArrivalPath,unoccupiedArrival} from './arrival-slots.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const destination=u=>u.combatDeployment?.goal??u.combatDeployment?.slot;
const failed=new WeakMap();
const freeToReassign=(m,u)=>u.task?.type==='combat-position'&&canReceiveAttack(u,m.unitSpec(u))
  &&!u.pendingOrder&&!u.proposedOrder&&!u.combatRetreat&&!u.detour&&!u.jointTraffic&&!u.cycleContinuation
  &&!u.yieldReturn&&!u.passage&&!u.traffic&&!u.trafficHold&&!u.trafficPassThrough?.pairs?.length&&!m.trafficCoordinator?.planner?.pendingFor(u)
  &&!m.trafficCoordinator?.planner?.activeFor(u);

// Publish only destinations and routes; physical state belongs to movement.
function applyPosition(m,unit,deployment,index,point,path){
  m.trafficCoordinator?.cancelFiringApproach?.(m,unit);
  deployment.index=index;deployment.slot={...point};deployment.goal={...point};deployment.status='moving';deployment.compacting=true;
  delete deployment.exhausted;delete deployment.conditions;delete deployment.rejectedSlots;delete deployment.relocateAt;
  unit.task={type:'combat-position',...point};unit.path=path;
  delete unit.driveWatch;delete unit.failedArcs;delete unit.combatArrivalBlockedAt;delete unit.combatArrivalGoal;
  failed.delete(unit);
}

// Reservations of distant arrivals are soft. Physical occupants and cars on
// their final approach keep their places. Progress is strictly toward the
// target, so a car cannot oscillate between two equally good vacant slots.
export function* advanceFiringFrontage(m,unit,deployment,target){
  if(!freeToReassign(m,unit)||deployment.compacting)return false;
  const borrowedIds=new Set();
  for(const other of m.state.units)if(other.trafficPassThrough?.revision===other.commandRevision)
    for(const pair of other.trafficPassThrough?.pairs??[])borrowedIds.add(pair.id);
  const borrowed=u=>borrowedIds.has(u.id);
  if(borrowed(unit))return false;
  const rear=destination(unit),scale=m.config.worldScale;
  if(!rear||distance(unit,rear)>scale*3)return false;
  const world=m.state,task=unit.task,revision=unit.commandRevision,topology=m.nav.topologyRevision;
  const origin={x:unit.x,y:unit.y,heading:unit.heading},anchor={x:target.x,y:target.y};
  const live=()=>m.state===world&&m.nav.topologyRevision===topology&&unit.combatDeployment===deployment
    &&unit.task===task&&unit.commandRevision===revision&&unit.x===origin.x&&unit.y===origin.y&&unit.heading===origin.heading
    &&target.hp>0&&target.x===anchor.x&&target.y===anchor.y&&m.visibleAt(target.x,target.y)&&freeToReassign(m,unit);
  const radius=distance(rear,target);
  if(radius<scale*2)return false;
  const dx=(target.x-rear.x)/radius,dy=(target.y-rear.y)/radius;
  const candidates=firingSlots(m.unitSpec(unit),scale,deployment.angle,deployment.anchor)
    .map((point,index)=>({point,index,depth:distance(point,target)}))
    .filter(({point,depth})=>depth<radius-scale*2&&distance(unit,point)<=scale*16
      &&(point.x-rear.x)*dx+(point.y-rear.y)*dy>scale*2
      &&Math.abs((point.x-rear.x)*dy-(point.y-rear.y)*dx)<=scale*7)
    .sort((a,b)=>(Math.abs(a.depth-b.depth)>.01?a.depth-b.depth:distance(unit,a.point)-distance(unit,b.point))||a.index-b.index);
  if(!candidates.length)return false;
  const members=m.state.units.filter(other=>other!==unit&&other.hp>0&&other.combatDeployment?.group===deployment.group);
  const relevant=new Set(m.nearbyUnits(unit,scale*24).filter(other=>distance(unit,other)<=scale*24));
  for(const other of members)if(destination(other)&&distance(unit,destination(other))<=scale*24)relevant.add(other);
  const key=JSON.stringify([topology,target.id,target.x,target.y,origin,rear,deployment.angle,deployment.anchor,
    [...relevant].sort((a,b)=>a.id.localeCompare(b.id)).map(u=>[u.id,u.x,u.y,u.heading,u.kind,u.hp>0,destination(u),u.combatDeployment?.status,
      u.commandRevision,!!u.pendingOrder,!!u.proposedOrder,!!u.combatRetreat,!!u.detour,!!u.jointTraffic,
      !!u.traffic,!!u.trafficHold,!!u.passage,!!u.yieldReturn,u.path?.length,u.path?.at(-1),freeToReassign(m,u),!!u.combatDeployment?.compacting,borrowed(u)])]);
  const previous=failed.get(unit);
  if(previous?.key===key&&previous.world===world&&previous.field===m.field)return false;
  for(const {point,index} of candidates){
    yield;
    if(!live())return false;
    const current=m.state.units.filter(other=>other!==unit&&other.hp>0&&other.combatDeployment?.group===deployment.group);
    const claims=current.filter(other=>other.hp>0&&other.combatDeployment?.group===deployment.group
      &&destination(other)&&distance(destination(other),point)<scale*5.3);
    if(claims.length>1)continue;
    const donor=claims[0],otherDeployment=donor?.combatDeployment;
    if(donor&&(donor.owner!==unit.owner||otherDeployment.targetId!==target.id||!freeToReassign(m,donor)||borrowed(donor)
      ||otherDeployment.status==='arrived'||otherDeployment.compacting
      ||!canFillBefore(unit,donor,point,scale)
      ||distance(donor,target)<=radius+scale*2))continue;
    const reserved=current.filter(other=>other!==donor).map(destination).filter(Boolean);
    if(!validPosition(m,unit,target,point,reserved))continue;
    const front=firingPose(unit,point,target);
    if(!unoccupiedArrival(m,unit,front)||!m.vehicleMotionClear(unit,unit,front))continue;
    let path=null;
    if(donor){
      // The rear vacancy becomes available AFTER the front car leaves. Its
      // full body remains present at the front in this endpoint check. Actual
      // movement still uses live collisions, including the departing car.
      const view=projectedTrafficView(m,new Map([[unit.id,front]]));
      if(!validPosition(view,donor,target,rear,[...reserved,point])||!unoccupiedArrival(view,donor,firingPose(donor,rear,target)))continue;
      path=reuseArrivalPath(m,donor,rear,scale);if(!path?.length)continue;
    }
    const oldIndex=deployment.index;
    applyPosition(m,unit,deployment,index,point,[{...point}]);
    if(donor)applyPosition(m,donor,otherDeployment,oldIndex,rear,path);
    m.trafficCoordinator?.intentChanged();
    m.recordTrafficDiagnostic?.({event:'firing-frontage-filled',ids:[unit.id,...(donor?[donor.id]:[])],from:{...rear},to:{...point}});
    return true;
  }
  if(live())failed.set(unit,{key,world,field:m.field});
  return false;
}
