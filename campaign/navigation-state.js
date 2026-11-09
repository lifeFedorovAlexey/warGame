/** @typedef {'MOVING'|'YIELDING'|'WAITING_RESERVATION'|'MANEUVERING'|'LOCAL_REPLAN'|'GLOBAL_REPLAN'|'ARRIVED'|'BLOCKED'|'UNREACHABLE'|'IDLE'} NavigationState */

// Diagnostics describe the controller that actually ran. They never grant
// passage, clear an order, or turn an unclassified stop into a successful wait.
export function beginNavigationStep(unit){
 const state=unit.navigation??={state:'IDLE',reason:'no-order',since:0,stoppedSince:null};
 state.control=null;state.controlReason=null;state.blockerId=null;state.blockerIds=[];state.nextAction=null;state.desiredSpeed=null;
}
export function navigationDecision(unit,state,reason,blockerId=null,nextAction=null,desiredSpeed=null){
 const info=unit.navigation??={state:'IDLE',reason:'no-order',since:0,stoppedSince:null};
 info.control=state;info.controlReason=reason;
 info.blockerIds=[...new Set((Array.isArray(blockerId)?blockerId:[blockerId]).filter(Boolean))];
 info.blockerId=info.blockerIds[0]??null;info.nextAction=nextAction;info.desiredSpeed=desiredSpeed;
}
export function finishNavigationStep(mission,unit,dt,fromX,fromY){
 const info=unit.navigation,now=mission.state.time;
 if(!info)return;
 const travelled=Math.hypot(unit.x-fromX,unit.y-fromY),moving=travelled>1e-4;
 const active=!!(unit.task||unit.path.length||unit.detour||unit.jointTraffic||unit.yieldReturn||unit.pendingOrder||unit.factoryVisit&&unit.factoryVisit.phase!=='inside');
 let state,reason;
 if(unit.hp<=0){state='IDLE';reason='destroyed';}
 else if(moving){state=unit.detour||unit.jointTraffic?'MANEUVERING':'MOVING';reason=unit.jointTraffic?'joint-passage-phase':unit.detour?.idleYield?'clearing-passage':unit.detour?'checked-manoeuvre':'following-route';}
 else if(info.control){state=info.control;reason=info.controlReason;}
 else if(unit.pendingOrder){state='GLOBAL_REPLAN';reason='command-route-pending';info.nextAction='apply-current-order-result';}
 else if(unit.yieldReturn?.phase==='waiting'){state='YIELDING';reason='parking-return-occupied';info.blockerId=unit.yieldReturn.waitingFor??null;info.blockerIds=info.blockerId?[info.blockerId]:[];info.nextAction='return-when-clear';}
 else if(unit.builderWorking||unit.foldTime>0){state='IDLE';reason=unit.builderWorking?'working':'folding-equipment';}
 else if(unit.combatDeployment?.status==='arrived'||unit.combatRetreat?.status==='arrived'){
  state='ARRIVED';reason=unit.combatRetreat?'retreat-position':'firing-position';
 }else if(unit.task?.salvageId&&!unit.path.length){state='IDLE';reason='collecting-part';}
 else if(active){state='BLOCKED';reason='unclassified-stop';info.nextAction='diagnose-controller';}
 else{
  const goal=unit.combatParking?.goal??unit.routeOrder?.destination;
  const tolerance=unit.combatParking?mission.config.worldScale*4:2;
  state=goal&&Math.hypot(unit.x-goal.x,unit.y-goal.y)<tolerance?'ARRIVED':'IDLE';
  reason=state==='ARRIVED'?'destination-reached':'no-order';
 }
 if(state!==info.state||reason!==info.reason){info.since=now;info.state=state;info.reason=reason;}
 info.speed=dt>0?travelled/dt:0;
 // Accumulate actual displacement; steering/velocity changes alone are not
 // progress. Retain an unknown timestamp when loading older saves/logs.
 const anchor=info.progressAnchor??={x:fromX,y:fromY};
 if(Math.hypot(unit.x-anchor.x,unit.y-anchor.y)>=mission.config.worldScale*.02){
  info.lastProgressAt=now;info.progressAnchor={x:unit.x,y:unit.y};
 }
 info.commandRevision=unit.commandRevision;
 info.stoppedSince=!moving&&active&&state!=='ARRIVED'?(info.stoppedSince??now):null;
 info.waitSeconds=info.stoppedSince===null?0:Math.max(0,now-info.stoppedSince);
 info.attempt=unit.driveWatch?.attempts??0;
 // Named waits can also fail to make progress. The short threshold diagnoses
 // missing controller decisions; the longer one flags starvation for review,
 // without changing priority or treating a legitimate short queue as a fault.
 info.waitCycle=!moving&&active&&!!mission.navigationDiagnostics?.deadlockedIds?.has(unit.id);
 info.potentialDefect=info.waitSeconds>.50001&&(state==='BLOCKED'&&reason==='unclassified-stop'||info.waitCycle)
  ||info.waitSeconds>5&&['YIELDING','WAITING_RESERVATION','BLOCKED','LOCAL_REPLAN','GLOBAL_REPLAN'].includes(state);
 if(info.potentialDefect&&!info.reported){mission.emit('navigation-stalled',{unit:unit.id,reason,waitSeconds:info.waitSeconds});info.reported=true;}
 if(!info.potentialDefect)info.reported=false;
}
export function navigationStopDetails(mission,unit){
 const info=unit.navigation??{},coordinator=mission.trafficCoordinator,planner=coordinator.planner;
 const shared=planner?.jobFor?.(unit),route=coordinator.routes?.get(unit.id),pending=unit.pendingOrder;
 const passage=coordinator.passageDecisions?.get(unit.id),decision=coordinator.decisions?.get(unit.id);
 const blockerId=info.blockerId??info.blockerIds?.[0]??passage?.yieldTo??decision?.yieldTo??null;
 const blocker=blockerId&&mission.entity(blockerId),jointOwner=unit.jointTraffic?.owner??blocker?.jointTraffic?.owner;
 const reservationId=unit.jointTraffic?.token??blocker?.jointTraffic?.token??passage?.key
  ??(blocker?.detour?.reservedCorridor?'corridor:'+blocker.id:decision?.yieldTo?'junction:'+decision.yieldTo:null);
 const queuedAt=shared?.queuedAt??route?.queuedAt??pending?.queuedAt;
 const separating=unit.overlapRecovery&&unit.overlapRecovery.active!==false;
 let motionOwner=unit.hp<=0?'none':separating?'overlap-separation':unit.detour?.recoveryTurn?'stuck-turn':unit.jointTraffic?'joint:'+jointOwner:pending?'command-intent'
  :planner?.activeFor(unit)?'traffic-recovery':route&&(route.kind==='maneuver'||route.iterator)?'search:'+route.kind:unit.detour?'local-maneuver':unit.yieldReturn?'parking-return'
  :unit.factoryVisit?'factory:'+unit.factoryVisit.phase:unit.combatRetreat?'retreat':unit.path?.length?'route-following':unit.builderWorking?'service':'none';
 const failure=[...(planner?.failures?.values()??[])].find(job=>job.ids.includes(unit.id));
 return {motionOwner,stopReason:(info.speed??unit.driveSpeed??0)<.01?info.reason??'not-updated':null,blockerId,reservationId,
  pendingJobAge:queuedAt===undefined?null:Math.max(0,mission.state.time-queuedAt),
  lastProgressAt:info.lastProgressAt??null,
  nextRecoveryAction:separating?'resolve-overlap':unit.detour?.recoveryTurn?'finish-stuck-turn':shared?(shared.patch?'revalidate-and-publish':shared.iterator?'continue-local-search':'snapshot-local-search')
   :route?(route.finished?'publish-':route.iterator?'continue-':'start-')+route.kind+'-search'
   :failure&&mission.state.time<failure.retryAt?'retry-local-search-at:'+failure.retryAt.toFixed(1):info.nextAction??'none'};
}
export function navigationSnapshot(mission,unit){
 if(!unit)return null;
 const info=unit.navigation??{},group=mission.state.commandGroups?.find(g=>g.id===unit.commandGroupId),passage=mission.trafficCoordinator.passageDecisions?.get(unit.id);
 return {id:unit.id,state:info.state??'IDLE',reason:info.reason??'not-updated',...navigationStopDetails(mission,unit),
  goal:unit.pendingOrder?.target??unit.routeContinuation?.request??unit.routeOrder?.request??unit.task??null,
  destination:unit.pendingOrder?null:unit.routeContinuation?unit.routeContinuation.destination??null:unit.routeOrder?.destination??unit.combatDeployment?.goal??unit.task??null,
  path:unit.path,localTarget:mission.trafficCoordinator.intents.get(unit.id)?.waypoint??unit.path[0]??null,
  speed:info.speed??0,desiredSpeed:info.desiredSpeed,blockerIds:info.blockerIds??[],
  waitSeconds:info.waitSeconds??0,attempt:info.attempt??0,nextAction:info.nextAction,potentialDefect:!!info.potentialDefect,
  group:group?{id:group.id,leaderId:group.leaderId,virtual:group.virtual,formation:group.formation,members:group.members,goal:group.anchor??null}:null,
  reservation:passage&&unit.passage?.throat?{...passage,throat:unit.passage.throat}:null};
}

