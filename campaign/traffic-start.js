import {checkManeuver,clearOfVehicles,maneuverStep} from './vehicle-motion.js';
import {vehicleEnvelope,vehicleClearance} from './vehicle-collision.js';
import {isInfantry} from './scav-unit-profiles.js';
import {UnitSpatialIndex} from './unit-spatial-index.js';

// Bounded initial rollout for a close, aligned convoy ordered behind itself.
// Every member follows its existing column to a common turning place. There
// are no parked leases: the ordinary swept movement still guards every step.
const attempted=new WeakSet();
const homeIndexes=new WeakMap();
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
 const obstacles=mission.nearbyUnits(member,reach).filter(other=>!members.has(other));
 let pose=member;
 for(const leg of legs){
  let remaining=leg.remaining;
  while(remaining>1e-8){
   const length=Math.min(remaining,scale*2);
   pose=checkManeuver(pose,[{...leg,remaining:length}],scale,
    (from,to)=>mission.vehicleMotionClear(member,from,to,grade,blockers,obstacles));
   if(!pose)return null;
   remaining-=length;
   if(performance.now()>=(mission.nav.workDeadline??Infinity))yield;
  }
 }
 return pose;
}
export function* prepareTrafficDeparture(mission,unit){
 const order=unit.routeOrder,scale=mission.config.worldScale;
 if(!order||attempted.has(order))return false;
 attempted.add(order);
 if(!unit.path.length||!['move','attack-move'].includes(unit.task?.type)||unit.combatDeployment||unit.combatRetreat||unit.detour||unit.passage||unit.builderWorking||isInfantry(unit)||unit.tool>0||unit.foldTime>0||(unit.driveSpeed??0)>.1)return false;
 const forward={x:-Math.sin(unit.heading),y:Math.cos(unit.heading)},right={x:forward.y,y:-forward.x};
 const dx=unit.task.x-unit.x,dy=unit.task.y-unit.y;
 if(dx*forward.x+dy*forward.y>-.72*Math.hypot(dx,dy))return false;
 const group=mission.nearbyUnits(unit,scale*22).filter(other=>other.hp>0&&other.owner===unit.owner&&other.path.length
  &&!other.detour&&!other.passage&&!other.combatDeployment&&!other.combatRetreat&&!other.builderWorking&&!isInfantry(other)&&!(other.tool>0)&&!(other.foldTime>0)&&(other.driveSpeed??0)<.1
  &&other.routeOrder&&Math.hypot(other.routeOrder.request.x-order.request.x,other.routeOrder.request.y-order.request.y)<1
  &&Math.cos(other.heading-unit.heading)>.999&&Math.hypot(other.x-unit.x,other.y-unit.y)<scale*22);
 if(group.length<3||group.length>12)return false;
 for(const member of group)attempted.add(member.routeOrder);
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
export function* resumeYieldHome(mission,unit){
 const state=unit.yieldReturn,scale=mission.config.worldScale;
 if(!state)return;
 const goal=unit.routeOrder?.destination;
 if(['returning','routing'].includes(state.phase)&&goal&&(!unit.task||unit.task.yieldHome)
  &&(!unit.detour||unit.detour.yieldReturning)
  &&Math.hypot(state.home.x-goal.x,state.home.y-goal.y)<2
  &&Math.hypot(unit.x-goal.x,unit.y-goal.y)<2
  &&Math.cos(unit.heading-state.home.heading)>.9
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
  if(unit.task?.yieldHome)return;
  if(!unit.task&&!unit.path.length){delete unit.yieldReturn;return;}
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
 let returnAlternative=false;
 if(!end){
  state.waitingFor='occupied-return-corridor';
  const moving=[...blockers].find(other=>other.path.length||(other.driveSpeed??0)>.1);
  if(moving){state.waitingFor=moving.id;return;}
  // A neighbour may have arrived at its own final slot while this space was
  // borrowed. Try one bounded alternative for that changed configuration;
  // an unchanged failed corridor never causes a periodic search loop.
  const neighbours=mission.nearbyUnits(unit,scale*14).filter(other=>other.hp>0);
  const signature=JSON.stringify(neighbours.map(other=>[other.id,Math.round(other.x),Math.round(other.y),Math.round(other.heading*8)]).sort((a,b)=>a[0].localeCompare(b[0])));
  if(state.failedReturn===signature)return;
  state.failedReturn=signature;
  const goal=unit.routeOrder?.destination??state.home;
  legs=yield* mission.planManeuverSteps(unit,goal,{scale,attempts:2,tolerance:.5,
   maximumLegs:14,reverseBudget:scale*6,
   allowed:(from,to)=>mission.vehicleMotionClear(unit,from,to,state.rough ? .60 : .52),
   accept:pose=>Math.hypot(pose.x-goal.x,pose.y-goal.y)<1.95
    &&Math.cos(pose.heading-state.home.heading)>.9});
  if(!legs){
   const path=yield* mission.vehiclePathSteps(unit,goal,{avoidMoving:true,fallback:false,maxGoalDistance:.01});
   if(!path?.length)return;
   // A newly occupied inverse may require going around the block. Keep the
   // original destination and use normal path following/traffic control;
   // this remains an unfinished return until actual arrival.
   unit.path=path;unit.task={type:'move',x:goal.x,y:goal.y,yieldHome:true};
   state.phase='routing';return;
  }
  returnAlternative=true;
 }else if(Math.hypot(end.x-state.home.x,end.y-state.home.y)>1e-4)return;
 state.phase='returning';
 unit.detour={legs,parking:false,idleYield:true,yieldReturning:true,returnAlternative,rough:state.rough,blocked:0};
}
