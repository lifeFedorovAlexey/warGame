import {checkManeuver} from './vehicle-motion.js';
import {checkedRouteShortcut,recoveryConditions} from './traffic-shortcut.js';
import {navigationDecision} from './navigation-state.js';
import {isInfantry} from './scav-unit-profiles.js';
import {vehicleEnvelope,footprintSupport} from './vehicle-collision.js';

const failed=new WeakMap();
const routeKey=unit=>JSON.stringify([unit.task,unit.path]);
const requestKey=unit=>JSON.stringify([unit.commandRevision,unit.task,unit.path.at(-1)]);
const replaceable=plan=>plan?.blocked>0&&!plan.parking&&!plan.idleYield&&!plan.yieldReturning
 &&!plan.departure&&!plan.passageExit&&!plan.progressRecovery;
export function checkedCycleActive(mission,unit){
 if(unit.traffic?.cycle)return true;
 const moving=unit.trafficHold&&mission.entity(unit.trafficHold);
 if(moving?.traffic?.cycle&&moving.detour?.cycleRecovery)return true;
 const yielding=unit.cycleContinuation&&mission.entity(unit.cycleContinuation),state=yielding?.traffic;
 if(state?.cycle&&state.leader===unit.id&&state.requesterKey===requestKey(unit))return true;
 delete unit.cycleContinuation;return false;
}
function releaseCycle(mission,unit,state){
 const requester=mission.entity(state.leader);
 if(requester?.cycleContinuation===unit.id)delete requester.cycleContinuation;
 delete unit.traffic;
}
function rearBeyondRelease(mission,unit,release){
 const direction={x:-Math.sin(release.heading),y:Math.cos(release.heading)},scale=mission.config.worldScale;
 const actual=vehicleEnvelope(unit,scale,mission.field),planned=vehicleEnvelope(release,scale,mission.field);
 return (actual.x-planned.x)*direction.x+(actual.y-planned.y)*direction.y
  -footprintSupport(actual,direction.x,direction.y)+footprintSupport(planned,direction.x,direction.y);
}
function projectedSweep(mission,unit,projected){
 return (from,to)=>{
  // The same full-body neighbourhood as vehicleMotionClear, replacing only
  // the one/two explicitly proved future poses. Avoid scanning 500 bodies
  // at every arc sample of a suspended continuation proof.
  const obstacles=mission.nearbyUnits(to,mission.config.worldScale*7).filter(body=>!projected.has(body));
  obstacles.push(...projected.values());
  return mission.vehicleMotionClear(unit,from,to,.52,undefined,obstacles);
 };
}

