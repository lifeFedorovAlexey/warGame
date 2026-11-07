import {pickupTarget} from './pickup-orders.js';
import {isInfantry} from './scav-unit-profiles.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const travel=new Set(['move','attack-move','attack']);
const plannedFields=['path','task','routeOrder','detour','traffic','trafficHold','driveWatch','reverseDebt','failedArcs','workEscapeRetryAt',
 'passage','passingLane','combatRetreat','combatDeployment','combatGroup','combatContactAt','combatResume','combatArrivalBlockedAt',
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
    if(visited.has(other)||Math.cos(other.heading-first.heading)<.995||distance(unit,other)>=range)continue;
    visited.add(other);group.push(other);
   }
  }
  if(group.length>=3&&group.length<=12)cohorts.push(group.map(u=>u.id));
 }
 return cohorts;
}

// One private search context: movement keeps its own suspended A* state. Only
// data intents are saved; a loaded command reconstructs unfinished searches.
export class CommandPlanner{
 constructor(mission){
  this.mission=mission;this.nav=mission.nav.createSearchContext();this.active=null;
  mission.state.commandOrders??=[];
  for(const order of mission.state.commandOrders)if(order.status==='planning')order.status='queued';
  this.stats={slices:0,cpuMs:0,maxSliceMs:0,applied:0,reused:0,cancelled:0,preemptions:0};
 }
 signature(record){
  const m=this.mission,selected=new Set(record.ids),size=m.config.worldScale*16,zones=new Set();
  const pending=m.state.units.filter(u=>u.pendingOrder?.revision===record.revision);
  if(record.status==='complete'&&pending.length&&pending.every(u=>u.pendingOrder.reason==='destination-occupied'&&u.pendingOrder.blockerId)){
   const ids=[...new Set(pending.map(u=>u.pendingOrder.blockerId))].sort();
   return ['occupied',...m.state.bounds,...ids.map(id=>{const body=m.nav.solids.find(s=>s.id===id);return body?[id,body.x,body.y,body.halfWidth,body.halfDepth].join(','):'removed:'+id;})].join('|');
  }
  if(record.status==='complete'&&pending.length&&pending.every(u=>['route-unreachable','destination-terrain-forbidden','static-route-not-found'].includes(u.pendingOrder.reason)))
   return ['static',m.nav.topologyRevision,...m.state.bounds,...pending.map(u=>[u.id,u.x,u.y,u.kind].join(','))].join('|');
  const add=p=>{const x=Math.floor(p.x/size),y=Math.floor(p.y/size);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)zones.add((x+dx)+','+(y+dy));};
  add(record.target);
  for(const unit of pending)add(unit);
  return [m.nav.topologyRevision,...m.state.bounds,...m.state.units.filter(u=>u.hp>0
   &&(!selected.has(u.id)||u.pendingOrder?.revision===record.revision)&&zones.has(Math.floor(u.x/size)+','+Math.floor(u.y/size)))
   .map(u=>u.id+':'+u.x+','+u.y+','+u.heading+':'+(u.path.length?'moving':'parked'))].join('|');
 }
 cancel(ids){
  const selected=new Set(ids);
  for(const unit of this.mission.state.units)if(selected.has(unit.id)){
   delete unit.commandRevision;if(unit.pendingOrder){delete unit.pendingOrder;this.stats.cancelled++;}
  }
  for(const record of this.mission.state.commandOrders)if(['queued','planning'].includes(record.status)
   &&!this.mission.state.units.some(u=>u.commandRevision===record.revision))record.status='cancelled';
 }
 submit(ids,action,target){
  const m=this.mission;
  if(!travel.has(action))return m.order(ids,action,target);
  if(!target||!Number.isFinite(target.x)||!Number.isFinite(target.y))return m.fail('Недопустимый приказ');
  // Collection chooses one eligible vehicle and preserves the others' orders;
  // it is not a shared march to a destination region.
  if(action==='move'&&pickupTarget(m,target))return m.order(ids,action,target);
  if(action==='attack'&&(target.owner==='rai'||!m.entity(target.id)||!m.visibleAt(target.x,target.y)))return m.fail('Цель не обнаружена');
  const selected=new Set(ids),units=m.state.units.filter(u=>selected.has(u.id)&&u.hp>0&&u.owner==='rai'&&(action==='move'||m.unitSpec(u).damage));
  if(!units.length)return m.fail('Не выбрана подходящая техника');
  const groups=new Set(units.map(u=>u.commandGroupId).filter(Boolean));
  const profile=(m.state.commandGroups??[]).filter(g=>groups.has(g.id)).map(g=>g.id+':'+g.formation).sort().join(',');
  const key=units.map(u=>u.id).sort().join(',')+'|'+profile,records=m.state.commandOrders;
  const previous=records.findLast(r=>r.key===key&&r.action===action&&(action!=='attack'||r.target.id===target.id)&&distance(r.target,target)<3);
  if(previous&&units.every(u=>u.commandRevision===previous.revision)
   &&(['queued','planning'].includes(previous.status)&&units.some(u=>u.pendingOrder?.revision===previous.revision)
    ||previous.status==='complete'&&previous.signature===this.signature(previous))){
   this.stats.reused++;return {ok:true,assigned:units.length,pending:units.filter(u=>u.pendingOrder?.revision===previous.revision).length,revision:previous.revision,reused:true};
  }
  this.cancel(units.map(u=>u.id));
  const revision=m.state.commandRevision=(m.state.commandRevision??0)+1;
  const cohorts=action==='attack'?[]:coupledStarts(m,units,target);
  const record={revision,key,ids:units.map(u=>u.id),action,target:{x:target.x,y:target.y,...(target.id?{id:target.id}:{})},
   queuedAt:m.state.time,status:'queued',assigned:[],priority:action==='attack'?0:1,cohorts,atomic:cohorts.length===1&&cohorts[0].length===units.length};
  records.push(record);
  // Keep active records plus a bounded history of reusable completed results.
  while(records.length>64){const old=records.findIndex(r=>!['queued','planning'].includes(r.status));if(old<0)break;records.splice(old,1);}
  for(const unit of units){unit.commandRevision=revision;unit.pendingOrder={revision,type:action,target:{...record.target},queuedAt:m.state.time,status:'planning'};}
  return {ok:true,assigned:units.length,pending:units.length,revision};
 }
 start(record){
  const m=this.mission;this.nav.refreshContext();
  const facade=Object.create(m),runtime={revision:record.revision,mission:m,assigned:record.assigned,failures:record.failures??={},currentUnit:null};
  Object.assign(facade,{nav:this.nav,commandJob:runtime,finishPendingStep:()=>{}});
  let copies=null;
  if(record.cohorts?.length||record.atomic){
   const selected=new Set(record.cohorts?.flat()??record.ids);copies=new Map();runtime.copiedIds=selected;
   const units=m.state.units.map(unit=>{
    if(!selected.has(unit.id))return unit;
    const copy={...unit};for(const key of plannedFields)if(unit[key]!==undefined)copy[key]=structuredClone(unit[key]);
    copies.set(unit.id,copy);return copy;
   });
   // Only the unit view is isolated. Counters and shared world data still
   // belong to the live mission; physical pose/health is never committed.
   facade.state=new Proxy(m.state,{get:(state,key)=>key==='units'?units:Reflect.get(state,key),set:Reflect.set});
  }
  const target=record.target.id?m.entity(record.target.id):record.target;
  if(!target){record.status='cancelled';this.cancel(record.ids);return null;}
  if(!record.ids.some(id=>m.entity(id)?.pendingOrder?.revision===record.revision)){record.status='complete';record.signature=this.signature(record);return null;}
  record.status='planning';
  return {record,runtime,copies,committedCohorts:new Set(),iterator:facade.orderSteps(record.ids,record.action,target),topology:this.nav.topologyRevision,bounds:this.nav.bounds.join(',')};
 }
 commitCohorts(active,partial=false){
  const m=this.mission;if(!active.copies||m.pendingTick)return;
  for(const [index,ids] of (active.record.cohorts??[active.record.ids]).entries()){
   if(active.committedCohorts.has(index))continue;
   if(!partial&&ids.some(id=>m.entity(id)?.pendingOrder?.revision===active.record.revision&&active.copies.get(id)?.pendingOrder))continue;
   for(const id of ids){
    const unit=m.entity(id),copy=active.copies.get(id);
    if(!unit||unit.hp<=0||unit.pendingOrder?.revision!==active.record.revision||copy?.pendingOrder)continue;
    for(const key of plannedFields){if(Object.hasOwn(copy,key))unit[key]=copy[key];else delete unit[key];}
    delete unit.pendingOrder;
   }
   active.committedCohorts.add(index);
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
  const m=this.mission,started=performance.now(),deadline=started+Math.max(0,Math.min(2,budgetMs));
  if(this.retryTime!==m.state.time||this.retryTopology!==m.nav.topologyRevision){
   this.retryTime=m.state.time;this.retryTopology=m.nav.topologyRevision;
   for(const record of m.state.commandOrders)if(record.status==='complete'&&m.state.time-(record.retryAt??-1)>=.25
    &&m.state.units.some(u=>u.pendingOrder?.revision===record.revision&&u.pendingOrder.status==='blocked')
    &&record.signature!==this.signature(record)){
    record.status='queued';record.retryAt=m.state.time;
    for(const unit of m.state.units)if(unit.pendingOrder?.revision===record.revision)unit.pendingOrder.status='planning';
   }
  }
  this.nav.workDeadline=deadline;
  do{
   if(this.active){
    const {record}=this.active;
    if(record.status==='cancelled'||!record.ids.some(id=>m.entity(id)?.pendingOrder?.revision===record.revision)
     &&!record.ids.every(id=>record.assigned.includes(id))){
     this.active.iterator.return();record.status='cancelled';this.active=null;
    }else if(this.active.topology!==m.nav.topologyRevision||this.active.bounds!==m.nav.bounds.join(','))this.restartActive();
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
   const active=this.active,result=active.readyResult??active.iterator.next();
   this.commitCohorts(active,result.done);
   if(result.done&&active.copies&&m.pendingTick){active.readyResult=result;break;}
   if(result.done){
    const record=active.record;record.status='complete';record.result=result.value;
    for(const id of record.ids){
     const unit=m.entity(id);if(unit?.pendingOrder?.revision!==record.revision)continue;
     if(unit.hp<=0){delete unit.pendingOrder;continue;}
     unit.pendingOrder.status='blocked';Object.assign(unit.pendingOrder,active.runtime.failures[id]??{reason:'route-not-found',blockerId:null});
    }
    record.signature=this.signature(record);this.stats.applied+=record.assigned.length;this.active=null;
   }
   // A ready result waits for a tick boundary instead of repeatedly spinning.
   if(m.pendingTick&&active.runtime.waitingTick)break;
  }while(performance.now()<deadline);
  const elapsed=performance.now()-started;this.stats.slices++;this.stats.cpuMs+=elapsed;this.stats.maxSliceMs=Math.max(this.stats.maxSliceMs,elapsed);
  this.nav.workDeadline=Infinity;return elapsed;
 }
}

