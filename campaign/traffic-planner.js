import {trafficCollisionRequired} from './vehicle-collision.js';
import {createTrafficBuffer,captureTrafficState} from './traffic-snapshot.js';
import {recoverWaitCycle} from './traffic-cycle.js';
import {invalidateTrafficCorridors} from './traffic-corridor.js';
import {checkManeuverSteps} from './vehicle-motion.js';
import {maneuverAdmissionBlocker} from './maneuver-admission.js';
import {isInfantry} from './scav-unit-profiles.js';
import {invalidateBorrowedHomes} from './traffic-start.js';
import {SEARCH_OUTCOME,LOCAL_RETRY_SECONDS,trafficPoseKey as position,trafficBodyKey as bodyKey,
 trafficRequestKey,captureTrafficBodies,trafficWitness,trafficDependencyChanges,projectedTrafficView,bodyInTrafficRegion} from './traffic-context.js';

const fields=['path','task','routeOrder','detour','traffic','trafficHold','driveWatch','reverseDebt','failedArcs',
 'passage','passingLane','yieldReturn','jointTraffic','cycleContinuation','trafficRecoveryUntil','terrainEscape'];
const navigation=u=>Object.fromEntries(fields.filter(k=>Object.hasOwn(u,k)).map(k=>[k,u[k]]));
function witness(mission,job,baseline=false){
 return trafficWitness(mission,job.region,job.failureIds??job.ids,baseline?job.baseline:undefined,!!job.failureIds);
}
function dependencyChanges(mission,job){
 return trafficDependencyChanges(mission,job.region,job.failureIds??job.ids,job.baseline,!!job.failureIds);
}
function contextValid(mission,job){
 return mission.state===job.world&&mission.nav.topologyRevision===job.topology
  &&job.ids.every((id,i)=>{const unit=mission.entity(id);return unit?.hp>0&&!unit.pendingOrder
   &&!(unit.overlapRecovery&&unit.overlapRecovery.active!==false)
   &&unit.commandRevision===job.memberRevisions[i];})
  &&(!job.before||job.ids.every(id=>mission.entity(id)&&bodyKey(mission.entity(id))===job.before.get(id)?.key));
}
function changedParticipant(mission,job){
 for(const [index,id] of job.ids.entries()){
  const unit=mission.entity(id);
  if(!unit||unit.hp<=0)return {id,change:'removed'};
  if(unit.pendingOrder||unit.commandRevision!==job.memberRevisions[index])return {id,change:'command'};
  if(unit.overlapRecovery&&unit.overlapRecovery.active!==false)return {id,change:'overlap-separation'};
  const before=job.before?.get(id);
  if(before&&position(unit)!==before.position)return {id,change:'pose',before:JSON.parse(before.position).slice(0,3),after:[unit.x,unit.y,unit.heading]};
  if(before&&bodyKey(unit)!==before.key)return {id,change:'navigation-or-service'};
 }
 return {change:'world-or-topology'};
}
function* passageStillClear(mission,job,deadline){
 const plans=job.patch.map(change=>change.fields.detour?.joint).filter(Boolean);
 if(!plans.length)return false;
 for(const plan of plans){
  const projected=new Map(plan.members.map(member=>[member.id,{...mission.entity(member.id)}]));
  for(const phase of plan.phases){
   const view=projectedTrafficView(mission,projected),actor=view.entity(phase.id),from=projected.get(phase.id),blockers=new Set();
   if(!actor||!from)return false;
   const allowed=(a,b)=>{
    const obstacles=view.vehicleMotionNeighbours(actor,a,b);
    blockers.clear();
    if(!view.vehicleMotionClear(actor,a,b,phase.rough?.60:.52,blockers,obstacles)){
     job.validationFailure={actor:actor.id,phase:plan.phases.indexOf(phase),reason:blockers.size?'vehicle':'terrain-or-reservation',blockers:[...blockers].map(body=>body.id)};
     return false;
    }
    const blocker=maneuverAdmissionBlocker(view,actor,a,b,mission.config.simulationStep);
    if(blocker)job.validationFailure={actor:actor.id,phase:plan.phases.indexOf(phase),reason:'braking-path',blockers:[blocker.id]};
    return !blocker;
   };
   const end=yield* checkManeuverSteps(from,phase.legs,mission.config.worldScale,allowed,deadline);if(!end)return false;
   projected.set(actor.id,{...from,...end,driveSpeed:0});
  }
 }
 return true;
}

