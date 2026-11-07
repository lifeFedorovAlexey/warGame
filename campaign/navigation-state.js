/** @typedef {'MOVING'|'YIELDING'|'WAITING_RESERVATION'|'MANEUVERING'|'LOCAL_REPLAN'|'GLOBAL_REPLAN'|'ARRIVED'|'BLOCKED'|'UNREACHABLE'|'IDLE'} NavigationState */

// Diagnostics describe the controller that actually ran. They never grant
// passage, clear an order, or turn an unclassified stop into a successful wait.
export function beginNavigationStep(unit){
 const state=unit.navigation??={state:'IDLE',reason:'no-order',since:0,stoppedSince:null};
 state.control=null;state.controlReason=null;state.blockerId=null;state.nextAction=null;state.desiredSpeed=null;
}
export function navigationDecision(unit,state,reason,blockerId=null,nextAction=null,desiredSpeed=null){
 const info=unit.navigation??={state:'IDLE',reason:'no-order',since:0,stoppedSince:null};
 info.control=state;info.controlReason=reason;info.blockerId=blockerId;info.nextAction=nextAction;info.desiredSpeed=desiredSpeed;
}
export function finishNavigationStep(mission,unit,dt,fromX,fromY){
 const info=unit.navigation,now=mission.state.time;
 if(!info)return;
 const travelled=Math.hypot(unit.x-fromX,unit.y-fromY),moving=travelled>1e-4;
 const active=!!(unit.task||unit.path.length||unit.detour||unit.yieldReturn||unit.pendingOrder);
 let state,reason;
 if(unit.hp<=0){state='IDLE';reason='destroyed';}
 else if(moving){state=unit.detour?'MANEUVERING':'MOVING';reason=unit.detour?.idleYield?'clearing-passage':unit.detour?'checked-manoeuvre':'following-route';}
 else if(info.control){state=info.control;reason=info.controlReason;}
 else if(unit.pendingOrder){state='GLOBAL_REPLAN';reason='command-route-pending';info.nextAction='apply-current-order-result';}
 else if(unit.yieldReturn?.phase==='waiting'){state='YIELDING';reason='parking-return-occupied';info.blockerId=unit.yieldReturn.waitingFor??null;info.nextAction='return-when-clear';}
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
 info.stoppedSince=!moving&&active&&state!=='ARRIVED'?(info.stoppedSince??now):null;
 info.waitSeconds=info.stoppedSince===null?0:Math.max(0,now-info.stoppedSince);
 info.attempt=unit.driveWatch?.attempts??0;
 info.potentialDefect=info.waitSeconds>.50001&&state==='BLOCKED'&&reason==='unclassified-stop';
 if(info.potentialDefect&&!info.reported){mission.emit('navigation-stalled',{unit:unit.id,reason,waitSeconds:info.waitSeconds});info.reported=true;}
 if(!info.potentialDefect)info.reported=false;
}
export function navigationSnapshot(mission,unit){
 if(!unit)return null;
 const info=unit.navigation??{},group=mission.state.commandGroups?.find(g=>g.id===unit.commandGroupId),passage=mission.trafficCoordinator.passageDecisions?.get(unit.id);
 return {id:unit.id,state:info.state??'IDLE',reason:info.reason??'not-updated',
  goal:unit.pendingOrder?.target??unit.routeOrder?.request??unit.task??null,destination:unit.pendingOrder?null:unit.routeOrder?.destination??unit.combatDeployment?.goal??unit.task??null,
  path:unit.path,localTarget:mission.trafficCoordinator.intents.get(unit.id)?.waypoint??unit.path[0]??null,
  speed:info.speed??0,desiredSpeed:info.desiredSpeed,blockerId:info.blockerId,
  waitSeconds:info.waitSeconds??0,attempt:info.attempt??0,nextAction:info.nextAction,potentialDefect:!!info.potentialDefect,
  group:group?{id:group.id,leaderId:group.leaderId,virtual:group.virtual,formation:group.formation,members:group.members,goal:group.anchor??null}:null,
  reservation:passage&&unit.passage?.throat?{...passage,throat:unit.passage.throat}:null};
}

export function auditNavigationWaits(mission){
 const waiting=mission.state.units.filter(u=>u.hp>0&&(u.navigation?.waitSeconds??0)>.50001);
 const diagnostics=mission.navigationDiagnostics??={cycles:[],unexplained:[],reportedCycles:new Set()};
 diagnostics.unexplained=waiting.filter(u=>u.navigation.reason==='unclassified-stop').map(u=>u.id);
 diagnostics.cycles=[];
 if(!waiting.length){diagnostics.reportedCycles.clear();return;}
 const byId=new Map(waiting.map(u=>[u.id,u])),done=new Set(),present=new Set();
 for(const unit of waiting){
  if(done.has(unit.id))continue;
  const path=[],indices=new Map();let current=unit;
  while(current&&!done.has(current.id)){
   if(indices.has(current.id)){
    const cycle=path.slice(indices.get(current.id)),key=cycle.map(u=>u.id).sort().join('|');present.add(key);
    diagnostics.cycles.push(cycle.map(u=>u.id));
    for(const member of cycle){member.navigation.potentialDefect=true;member.navigation.nextAction='break-wait-cycle';}
    if(!diagnostics.reportedCycles.has(key))mission.emit('navigation-wait-cycle',{units:cycle.map(u=>u.id)});
    break;
   }
   indices.set(current.id,path.length);path.push(current);
   current=byId.get(current.navigation.blockerId);
  }
  for(const member of path)done.add(member.id);
 }
 diagnostics.reportedCycles=present;
}
