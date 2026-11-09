import {checkManeuver,clearOfVehicles,maneuverStep} from './vehicle-motion.js';
import {vehicleEnvelope,vehicleClearance,vehicleSweep,sweepClearsVehicle,trafficCollisionRequired} from './vehicle-collision.js';
import {isInfantry} from './scav-unit-profiles.js';
import {UnitSpatialIndex} from './unit-spatial-index.js';
import {recoveryConditions,checkedRouteShortcut} from './traffic-shortcut.js';
import {reserveManeuverCorridor,corridorReservationActive} from './traffic-corridor.js';
import {maneuverAdmissionBlocker} from './maneuver-admission.js';
import {checkedArrivalRoute,checkedTerminalApproach,arrivalRouteAllowance} from './traffic-arrival-route.js';
import {localTrafficContext,trafficViewForObstacles,trafficReservationKey,LOCAL_RETRY_SECONDS} from './traffic-context.js';

// Bounded initial rollout for a close, aligned convoy ordered behind itself.
// Every member follows its existing column to a common turning place. There
// are no parked leases: the ordinary swept movement still guards every step.
const attempted=new WeakSet();
const homeIndexes=new WeakMap();
export function invalidateBorrowedHomes(mission){homeIndexes.delete(mission);}
function homeIndex(mission){
 let cache=homeIndexes.get(mission);
 if(!cache||cache.state!==mission.state){
  cache={state:mission.state,index:new UnitSpatialIndex(),entries:new Map()};
  for(const unit of mission.state.units)if(unit.yieldReturn){
   const home=unit.yieldReturn.home,entry={...home,home,unit};cache.entries.set(unit.id,entry);cache.index.insert(entry);
  }
  homeIndexes.set(mission,cache);
 }
 return cache;
}
export function borrowedHomeClear(mission,unit,pose=unit){
 const scale=mission.config.worldScale,cache=homeIndex(mission);
 const homes=cache.index.query(pose,scale*7).filter(entry=>entry.unit!==unit&&entry.unit.hp>0&&entry.unit.yieldReturn?.home===entry.home);
 return clearOfVehicles(null,{...pose,kind:unit.kind},homes.map(entry=>({...entry.home,hp:1})),scale,true,null,mission.field);
}
const dot=(a,b)=>a.x*b.x+a.y*b.y;
function departureColumns(group,right,forward,scale){
 const columns=[];
 for(const member of group.slice().sort((a,b)=>dot(a,right)-dot(b,right))){
  const across=dot(member,right),column=columns.at(-1);
  if(column&&Math.abs(column.across-across)<scale*.35)column.units.push(member);
  else columns.push({across,units:[member]});
 }
 if(columns.length>3||columns.some(column=>column.units.length<2))return null;
 for(const column of columns)column.units.sort((a,b)=>dot(b,forward)-dot(a,forward));
 return columns;
}
// Assign deeper destination rows to the actual first vehicles out of a
// reversing convoy. Using their current distance to the goal would invert
// this order and let early arrivals park across the following approach.
export function departureSlotOrder(units,goal,scale){
 if(units.length<3||units.length>12)return null;
 const first=units[0],forward={x:-Math.sin(first.heading),y:Math.cos(first.heading)},right={x:forward.y,y:-forward.x};
 if(units.some(unit=>isInfantry(unit)||unit.detour||unit.passage||unit.combatDeployment||unit.combatRetreat
  ||unit.builderWorking||unit.tool>0||unit.foldTime>0||(unit.driveSpeed??0)>.1
  ||Math.cos(unit.heading-first.heading)<.999||Math.hypot(unit.x-first.x,unit.y-first.y)>scale*22))return null;
 const center={x:units.reduce((s,u)=>s+u.x,0)/units.length,y:units.reduce((s,u)=>s+u.y,0)/units.length};
 const dx=goal.x-center.x,dy=goal.y-center.y,length=Math.hypot(dx,dy);
 if(dx*forward.x+dy*forward.y>-.72*length)return null;
 const columns=departureColumns(units,right,forward,scale);if(!columns)return null;
 const targetRight={x:dy/length,y:-dx/length};
 const ordered=[];
 for(let row=0;row<Math.max(...columns.map(column=>column.units.length));row++){
  ordered.push(...columns.map(column=>column.units[row]).filter(Boolean).sort((a,b)=>dot(a,targetRight)-dot(b,targetRight)));
 }
 return {columns:columns.length,orderedIds:ordered.map(unit=>unit.id)};
}
function* checkDeparture(mission,member,legs,scale,members,grade=.52,blockers){
 const reach=legs.reduce((sum,leg)=>sum+leg.remaining,0)+scale*7;
 const obstacles=mission.nearbyUnits(member,reach).filter(other=>!members.has(other)&&trafficCollisionRequired(member,other));
 function* arc(from,leg,length,depth=0){
  const rejected=blockers?new Set():undefined;
  const end=checkManeuver(from,[{...leg,remaining:length}],scale,
   (a,b)=>mission.vehicleMotionClear(member,a,b,grade,rejected,obstacles));
  if(end)return end;
  // A union of rotated hulls is conservative. A long proof interval can
  // therefore reject the same clear curve that the executor traversed in
  // shorter intervals. Refine that interval, retaining full swept bodies and
  // their unchanged safety skin; never accept endpoint-only clearance.
  if(length>.28&&depth<6){
   if(performance.now()>=(mission.nav.workDeadline??Infinity))yield;
   const middle=yield* arc(from,leg,length/2,depth+1);
   return middle?yield* arc(middle,leg,length/2,depth+1):null;
  }
  if(rejected)for(const other of rejected)blockers.add(other);
  return null;
 }
 let pose=member;
 for(const leg of legs){
  let remaining=leg.remaining;
  while(remaining>1e-8){
   const length=Math.min(remaining,scale*2);
   pose=yield* arc(pose,leg,length);
   if(!pose)return null;
   remaining-=length;
   if(performance.now()>=(mission.nav.workDeadline??Infinity))yield;
  }
 }
 return pose;
}
export function* prepareTrafficDeparture(mission,unit){
 const order=unit.routeOrder;
 if(!order||attempted.has(order))return false;
 const orders=new Set([order]);attempted.add(order);let completed=false;
 try{
  const result=yield* planTrafficDeparture(mission,unit,orders);completed=true;return result;
 }finally{
  // Abandoning a proof at a yield is not a geometric rejection. A later
  // controller must still be allowed to plan these unchanged physical orders.
  if(!completed)for(const candidate of orders)attempted.delete(candidate);
 }
}
function* planTrafficDeparture(mission,unit,orders){
 const order=unit.routeOrder,scale=mission.config.worldScale;
 if(!unit.path.length||!['move','attack-move'].includes(unit.task?.type)||unit.combatDeployment||unit.combatRetreat||unit.detour||unit.passage||unit.builderWorking||isInfantry(unit)||unit.tool>0||unit.foldTime>0||(unit.driveSpeed??0)>.1)return false;
 const forward={x:-Math.sin(unit.heading),y:Math.cos(unit.heading)},right={x:forward.y,y:-forward.x};
 const dx=unit.task.x-unit.x,dy=unit.task.y-unit.y;
 if(dx*forward.x+dy*forward.y>-.72*Math.hypot(dx,dy))return false;
 const group=mission.nearbyUnits(unit,scale*22).filter(other=>other.hp>0&&other.owner===unit.owner&&trafficCollisionRequired(unit,other)&&other.path.length
  &&!other.detour&&!other.passage&&!other.combatDeployment&&!other.combatRetreat&&!other.builderWorking&&!isInfantry(other)&&!(other.tool>0)&&!(other.foldTime>0)&&(other.driveSpeed??0)<.1
  &&other.routeOrder&&Math.hypot(other.routeOrder.request.x-order.request.x,other.routeOrder.request.y-order.request.y)<1
  &&Math.cos(other.heading-unit.heading)>.999&&Math.hypot(other.x-unit.x,other.y-unit.y)<scale*22);
 if(group.length<3||group.length>12)return false;
 for(const member of group){orders.add(member.routeOrder);attempted.add(member.routeOrder);}
 const columns=departureColumns(group,right,forward,scale);
 if(!columns){mission.trafficDepartureDebug?.({reason:'columns'});return false;}
 const centre=group.reduce((sum,u)=>sum+dot(u,right)/group.length,0),members=new Set(group);
 const depth=Math.max(...group.map(member=>vehicleEnvelope(member,scale,mission.field).depth));
 // The initial bend is sized from rear-overhang swing into the neighbouring
 // column. The full swept check below, rather than this estimate, accepts it.
 let sideGap=Infinity;
 for(let i=1;i<columns.length;i++)for(const a of columns[i].units)for(const b of columns[i-1].units){
  if(Math.abs(dot(a,forward)-dot(b,forward))<depth)sideGap=Math.min(sideGap,vehicleClearance(a,b,scale,mission.field));
 }
 const turnRadius=Math.max(depth*4,2.6*scale/Math.tan(.67))/scale;
 const spreadRadius=Math.max(turnRadius,depth*depth/Math.max(scale*.12,sideGap-scale*.12)/scale);
 for(const clearance of [4,6,8]){
  const plans=[];
  for(const column of columns){
   const head=Math.max(...column.units.map(u=>dot(u,forward)));
   const turnSign=column.across>=centre?-1:1;
   for(const [rank,member] of column.units.slice().sort((a,b)=>dot(b,forward)-dot(a,forward)).entries()){
    // A gentle first bend separates neighbouring columns before their rear
    // overhangs swing inward. A tight turn immediately from side-by-side rest
    // is not physically possible for the authored long bodies.
    const spreadAngle=.30,spreadCurve=2.6/spreadRadius,turnCurve=2.6/turnRadius;
    const legs=[{direction:1,curve:0,remaining:head-dot(member,forward)+scale*clearance},
     {direction:1,curve:turnSign*spreadCurve,remaining:spreadAngle*spreadRadius*scale},
     {direction:1,curve:turnSign*turnCurve,remaining:(Math.PI-spreadAngle)*2.6*scale/turnCurve}];
    const exit=yield* checkDeparture(mission,member,legs,scale,members);
    if(!exit)break;
    plans.push({unit:member,legs,exit,speed:13*Math.pow(.9,rank),length:legs.reduce((sum,l)=>sum+l.remaining,0)});
    if(performance.now()>=(mission.nav.workDeadline??Infinity))yield;
   }
  }
  if(plans.length!==group.length){mission.trafficDepartureDebug?.({reason:'terrain',clearance,plans:plans.length,group:group.length});continue;}
  // Integrate with the same acceleration and leg-boundary behaviour as the
  // actual vehicle. Slower following members open space while still rolling;
  // projected, terrain-dependent hulls must remain clear at every time step.
  const dt=mission.config.simulationStep??.1;
  const simulation=plans.map(p=>({pose:{...p.unit},legs:p.legs.map(l=>({...l})),distance:0}));
  let safe=true;
  for(let tick=0;tick<1000&&safe&&simulation.some(s=>s.legs.length);tick++){
   const previous=simulation.map(s=>s.pose),current=[];
   for(let i=0;i<plans.length;i++){
    const state=simulation[i],plan=plans[i];
    const leg=state.legs[0]??{direction:1,curve:0,remaining:1000};
    const step=maneuverStep(state.pose,leg,dt,{scale,allowed:()=>true,throughSpeed:plan.speed,forwardSpeed:plan.speed});
    state.pose=step.pose;state.distance+=step.length;leg.remaining-=step.length;
    if(leg.remaining<1e-6)state.legs.shift();
    current.push(state.pose);
   }
   for(let i=0;i<plans.length&&safe;i++)for(let j=0;j<i;j++){
    if(!clearOfVehicles(null,current[i],[{...current[j],hp:1},{...previous[j],hp:1}],scale,false,previous[i],mission.field)
      ||!clearOfVehicles(null,current[j],[{...current[i],hp:1},{...previous[i],hp:1}],scale,false,previous[j],mission.field)){safe=false;mission.trafficDepartureDebug?.({reason:'coupled',clearance,tick,i,j,current:current.map(p=>({...p}))});break;}
   }
   if(performance.now()>=(mission.nav.workDeadline??Infinity))yield;
  }
  if(!safe||simulation.some(s=>s.legs.length))continue;
  // Keep the leading vehicles on the trajectory just verified while the
  // tail finishes its turn. Otherwise an early switch to a converging route
  // would invalidate that shared rollout. This is continued motion, not a
  // timed hold; the added straight corridor is terrain/obstacle checked too.
  for(let i=0;i<plans.length;i++){
   const plan=plans[i],extra=simulation[i].distance-plan.length;
   if(extra>1e-6){
    const continuation={direction:1,curve:0,remaining:extra};
    const exit=yield* checkDeparture(mission,{...plan.unit,...plan.exit},[continuation],scale,members);
    if(!exit){safe=false;break;}
    plan.legs.push(continuation);plan.exit=exit;
   }
  }
  if(!safe)continue;
  for(const plan of plans){
   plan.path=yield* mission.vehiclePathSteps({...plan.unit,...plan.exit},plan.unit.task,{ignoreUnits:members,fallback:false,maxGoalDistance:.01});
   if(!plan.path?.length){safe=false;mission.trafficDepartureDebug?.({reason:'exitPath',clearance,id:plan.unit.id,exit:plan.exit});break;}
  }
  if(!safe)continue;
  for(const plan of plans){
   plan.unit.path=plan.path;
   plan.unit.detour={legs:plan.legs,departure:true,departureSpeed:plan.speed,blocked:0};
   delete plan.unit.traffic;delete plan.unit.trafficHold;delete plan.unit.driveWatch;delete plan.unit.mergeTraffic;
  }
  return true;
 }
 return false;
}