export const navigationDependencies=unit=>unit.navigation?.blockerIds?.length?unit.navigation.blockerIds
 :unit.navigation?.blockerId?[unit.navigation.blockerId]:[];
export const navigationRouteKey=unit=>JSON.stringify([unit.task,unit.path,unit.commandRevision,unit.yieldReturn?.home]);
function dependencyCycles(units){
 const byId=new Map(units.map(u=>[u.id,u])),indices=new Map(),low=new Map(),stack=[],onStack=new Set(),cycles=[];
 let index=0;
 const visit=unit=>{
  indices.set(unit.id,index);low.set(unit.id,index++);stack.push(unit);onStack.add(unit.id);
  for(const id of navigationDependencies(unit)){
   const other=byId.get(id);if(!other)continue;
   if(!indices.has(id)){visit(other);low.set(unit.id,Math.min(low.get(unit.id),low.get(id)));}
   else if(onStack.has(id))low.set(unit.id,Math.min(low.get(unit.id),indices.get(id)));
  }
  if(low.get(unit.id)!==indices.get(unit.id))return;
  const component=[];let member;
  do{member=stack.pop();onStack.delete(member.id);component.push(member);}while(member!==unit);
  if(component.length>1)cycles.push(component.sort((a,b)=>a.id.localeCompare(b.id)));
 };
 for(const unit of units)if(!indices.has(unit.id))visit(unit);
 return cycles;
}
// Show the end of a stopped dependency chain, not every car queued behind it.
// A closed cycle has several mutually blocking members; none is singled out
// as its sole cause. This uses the same physical edges as recovery.
function trafficBlockerIds(units,dependencies,cycles){
 const byId=new Map(units.map(unit=>[unit.id,unit])),blocked=new Set(),cycleById=new Map();
 for(const cycle of cycles)for(const id of cycle)cycleById.set(id,cycle);
 for(const unit of units){
  if((unit.navigation?.waitSeconds??0)<=.5&&!unit.navigation?.potentialDefect)continue;
  const pending=[...(dependencies.get(unit.id)??[])],seen=new Set();
  while(pending.length){
   const id=pending.pop();if(seen.has(id))continue;seen.add(id);
   const other=byId.get(id);if(!other||other.hp<=0||(other.navigation?.speed??other.driveSpeed??0)>.05)continue;
   const cycle=cycleById.get(id);
   if(cycle){for(const member of cycle)blocked.add(member);continue;}
   const next=(dependencies.get(id)??[]).filter(key=>byId.has(key));
   if(next.length)pending.push(...next);else if(id!==unit.id)blocked.add(id);
  }
 }
 return blocked;
}
export function auditNavigationWaits(mission){
 const waiting=mission.state.units.filter(u=>u.hp>0&&(u.navigation?.waitSeconds??0)>.50001);
 const diagnostics=mission.navigationDiagnostics??={cycles:[],unexplained:[],reportedCycles:new Set()};
 diagnostics.unexplained=waiting.filter(u=>u.navigation.reason==='unclassified-stop').map(u=>u.id);
 diagnostics.cycles=[];
 // The same physical dependencies feed priority, recovery and diagnostics.
 // A borrowed parking space is an unfinished movement even without a path.
 const dependent=mission.state.units.filter(u=>u.hp>0&&!u.pendingOrder
  &&((u.path?.length??0)>0||u.yieldReturn||u.jointTraffic)&&navigationDependencies(u).length
  &&(u.navigation.speed??0)<.01
  &&(u.navigation.commandRevision===undefined||u.navigation.commandRevision===u.commandRevision));
 diagnostics.dependencies=new Map(dependent.map(u=>[u.id,navigationDependencies(u).slice()]));
 diagnostics.recoveryCycles=dependencyCycles(dependent).map(cycle=>cycle.map(u=>u.id));
 const cycleIds=new Set(diagnostics.recoveryCycles.flat());
 diagnostics.recoveryRoutes=new Map(dependent.filter(u=>cycleIds.has(u.id)).map(u=>[u.id,navigationRouteKey(u)]));
 diagnostics.deadlockedIds=cycleIds;
 diagnostics.blockingIds=trafficBlockerIds(mission.state.units,diagnostics.dependencies,diagnostics.recoveryCycles);
 for(let changed=true;changed;){changed=false;for(const u of dependent)if(!cycleIds.has(u.id)&&navigationDependencies(u).some(id=>cycleIds.has(id))){cycleIds.add(u.id);changed=true;}}
 const present=new Set();
 for(const cycle of dependencyCycles(waiting)){
  const key=cycle.map(u=>u.id).sort().join('|');present.add(key);
  diagnostics.cycles.push(cycle.map(u=>u.id));
  for(const member of cycle){member.navigation.potentialDefect=true;member.navigation.nextAction='break-wait-cycle';}
  if(!diagnostics.reportedCycles.has(key))mission.emit('navigation-wait-cycle',{units:cycle.map(u=>u.id)});
 }
 diagnostics.reportedCycles=present;
}