// A wait cycle is evidence that priority alone cannot release these bodies.
// Search one physical yield, followed by two checked continuations: the
// requester first, then the yielding car back onto its unchanged route.
export function* recoverWaitCycle(mission,owner){
 const diagnostics=mission.navigationDiagnostics;
 const ids=(diagnostics?.recoveryCycles??diagnostics?.cycles)?.find(cycle=>cycle.slice().sort()[0]===owner.id);
 if(!ids||ids.length<2)return false;
 const members=ids.map(id=>mission.entity(id));
 if(members.some(unit=>!unit||unit.hp<=0||isInfantry(unit)||unit.owner!==owner.owner||!unit.path.length
  ||unit.detour&&!replaceable(unit.detour)||unit.traffic||unit.trafficHold||unit.pendingOrder||unit.builderWorking
  ||unit.foldTime>0||unit.tool>0||(unit.driveSpeed??0)>.1))return false;
 if(diagnostics.recoveryRoutes&&members.some(unit=>diagnostics.recoveryRoutes.get(unit.id)
  !==JSON.stringify([unit.task,unit.path,unit.commandRevision])))return false;
 // beginNavigationStep clears the current controller's previous blocker.
 // The cycle itself is the preceding tick's ordered, audited dependency path.
 if(members.some((unit,index)=>unit.navigation?.blockerId
  &&unit.navigation.blockerId!==ids[(index+1)%ids.length]))return false;
 const scale=mission.config.worldScale,signature=members.map(unit=>recoveryConditions(mission,unit)).join('\n');
 if(failed.get(owner)===signature)return false;
 const routes=new Map(members.map(unit=>[unit,routeKey(unit)]));
 const revisions=new Map(members.map(unit=>[unit,unit.commandRevision]));
 const state=mission.state,topology=mission.nav.topologyRevision,
  bodies=state.units.map(unit=>({unit,x:unit.x,y:unit.y,heading:unit.heading,hp:unit.hp}));
 const valid=()=>mission.state===state&&mission.nav.topologyRevision===topology
  &&state.units.length===bodies.length&&bodies.every((body,index)=>state.units[index]===body.unit
   &&body.unit.x===body.x&&body.unit.y===body.y&&body.unit.heading===body.heading&&body.unit.hp===body.hp)
  &&members.every(unit=>routeKey(unit)===routes.get(unit)&&unit.commandRevision===revisions.get(unit)&&!unit.pendingOrder);
 for(const unit of members.slice().sort((a,b)=>a.id.localeCompare(b.id)).slice(0,6)){
  const requester=members[(members.indexOf(unit)+members.length-1)%members.length];
  const allowed=(from,to)=>mission.vehicleMotionClear(unit,from,to);
  const rejected=[];
  for(let attempt=0;attempt<3;attempt++){
  const park=yield* mission.parkingManeuverSteps(unit,requester,allowed,{accept:pose=>rejected.every(other=>
   Math.hypot(pose.x-other.x,pose.y-other.y)>scale||Math.cos(pose.heading-other.heading)<.98)});
  if(!park)break;
  const end=checkManeuver(unit,park.legs,scale,allowed);if(!end)continue;
  rejected.push(end);
  const parked={...unit,...end,driveSpeed:0};
  const afterParking=new Map([[unit,parked]]),requestClear=projectedSweep(mission,requester,afterParking);
  let requestStart={...requester,driveSpeed:0},releaseGoal,remaining=scale*12;
  for(const point of requester.path.slice(0,3)){
   const releasePose={};
   if(!(yield* checkedRouteShortcut(mission,requestStart,point,{
    allowed:requestClear,
    endpoint:releasePose,maximumDistance:remaining})))break;
   const released={...requester,...releasePose.pose,driveSpeed:0};
   const afterRelease=new Map([[unit,parked],[requester,released]]);
   if(rearBeyondRelease(mission,requester,released)<-.05&&(yield* checkedRouteShortcut(mission,{...parked},unit.path[0],{
    allowed:projectedSweep(mission,unit,afterRelease)}))){
    releaseGoal={x:released.x,y:released.y,heading:released.heading,kind:requester.kind};break;
   }
   remaining-=releasePose.travelled;if(remaining<=0)break;
   requestStart={...requester,...releasePose.pose};
  }
  if(!releaseGoal)continue;
  // Suspended searches never publish a half-plan. The original routes and
  // accepted destinations remain owned by their original orders.
  if(!valid())return false;
  unit.detour={legs:park.legs,parking:true,cycleRecovery:true,blocked:0};
  unit.traffic={leader:requester.id,since:mission.state.time,phase:'move',cycle:true,
   route:routes.get(unit),members:ids.slice(),releaseGoal,requesterKey:requestKey(requester)};
  requester.cycleContinuation=unit.id;
  if(replaceable(requester.detour))delete requester.detour;
  for(const other of members)if(other!==unit)other.trafficHold=unit.id;
  mission.emit('navigation-cycle-recovery',{units:ids,unit:unit.id,requester:requester.id});
  return true;
  }
 }
 if(valid())failed.set(owner,signature);return false;
}

export function* resumeCycleRoute(mission,unit){
 const state=unit.traffic;if(!state?.cycle||state.phase!=='parked')return false;
 if(state.route!==routeKey(unit)){releaseCycle(mission,unit,state);return false;}
 const requester=mission.entity(state.leader),release=state.releaseGoal;
 if(requester&&release&&state.requesterKey===requestKey(requester)){
  const rear=rearBeyondRelease(mission,requester,release);
  if(rear<-.05){
   navigationDecision(unit,'YIELDING','cycle-requester-crossing',requester.id,'wait-for-actual-release-sector');
   unit.driveSpeed=0;return true;
  }
 }
 const allowed=(from,to)=>mission.vehicleMotionClear(unit,from,to);
 const world=mission.state,topology=mission.nav.topologyRevision,route=routeKey(unit),revision=unit.commandRevision,
  bodies=world.units.map(body=>({body,x:body.x,y:body.y,heading:body.heading,hp:body.hp}));
 const clear=yield* checkedRouteShortcut(mission,unit,unit.path[0],{allowed});
 // The return connector is also a suspended proof. A newer command must
 // retain its own state; construction/body changes require a fresh proof.
 if(mission.state!==world||unit.traffic!==state||unit.pendingOrder||unit.commandRevision!==revision
  ||routeKey(unit)!==route||mission.nav.topologyRevision!==topology||world.units.length!==bodies.length
  ||bodies.some((saved,index)=>world.units[index]!==saved.body||saved.body.x!==saved.x||saved.body.y!==saved.y
   ||saved.body.heading!==saved.heading||saved.body.hp!==saved.hp))return true;
 if(clear){
  releaseCycle(mission,unit,state);delete unit.driveWatch;return false;
 }
 navigationDecision(unit,'YIELDING','cycle-passage-occupied',state.leader,'resume-after-checked-connector');
 unit.driveSpeed=0;return true;
}
