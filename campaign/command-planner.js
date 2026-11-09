import {pickupTarget} from './pickup-orders.js';
import {inFactoryInterior} from './combat-retreat-state.js';
import {isInfantry} from './scav-unit-profiles.js';
import {movementEngaged} from './combat-orders.js';
import {departureSlotOrder} from './traffic-start.js';
import {ownsContinuation,prepareRoutePrefixes,continuationSource,stageRouteTail} from './route-continuation.js';
import {commandPathFromLive,retryCommandFromRest} from './command-motion.js';

// A suspended unit controller may be planning a yield for another vehicle.
// Commit only BETWEEN controllers, never into any live movement generator.
// Passage changes also wait for the next global admission snapshot.
export function commandBoundary(mission,passageChange=false){
 const tick=mission.pendingTick;
 return !tick||!passageChange&&!tick.iterator&&!tick.goalRelease&&!tick.overlaps;
}
export function activateCommand(mission,unit){
 // Routes may commit between controllers. Their first movement still needs
 // the next coordinator snapshot, including incoming neighbours' intents.
 if(mission.pendingTick)unit.commandStartAfter=mission.state.time;
 else delete unit.commandStartAfter;
}

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const travel=new Set(['move','attack-move','attack']);
const pendingCommand=unit=>unit?.proposedOrder??unit?.pendingOrder;
const ownsPending=(unit,revision)=>pendingCommand(unit)?.revision===revision;
const plannedFields=['path','task','routeOrder','detour','traffic','trafficHold','driveWatch','reverseDebt','failedArcs','workEscapeRetryAt',
 'passage','passingLane','factoryVisit','combatRetreat','combatDeployment','combatGroup','combatContactAt','combatResume','combatArrivalBlockedAt',
 'combatArrivalGoal','combatParking','combatDisengage','retreatSuppressed','mergeTraffic','yieldReturn','resumeConstructionId','terrainEscape'];
function coupledStarts(mission,units,target){
 const range=mission.config.worldScale*7,buckets=new Map(),eligible=units.filter(u=>!isInfantry(u)&&(u.driveSpeed??0)<=.1&&!(u.tool>0)&&!(u.foldTime>0)
  &&(target.x-u.x)*-Math.sin(u.heading)+(target.y-u.y)*Math.cos(u.heading)<=-.5*distance(u,target));
 for(const unit of eligible){const key=Math.floor(unit.x/range)+','+Math.floor(unit.y/range),list=buckets.get(key)??[];list.push(unit);buckets.set(key,list);}
 const visited=new Set(),cohorts=[];
 for(const first of eligible){
  if(visited.has(first))continue;
  const group=[first];visited.add(first);
  for(let i=0;i<group.length;i++){
   const unit=group[i],x=Math.floor(unit.x/range),y=Math.floor(unit.y/range);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)for(const other of buckets.get((x+dx)+','+(y+dy))??[]){
    if(visited.has(other)||Math.cos(other.heading-first.heading)<.999||distance(unit,other)>=range)continue;
    visited.add(other);group.push(other);
   }
  }
  if(group.length>=3&&group.length<=12&&departureSlotOrder(group,target,mission.config.worldScale))cohorts.push(group.map(u=>u.id));
 }
 return cohorts;
}

