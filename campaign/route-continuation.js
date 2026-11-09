import {sharedRouteTree} from './shared-route-tree.js';
import {interruptedCombatTargets} from './combat-orders.js';
import {cancelCombatRetreat} from './combat-policy.js';
import {cancelCombatDeployment} from './combat-deployment.js';
import {isInfantry} from './scav-unit-profiles.js';
import {navigationDecision} from './navigation-state.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const pose=unit=>({x:unit.x,y:unit.y,heading:unit.heading});
export const ownsContinuation=(unit,revision=unit.commandRevision)=>!!unit.routeContinuation&&unit.hp>0
 &&unit.commandRevision===revision&&unit.routeContinuation?.revision===revision;
export const followsContinuation=unit=>ownsContinuation(unit)&&unit.routeContinuation.phase==='following'
 &&unit.task?.type===unit.routeContinuation.type&&!unit.combatRetreat&&!unit.combatDeployment&&!unit.combatResume;

// A frontier is a temporary route boundary, never a parking destination. All
// data here survives saving; generators and private search scratch do not.
export function* prepareRoutePrefixes(mission,record){
 const nav=mission.nav,live=mission.commandJob.mission,cohorts=new Set(record.cohorts?.flat()??[]);
 const units=mission.state.units.filter(u=>record.ids.includes(u.id)&&u.pendingOrder?.revision===record.revision);
 const anchor=nav.terrainAllowed(record.target.x,record.target.y)?nav.nearest(record.target.x,record.target.y,3):null;
 if(!anchor||nav.solids.some(s=>Math.abs(record.target.x-s.x)<s.halfWidth&&Math.abs(record.target.y-s.y)<s.halfDepth))return;
 const disengage=record.action==='attack-move'?yield* interruptedCombatTargets(mission,units):[];
 for(const unit of units){
  if(performance.now()>=(nav.workDeadline??Infinity))yield;
  const current=live.entity(unit.id);
  if(!current||current.hp<=0||current.pendingOrder?.revision!==record.revision||ownsContinuation(current)
   ||cohorts.has(unit.id)||isInfantry(unit)||unit.tool>0||unit.foldTime>0||distance(unit,anchor)<nav.cell*8)continue;
  // Intent execution may move the car during this search. Publication checks
  // the connection from its live pose; the search keeps an immutable source.
  const source={...unit,...pose(current)},paved=nav.roads.nearPavement(source)&&nav.roads.nearPavement(anchor);
  const tree=sharedRouteTree(nav,anchor,paved),branch=yield* tree.branch(source);
  if(!branch?.length)continue;
  const raw=branch.map(id=>tree.position(id));let index=0,cost=tree.travelCost(source,raw[0]);
  while(index+1<raw.length&&distance(source,raw[index+1])<=nav.cell*8&&tree.clearSegment(source,raw[index+1])){
   if(performance.now()>=(nav.workDeadline??Infinity))yield;
   const next=tree.travelCost(source,raw[index+1]);
   if(nav.roads.buckets.size&&next>cost+tree.travelCost(raw[index],raw[index+1])+.04*nav.cell)break;
   index++;cost=next;
  }
  let frontier=raw[index];
  // A shared tree supplies connectivity, not a point for every row to merge
  // into. Keep the translated formation on an open initial corridor. This
  // uses the same static segment proof and keeps the original prefix bound.
  const steering=current.pendingOrder.steeringTarget;
  if(steering){
   const length=distance(source,steering),travel=Math.min(length,nav.cell*8);
   const translated={x:source.x+(steering.x-source.x)*travel/Math.max(.001,length),
    y:source.y+(steering.y-source.y)*travel/Math.max(.001,length)};
   if(tree.clearSegment(source,translated))frontier=translated;
  }
  if(distance(source,frontier)<nav.cell*2||current.pendingOrder?.revision!==record.revision)continue;
  current.routeContinuation={revision:record.revision,request:{...record.target},frontier:{...frontier},
   source:pose(source),phase:'ready-prefix',path:[{...frontier}],type:record.action,disengage,
   topology:nav.topologyRevision,bounds:nav.bounds.join(',')};
  yield;
 }
}

// Tail planning starts at the future end of an already checked prefix. The
// actual pose is recorded too, but never committed back to the live vehicle.
export function continuationSource(unit){
 if(!ownsContinuation(unit))return null;
 const state=unit.routeContinuation,frontier=state.frontier;
 if(state.planFromActual)return {actual:pose(unit),frontier:null,pose:pose(unit)};
 const last=unit.path.at(-1),previous=unit.path.length>1?unit.path.at(-2):unit;
 if(state.phase==='ready-prefix')return {actual:pose(unit),frontier:{...frontier},
  pose:{...frontier,heading:Math.atan2(unit.x-frontier.x,frontier.y-unit.y)}};
 if(last)return {actual:pose(unit),frontier:{...last},
  pose:{...last,heading:Math.atan2(previous.x-last.x,last.y-previous.y)}};
 // A local recovery can replace the path. Replan from a fresh immutable pose;
 // the result then needs a checked reconnection before it can replace that path.
 return {actual:pose(unit),frontier:null,pose:pose(unit)};
}