// Search work owns an immutable world view and a private navigator. Physical
// ticks never drain this queue. Only the dispatcher publishes a finished patch
// at a tick boundary, after checking all bodies in the inspected region.
function collisionFreeGroup(members){
 return members.length>1&&members.every((a,i)=>a&&members.every((b,j)=>j<=i||b&&!trafficCollisionRequired(a,b)));
}
export class TrafficPlanner{
 constructor(){this.queued=new Map();this.failures=new Map();this.active=null;this.ready=[];this.navPool=[];this.snapshotPool=[];this.sequence=0;
  this.stats={started:0,applied:0,failed:0,discarded:0,revalidated:0,slices:0,maxSliceMs:0,maxSnapshotMs:0,maxPublishMs:0,
   snapshotMs:0,searchMs:0,revalidationMs:0,publishMs:0,maxNextMs:0,maxSearchNextMs:0,maxRevalidationNextMs:0,
   negativeCacheHits:0,maxQueueWaitMs:0,maxServiceGapMs:0,maxJobAge:0,cancellations:{},cacheInvalidations:{},outcomes:{}};}
 trace(mission,job,event,details={}){
  mission.recordTrafficDiagnostic?.({event,jobId:job.id,jobType:job.type,ids:job.ids,
   age:Math.max(0,mission.state.time-job.queuedAt),wallAgeMs:performance.now()-job.createdAt,
   queueWaitMs:job.queueWaitMs+(job.waitSince===null?0:performance.now()-job.waitSince),
   slices:job.slices,...job.timing,...details});
 }
 pendingFor(unit){return [...this.queued.values(),...(this.active?[this.active]:[]),...this.ready].some(job=>job.ids.includes(unit.id));}
 activeFor(unit){
  const owns=job=>job?.ids.some((id,index)=>id===unit.id&&job.memberRevisions[index]===unit.commandRevision);
  return !!(owns(this.active)||[...this.queued.values()].some(job=>job.iterator&&owns(job))||this.ready.some(owns));
 }
 jobFor(unit){return [...this.queued.values(),...(this.active?[this.active]:[]),...this.ready].find(job=>job.ids.includes(unit.id));}
 jobs(mission){return [...this.queued.values(),...(this.active?[this.active]:[]),...this.ready].map(job=>({jobId:job.id,ids:job.ids,type:job.type,
  age:Math.max(0,mission.state.time-job.queuedAt),wallAgeMs:performance.now()-job.createdAt,
  queueWaitMs:job.queueWaitMs+(job.waitSince===null?0:performance.now()-job.waitSince),slices:job.slices,
  serviceGapMs:performance.now()-(job.lastServedAt??job.createdAt),...job.timing,
  stage:job.patch?'publish':job.iterator?'search':'snapshot',searchStage:job.diagnostics?.stage??null,outcome:job.outcome??null}));}
 enqueue(mission,type,ids,reason){
  const ownerId=type==='cycle'?[...ids].sort()[0]:ids[0],now=performance.now();
  const job={id:++this.sequence,type,reason,ownerId,ids:ids.slice(),requestKey:trafficRequestKey(mission,type,ids),
   memberRevisions:ids.map(id=>mission.entity(id).commandRevision),world:mission.state,topology:mission.nav.topologyRevision,
   queuedAt:mission.state.time,createdAt:now,waitSince:now,queueWaitMs:0,slices:0,
   timing:{snapshotMs:0,searchMs:0,revalidationMs:0,publishMs:0,maxNextMs:0}};
  this.queued.set(ownerId,job);this.trace(mission,job,'queued',{reason,requestKey:job.requestKey});return job;
 }
 negativeHit(mission,type,ids){
  // Retain A-B, A-C and cycle/passage results independently. The request
  // key includes type, membership and current dependency edges.
  const requestKey=trafficRequestKey(mission,type,ids),failed=this.failures.get(requestKey);
  if(!failed)return false;
  const reason=failed.requestKey!==requestKey?'request-changed':!contextValid(mission,failed)?'participant-or-topology-changed'
   :failed.witness!==witness(mission,failed)?'dependencies-changed':mission.state.time>=failed.retryAt?'retry-due':null;
  if(reason){
   this.stats.cacheInvalidations[reason]=(this.stats.cacheInvalidations[reason]??0)+1;
   this.trace(mission,failed,'cache-invalidated',{reason,requestedIds:ids,requestKey,previousRequestKey:failed.requestKey,
    changes:reason==='dependencies-changed'?dependencyChanges(mission,failed):undefined});
   this.failures.delete(requestKey);return false;
  }
  this.stats.negativeCacheHits++;this.stats.lastCacheHit={at:mission.state.time,ids:ids.slice(),outcome:failed.outcome,retryAt:failed.retryAt};
  if(!failed.cacheHitLogged){this.trace(mission,failed,'negative-cache-hit',{outcome:failed.outcome,retryAt:failed.retryAt});failed.cacheHitLogged=true;}
  return true;
 }
 dispose(job){
  job.iterator?.return();job.validation?.return();
  if(job.shadow?.nav){this.navPool.push(job.shadow.nav);if(this.navPool.length>4)this.navPool.shift();}
  if(job.buffer){if(this.snapshotPool.length<4)this.snapshotPool.push(job.buffer);job.buffer=null;}
  job.shadow=null;
 }
 discard(mission,job,reason,details={}){
  this.dispose(job);this.stats.discarded++;this.stats.outcomes.STALE=(this.stats.outcomes.STALE??0)+1;
  this.stats.cancellations[reason]=(this.stats.cancellations[reason]??0)+1;
  this.stats.lastDiscard={at:mission.state.time,ids:job.ids,reason,outcome:SEARCH_OUTCOME.STALE,...details};
  this.trace(mission,job,'cancelled',{reason,outcome:SEARCH_OUTCOME.STALE,...details});
 }
 prunePassThrough(mission){
  const unnecessary=job=>collisionFreeGroup(job.ids.map(id=>mission.entity(id)));
  if(this.active&&unnecessary(this.active)){this.discard(mission,this.active,'friendly-pass-through');this.active=null;}
  for(const [id,job] of this.queued)if(unnecessary(job)){this.queued.delete(id);this.discard(mission,job,'friendly-pass-through');}
  this.ready=this.ready.filter(job=>{if(!unnecessary(job))return true;this.discard(mission,job,'friendly-pass-through');return false;});
 }
 requestPassages(mission){
  // A stopped route behind an arrived ally is not a wait cycle. It still
  // needs the same checked loan/passage/return transaction as evacuation.
  // Give evacuation requests the first choice of available participants.
  const ordered=mission.state.units.slice().sort((a,b)=>(a.combatRetreat?a.hp/a.maxHp:2)-(b.combatRetreat?b.hp/b.maxHp:2));
  for(const retreat of [true,false])for(const unit of ordered){
   const evacuating=!!unit.combatRetreat;
   if(evacuating!==retreat||!retreat&&(unit.navigation?.waitSeconds??0)<2
    ||isInfantry(unit)||!unit.path.length||unit.hp<=0||unit.pendingOrder
    ||unit.jointTraffic||unit.detour||unit.overlapRecovery&&unit.overlapRecovery.active!==false||(unit.driveSpeed??0)>.1||this.pendingFor(unit)
    ||mission.trafficCoordinator.routes?.has(unit.id))continue;
   const previous=[...this.failures.values()].findLast(job=>job.type==='passage'&&job.ownerId===unit.id);
   // Actual passage probes can find a different blocker than the preceding
   // driving/right-of-way decision. Reconsider that pair first, only while
   // the observed poses and request still match. Every candidate still goes
   // through ordinary snapshot search, live revalidation and swept execution.
   const matches=previous?.type==='passage'&&contextValid(mission,previous)
    &&previous.baseline.find(body=>body.id===unit.id)?.poseKey===position(unit);
   const observed=matches?(previous.passageBlockers??[]).filter(id=>{
    const body=mission.entity(id);
    return body&&previous.baseline.find(saved=>saved.id===id)?.poseKey===position(body);
   }):[];
   for(const id of new Set(observed.length?observed:(unit.navigation?.blockerIds??[]))){
    const other=mission.entity(id);
    if(!other||!trafficCollisionRequired(unit,other)||isInfantry(other)||other.owner!==unit.owner||other.hp<=0||other.combatRetreat&&!other.path.length||other.pendingOrder||other.jointTraffic
     ||other.detour||other.overlapRecovery&&other.overlapRecovery.active!==false||other.builderWorking||other.tool>0||other.foldTime>0||(other.driveSpeed??0)>.1||this.pendingFor(other)
     ||mission.trafficCoordinator.routes?.has(other.id))continue;
    const ids=[unit.id,other.id];
    if(this.negativeHit(mission,'passage',ids))continue;
    this.enqueue(mission,'passage',ids,observed.includes(id)?'passage-probe-blocker':retreat?'retreat':'blocked-route');
    break;
   }
  }
 }
 requestCycles(mission){
  for(const ids of mission.navigationDiagnostics?.recoveryCycles??[]){
   const ownerId=ids.slice().sort()[0];
   const key=trafficRequestKey(mission,'cycle',ids);
   const old=this.queued.get(ownerId);
   // Refresh an unstarted request, but do not destroy a geometric proof just
   // because a third car joined/left the wait graph while its members held.
   // Membership/edge keys govern NEGATIVE reuse; live geometry governs commit.
   if(old?.type==='cycle'&&!old.iterator&&old.requestKey!==key){this.queued.delete(ownerId);this.discard(mission,old,'dependencies-changed');}
   if(this.queued.has(ownerId)||this.active?.ownerId===ownerId||this.ready.some(j=>j.ownerId===ownerId))continue;
   const members=ids.map(id=>mission.entity(id));
   if(collisionFreeGroup(members))continue;
   if(members.some(u=>!u||isInfantry(u)||u.owner!==members[0].owner||u.pendingOrder||u.jointTraffic||u.overlapRecovery&&u.overlapRecovery.active!==false||(u.driveSpeed??0)>.1||this.pendingFor(u)
    ||mission.trafficCoordinator.routes?.has(u.id)))continue;
   if(this.negativeHit(mission,'cycle',ids))continue;
   this.enqueue(mission,'cycle',ids,'wait-cycle');
  }
 }
 snapshot(mission,job){
  const started=performance.now();
  const pooled=this.navPool.findIndex(nav=>nav.baseNavigator===mission.nav);
  const nav=pooled<0?mission.nav.createSearchContext():this.navPool.splice(pooled,1)[0];
  const buffer=job.buffer=this.snapshotPool.pop()??createTrafficBuffer();
  const shadow=Object.create(mission),state=captureTrafficState(mission,buffer);nav.refreshContext();
  const unitIndex=buffer.unitIndex;
  const coordinator=Object.create(mission.trafficCoordinator);
  for(const key of ['decisions','intents','passageDecisions','queues','groups','statistics'])coordinator[key]=structuredClone(mission.trafficCoordinator[key]);
  coordinator.updatedState=state;coordinator.updatedAt=state.time;coordinator.planner=null;coordinator.liveMission=shadow;
  Object.assign(shadow,{state,nav,unitIndex,visible:buffer.visible,unitIndexActive:true,trafficCoordinator:coordinator,pendingTick:null,
   commandPlanner:null,events:[],effects:[],finishPendingStep:()=>{},navigationDiagnostics:structuredClone(mission.navigationDiagnostics)});
  job.region={left:Infinity,right:-Infinity,bottom:Infinity,top:-Infinity};job.blockers=new Set();
  const observe=(point,radius)=>{
   const r=radius+mission.config.worldScale*8;
   job.region.left=Math.min(job.region.left,point.x-r);job.region.right=Math.max(job.region.right,point.x+r);
   job.region.bottom=Math.min(job.region.bottom,point.y-r);job.region.top=Math.max(job.region.top,point.y+r);
  };
  for(const id of job.ids)observe(shadow.entity(id),mission.config.worldScale*20);
  const nearby=shadow.nearbyUnits,motion=shadow.vehicleMotionNeighbours,clear=shadow.vehicleMotionClear,path=shadow.vehiclePathSteps;
  shadow.nearbyUnits=function(point,radius,...args){observe(point,radius);return nearby.call(this,point,radius,...args);};
  shadow.vehicleMotionNeighbours=function(actor,from,to){observe(from,Math.hypot(to.x-from.x,to.y-from.y)+this.config.worldScale*8);return motion.call(this,actor,from,to);};
  shadow.trafficPlanningBlocker=body=>job.blockers.add(body.id);
  shadow.vehicleMotionClear=function(actor,from,to,grade=.52,blockers=new Set(),obstacles=this.state.units,reservationWitness={}){
   observe(from,Math.hypot(to.x-from.x,to.y-from.y)+this.config.worldScale*8);
   const allowed=clear.call(this,actor,from,to,grade,blockers,obstacles,reservationWitness);
   if(!allowed){
    for(const body of blockers)job.blockers.add(body.id);
    if(reservationWitness.owner)job.blockers.add(reservationWitness.owner.id);
    const yieldTo=this.trafficCoordinator.passageDecisions.get(actor.id)?.yieldTo;if(yieldTo)job.blockers.add(yieldTo);
   }
   return allowed;
  };
  shadow.vehiclePathSteps=function*(...args){
   job.globalDependencies=true;
   // Global dynamic route occupancy can depend on bodies outside the local
   // manoeuvre probes. Retain those witnesses for this exceptional request.
   for(const body of args[2]?.obstacles??state.units){observe(body,0);job.blockers.add(body.id);}
   return yield* path.apply(this,args);
  };
  job.shadow=shadow;job.before=new Map(state.units.map(u=>[u.id,{position:position(u),key:bodyKey(u),fields:JSON.stringify(navigation(u))}]));
  job.baseline=captureTrafficBodies(shadow);
  job.diagnostics={};
  job.iterator=job.type==='passage'
   ?coordinator.movingPassageSteps(shadow,shadow.entity(job.ownerId),shadow.entity(job.ids[1]),{diagnostics:job.diagnostics})
   :recoverWaitCycle(shadow,shadow.entity(job.ownerId),job.diagnostics);this.stats.started++;
  const elapsed=performance.now()-started;this.stats.snapshotMs+=elapsed;
  job.timing.snapshotMs+=elapsed;
  this.stats.maxSnapshotMs=Math.max(this.stats.maxSnapshotMs,elapsed);
 }
 advance(mission,budgetMs=2){
  // Zero budget is a strict no-op, including snapshot creation and counters.
  if(!(budgetMs>0))return;
  this.prunePassThrough(mission);
  const start=performance.now(),deadline=start+Math.min(2,budgetMs);
  while(performance.now()<deadline){
   if(this.active&&!contextValid(mission,this.active)){
    this.discard(mission,this.active,'participant-or-topology-changed',changedParticipant(mission,this.active));this.active=null;
   }
   if(!this.active){
    // A new snapshot needs a complete simulation boundary. A suspended
    // search already has its immutable snapshot and can use frame budget
    // while a physical tick is pending. Do not strand it behind an unstarted
    // request, or round robin reduces every search to simulation-tick rate.
    const next=[...this.queued.values()].find(job=>!mission.pendingTick||job.iterator);if(!next)break;
    this.queued.delete(next.ownerId);
    if(!contextValid(mission,next)){this.discard(mission,next,'participant-or-topology-changed',changedParticipant(mission,next));continue;}
    // A body which rejected actual probes can leave the inspected area
    // while the immutable search runs. Do not keep its neighbours frozen
    // solving that vanished obstruction. Unqueried/distant bodies are never
    // considered here; moved bodies still inside the area are revalidated
    // before publication without restarting the search on every movement.
    const departed=next.iterator&&!next.globalDependencies&&[...next.blockers].find(id=>{
     if(next.ids.includes(id))return false;
     const body=mission.entity(id);
     return !body||body.hp<=0||!bodyInTrafficRegion(mission,body,next.region);
    });
    if(departed){this.discard(mission,next,'rejecting-body-left-region',{id:departed,region:next.region});continue;}
    if(!next.iterator&&next.type==='cycle'&&next.requestKey!==trafficRequestKey(mission,'cycle',next.ids)){
     this.discard(mission,next,'dependencies-changed');continue;
    }
    next.queueWaitMs+=performance.now()-next.waitSince;next.waitSince=null;
    this.stats.maxServiceGapMs=Math.max(this.stats.maxServiceGapMs,performance.now()-(next.lastServedAt??next.createdAt));
    next.lastServedAt=performance.now();
    this.stats.maxQueueWaitMs=Math.max(this.stats.maxQueueWaitMs,next.queueWaitMs);
    this.stats.maxJobAge=Math.max(this.stats.maxJobAge,mission.state.time-next.queuedAt);
    if(!next.iterator){this.snapshot(mission,next);this.trace(mission,next,'started');}
    this.active=next;next.slices++;
   }
   if(performance.now()>=deadline)break;
   const job=this.active;job.shadow.nav.workDeadline=deadline;
   const stage=job.diagnostics.stage??'cycle',at=performance.now(),step=job.iterator.next(),elapsed=performance.now()-at;
   job.timing.searchMs+=elapsed;job.timing.maxNextMs=Math.max(job.timing.maxNextMs,elapsed);
   if(elapsed>2&&(elapsed>(job.loggedNextMs??0)+.5||at-(job.lastSlowAt??-Infinity)>1000)){
    this.trace(mission,job,'slow-next',{ms:elapsed,stage,nextStage:job.diagnostics.stage??'cycle'});
    job.loggedNextMs=elapsed;job.lastSlowAt=at;
   }
   this.stats.searchMs+=elapsed;this.stats.maxSearchNextMs=Math.max(this.stats.maxSearchNextMs,elapsed);
   this.stats.maxNextMs=Math.max(this.stats.maxNextMs,elapsed);
   if(step.done){
    const publication=performance.now();job.patch=[];
    for(const body of job.shadow.state.units){
     const before=job.before.get(body.id);
     if(position(body)!==before.position)throw new Error('Traffic planning changed a physical pose');
     if(JSON.stringify(navigation(body))!==before.fields)job.patch.push({id:body.id,fields:structuredClone(navigation(body)),key:before.key});
    }
    job.outcome=job.patch.length?SEARCH_OUTCOME.FOUND:job.diagnostics.outcome??SEARCH_OUTCOME.LOCAL_SEARCH_EXHAUSTED;
    // A negative local result grants no movement. Keep its rejecting bodies
    // and reservation owners, not every bystander returned by broad-phase
    // queries. Revisit after LOCAL_RETRY_SECONDS even if they are unchanged.
    // Successful plans and searches using global occupancy keep the complete
    // inspected-region witness and live revalidation before publication.
    if(!job.patch.length&&!job.globalDependencies&&job.outcome!==SEARCH_OUTCOME.STALE)
     job.failureIds=[...new Set([...job.ids,...job.blockers])].sort();
    if(job.diagnostics.negativeCacheHit)this.stats.negativeCacheHits++;
    job.witness=witness(job.shadow,job,true);this.ready.push(job);this.active=null;
    const publishMs=performance.now()-publication;this.stats.publishMs+=publishMs;job.timing.publishMs+=publishMs;
    this.trace(mission,job,'searched',{outcome:job.outcome,stage:job.diagnostics.stage,region:job.region,
     dependencies:JSON.parse(job.witness).map(([id])=>id),dependencyScope:job.failureIds?'rejecting-bodies':'inspected-region',
     blockers:[...job.blockers],negativeCacheHit:!!job.diagnostics.negativeCacheHit});
   }
  }
  // Round robin: each unfinished job goes behind already waiting jobs.
  // Each suspended generator retains its own navigator/search buffers.
  if(this.active){this.active.waitSince=performance.now();this.queued.set(this.active.ownerId,this.active);this.active=null;}
  this.stats.slices++;this.stats.maxSliceMs=Math.max(this.stats.maxSliceMs,performance.now()-start);
 }
 publish(mission,deadline=Infinity){
  if(mission.pendingTick||performance.now()>=deadline)return;
  const started=performance.now();let validationMs=0,remaining=this.ready.length;
  while(remaining-->0&&this.ready.length&&performance.now()<deadline){
   const job=this.ready.shift(),checkStarted=performance.now();
   const valid=contextValid(mission,job)&&!job.patch.some(change=>!mission.entity(change.id)||bodyKey(mission.entity(change.id))!==change.key);
   const currentWitness=valid?witness(mission,job):null;
   const checkMs=performance.now()-checkStarted;validationMs+=checkMs;job.timing.revalidationMs+=checkMs;
   if(!valid){this.discard(mission,job,'participant-or-topology-changed',changedParticipant(mission,job));continue;}
   if(job.outcome===SEARCH_OUTCOME.STALE){this.discard(mission,job,'search-context-changed',{diagnostics:job.diagnostics});continue;}
   if(job.witness!==currentWitness){
    if(job.patch.length){
     const at=performance.now();
     if(job.validationWitness!==currentWitness){
      job.validation?.return();job.validationWitness=currentWitness;
      job.validation=passageStillClear(mission,job,()=>job.validationDeadline);
     }
     // A long revalidation must not monopolise the ready queue either.
     job.validationDeadline=Math.min(deadline,performance.now()+.5);
     let checked;
     while(performance.now()<job.validationDeadline){
      const nextAt=performance.now();checked=job.validation.next();const elapsed=performance.now()-nextAt;
      this.stats.maxRevalidationNextMs=Math.max(this.stats.maxRevalidationNextMs,elapsed);
      this.stats.maxNextMs=Math.max(this.stats.maxNextMs,elapsed);if(checked.done)break;
     }
     const elapsed=performance.now()-at;validationMs+=elapsed;job.timing.revalidationMs+=elapsed;
     if(!checked?.done){this.ready.push(job);continue;}
     job.validation=null;
     if(checked.value){job.witness=currentWitness;this.stats.revalidated++;}
    }
    if(job.witness!==currentWitness){
     this.discard(mission,job,job.patch.length?'passage-no-longer-clear':'failure-dependencies-changed',{
      validation:job.validationFailure,changes:dependencyChanges(mission,job)});continue;
    }
   }
   if(performance.now()>=deadline){this.ready.push(job);continue;}
   this.stats.outcomes[job.outcome]=(this.stats.outcomes[job.outcome]??0)+1;
   if(!job.patch.length){
    const retryAt=mission.state.time+LOCAL_RETRY_SECONDS,dependencyIds=new Set(JSON.parse(job.witness).map(([id])=>id));
    this.stats.lastFailure={at:mission.state.time,ids:job.ids,type:job.type,outcome:job.outcome,...job.diagnostics,retryAt,blockers:[...job.blockers].slice(0,16)};
    this.failures.delete(job.requestKey);
    this.failures.set(job.requestKey,{id:job.id,type:job.type,ids:job.ids,ownerId:job.ownerId,requestKey:job.requestKey,
     queuedAt:job.queuedAt,createdAt:job.createdAt,queueWaitMs:job.queueWaitMs,waitSince:null,slices:job.slices,timing:job.timing,
     world:job.world,topology:job.topology,memberRevisions:job.memberRevisions,region:job.region,witness:job.witness,failureIds:job.failureIds,
     baseline:job.baseline.filter(body=>dependencyIds.has(body.id)),outcome:job.outcome,retryAt});
    this.failures.get(job.requestKey).passageBlockers=job.diagnostics.passageBlockers??[];
    while(this.failures.size>256)this.failures.delete(this.failures.keys().next().value);
    this.trace(mission,job,'failed',{outcome:job.outcome,diagnostics:job.diagnostics,retryAt});
    this.dispose(job);this.stats.failed++;continue;
   }
   const applyStarted=performance.now();
   for(const change of job.patch){
    const unit=mission.entity(change.id);
    for(const key of fields){if(Object.hasOwn(change.fields,key))unit[key]=change.fields[key];else delete unit[key];}
    if(unit.yieldReturn?.since===job.shadow.state.time)unit.yieldReturn.since=mission.state.time;
   }
   invalidateTrafficCorridors(mission);invalidateBorrowedHomes(mission);this.failures.delete(job.requestKey);this.stats.applied++;
   for(const {id,time,type,...data} of job.shadow.events)mission.emit(type,data);
   job.timing.publishMs+=performance.now()-applyStarted;
   this.trace(mission,job,'applied',{outcome:job.outcome,changedIds:job.patch.map(change=>change.id)});
   this.dispose(job);
  }
  const elapsed=performance.now()-started;
  this.stats.revalidationMs+=validationMs;this.stats.publishMs+=Math.max(0,elapsed-validationMs);
  this.stats.maxPublishMs=Math.max(this.stats.maxPublishMs,elapsed);
 }
}