// Idle vehicles lend their parking space; a passage manoeuvre must not erase
// their final position. Store actual arc lengths so an interrupted yield can
// still retrace exactly what was driven, including across save/load.
export function rememberYieldHome(unit,requesters,rough=false,time=0,mission){
 if(unit.task||unit.path.length)return;
 const state=unit.yieldReturn??={home:{x:unit.x,y:unit.y,heading:unit.heading,kind:unit.kind},legs:[],requesters:[],phase:'outward'};
 state.rough||=rough;state.phase='outward';state.since=time;
 if(mission){
  const cache=homeIndex(mission);
  if(cache.entries.get(unit.id)?.home!==state.home){
   const entry={...state.home,home:state.home,unit};cache.entries.set(unit.id,entry);cache.index.insert(entry);
   if(cache.index.entries.size>Math.max(64,cache.entries.size*2)){
    const active=[...cache.entries.values()].filter(entry=>entry.unit.yieldReturn?.home===entry.home);
    cache.entries=new Map(active.map(entry=>[entry.unit.id,entry]));cache.index.rebuild(active);
   }
  }
 }
 for(const requester of requesters){
  if(!requester?.id||state.requesters.some(r=>r.id===requester.id))continue;
  const goal=requester.path.at(-1);
  state.requesters.push({id:requester.id,goal:goal&&{x:goal.x,y:goal.y}});
 }
}
export function recordYieldStep(unit,plan,leg,length){
 const state=unit.yieldReturn;
 if(!state||!plan.idleYield)return;
 if(plan.yieldReturning&&!plan.returnAlternative){
  const last=state.legs.at(-1);
  if(last){last.remaining-=length;if(last.remaining<1e-6)state.legs.pop();}
 }else{
  const last=state.legs.at(-1);
  if(last?.direction===leg.direction&&last.curve===leg.curve)last.remaining+=length;
  else state.legs.push({direction:leg.direction,curve:leg.curve,remaining:length});
 }
}
export function* routeYieldHome(mission,unit){
 const state=unit.yieldReturn;if(!state||unit.path.length||unit.task||unit.detour||unit.jointTraffic||unit.pendingOrder)return false;
 const goal=unit.routeOrder?.destination??state.home,world=mission.state,revision=unit.commandRevision,
  topology=mission.nav.topologyRevision,origin={x:unit.x,y:unit.y,heading:unit.heading};
 const path=yield* mission.vehiclePathSteps(unit,goal,{avoidMoving:true,fallback:true,maxGoalDistance:.01});
 if(!path?.length||mission.state!==world||unit.yieldReturn!==state||unit.pendingOrder||unit.commandRevision!==revision
  ||mission.nav.topologyRevision!==topology||unit.x!==origin.x||unit.y!==origin.y||unit.heading!==origin.heading)return false;
 unit.path=path;unit.task={type:'move',x:goal.x,y:goal.y,yieldHome:true};state.phase='routing';return true;
}
const failedCooperativeArrivals=new WeakMap();
const cooperativeParkingPlans=new WeakMap();
const failedBackoffs=new WeakMap();
const failedPassages=new WeakMap();
const obstructionKey=(mission,body,physical=false)=>JSON.stringify([body.x,body.y,body.heading,body.kind,body.hp>0,body.commandRevision,
 body.driveSpeed>.01?[body.driveSpeed,body.steering,body.reversing]:null,physical?!!body.path.length:body.path,body.task,body.routeOrder,body.pendingOrder,
 body.yieldReturn?.home,body.yieldReturn?.cooperativeRequester,body.jointTraffic,!!body.detour,body.builderWorking,body.tool,body.foldTime,body.passingLane,
 body.traffic?.phase,body.traffic?.passageComplete,mission.trafficCoordinator.passageDecisions.get(body.id),body.passage]);