export function stageRouteTail(unit,source,fields,topology,bounds){
 if(!ownsContinuation(unit))return false;
 unit.routeContinuation.ready={source,fields,topology,bounds};
 delete unit.routeContinuation.failure;
 // This is the first accepted parking destination, separate from frontier.
 unit.routeContinuation.destination=fields.routeOrder?.destination;
 return true;
}

export function applyRouteContinuations(mission){
 for(const unit of mission.state.units){
  if(!unit.routeContinuation)continue;
  if(!ownsContinuation(unit)){delete unit.routeContinuation;continue;}
  const state=unit.routeContinuation,record=mission.state.commandOrders?.find(r=>r.revision===state.revision);
  // A temporary firing deployment suspends the march. Its controller keeps
  // ownership of movement until it restores the saved marching task.
  if(state.phase==='following'&&(unit.combatDeployment||unit.combatResume))continue;
  if(state.phase==='following'&&(unit.combatRetreat||unit.task?.type!==state.type)){
   delete unit.routeContinuation;delete unit.commandRevision;continue;
  }
  if(state.phase==='ready-prefix'){
   if(unit.pendingOrder?.revision!==state.revision||distance(unit,state.source)>.001&&!mission.nav.lineClear(unit,state.frontier,false,true,.52,true)
    ||state.topology!==mission.nav.topologyRevision||state.bounds!==mission.nav.bounds.join(',')){
    delete unit.routeContinuation;if(record)record.status='queued';continue;
   }
   cancelCombatRetreat(unit,unit.retreatSuppressed);cancelCombatDeployment(unit);
   for(const key of ['detour','traffic','trafficHold','driveWatch','reverseDebt','failedArcs','workEscapeRetryAt',
    'passage','passingLane','mergeTraffic','yieldReturn','routeOrder','commandStartAfter'])delete unit[key];
   if(state.disengage.length)unit.combatDisengage=[...state.disengage];
   unit.path=state.path;unit.task={type:state.type,targetId:null,...state.request};
   state.phase='following';delete state.path;delete unit.pendingOrder;
   if(record)record.prefixReleased=(record.prefixReleased??0)+1;
  }
  const ready=state.ready;if(!ready)continue;
  if(ready.topology!==mission.nav.topologyRevision||ready.bounds!==mission.nav.bounds.join(',')){
   delete state.ready;if(record)record.status='queued';continue;
  }
  let path=null;
  if(ready.source.frontier&&ready.fields.detour){
   // Manoeuvre legs are relative to a physical pose. A future-frontier plan
   // cannot start while the car is still driving its prefix. Recompute that
   // exceptional tail only after the real prefix finishes, at the live pose.
   if(unit.path.length)continue;
   delete state.ready;state.planFromActual=true;if(record)record.status='queued';continue;
  }
  if(ready.source.frontier){
   const index=unit.path.findIndex(point=>distance(point,ready.source.frontier)<.001);
   if(index>=0){
    path=[...unit.path.slice(0,index+1),...ready.fields.path];
    const first=ready.fields.path[0],frontier=ready.source.frontier;
    // Once the full tail exists, a nearly straight temporary frontier is
    // not a stop/turn target. Keeping it made every row brake, then forced
    // following rows into expensive avoidance on an otherwise clear march.
    if(index===0&&first){
     const ax=frontier.x-unit.x,ay=frontier.y-unit.y,bx=first.x-frontier.x,by=first.y-frontier.y;
     if(ax*bx+ay*by>0&&Math.abs(Math.atan2(ax*by-ay*bx,ax*bx+ay*by))<.12
      &&mission.nav.lineClear(unit,first,false,true))path=ready.fields.path;
    }
   }
   else if(!unit.path.length&&distance(unit,ready.source.frontier)<2.01
    &&mission.nav.lineClear(unit,ready.fields.path[0],false,true))path=ready.fields.path;
  }else if(distance(unit,ready.source.actual)<.001&&Math.abs(Math.atan2(Math.sin(unit.heading-ready.source.actual.heading),Math.cos(unit.heading-ready.source.actual.heading)))<1e-6)path=ready.fields.path;
  if(!path){
   // Never restore the stale source or an old initial segment. The next slice
   // plans from the changed live route, retaining the already assigned goal.
   delete state.ready;if(record)record.status='queued';continue;
  }
  unit.path=path;unit.task=ready.fields.task;unit.routeOrder=ready.fields.routeOrder;
  if(ready.fields.passage)unit.passage=ready.fields.passage;else delete unit.passage;
  if(!ready.source.frontier){
   for(const key of ['detour','traffic','trafficHold','driveWatch','reverseDebt','failedArcs','terrainEscape']){
    if(ready.fields[key]!==undefined)unit[key]=ready.fields[key];else delete unit[key];
   }
  }
  for(const key of ['combatGroup','combatDisengage'])if(ready.fields[key]!==undefined)unit[key]=ready.fields[key];
  delete unit.routeContinuation;
  if(record&&!record.assigned.includes(unit.id))record.assigned.push(unit.id);
 }
}

export function waitingForContinuation(unit){
 if(!followsContinuation(unit)||unit.path.length)return false;
 const failure=unit.routeContinuation.failure;
 unit.driveSpeed=0;
 navigationDecision(unit,failure?'BLOCKED':'GLOBAL_REPLAN',failure?.reason??'route-continuation-pending',
  failure?.blockerId??null,failure?'await-changed-conditions':'append-checked-continuation');
 return true;
}