// One private search context: movement keeps its own suspended A* state. Only
// data intents are saved; a loaded command reconstructs unfinished searches.
export class CommandPlanner{
 constructor(mission,{prefixThreshold=128}={}){
  this.mission=mission;this.nav=mission.nav.createSearchContext();this.active=null;
  this.prefixThreshold=prefixThreshold;
  mission.state.commandOrders??=[];
  for(const order of mission.state.commandOrders)if(order.status==='planning')order.status='queued';
  this.stats={slices:0,cpuMs:0,maxSliceMs:0,applied:0,reused:0,cancelled:0,preemptions:0,rejectedKeptRoute:0};
 }
 signature(record){
  const m=this.mission,selected=new Set(record.ids),size=m.config.worldScale*16,zones=new Set();
  const pending=m.state.units.filter(u=>ownsPending(u,record.revision)||ownsContinuation(u,record.revision)&&u.routeContinuation.failure);
  const failure=u=>pendingCommand(u)??u.routeContinuation?.failure;
  if(record.status==='complete'&&pending.length&&pending.every(u=>failure(u).reason==='destination-occupied'&&failure(u).blockerId)){
   const ids=[...new Set(pending.map(u=>failure(u).blockerId))].sort();
   return ['occupied',...m.state.bounds,...ids.map(id=>{const body=m.nav.solids.find(s=>s.id===id);return body?[id,body.x,body.y,body.halfWidth,body.halfDepth].join(','):'removed:'+id;})].join('|');
  }
  if(record.status==='complete'&&pending.length&&pending.every(u=>['route-unreachable','destination-terrain-forbidden','static-route-not-found'].includes(failure(u).reason)))
   return ['static',m.nav.topologyRevision,...m.state.bounds,...pending.map(u=>[u.id,u.x,u.y,u.kind].join(','))].join('|');
  const add=p=>{const x=Math.floor(p.x/size),y=Math.floor(p.y/size);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)zones.add((x+dx)+','+(y+dy));};
  add(record.target);
  for(const unit of pending)add(unit);
  return [m.nav.topologyRevision,...m.state.bounds,...m.state.units.filter(u=>u.hp>0
   &&(!selected.has(u.id)||u.pendingOrder?.revision===record.revision)&&zones.has(Math.floor(u.x/size)+','+Math.floor(u.y/size)))
   .map(u=>u.id+':'+u.x+','+u.y+','+u.heading+':'+(u.path.length?'moving':'parked'))].join('|');
 }
 cancel(ids,preserveAccepted=false){
  const selected=new Set(ids);
  for(const unit of this.mission.state.units)if(selected.has(unit.id)){
   if(!preserveAccepted){delete unit.routeContinuation;delete unit.commandRevision;delete unit.commandStartAfter;}
   if(unit.pendingOrder||unit.proposedOrder)this.stats.cancelled++;
   delete unit.pendingOrder;delete unit.proposedOrder;
  }
  for(const record of this.mission.state.commandOrders)if(['queued','planning'].includes(record.status)
   &&!this.mission.state.units.some(u=>u.commandRevision===record.revision||ownsPending(u,record.revision)))record.status='cancelled';
 }
 submit(ids,action,target){
  const m=this.mission;
  if(!travel.has(action))return m.order(ids,action,target);
  if(!target||!Number.isFinite(target.x)||!Number.isFinite(target.y))return m.fail('Недопустимый приказ');
  // Collection chooses one eligible vehicle and preserves the others' orders;
  // it is not a shared march to a destination region.
  if(action==='move'&&pickupTarget(m,target))return m.order(ids,action,target);
  if(action==='attack'&&(target.owner==='rai'||!m.entity(target.id)||!m.visibleAt(target.x,target.y)))return m.fail('Цель не обнаружена');
  const selected=new Set(ids),units=m.state.units.filter(u=>selected.has(u.id)&&u.hp>0&&u.owner==='rai'&&!inFactoryInterior(u)&&(action==='move'||m.unitSpec(u).damage));
  if(!units.length)return m.fail('Не выбрана подходящая техника');
  const groups=new Set(units.map(u=>u.commandGroupId).filter(Boolean));
  const profile=(m.state.commandGroups??[]).filter(g=>groups.has(g.id)).map(g=>g.id+':'+g.formation).sort().join(',');
  const key=units.map(u=>u.id).sort().join(',')+'|'+profile,records=m.state.commandOrders;
  const previous=records.findLast(r=>r.key===key&&r.action===action&&(action!=='attack'||r.target.id===target.id)&&distance(r.target,target)<3);
  if(previous&&!(action==='attack-move'&&units.some(movementEngaged))&&units.every(u=>u.commandRevision===previous.revision||ownsPending(u,previous.revision))
   &&(['queued','planning'].includes(previous.status)&&units.some(u=>ownsPending(u,previous.revision)||ownsContinuation(u,previous.revision))
    ||previous.status==='complete'&&previous.signature===this.signature(previous))){
   this.stats.reused++;return {ok:true,assigned:units.length,pending:units.filter(u=>ownsPending(u,previous.revision)).length,revision:previous.revision,reused:true};
  }
  const stopped=new Set(units.filter(unit=>unit.pendingOrder?.type==='stop').map(unit=>unit.id));
  const preserveAccepted=unit=>!stopped.has(unit.id)&&!!(unit.path?.length||unit.task||unit.detour||unit.yieldReturn||unit.jointTraffic);
  this.cancel(units.map(u=>u.id),true);
  const revision=m.state.commandRevision=(m.state.commandRevision??0)+1;
  const cohorts=action==='attack'?[]:coupledStarts(m,units,target);
  const record={revision,key,ids:units.map(u=>u.id),action,target:{x:target.x,y:target.y,...(target.id?{id:target.id}:{})},
   queuedAt:m.state.time,status:'queued',assigned:[],priority:action==='attack'?0:1,cohorts,atomic:cohorts.length===1&&cohorts[0].length===units.length};
  record.preservesAccepted=units.some(preserveAccepted);
  if(!record.preservesAccepted&&action!=='attack'&&units.length>=this.prefixThreshold)record.continuation=true;
  records.push(record);
  // Keep active records plus a bounded history of reusable completed results.
  while(records.length>64){const old=records.findIndex(r=>!['queued','planning'].includes(r.status));if(old<0)break;records.splice(old,1);}
  const centre=units.reduce((p,u)=>({x:p.x+u.x/units.length,y:p.y+u.y/units.length}),{x:0,y:0});
  const coordinated=new Set(cohorts.flat());
  for(const unit of units){
   const preserve=preserveAccepted(unit);
   if(!preserve){unit.commandRevision=revision;unit.retreatSuppressed=true;}
   // Until slots are allocated, translate the formation toward the click.
   // A group must not steer all its hulls into the same provisional point.
   const pending={revision,type:action,target:{...record.target},
    steeringTarget:{x:unit.x+target.x-centre.x,y:unit.y+target.y-centre.y},queuedAt:m.state.time,status:'planning',
    // The existing coupled reverse departure owns these initial poses. Its
    // replacement must provide a rolling handoff before releasing this guard.
    ...(coordinated.has(unit.id)?{holdForRoute:true}:{})};
   // An unvalidated replacement is not the motion owner. The accepted route
   // continues live; no saved pose or stale motion snapshot is restored later.
   if(preserve)unit.proposedOrder=pending;else unit.pendingOrder=pending;
  }
  return {ok:true,assigned:units.length,pending:units.length,revision};
 }
 start(record){
  const m=this.mission;this.nav.refreshContext();
  const facade=Object.create(m),runtime={revision:record.revision,mission:m,assigned:record.assigned,failures:record.failures??={},currentUnit:null};
  Object.assign(facade,{nav:this.nav,commandJob:runtime,finishPendingStep:()=>{}});
  let copies=null;
  if(record.preservesAccepted||record.continuation||record.cohorts?.length||record.atomic){
   const selected=new Set(record.preservesAccepted||record.continuation?record.ids:record.cohorts?.flat()??record.ids);copies=new Map();runtime.copiedIds=selected;
   const units=m.state.units.map(unit=>{
    if(!selected.has(unit.id))return unit;
    const copy={...unit};for(const key of plannedFields)if(unit[key]!==undefined)copy[key]=structuredClone(unit[key]);
    if(unit.proposedOrder?.revision===record.revision){
     copy.pendingOrder=structuredClone(unit.proposedOrder);copy.commandRevision=record.revision;copy.retreatSuppressed=true;delete copy.proposedOrder;
    }
    if(ownsContinuation(unit,record.revision)&&!unit.routeContinuation.ready){
     copy.pendingOrder={revision:record.revision,type:record.action,target:{...record.target},status:'planning'};
     delete copy.routeOrder;
    }
    copies.set(unit.id,copy);return copy;
   });
   // Only the unit view is isolated. Counters and shared world data still
   // belong to the live mission; physical pose/health is never committed.
   facade.state=new Proxy(m.state,{get:(state,key)=>key==='units'?units:Reflect.get(state,key),set:Reflect.set});
  }
  const target=record.target.id?m.entity(record.target.id):record.target;
  if(!target){record.status='cancelled';this.cancel(record.ids.filter(id=>ownsPending(m.entity(id),record.revision)),true);return null;}
  if(!record.ids.some(id=>{const u=m.entity(id);return ownsPending(u,record.revision)||u&&ownsContinuation(u,record.revision)&&!u.routeContinuation.ready;})){record.status='complete';record.signature=this.signature(record);return null;}
  record.status='planning';
  if(record.continuation){
   runtime.assigned=[];runtime.tailSources=new Map();
   runtime.prepareUnit=copy=>{
    const live=m.entity(copy.id);
    if(!live||live.hp<=0||!ownsPending(live,record.revision)&&live.commandRevision!==record.revision){delete copy.pendingOrder;return;}
    const source=continuationSource(live);
    if(source){
     runtime.tailSources.set(copy.id,source);
     Object.assign(copy,source.pose);
     copy.routeContinuation=structuredClone(live.routeContinuation);delete copy.routeOrder;
    }
   };
  }
  const iterator=function*(){
   if(record.continuation&&!record.prefixPrepared){
    runtime.prefixPhase=true;yield* prepareRoutePrefixes(facade,record);
    runtime.prefixPhase=false;record.prefixPrepared=true;
   }
   return yield* facade.orderSteps(record.ids,record.action,target);
  }();
  const groups=record.continuation||record.preservesAccepted?[...(record.cohorts??[]),...record.ids.filter(id=>!record.cohorts?.some(group=>group.includes(id))).map(id=>[id])]:record.cohorts??[record.ids];
  const groupById=new Map();groups.forEach((ids,index)=>ids.forEach(id=>groupById.set(id,index)));
  return {record,runtime,copies,groups,groupById,readyGroups:new Set(),assignmentCursor:0,
   committedCohorts:new Set(),iterator,topology:this.nav.topologyRevision,bounds:this.nav.bounds.join(',')};
 }
 commitCohorts(active,partial=false){
  const m=this.mission;if(!active.copies||active.runtime.prefixPhase||!commandBoundary(m))return;
  // A full-copy tail job can contain 500 members. Inspect a cohort only when
  // a member finishes planning, not once per group on every A* yield.
  while(active.assignmentCursor<active.runtime.assigned.length){
   const index=active.groupById.get(active.runtime.assigned[active.assignmentCursor++]);
   if(index!==undefined)active.readyGroups.add(index);
  }
  if(partial)active.groups.forEach((ids,index)=>{if(!active.committedCohorts.has(index))active.readyGroups.add(index);});
  for(const index of active.readyGroups){
   const ids=active.groups[index];
   if(active.committedCohorts.has(index))continue;
   if(m.pendingTick&&ids.some(id=>active.copies.get(id)?.passage||m.entity(id)?.passage))continue;
   if(!partial&&ids.some(id=>{const unit=m.entity(id);return unit&&(ownsPending(unit,active.record.revision)||ownsContinuation(unit,active.record.revision))&&active.copies.get(id)?.pendingOrder?.status==='planning';}))continue;
   const joins=new Map();let retry=false;
   for(const id of ids){
    const unit=m.entity(id),copy=active.copies.get(id);
    if(!unit||unit.hp<=0||!ownsPending(unit,active.record.revision)||copy?.pendingOrder||ownsContinuation(unit,active.record.revision))continue;
    const path=commandPathFromLive(m,unit,copy,copy.path,!!copy.detour||!!copy.passage);
    joins.set(id,path);if(!path)retry=true;
   }
   if(retry){
    // A cohort is one publication: failed reconnection cannot release only
    // its leading members while the remaining initial poses are replanned.
    for(const id of joins.keys())retryCommandFromRest(active.runtime,m.entity(id),active.copies.get(id).routeOrder?.destination);
    active.committedCohorts.add(index);active.readyGroups.delete(index);continue;
   }
   for(const id of ids){
    const unit=m.entity(id),copy=active.copies.get(id);
    if(!unit||unit.hp<=0||!ownsPending(unit,active.record.revision)&&unit.commandRevision!==active.record.revision||copy?.pendingOrder)continue;
    if(ownsContinuation(unit,active.record.revision)){
     const fields={};for(const key of plannedFields)if(Object.hasOwn(copy,key))fields[key]=copy[key];
     const source=active.runtime.tailSources.get(id);
     if(source)stageRouteTail(unit,source,fields,active.topology,active.bounds);
     continue;
    }
    if(!ownsPending(unit,active.record.revision))continue;
    copy.path=joins.get(id);
    for(const key of plannedFields){if(Object.hasOwn(copy,key))unit[key]=copy[key];else delete unit[key];}
    unit.commandRevision=active.record.revision;delete unit.proposedOrder;delete unit.pendingOrder;delete unit.routeContinuation;activateCommand(m,unit);
    if(active.record.continuation&&!active.record.assigned.includes(id))active.record.assigned.push(id);
   }
   active.committedCohorts.add(index);
   active.readyGroups.delete(index);
  }
 }
 restartActive(){
  const active=this.active;if(!active)return;
  active.iterator.return();
  const {record}=active,m=this.mission;
  // Staged cohort copies are not live assignments. Drop those copies while
  // retaining every route already committed to the corresponding revision.
  const applied=[...new Set(record.assigned)].filter(id=>{const u=m.entity(id);return u?.hp>0&&u.commandRevision===record.revision&&!u.pendingOrder;});
  record.assigned.splice(0,record.assigned.length,...applied);record.status='queued';this.active=null;
 }
 advance(budgetMs=2){
  if(!(budgetMs>0))return 0;
  const m=this.mission,started=performance.now(),deadline=started+Math.max(0,Math.min(2,budgetMs));
  for(const record of m.state.commandOrders)if(record.awaitingTails&&!m.state.units.some(u=>ownsContinuation(u,record.revision)&&u.routeContinuation.ready)){
   delete record.awaitingTails;
   this.stats.applied+=Math.max(0,record.assigned.length-(record.reportedAssignments??record.assigned.length));
   delete record.reportedAssignments;
   if(record.status==='planning'){record.status='complete';record.signature=this.signature(record);}
  }
  if(this.retryTime!==m.state.time||this.retryTopology!==m.nav.topologyRevision){
   this.retryTime=m.state.time;this.retryTopology=m.nav.topologyRevision;
   for(const record of m.state.commandOrders)if(record.status==='complete'&&m.state.time-(record.retryAt??-1)>=.25
    &&m.state.units.some(u=>u.pendingOrder?.revision===record.revision&&u.pendingOrder.status==='blocked'||ownsContinuation(u,record.revision)&&u.routeContinuation.failure)
    &&record.signature!==this.signature(record)){
    record.status='queued';record.retryAt=m.state.time;
    for(const unit of m.state.units)if(unit.pendingOrder?.revision===record.revision)unit.pendingOrder.status='planning';
   }
  }
  this.nav.workDeadline=deadline;
  while(performance.now()<deadline){
   if(this.active){
    const {record}=this.active;
    // A revision uniquely owns its pending members. Looking up every selected
    // ID through entity() here copied/scanned the whole world on EVERY yield.
    if(record.status==='cancelled'||!m.state.units.some(unit=>unit.hp>0&&(ownsPending(unit,record.revision)||ownsContinuation(unit,record.revision)))
     &&!record.ids.every(id=>record.assigned.includes(id))){
     this.active.iterator.return();record.status='cancelled';this.active=null;
    }else if(record.status==='queued'||this.active.topology!==m.nav.topologyRevision||this.active.bounds!==m.nav.bounds.join(','))this.restartActive();
    else if(m.state.commandOrders.some(r=>r.status==='queued'&&r.revision>record.revision)){
     // A new explicit command to a subset must not wait for the remainder of
     // an older group. Discard suspended A* scratch at this clean yield; a
     // resumed old intent reconstructs only its still-owned pending members.
     this.restartActive();this.stats.preemptions++;
    }
   }
   if(!this.active){
    const next=m.state.commandOrders.filter(r=>r.status==='queued').sort((a,b)=>b.revision-a.revision||a.priority-b.priority)[0];
    if(!next)break;
    this.active=this.start(next);if(!this.active)continue;
   }
   if(performance.now()>=deadline)break;
   const active=this.active,result=active.readyResult??active.iterator.next();
   this.commitCohorts(active,result.done);
   if(result.done&&active.copies&&active.committedCohorts.size<active.groups.length){active.readyResult=result;break;}
   if(result.done){
    const record=active.record,newlyRejected=[];record.status='complete';record.result=result.value;
    for(const id of record.ids){
     const unit=m.entity(id);
     if(unit&&ownsContinuation(unit,record.revision)&&!unit.routeContinuation.ready){unit.routeContinuation.failure=active.runtime.failures[id]??{reason:'route-not-found',blockerId:null};continue;}
     if(!ownsPending(unit,record.revision))continue;
     if(unit.proposedOrder?.revision===record.revision){
      (record.rejected??={})[id]=active.runtime.failures[id]??{reason:'route-not-found',blockerId:null};
      newlyRejected.push(id);delete unit.proposedOrder;this.stats.rejectedKeptRoute++;continue;
     }
     if(unit.hp<=0){delete unit.pendingOrder;continue;}
     if(active.runtime.retryIds?.has(id)){unit.pendingOrder.status='planning';continue;}
     unit.pendingOrder.status='blocked';Object.assign(unit.pendingOrder,active.runtime.failures[id]??{reason:'route-not-found',blockerId:null});
    }
    if(active.runtime.retryIds?.size){
     record.status='queued';record.assigned=record.assigned.filter(id=>!active.runtime.retryIds.has(id));
    }
    if(newlyRejected.length)m.emit('navigation-command-rejected',{revision:record.revision,
     target:record.target,units:newlyRejected.map(id=>({id,...record.rejected[id],
      retainedRevision:m.entity(id)?.commandRevision,retainedGoal:m.entity(id)?.routeOrder?.destination})),keptPrevious:true});
    record.signature=this.signature(record);this.stats.applied+=record.assigned.length;this.active=null;
    if(!active.runtime.retryIds?.size&&record.continuation&&m.state.units.some(u=>ownsContinuation(u,record.revision)&&u.routeContinuation.ready)){
     record.status='planning';record.awaitingTails=true;record.reportedAssignments=record.assigned.length;
    }
   }
   // A ready result waits for a tick boundary instead of repeatedly spinning.
   if(m.pendingTick&&active.runtime.waitingTick)break;
  }
  const elapsed=performance.now()-started;this.stats.slices++;this.stats.cpuMs+=elapsed;this.stats.maxSliceMs=Math.max(this.stats.maxSliceMs,elapsed);
  this.nav.workDeadline=Infinity;return elapsed;
 }
}