const obstructionCorridor=body=>body.detour?.reservedCorridor??body.traffic?.passageCorridor;
function arrivalDependencies(mission,unit){
 return mission.navigationDiagnostics?.dependencies?.get(unit.id)??unit.navigation?.blockerIds
  ??(unit.navigation?.blockerId?[unit.navigation.blockerId]:[]);
}
const idleArrivalDonor=(mission,unit,other)=>other&&other!==unit&&other.hp>0&&other.owner===unit.owner&&trafficCollisionRequired(unit,other)&&!other.task
 &&!other.path.length&&!other.detour&&!other.jointTraffic&&!other.yieldReturn&&!other.pendingOrder&&!other.builderWorking&&!other.tool&&!other.foldTime
 &&mission.unitSpec(other).role!=='builder'&&!!other.routeOrder?.destination&&(other.driveSpeed??0)<=.01;
function movingArrivalBodies(mission,unit,range=mission.config.worldScale*22){
 return mission.nearbyUnits(unit,range).filter(other=>other!==unit&&other.hp>0&&trafficCollisionRequired(unit,other)&&Math.hypot(other.x-unit.x,other.y-unit.y)<=range
  &&((other.driveSpeed??0)>.01||(other.navigation?.speed??0)>.01||other.detour||other.pendingOrder));
}
const movingArrivalTraffic=(mission,unit)=>movingArrivalBodies(mission,unit).length>0;
function sameProofOrigin(mission,record,unit,key){
 return record&&record.world===mission.state&&record.field===mission.field&&record.scale===mission.config.worldScale
  &&record.topology===mission.nav.topologyRevision&&record.key===key&&record.own===obstructionKey(mission,unit);
}
function sameProofObstacles(mission,record){
 return record.bodies.every(({body,key,corridor,reservationKey})=>mission.entity(body.id)===body&&obstructionKey(mission,body,true)===key&&obstructionCorridor(body)===corridor&&trafficReservationKey(mission,body)===reservationKey)
  &&(record.reservations??[]).every(({actor,owner,corridor})=>mission.entity(actor.id)===actor&&corridorReservationActive(mission,actor,owner,corridor))
  &&(!record.deferredRegion||movingArrivalBodies(mission,mission.entity(record.deferredRegion.id)??record.deferredRegion,record.deferredRegion.radius).length>0);
}
function obstructionRecord(mission,unit,key,blockers){
 const canonical=new Map(mission.state.units.map(body=>[body.id,body]));
 // Candidate phases may contain projected copies. Cache dependencies on
 // the corresponding live body, not a synthetic future parking pose.
 const bodies=[...new Set([...blockers].map(body=>canonical.get(body.id)).filter(Boolean))];
 return {world:mission.state,field:mission.field,scale:mission.config.worldScale,
  topology:mission.nav.topologyRevision,key,own:obstructionKey(mission,unit),
  // A blocker's intermediate route is not occupied geometry. Retain whether
  // it has a route, since finishing it changes eligibility to lend its space.
  bodies:bodies.map(body=>({body,key:obstructionKey(mission,body,true),corridor:obstructionCorridor(body),reservationKey:trafficReservationKey(mission,body)}))};
}
function* cooperativeParking(mission,donor,leader,allowed,fine,blockers,valid,{exclude=[],limit=1,positionOnly=false}={}){
 const key=JSON.stringify([obstructionKey(mission,leader),leader.path,fine,exclude,limit,positionOnly]),slot=leader.id+'|'+fine+'|'+limit;
 let cache=cooperativeParkingPlans.get(donor);if(!cache){cache=new Map();cooperativeParkingPlans.set(donor,cache);}
 const record=cache.get(slot);
 const copy=plans=>plans.map(plan=>({...plan,legs:plan.legs.map(leg=>({...leg}))}));
 if(sameProofOrigin(mission,record,donor,key)){
  const usable=record.plans.filter(plan=>checkManeuver(donor,plan.legs,mission.config.worldScale,allowed));
  if(usable.length)return copy(usable);
  if(!record.plans.length&&mission.state.time<record.retryAt&&sameProofObstacles(mission,record)){
   for(const saved of record.bodies)blockers.add(saved.body);
   return [];
  }
 }
 const plans=[],ends=exclude.slice(),scale=mission.config.worldScale;
 // The first candidate stays cheap. Only after the complete joint proof
 // rejects it, collect a bounded set of alternatives in one search, instead
 // of restarting the same parking beam for each discarded endpoint.
 yield* mission.parkingManeuverSteps(donor,leader,allowed,{fine,
 accept:pose=>!ends.some(p=>Math.hypot(p.x-pose.x,p.y-pose.y)<=scale&&(positionOnly||Math.cos(p.heading-pose.heading)>=.98)),
 acceptPlan:(pose,legs)=>{
  ends.push({x:pose.x,y:pose.y,heading:pose.heading});plans.push({legs:legs.map(leg=>({...leg}))});
  return plans.length>=limit;
 }});
 if(valid()){
  cache.set(slot,{...obstructionRecord(mission,donor,key,blockers),plans,retryAt:mission.state.time+LOCAL_RETRY_SECONDS});
  if(cache.size>12)cache.delete(cache.keys().next().value);
 }
 return copy(plans);
}
// Recovery must follow repeated failed movement, not one diagnostic label:
// legacy route/traffic branches can keep reporting headway indefinitely.
// The range is the complete cooperative search's finite travel allowance.
export function cooperativeArrivalReady(mission,unit,goal){
 const scale=mission.config.worldScale;
 // Finish an already granted passage first. Other traffic is checked against
 // the candidate's actual sweeps and braking paths, rather than vetoing all
 // recovery anywhere within a large circle around a stationary requester.
 const yielding=unit.trafficHold&&mission.entity(unit.trafficHold);
 return !(yielding?.hp>0&&yielding.detour)&&!unit.traffic?.cycle
  &&(unit.navigation?.reason==='unchanged-local-obstruction'||(unit.driveWatch?.attempts??0)>=3||(unit.navigation?.waitSeconds??0)>=2)
  &&Math.hypot(unit.x-goal.x,unit.y-goal.y)<20*1.2*scale
  &&(!movingArrivalTraffic(mission,unit)||arrivalDependencies(mission,unit).some(id=>idleArrivalDonor(mission,unit,mission.entity(id))));
}
// Lending a parking space is one transaction: checked outward motion,
// an executed requester passage, then a possible return to the original home.
// Merely finding more space around the donor is not progress for its requester.
export function* checkedYieldPassage(mission,unit,other,park,{rough=false}={}){
 if(unit.pendingOrder||!unit.path.length||unit.detour?.legs.length||other.pendingOrder||other.task||other.path.length
  ||unit.jointTraffic||other.jointTraffic||other.detour||other.yieldReturn?.cooperativeRequester||other.hp<=0||unit.hp<=0)return false;
 const scale=mission.config.worldScale,world=mission.state,topology=mission.nav.topologyRevision,
  revision=unit.commandRevision,otherRevision=other.commandRevision,borrowed=other.yieldReturn,
  route=JSON.stringify([unit.task,unit.path,unit.routeOrder]);
 const history=other.yieldReturn?.legs??[],inverse=[...history,...park].toReversed().map(leg=>
  ({direction:-leg.direction,curve:-leg.curve,remaining:leg.remaining}));
 const reach=park.reduce((sum,leg)=>sum+leg.remaining,0)+scale*19;
 const continuousPassage=mission.trafficCoordinator.continuousPassageAllowed(mission,unit,other,reach);
 const signature=recoveryConditions(mission,unit,Math.max(scale*22,reach))+'|'+other.id+'|'+JSON.stringify([park,history,rough]);
 const previousFailure=failedPassages.get(unit)?.get(other.id);
 if(previousFailure?.signature===signature&&mission.state.time<previousFailure.retryAt)return false;
 const context=localTrafficContext(mission,[unit,other]);mission=context.view;
 const valid=()=>context.valid()&&!unit.pendingOrder&&!other.pendingOrder
  &&other.yieldReturn===borrowed&&!other.task&&!other.path.length&&!other.detour
  &&unit.commandRevision===revision&&other.commandRevision===otherRevision&&JSON.stringify([unit.task,unit.path,unit.routeOrder])===route;
 if(performance.now()>=(mission.nav.workDeadline??Infinity)){yield;if(!valid())return false;}
 const admitted=(body,obstacles,grade=.52)=>{
  const view=trafficViewForObstacles(mission,obstacles),actor=view.entity(body.id);
  const allowed=(from,to)=>view.vehicleMotionClear(actor,from,to,grade,undefined,view.vehicleMotionNeighbours(actor,from,to))
   &&!maneuverAdmissionBlocker(view,actor,from,to,mission.config.simulationStep);
  allowed.trafficView=view;return allowed;
 };
 const parkingClear=admitted(other,world.units,rough?.60:.52),parked=checkManeuver(other,park,scale,parkingClear);
 if(!parked)return false;
 const projected=world.units.map(body=>body===other?{...other,...parked,driveSpeed:0}:body),allowed=admitted(unit,projected);
 // A donor which advances along the aisle may lend a long return corridor.
 // The requester must be allowed to clear that corridor before we can prove
 // its inverse; a fixed short prefix rejects an otherwise valid convoy exit.
 const passage=[],passed=[];let from={...unit,driveSpeed:0},
  remaining=inverse.reduce((sum,leg)=>sum+leg.remaining,0)+scale*12,released=null;
 for(const [index,point] of unit.path.slice(0,3).entries()){
  const end={},tolerance=index===unit.path.length-1?.65:2;
  // Own only the passage needed to release the complete return corridor.
  // Holding the donor until an arbitrary long route prefix finishes adds
  // seconds of idle time even after its whole inverse is already clear.
  const releasedAt=pose=>{
   if(Math.hypot(unit.x-point.x,unit.y-point.y)-Math.hypot(pose.x-point.x,pose.y-point.y)<=scale*.5)return false;
   const after=world.units.map(body=>body===unit?{...unit,...pose,driveSpeed:0}:body);
   return !!checkManeuver({...other,...parked},inverse,scale,admitted(other,after,rough?.60:.52));
  };
  if(!(yield* checkedRouteShortcut(mission,from,point,{allowed,endpoint:end,maximumDistance:remaining,tolerance,stopWhen:continuousPassage?releasedAt:undefined})))break;
  if(!valid())return false;
  passage.push(...end.legs);if(end.reached)passed.push({...point});
  const progress=Math.hypot(unit.x-unit.path[0].x,unit.y-unit.path[0].y)
   -Math.hypot(end.pose.x-point.x,end.pose.y-point.y)
   +unit.path.slice(1,index+1).reduce((sum,p,i)=>sum+Math.hypot(p.x-unit.path[i].x,p.y-unit.path[i].y),0);
  const after=world.units.map(body=>body===unit?{...unit,...end.pose,driveSpeed:0}:body);
  if((progress>scale*.5||passed.length===unit.path.length)
   &&checkManeuver({...other,...parked},inverse,scale,admitted(other,after,rough?.60:.52))){released=end.pose;break;}
  remaining-=end.travelled;if(remaining<=0)break;from={...unit,...end.pose,driveSpeed:0};
 }
 if(!released){
  // A route follower cannot invent a turn around the parked donor. Search
  // one finite connector which actually advances the same waypoint and
  // leaves the donor's full inverse corridor clear.
  const sweeps=[];checkManeuver({...other,...parked},inverse,scale,(a,b)=>{sweeps.push(vehicleSweep(a,b,scale,mission.field));return true;});
  const point=unit.path[0],initial=Math.hypot(unit.x-point.x,unit.y-point.y);
  const connector=(yield* mission.parkingManeuverSteps(unit,{...other,...parked,path:[other.yieldReturn?.home??other]},allowed,{
   requireInverse:false,
   accept:pose=>{
    const distance=Math.hypot(pose.x-point.x,pose.y-point.y);
    if(initial-distance<=scale*.5&&!(unit.path.length===1&&distance<.65))return false;
    const body=vehicleEnvelope({...unit,...pose},scale,mission.field);
    return sweeps.every(sweep=>sweepClearsVehicle(sweep,body,scale*.055));
   }}))?.legs;
  if(!valid())return false;
  if(connector){
   const end=checkManeuver(unit,connector,scale,allowed),after=world.units.map(body=>body===unit?{...unit,...end,driveSpeed:0}:body);
   if(end&&checkManeuver({...other,...parked},inverse,scale,admitted(other,after,rough?.60:.52))){
    passage.splice(0,passage.length,...connector);passed.length=0;released=end;
    if(Math.hypot(end.x-point.x,end.y-point.y)<(unit.path.length===1?.65:2))passed.push({...point});
   }
  }
 }
 if(!released||!passage.length){
  if(valid()){let failed=failedPassages.get(unit);if(!failed){failed=new Map();failedPassages.set(unit,failed);}
   failed.set(other.id,{signature,retryAt:mission.state.time+2});if(failed.size>12)failed.delete(failed.keys().next().value);}
  return false;
 }
 // If the exact connector is already clear, execute it without moving an
 // unrelated neighbour. A conservative driving forecast is not a reason to
 // repeatedly lend the same parking space.
 const directCorridor=reserveManeuverCorridor(mission,unit,passage,admitted(unit,world.units));
 if(directCorridor&&valid()){
  unit.detour={legs:passage,parking:false,progressRecovery:true,blocked:0,passedWaypoints:passed,reservedCorridor:directCorridor};return true;
 }
 const after=world.units.map(body=>body===unit?{...unit,...released,driveSpeed:0}:body);
 return !!mission.trafficCoordinator.commitPassage(mission,unit,unit.routeOrder?.destination??unit.path.at(-1),[
  {body:other,from:other,legs:park,allowed:parkingClear,arrival:false,rough},
  {body:unit,from:unit,legs:passage,allowed,arrival:true,continuous:continuousPassage,passedWaypoints:passed},
  {body:other,from:{...other,...parked},legs:inverse,allowed:admitted(other,after,rough?.60:.52),arrival:false,returning:true,rough}
 ],valid);
}
export function* checkedPassageBackoff(mission,unit,other){
 const goal=unit.routeOrder?.destination,scale=mission.config.worldScale;
 if(!goal||unit.pendingOrder||unit.detour||unit.jointTraffic||other.jointTraffic||other.yieldReturn||other.task||other.path.length||other.detour||other.pendingOrder
  ||!other.routeOrder?.destination||Math.hypot(unit.x-goal.x,unit.y-goal.y)>scale*16)return null;
 const signature=recoveryConditions(mission,unit)+'|backoff:'+other.id+'|'+JSON.stringify(goal);
 const previousFailure=failedBackoffs.get(unit);
 if(previousFailure?.signature===signature&&mission.state.time<previousFailure.retryAt)return null;
 const world=mission.state,context=localTrafficContext(mission,[unit,other]);mission=context.view;
 const valid=()=>context.valid();
 const admitted=(body,obstacles)=>{
  const view=trafficViewForObstacles(mission,obstacles),actor=view.entity(body.id);
  const allowed=(from,to)=>view.vehicleMotionClear(actor,from,to,.52,undefined,view.vehicleMotionNeighbours(actor,from,to))
   &&!maneuverAdmissionBlocker(view,actor,from,to,mission.config.simulationStep);
  allowed.trafficView=view;return allowed;
 };
 for(const length of [scale*2,scale*3,scale*4]){
  const back=[{direction:-1,curve:0,remaining:length}],backClear=admitted(unit,world.units),exit=checkManeuver(unit,back,scale,backClear);
  if(!exit)continue;
  const leader={...unit,...exit,driveSpeed:0},afterBack=world.units.map(body=>body===unit?leader:body),parkingClear=admitted(other,afterBack);
  const park=yield* mission.parkingManeuverSteps(other,leader,parkingClear);
  if(!valid())return null;if(!park)continue;
  const parked=checkManeuver(other,park.legs,scale,parkingClear),afterPark=world.units.map(body=>body===other?{...other,...parked,driveSpeed:0}:body);
  const arrivalClear=admitted(unit,afterPark);
  const arrival=yield* mission.planManeuverSteps(leader,goal,{scale,allowed:arrivalClear,attempts:2,tolerance:.5,maximumLegs:24,reverseBudget:scale*6,
   accept:pose=>Math.hypot(pose.x-goal.x,pose.y-goal.y)<.65&&borrowedHomeClear(mission,unit,pose)});
  if(!valid())return null;if(!arrival)continue;
  const arrived=checkManeuver(leader,arrival,scale,arrivalClear),afterArrival=world.units.map(body=>body===unit?{...unit,...arrived,driveSpeed:0}:body),
   inverse=park.legs.toReversed().map(leg=>({direction:-leg.direction,curve:-leg.curve,remaining:leg.remaining}));
  if(!arrived||!checkManeuver({...other,...parked},inverse,scale,admitted(other,afterArrival)))continue;
  const transaction=mission.trafficCoordinator.commitPassage(mission,unit,goal,[
   {body:unit,from:unit,legs:back,allowed:backClear,arrival:false},
   {body:other,from:other,legs:park.legs,allowed:parkingClear,arrival:false},
   {body:unit,from:leader,legs:arrival,allowed:arrivalClear,arrival:true,returning:!!unit.yieldReturn,alternative:true,
    passedWaypoints:unit.path.map(point=>({...point}))},
   {body:other,from:{...other,...parked},legs:inverse,allowed:admitted(other,afterArrival),arrival:false,returning:true}
  ],valid);
  if(transaction)return transaction;
 }
 if(valid())failedBackoffs.set(unit,{signature,retryAt:mission.state.time+2});return null;
}
// A blocked donor can itself need a neighbouring space. Prove the entire
// ordered transaction, including both returns, before moving any participant.
// Search is deliberately bounded to the actual blocking donors and nearby
// helpers; it runs under the same yielding search budget as ordinary routing.
function* checkedJointArrival(mission,unit,goal,candidates,admitted,valid,accept,{quick=false,attempts}={}){
 if(unit.yieldReturn||unit.task?.type!=='move')return null;
 const scale=mission.config.worldScale,world=mission.state;
 // The caller restricts the early probe to direct blockers. In a stationary
 // scene its wider candidates also include parked bodies which prevented an
 // escape around an active blocker; those bodies need not be in the wait SCC.
 const donors=candidates.slice(0,quick?1:3);
 const projected=(...pairs)=>world.units.map(body=>{
  const pair=pairs.find(([u])=>u===body);return pair?{...body,...pair[1],driveSpeed:0}:body;
 });
 const inverse=legs=>legs.toReversed().map(l=>({direction:-l.direction,curve:-l.curve,remaining:l.remaining}));
 for(const donor of donors){
  const blockingHelpers=quick?new Set([...attempts.get(donor).phaseBlockers].map(body=>body.id)):null;
  const helpers=world.units.filter(other=>other!==donor&&idleArrivalDonor(mission,unit,other)
   &&(!blockingHelpers||blockingHelpers.has(other.id))
   &&Math.hypot(other.x-donor.x,other.y-donor.y)<scale*10)
   .sort((a,b)=>Math.hypot(a.x-donor.x,a.y-donor.y)-Math.hypot(b.x-donor.x,b.y-donor.y)).slice(0,quick?2:4);
  for(const helper of helpers)for(const length of (quick?[8]:[8,10,12,14]).map(n=>n*scale)){
   const first=[{direction:1,curve:0,remaining:length}],firstClear=admitted(helper),advanced=checkManeuver(helper,first,scale,firstClear);
   if(!advanced)continue;
   const parkingClear=admitted(donor,projected([helper,advanced])),ends=[];
   for(const fine of quick?[false]:[false,true]){
    const parks=[];
    yield* mission.parkingManeuverSteps(donor,{...unit,path:[goal]},parkingClear,{fine,
     accept:pose=>!ends.some(p=>Math.hypot(p.x-pose.x,p.y-pose.y)<scale),
     acceptPlan:(pose,legs)=>{ends.push(pose);parks.push({pose,legs});return parks.length>=(quick?1:4);}});
    if(!valid())return null;
    for(const park of parks){
     const helperReturn=inverse(first),helperStart={...helper,...advanced},helperClear=admitted(helper,projected([donor,park.pose])),
      home=checkManeuver(helperStart,helperReturn,scale,helperClear);
     if(!home)continue;
     const afterPark=projected([donor,park.pose],[helper,home]),arrivalClear=admitted(unit,afterPark),
      options={scale,attempts:2,maximumLegs:20,reverseBudget:scale*12,tolerance:.5};
     let arrival=yield* mission.planManeuverSteps(unit,goal,{...options,allowed:arrivalClear,accept});
     if(!valid())return null;
     if(!arrival)arrival=yield* checkedArrivalRoute(mission,unit,goal,afterPark,arrivalClear,valid,accept);
     if(!valid())return null;if(!arrival)continue;
     const arrived=checkManeuver(unit,arrival,scale,arrivalClear);if(!arrived)continue;
     const afterArrival=projected([unit,arrived],[helper,home]),returnClear=admitted(donor,afterArrival),donorStart={...donor,...park.pose},
      returnGoal=donor.routeOrder.destination,returnAccept=pose=>Math.hypot(pose.x-returnGoal.x,pose.y-returnGoal.y)<.65;
     let returning=inverse(park.legs),alternative=false;
     if(!checkManeuver(donorStart,returning,scale,returnClear)){
      alternative=true;
      returning=yield* mission.planManeuverSteps(donorStart,returnGoal,{...options,allowed:returnClear,accept:returnAccept});
      if(!valid())return null;
      if(!returning)returning=yield* checkedArrivalRoute(mission,donorStart,returnGoal,afterArrival,returnClear,valid,returnAccept);
     }
     if(!valid())return null;if(!returning)continue;
     const phases=[{body:helper,from:helper,legs:first,allowed:firstClear},
      {body:donor,from:donor,legs:park.legs,allowed:parkingClear},
      {body:helper,from:helperStart,legs:helperReturn,allowed:helperClear,returning:true},
      {body:unit,from:unit,legs:arrival,allowed:arrivalClear},
      {body:donor,from:donorStart,legs:returning,allowed:returnClear,returning:true,alternative}];
     const transaction=mission.trafficCoordinator.commitPassage(mission,unit,goal,phases,valid);
     if(transaction)return transaction;
    }
   }
  }
 }
 return null;
}
export function* checkedCooperativeArrival(mission,unit,goal,{cooperate=false}={}){
 // While traffic is progressing, address the actual stopped-body dependency.
 // A beam search may touch dozens of unrelated parked cars; trying to lend
 // every one of those spaces on each traffic tick is neither necessary nor
 // affordable. When the local scene is stationary, inspect all proof blockers.
 const dependencies=cooperate&&movingArrivalTraffic(mission,unit)?new Set(arrivalDependencies(mission,unit)):null;
 const failed=failedCooperativeArrivals.get(unit),key=JSON.stringify([goal,dependencies?[...dependencies].sort():null]);
 // This proof goes from the actual pose to the accepted goal. Replacing
 // intermediate bypass waypoints cannot make its failed geometry different.
 const arrivalOrigin={...unit,path:[]};
 if(cooperate&&mission.state.time<failed?.retryAt&&sameProofOrigin(mission,failed,arrivalOrigin,key)&&sameProofObstacles(mission,failed))return null;
 const scale=mission.config.worldScale,world=mission.state,context=localTrafficContext(mission,[unit]);mission=context.view;
 const valid=()=>context.valid();
 const physical=new Set(),reservations=new Map();
 // A reserved sweep is immutable while its owner executes it. Cache that
 // actual rejecting geometry, rather than invalidating on every owner pose.
 // Bodies reported for any physical/return-home reason retain pose checks.
 class Blockers extends Set{add(body){physical.add(body.id);return super.add(body);}}
 const blockers=new Blockers(),rejected=new Blockers();
 const admitted=(body,obstacles=world.units,collect=rejected)=>{
  const found=new Set(),witness={},view=trafficViewForObstacles(mission,obstacles),actor=view.entity(body.id);
  const allowed=(from,to)=>{
  found.clear();witness.owner=null;
  if(!view.vehicleMotionClear(actor,from,to,.52,found,view.vehicleMotionNeighbours(actor,from,to),witness)){
   if(witness.owner){
    for(const blocked of found)Set.prototype.add.call(collect,blocked);
    reservations.set(body.id+'|'+witness.owner.id,{...witness,actor:body});
   }else for(const blocked of found)collect.add(blocked);
   return false;
  }
  const braking=maneuverAdmissionBlocker(view,actor,from,to,mission.config.simulationStep);
  if(braking)collect.add(braking);
  return !braking;
  };
  allowed.trafficView=view;return allowed;
 };
 const allowed=admitted(unit,world.units,blockers);
 const options={scale,attempts:2,tolerance:.5,maximumLegs:cooperate?20:14,
  reverseBudget:cooperate?Math.min(scale*12,Math.hypot(unit.x-goal.x,unit.y-goal.y)+scale*2):scale*6,
  accept:pose=>{
   if(Math.hypot(pose.x-goal.x,pose.y-goal.y)>=.65)return false;
   if(!borrowedHomeClear(mission,unit,pose)){
    for(const body of world.units)if(body.yieldReturn)rejected.add(body);
    return false;
   }
   return unit.routeOrder?.destination||Math.cos(pose.heading-unit.yieldReturn.home.heading)>.9;
  }};
 const plan=legs=>({legs,parking:false,idleYield:!!unit.yieldReturn,yieldReturning:!!unit.yieldReturn,returnAlternative:true,preciseArrival:true,arrival:true,blocked:0,
  passedWaypoints:unit.path.map(p=>({...p}))});
 const direct=yield* mission.planManeuverSteps(unit,goal,{...options,allowed});
 if(!valid())return null;
 if(direct)return {...plan(direct),reservedCorridor:reserveManeuverCorridor(mission,unit,direct,allowed)};
 if(!cooperate)return null;
 // A return can be boxed in by a body behind it, which forward headway never
 // names. Use the failed complete return's physical blockers. Commit a pair
 // only after proving all three phases: yield, exact arrival, inverse return.
 const candidates=[...blockers].filter(other=>idleArrivalDonor(mission,unit,other)&&(!dependencies||dependencies.has(other.id)));
 const attempts=new Map(candidates.map(other=>[other,{phaseBlockers:new Blockers(),parkingEnds:[],refinable:new Set()}]));
 // Try the cheap first candidate for every donor before expanding any one
 // parking search. A rejected donor must not delay another easy passage.
 for(const alternative of [false,true])for(const other of candidates){
  const {phaseBlockers,parkingEnds,refinable}=attempts.get(other);
  for(const fine of [false,true]){
  // With no first legal parking pose, excluding more poses cannot help.
  if(alternative&&!refinable.has(fine))continue;
  // Refine a stable geometric obstruction. A moving body which rejected
  // the coarse proof will change its own clearance; restarting the much
  // denser search every tick while it passes only stalls the simulation.
  if((fine||alternative)&&[...phaseBlockers].some(body=>(body.driveSpeed??0)>.01||body.detour||body.pendingOrder))break;
  // This proof drives to the accepted goal, not along a possibly obsolete
  // bypass. The donor must clear that same approach. Refine only when the
  // coarse candidate cannot complete the joint arrival/return transaction.
  const parks=yield* cooperativeParking(mission,other,{...unit,path:[goal]},admitted(other,world.units,phaseBlockers),fine,phaseBlockers,valid,
   {exclude:parkingEnds,limit:alternative?3:1});
  if(!valid())return null;if(!parks.length)continue;
  refinable.add(fine);
  for(const park of parks){
  const parked=checkManeuver(other,park.legs,scale,()=>true),projected=world.units.map(body=>body===other?{...other,...parked}:body);
  parkingEnds.push({x:parked.x,y:parked.y,heading:parked.heading});
  const afterParking=admitted(unit,projected,phaseBlockers);
  const arrival=yield* mission.planManeuverSteps(unit,goal,{...options,allowed:afterParking});
  if(!valid())return null;if(!arrival)continue;
  const arrived=checkManeuver(unit,arrival,scale,afterParking),afterArrival=world.units.map(body=>body===unit?{...unit,...arrived}:body);
  const inverse=park.legs.toReversed().map(leg=>({direction:-leg.direction,curve:-leg.curve,remaining:leg.remaining}));
  if(!arrived||!checkManeuver(parked,inverse,scale,admitted(other,afterArrival,phaseBlockers)))continue;
  // The donor's inverse was proved against the arrived requester. Reserve
  // and execute it in the same transaction; publishing only parking and
  // arrival allows a third car to take that already-promised return space.
  const transaction=mission.trafficCoordinator.commitPassage(mission,unit,goal,[
   {body:other,from:other,legs:park.legs,allowed:admitted(other,world.units,phaseBlockers),arrival:false},
   {body:unit,from:unit,legs:arrival,allowed:afterParking,arrival:true,returning:!!unit.yieldReturn,alternative:true,
    passedWaypoints:unit.path.map(p=>({...p}))},
   {body:other,from:{...other,...parked},legs:inverse,allowed:admitted(other,afterArrival,phaseBlockers),arrival:false,returning:true}
  ],valid);
  if(transaction)return transaction;
  }
  }
  for(const body of phaseBlockers)Set.prototype.add.call(rejected,body);
 }
 // A car boxed between stopped bodies cannot wait for the convoy behind it
 // to finish first. Try one actual blocking donor and at most two helpers
 // which physically rejected that donor's parking search. This early probe
 // has just one coarse candidate per helper; all five phases, including
 // live neighbours' braking paths, still have to pass before committing.
 const dependenciesNow=new Set(arrivalDependencies(mission,unit));
 const boxedDonors=candidates.filter(other=>dependenciesNow.has(other.id)&&!attempts.get(other).parkingEnds.length);
 if(boxedDonors.length&&!reservations.size
  &&!checkManeuver(unit,[{direction:1,curve:0,remaining:scale}],scale,allowed)
  &&!checkManeuver(unit,[{direction:-1,curve:0,remaining:scale}],scale,allowed)&&!reservations.size){
  const joint=yield* checkedJointArrival(mission,unit,goal,boxedDonors,admitted,valid,options.accept,{quick:true,attempts});
  if(!valid())return null;if(joint)return joint;
 }
 // Local beams cannot reach an entrance on the far side of a parked group.
 // Once nearby traffic is stationary, check a complete outside approach.
 // An omitted body only proposes a donor; execution still requires that
 // donor's real parking arc, the full approach and its inverse return.
 // A global approach inspects a larger region than the local beam. Wait for
 // checked traffic in that same region rather than repeating a full global
 // proof at each intermediate pose. Its immutable reservation is the retry
 // dependency, so the search resumes as soon as that transaction releases it.
 const radius=arrivalRouteAllowance(unit,goal,scale)+scale*14,globalTraffic=movingArrivalBodies(mission,unit,radius);
 for(const body of globalTraffic){
  const owner=mission.entity(body.jointTraffic?.owner??body.yieldReturn?.cooperativeRequester?.id??body.id),corridor=owner&&obstructionCorridor(owner);
  if(corridor&&corridorReservationActive(mission,unit,owner,corridor))reservations.set(unit.id+'|'+owner.id,{actor:unit,owner,corridor,leader:owner});
  // An unrelated moving body only defers the global phase. Actual physical
  // rejection was already recorded by admitted(); do not manufacture a
  // pose-dependent local blocker merely because the body is in this region.
 }
 const outsideApproach=!reservations.size&&!globalTraffic.length
  &&(yield* mission.vehiclePathSteps(unit,goal,{obstacles:[],avoidMoving:true,fallback:false,maxGoalDistance:.01}));
 if(!valid())return null;
 if(outsideApproach){
  for(const body of world.units)if(body.hp>0&&Math.hypot(body.x-unit.x,body.y-unit.y)<=radius)rejected.add(body);
  const routed=yield* checkedArrivalRoute(mission,unit,goal,world.units,allowed,valid,options.accept);
  if(!valid())return null;
  if(routed){
   const corridor=reserveManeuverCorridor(mission,unit,routed,allowed);
   if(corridor&&valid())return {...plan(routed),reservedCorridor:corridor};
  }
  const entrances=world.units.filter(other=>idleArrivalDonor(mission,unit,other)
   &&Math.hypot(other.x-goal.x,other.y-goal.y)<scale*14)
   .sort((a,b)=>Math.hypot(a.x-goal.x,a.y-goal.y)-Math.hypot(b.x-goal.x,b.y-goal.y)||a.id.localeCompare(b.id));
  const terminal=yield* checkedTerminalApproach(mission,unit,goal,world.units,allowed,valid,options.accept);
  if(!valid())return null;
  if(terminal){
   const corridor=reserveManeuverCorridor(mission,unit,terminal,allowed);
   if(corridor&&valid())return {...plan(terminal),reservedCorridor:corridor};
  }
  for(const other of entrances){
   const approach=yield* mission.vehiclePathSteps(unit,goal,{ignoreUnits:new Set([other]),avoidMoving:true,fallback:false,maxGoalDistance:.01});
   if(!valid())return null;if(!approach?.length)continue;
   const entry=approach.at(-2)??unit,leader={...unit,...entry,heading:Math.atan2(entry.x-goal.x,goal.y-entry.y),path:[goal]},ends=[];
   for(const fine of [false,true]){
    const parks=yield* cooperativeParking(mission,other,leader,admitted(other),fine,rejected,valid,{exclude:ends,limit:3,positionOnly:true});
    if(!valid())return null;
    for(const park of parks){
     const parked=checkManeuver(other,park.legs,scale,()=>true);ends.push({x:parked.x,y:parked.y,heading:parked.heading});
     const projected=world.units.map(body=>body===other?{...other,...parked}:body),afterParking=admitted(unit,projected);
     const arrival=yield* checkedArrivalRoute(mission,unit,goal,projected,afterParking,valid,options.accept);
     if(!valid())return null;if(!arrival)continue;
     const arrived=checkManeuver(unit,arrival,scale,afterParking),afterArrival=world.units.map(body=>body===unit?{...unit,...arrived}:body),
      inverse=park.legs.toReversed().map(leg=>({direction:-leg.direction,curve:-leg.curve,remaining:leg.remaining}));
     if(!arrived||!checkManeuver({...other,...parked},inverse,scale,admitted(other,afterArrival)))continue;
     const transaction=mission.trafficCoordinator.commitPassage(mission,unit,goal,[
      {body:other,from:other,legs:park.legs,allowed:admitted(other),arrival:false},
      {body:unit,from:unit,legs:arrival,allowed:afterParking,arrival:true,returning:!!unit.yieldReturn,alternative:true,
       passedWaypoints:unit.path.map(p=>({...p}))},
      {body:other,from:{...other,...parked},legs:inverse,allowed:admitted(other,afterArrival),arrival:false,returning:true}
     ],valid);
     if(transaction)return transaction;
    }
   }
  }
 }
 if(outsideApproach&&valid()){
  const joint=yield* checkedJointArrival(mission,unit,goal,candidates,admitted,valid,options.accept);
  if(!valid())return null;if(joint)return joint;
 }
 if(valid()){
  const reservedIds=new Set([...reservations.values()].map(r=>r.leader.id));
  // Parking probes can name the requester itself as a blocker. Its pose and
  // intent are already checked by arrivalOrigin; keeping it again as a body
  // would accidentally reintroduce irrelevant bypass-waypoint invalidation.
  const bodies=new Set([...blockers,...rejected].filter(body=>body.id!==unit.id&&(physical.has(body.id)||!reservedIds.has(body.id))));
  failedCooperativeArrivals.set(unit,{...obstructionRecord(mission,arrivalOrigin,key,bodies),retryAt:mission.state.time+2,reservations:[...reservations.values()],
   deferredRegion:globalTraffic.length?{id:unit.id,x:unit.x,y:unit.y,radius}:null});
 }
 return null;
}
export function* resumeYieldHome(mission,unit){
 const state=unit.yieldReturn,scale=mission.config.worldScale;
 if(!state)return;
 const cooperating=state.cooperativeRequester;
 if(cooperating){
  const requester=mission.entity(cooperating.id);
  if(requester?.hp>0&&!requester.pendingOrder&&requester.commandRevision===cooperating.revision
   &&requester.detour?.cooperativeYield===unit.id){
   if(!unit.detour){state.phase='waiting';state.waitingFor=requester.id;return;}
  }else{
   delete state.cooperativeRequester;
   // Cancellation releases the unexecuted part of the loan. The actual
   // travelled history still owns a checked inverse to the original home.
   if(unit.detour?.idleYield&&!unit.detour.yieldReturning){delete unit.detour;state.phase='waiting';}
  }
 }
 const world=mission.state,revision=unit.commandRevision,topology=mission.nav.topologyRevision;
 const current=()=>mission.state===world&&unit.yieldReturn===state&&!unit.pendingOrder&&unit.commandRevision===revision&&mission.nav.topologyRevision===topology;
 const goal=unit.routeOrder?.destination;
 if(!unit.detour?.preciseArrival&&['returning','routing'].includes(state.phase)&&goal&&(!unit.task||unit.task.yieldHome)
  &&(!unit.detour||unit.detour.yieldReturning)
  &&Math.hypot(state.home.x-goal.x,state.home.y-goal.y)<2
  &&Math.hypot(unit.x-goal.x,unit.y-goal.y)<2
  &&(state.phase==='routing'||Math.cos(unit.heading-state.home.heading)>.9)
  &&borrowedHomeClear(mission,unit)&&mission.vehicleMotionClear(unit,unit,unit)){
  // The borrowed position itself was an accepted arrival pose. Returning
  // into the same goal tolerance is enough; do not drive past that goal
  // merely to replay the last centimetres of a previously valid inverse.
  delete unit.yieldReturn;delete unit.detour;
  if(unit.task?.yieldHome){unit.task=null;unit.path=[];}
  unit.driveSpeed=0;return;
 }
 if(unit.detour)return;
 if(state.phase==='routing'){
  if(unit.task?.yieldHome){
   // The route navigator can bring a borrowed car into a different approach
   // than the original inverse. Finish the accepted position with a complete
   // local parking proof; a partial "facing the goal" manoeuvre is insufficient
   // here and can exhaust ordinary reverse allowance beside the final slot.
   const destination=goal??state.home;
   // First let live traffic execute its already checked plans. A failed local
   // search during that movement is not evidence that another parked body
   // must be displaced. Escalation is for an unchanged stationary blockage.
   const cooperate=cooperativeArrivalReady(mission,unit,destination);
   if((unit.driveSpeed??0)<.01&&(cooperate||Math.hypot(unit.x-destination.x,unit.y-destination.y)<scale*6)){
    const signature=recoveryConditions(mission,unit)+'|'+JSON.stringify(destination)+'|'+cooperate;
    if(state.failedArrival!==signature||mission.state.time>=(state.arrivalRetryAt??-Infinity)){
     let arrival;
     if(cooperate)arrival=yield* checkedCooperativeArrival(mission,unit,destination,{cooperate:true});
     else{
      const legs=yield* mission.planManeuverSteps(unit,destination,{scale,attempts:2,tolerance:.5,
       maximumLegs:14,reverseBudget:scale*6,
       allowed:(from,to)=>mission.vehicleMotionClear(unit,from,to,state.rough?.60:.52),
       accept:pose=>Math.hypot(pose.x-destination.x,pose.y-destination.y)<1.95
        &&(goal||Math.cos(pose.heading-state.home.heading)>.9)&&borrowedHomeClear(mission,unit,pose)});
      if(!current())return;
      if(legs)arrival={legs,parking:false,idleYield:true,yieldReturning:true,returnAlternative:true,rough:state.rough,blocked:0,
       reservedCorridor:reserveManeuverCorridor(mission,unit,legs)};
     }
     if(!current())return;
     state.failedArrival=signature;
     state.arrivalRetryAt=mission.state.time+2;
     if(arrival)unit.detour=arrival;
    }
   }
   return;
  }
  if(!unit.task&&!unit.path.length&&!goal&&Math.hypot(unit.x-state.home.x,unit.y-state.home.y)<2
   &&borrowedHomeClear(mission,unit)&&mission.vehicleMotionClear(unit,unit,unit)){delete unit.yieldReturn;return;}
  if(!unit.task&&!unit.path.length)state.phase='waiting';
 }
 if(unit.task||unit.path.length){delete unit.yieldReturn;return;}
 if(!state.legs.length){delete unit.yieldReturn;return;}
 state.phase='waiting';delete state.waitingFor;
 // Unwind dependent borrowed spaces in reverse order. A vehicle that left
 // later may have used this already-vacated home as part of its return arc.
 // Parking here first would permanently block that checked inverse path.
 for(const other of mission.nearbyUnits(state.home,scale*14)){
  const borrowed=other.yieldReturn;
  if(other===unit||other.hp<=0||!borrowed||borrowed.since<state.since
   ||borrowed.since===state.since&&other.id<unit.id)continue;
  let pose=other,history=borrowed.legs;
  if(other.detour?.idleYield&&!other.detour.yieldReturning){
   pose=checkManeuver(other,other.detour.legs,scale,()=>true);
   history=[...history,...other.detour.legs];
  }
  const reverse=history.slice().reverse().map(leg=>({direction:-leg.direction,curve:-leg.curve,remaining:leg.remaining}));
  if(!checkManeuver(pose,reverse,scale,(from,to)=>clearOfVehicles(null,to,[{...state.home,hp:1}],scale,false,from,mission.field))){
   state.waitingFor=other.id;return;
  }
 }
 // Wait for an actual requested passage, not the age of a lease. Once the
 // requester's nearby route no longer crosses the borrowed position, replay
 // the cached return immediately if its complete swept corridor is clear.
 for(const request of state.requesters){
  const leader=mission.entity(request.id),goal=leader?.path.at(-1);
  if(!leader?.hp||!goal||!request.goal||Math.hypot(goal.x-request.goal.x,goal.y-request.goal.y)>1)continue;
  let from=leader,look=scale*12;
  for(const to of leader.path){
   const distance=Math.hypot(to.x-from.x,to.y-from.y),length=Math.min(look,distance);
   if(distance<1e-6){from=to;continue;}
   const heading=Math.atan2(from.x-to.x,to.y-from.y);
   for(let along=0;along<=length;along+=scale){
    const pose={x:from.x+(to.x-from.x)*along/distance,y:from.y+(to.y-from.y)*along/distance,heading,kind:leader.kind,hp:leader.hp};
    if(!clearOfVehicles(null,state.home,[pose],scale,true,null,mission.field)){state.waitingFor=leader.id;return;}
   }
   look-=length;if(look<=0)break;from=to;
  }
 }
 let legs=state.legs.slice().reverse().map(leg=>({direction:-leg.direction,curve:-leg.curve,remaining:leg.remaining}));
 const blockers=new Set();
 const end=yield* checkDeparture(mission,unit,legs,scale,new Set([unit]),state.rough ? .60 : .52,blockers);
 if(!current())return;
 let returnAlternative=false;
 if(!end){
  state.waitingFor='occupied-return-corridor';
  const moving=[...blockers].find(other=>(other.driveSpeed??0)>.1);
  if(moving){state.waitingFor=moving.id;return;}
  const goal=unit.routeOrder?.destination??state.home,homeBlockers=new Set(),homePose={...state.home,...goal};
  if(!clearOfVehicles(null,homePose,mission.nearbyUnits(homePose,scale*7).filter(other=>other!==unit),scale,true,null,mission.field,homeBlockers)
   ||!mission.vehicleMotionClear(unit,homePose,homePose)){
   state.waitingFor=homeBlockers.values().next().value?.id??'occupied-return-home';return;
  }
  // A neighbour may have arrived at its own final slot while this space was
  // borrowed. Retry changed geometry immediately; unchanged failures get a
  // delayed retry and cannot permanently suppress the accepted return.
  const signature=recoveryConditions(mission,unit)+'|'+JSON.stringify([state.home,unit.routeOrder?.destination]);
  // A failed complete inverse/parking proof does not forbid ordinary
  // progress to the same accepted destination. Prefer the normal route
  // executor before starting another exhaustive local parking proof.
  if(state.failedRoute!==signature||mission.state.time>=(state.routeRetryAt??-Infinity)){
   const routed=yield* routeYieldHome(mission,unit);
   if(!current())return;
   if(routed)return;
   state.failedRoute=signature;
   state.routeRetryAt=mission.state.time+2;
  }
  if(state.failedReturn===signature&&mission.state.time<(state.returnRetryAt??-Infinity))return;
  legs=yield* mission.planManeuverSteps(unit,goal,{scale,attempts:2,tolerance:.5,
   maximumLegs:14,reverseBudget:scale*6,
   allowed:(from,to)=>mission.vehicleMotionClear(unit,from,to,state.rough ? .60 : .52),
   accept:pose=>Math.hypot(pose.x-goal.x,pose.y-goal.y)<1.95
    &&(unit.routeOrder?.destination||Math.cos(pose.heading-state.home.heading)>.9)
    &&borrowedHomeClear(mission,unit,pose)});
  if(!current())return;
  if(!legs){
   // A failed inflated vehicle grid is not proof that an accepted goal is
   // unreachable. As with a public move order, try the static corridor too;
   // execution still checks every body and borrowed home on every step.
   // A newly occupied inverse may require going around the block. Keep the
   // original destination and use normal path following/traffic control;
   // this remains an unfinished return until actual arrival.
   yield* routeYieldHome(mission,unit);
   if(current()){state.failedReturn=signature;state.returnRetryAt=mission.state.time+2;}
   return;
  }
  state.failedReturn=signature;
  state.returnRetryAt=mission.state.time+2;
  returnAlternative=true;
 }else if(Math.hypot(end.x-state.home.x,end.y-state.home.y)>1e-4)return;
 state.phase='returning';
 unit.detour={legs,parking:false,idleYield:true,yieldReturning:true,returnAlternative,rough:state.rough,blocked:0,
  reservedCorridor:reserveManeuverCorridor(mission,unit,legs)};
}
