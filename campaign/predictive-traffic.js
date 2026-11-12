// Bounded local driving controller. Existing service/manoeuvre executors are
// retained while ordinary player routes use control-space sampling.
// Control-space sampling (GVO), not an implementation of ORCA's guarantees:
// https://gamma-web.iacs.umd.edu/NHRVO/WilkieIROS09.pdf
// Bounded candidate scoring also follows DetourObstacleAvoidance's structure.
import {TrafficCoordinator} from './traffic-coordinator.js';
import {vehicleDynamics,steeringResponse,steeringManeuverReady} from './vehicle-dynamics.js';
import {checkManeuverSteps} from './vehicle-motion.js';
import {vehicleClearance,vehicleEnvelope,envelopeClearance,vehicleRadiusBound,trafficCollisionRequired} from './vehicle-collision.js';
import {navigationDecision} from './navigation-state.js';
import {damageMobility} from './damage-state.js';
import {borrowedHomeClear} from './traffic-start.js';
import {commandPathFromLive} from './command-motion.js';
import {findFiringApproach,validPosition,findMarchResume,applyMarchResume} from './combat-deployment.js';
import {reserveManeuverCorridor,invalidateTrafficCorridors} from './traffic-corridor.js';
import {maneuverAdmissionBlocker} from './maneuver-admission.js';
import {isInfantry} from './scav-unit-profiles.js';
import {TrafficPlanner} from './traffic-planner.js';
import {roadDrivingLane} from './road-merge.js';
import {stepRetreatContact,retreatSpeed,holdRetreatYield} from './retreat-contact.js';

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const wrap=x=>Math.atan2(Math.sin(x),Math.cos(x));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const angle=(a,b)=>wrap(Math.atan2(a.x-b.x,b.y-a.y)-a.heading);
const horizon=2;

// Length of the two forward circle/tangent approaches to a point. The
// heuristic sees the cost of turning a car around, instead of treating a
// sideways translation or an in-place rotation as immediately available.
function forwardApproach(pose,goal,radius){
 let best=Infinity;
 for(const side of [-1,1]){
  const cx=pose.x-side*Math.cos(pose.heading)*radius,cy=pose.y-side*Math.sin(pose.heading)*radius;
  const dx=goal.x-cx,dy=goal.y-cy,d=Math.hypot(dx,dy);
  if(d<radius)continue;
  const tangent=Math.atan2(dy,dx)-side*Math.acos(clamp(radius/d,-1,1));
  const start=Math.atan2(pose.y-cy,pose.x-cx);
  const turn=((side*(tangent-start))%(2*Math.PI)+2*Math.PI)%(2*Math.PI);
  best=Math.min(best,turn*radius+Math.sqrt(Math.max(0,d*d-radius*radius)));
 }
 return best;
}
export function approachCost(pose,goal,radius){
 const forward=forwardApproach(pose,goal,radius);
 // Inside a turning circle, a multi-point manoeuvre is needed. Keep a
 // finite position/heading estimate so it can still start to make progress.
 return Math.min(forward,distance(pose,goal)+radius*Math.abs(angle(pose,goal))*2);
}
function approachingControl(pose,control,goal,dt,braking,final){
 const reaction=braking*dt;
 const cap=Math.sqrt(2*braking*Math.max(0,distance(pose,goal)-(final?.2:0))+reaction*reaction)-reaction;
 return {...control,speed:Math.sign(control.speed)*Math.min(Math.abs(control.speed),cap)};
}

function routeSteering(pose,goal,scale,speed){
 const dynamics=vehicleDynamics(pose),look=Math.max(scale*3,Math.min(distance(pose,goal),Math.max(Math.abs(speed),pose.driveSpeed??0)));
 const turn=angle(pose,goal);
 // Pure pursuit assumes a target ahead. Behind the car sin(turn) tends
 // back to zero, so a U-turn was predicted as nearly straight driving.
 // Turn toward the rear target until it enters the forward semicircle.
 if(Math.abs(turn)>Math.PI/2)return Math.sign(turn)*dynamics.steeringLimit;
 return clamp(Math.atan(2*dynamics.wheelbase*scale*Math.sin(turn)/look),-dynamics.steeringLimit,dynamics.steeringLimit);
}

// Integrate the same bicycle dimensions, steering, acceleration and braking
// limits as production. A direction change must brake to zero first.
export function integrateControl(start,control,dt,scale){
 const dynamics=vehicleDynamics(start),old=(start.driveSpeed??0)*(start.reversing?-1:1);
 let requested=control.speed;
 if(old*requested<0)requested=0;
 const accelerating=Math.abs(requested)>Math.abs(old);
 const signed=old+clamp(requested-old,-(accelerating?dynamics.acceleration:dynamics.braking)*dt,
  (accelerating?dynamics.acceleration:dynamics.braking)*dt);
 const steering=steeringResponse(start,control.steering,dt,control.time??start.steeringClock??0,control.fault??start.steeringFault);
 const length=signed*dt,curvature=Math.tan(steering)/(dynamics.wheelbase*scale);
 const turn=curvature*length,middle=start.heading+turn/2;
 const chord=Math.abs(curvature)>1e-8?2*Math.sin(turn/2)/curvature:length;
 return {kind:start.kind,x:start.x-Math.sin(middle)*chord,y:start.y+Math.cos(middle)*chord,
  heading:wrap(start.heading+turn),driveSpeed:Math.abs(signed),reversing:signed<0,
  steering,steeringRequested:control.steering,wheelDistance:(start.wheelDistance??0)+length};
}

export class PredictiveTraffic extends TrafficCoordinator{
 constructor(){
  super();this.controls=new Map();this.forecasts=new WeakMap();this.routes=new Map();this.routeAttempts=new WeakMap();this.maneuverAttempts=new WeakMap();this.routeJob=null;this.routeNav=null;
  this.maneuverJob=null;this.maneuverNav=null;
  this.motionProgress=new WeakMap();this.turnAttempts=new WeakMap();this.routeSequence=0;
  this.planner=new TrafficPlanner();
  this.stats={samples:0,projections:0,maxDecisionMs:0,emergencyStops:0,routeSearches:0,routePublications:0,routeDiscards:0};
 }
 traceRoute(mission,job,event,details={}){
  job.diagnosticId??='route-'+(++this.routeSequence);
  const poseChange=event==='cancelled'&&job.origin?{origin:job.origin,
   currentPose:{x:job.unit.x,y:job.unit.y,heading:job.unit.heading},
   displacement:distance(job.origin,job.unit),headingChange:wrap(job.unit.heading-job.origin.heading)}:{};
  mission.recordTrafficDiagnostic?.({event:'route-'+event,jobId:job.diagnosticId,jobType:job.kind,ids:[job.unit.id],
   age:mission.state.time-job.queuedAt,searchMs:job.searchMs??0,maxNextMs:job.maxNextMs??0,
   searchMode:job.searchMode,maximumLegs:job.maximumLegs,
   revision:job.unit.commandRevision,task:job.unit.task?.type,goal:job.goal??job.unit.combatDeployment?.slot,...poseChange,...details});
 }
 update(mission){
  const version=mission.nav.terrainAllowed.version+':ellipse-footprint-r37';
  if(mission.state.navigationSurfaceVersion!==version){
   // A saved polyline belongs to the previous topology. Reuse the existing
   // bounded route queue, preserving each accepted destination and order.
   // Otherwise a reload would keep steering along the obsolete road route.
   mission.state.navigationSurfaceVersion=version;
   for(const unit of mission.state.units)if(unit.hp>0&&unit.path?.length
    &&['move','attack-move','attack','combat-position','scav-search','scav-return'].includes(unit.task?.type))unit.routeTopologyPending=version;
  }
  for(const unit of mission.state.units)if(unit.routeTopologyPending){
   if(unit.hp<=0||!unit.path?.length||unit.pendingOrder)delete unit.routeTopologyPending;
   else this.requestRoute(mission,unit);
  }
  this.planner.prunePassThrough(mission);super.update(mission);this.planner.requestPassages(mission);
 }
 routeIntent(unit){return JSON.stringify([unit.commandRevision,unit.routeOrder,unit.task,unit.yieldReturn?.home,
  unit.combatDeployment&&[unit.combatDeployment.targetId,unit.combatDeployment.goal,unit.combatDeployment.slot],
  unit.trafficPassThrough?.pairs.map(pair=>pair.id)]);}
 routeGoal(unit){
  if(unit.task?.type==='combat-position')return unit.combatDeployment?.goal??unit.combatDeployment?.slot??unit.path?.at(-1);
  return unit.routeOrder?.destination??unit.yieldReturn?.home??unit.path?.at(-1);
 }
 requestMarchResume(mission,unit,conditions){
  if(this.routes.has(unit.id)||unit.pendingOrder)return;
  const resume=unit.combatResume,task=unit.task,origin={x:unit.x,y:unit.y,heading:unit.heading};
  unit.driveSpeed=0;
  this.routes.set(unit.id,{unit,kind:'march',queuedAt:mission.state.time,world:mission.state,nav:mission.nav,topology:mission.nav.topologyRevision,
   intent:this.routeIntent(unit),
   valid:()=>unit.combatResume===resume&&unit.task===task&&unit.x===origin.x&&unit.y===origin.y&&unit.heading===origin.heading,
   make:(facade,source)=>findMarchResume(facade,source),
   apply:(live,path)=>applyMarchResume(mission,live,path,conditions)});
 }
 requestFiringApproach(mission,unit,deployment,target){
  if(this.routes.has(unit.id)||unit.pendingOrder)return;
  const origin={x:unit.x,y:unit.y,heading:unit.heading},snapshot={...deployment,slot:deployment.slot&&{...deployment.slot}};
  this.routes.set(unit.id,{unit,kind:'firing',queuedAt:mission.state.time,world:mission.state,nav:mission.nav,topology:mission.nav.topologyRevision,
   intent:this.routeIntent(unit),
   valid:()=>unit.combatDeployment===deployment&&unit.x===origin.x&&unit.y===origin.y&&unit.heading===origin.heading
    &&target.hp>0&&mission.visibleAt(target.x,target.y),
   make:(facade,source)=>findFiringApproach(facade,source,snapshot,{...target}),
   apply:(live,path)=>{
    const reserved=mission.state.units.filter(other=>other!==live&&other.hp>0&&other.combatDeployment?.group===deployment.group)
     .map(other=>other.combatDeployment.goal??other.combatDeployment.slot).filter(Boolean);
    const end=path?.at(-1);
    if(end&&validPosition(mission,live,target,end,reserved)){
     live.path=path;live.task={type:'combat-position',...end};deployment.goal={...end};deployment.status='moving';
    }else{
     if(Number.isInteger(deployment.index)){
      const rejected=deployment.rejectedSlots??=[];
      if(!rejected.includes(deployment.index))rejected.push(deployment.index);
     }
     deployment.index=null;deployment.slot=null;deployment.goal=null;deployment.status='reserve';live.driveSpeed=0;
     navigationDecision(live,'BLOCKED','firing-approach-unavailable',null,'try-next-firing-position');
    }
   }});
 }
 requestRoute(mission,unit){
  const goal=this.routeGoal(unit);
  if(!goal||unit.pendingOrder||unit.detour||unit.jointTraffic||this.routes.has(unit.id))return;
  const intent=this.routeIntent(unit);
  // Changed geometry/intent retries immediately. An unchanged failed search
  // gets another bounded attempt after a delay, never a permanent veto.
  const witness=JSON.stringify([intent,mission.nav.topologyRevision,unit.x,unit.y,unit.heading,
   mission.nearbyUnits(unit,Math.max(100,distance(unit,goal)+30)).filter(other=>other.hp>0)
    .map(other=>[other.id,other.x,other.y,other.heading,other.kind,trafficCollisionRequired(unit,other),other.path?.length>0])]);
  const previous=this.routeAttempts.get(unit);
  if(previous?.witness===witness&&mission.state.time<previous.retryAt)return;
  this.routeAttempts.set(unit,{witness,retryAt:mission.state.time+2});
  this.routes.set(unit.id,{unit,kind:'route',queuedAt:mission.state.time,world:mission.state,nav:mission.nav,topology:mission.nav.topologyRevision,
   intent,goal:{x:goal.x,y:goal.y},loan:unit.yieldReturn});
 }
 requestManeuver(mission,unit){
  if(unit.overlapRecovery&&unit.overlapRecovery.active!==false)return false;
  if(this.planner.pendingFor(unit))return false;
  if(this.routes.has(unit.id))return true;
  if(!unit.path.length||unit.pendingOrder||unit.detour||unit.jointTraffic||(unit.driveSpeed??0)>.01)return false;
  const scale=mission.config.worldScale,localTravel=6*1.2*scale;
  const origin={x:unit.x,y:unit.y,heading:unit.heading},intent=this.routeIntent(unit);
  // Rejoin the existing route beyond a nearby corner. The remaining travel
  // allowance stays available for a car turn; the accepted final goal stays
  // unchanged, including the home of a vehicle which lent its parking space.
  let index=0;
  while(index+1<unit.path.length&&distance(unit,unit.path[index+1])<localTravel/2)index++;
  const waypoint=unit.path[index],length=distance(unit,waypoint),partial=length>localTravel/2;
  const goal=partial?{x:unit.x+(waypoint.x-unit.x)*localTravel/2/length,y:unit.y+(waypoint.y-unit.y)*localTravel/2/length}:{...waypoint};
  const final=!partial&&index===unit.path.length-1,passed=partial?[]:unit.path.slice(0,index+1).map(point=>({...point}));
  // Rejoining a route needs only a short prefix. Exact parking needs the
  // complete bounded search also used by borrowed-space arrival recovery.
  // Both run in the same sliced queue; a failed six-leg turn must not be the
  // only arrival attempt repeated forever beside a parked neighbour.
  const maximumTravel=14*1.2*scale;
  const geometryKey=JSON.stringify([intent,mission.nav.topologyRevision,origin,unit.path]);
  const witness=JSON.stringify([geometryKey,
   mission.nearbyUnits(unit,maximumTravel+scale*8).filter(other=>other.hp>0)
    .map(other=>[other.id,other.x,other.y,other.heading,other.driveSpeed,trafficCollisionRequired(unit,other),other.path?.length>0])]);
  const previous=this.maneuverAttempts.get(unit);
  if(previous?.witness===witness&&mission.state.time<previous.retryAt)return false;
  // Repeating the same six-leg beam cannot discover a turn it just pruned.
  // Reconsider an unchanged exhaustion with the existing full parking search
  // (shorter blocked arcs and wider beam), retaining the same frame budget.
  const expanded=final||previous?.geometryKey===geometryKey&&(previous.expanded||previous.exhausted);
  const maximumLegs=expanded?14:6;
  this.maneuverAttempts.set(unit,{witness,geometryKey,expanded,exhausted:false,retryAt:mission.state.time+2});
  this.routes.set(unit.id,{unit,kind:'maneuver',queuedAt:mission.state.time,world:mission.state,nav:mission.nav,topology:mission.nav.topologyRevision,intent,
   searchMode:expanded?'full-local':'short-local',maximumLegs,origin,
   make:function*(facade,source){
    const allowed=(from,to)=>facade.vehicleMotionClear(unit,from,to);
    // First find a short, checked turn back towards the route. Solving exact
    // parking for every blocked intermediate waypoint stalls the whole queue.
    // This prefix does not complete arrival or consume any unreached waypoint.
    const radius=vehicleDynamics(source).wheelbase*scale/Math.tan(vehicleDynamics(source).steeringLimit);
    const originalCost=approachCost(source,waypoint,radius);
    const accept=(pose,legs)=>{
     if(distance(pose,goal)<(final?.5:2))return !final||borrowedHomeClear(facade,unit,pose);
     // Backing away while still facing the goal is not a completed recovery.
     // A partial turn must finish in forward gear and improve the approach.
     return !final&&legs.at(-1)?.direction>0
      &&approachCost(pose,waypoint,radius)<originalCost-scale*.5
      &&Math.abs(angle(pose,waypoint))<.65;
    };
    const options={scale,attempts:expanded?2:0,maximumLegs,tolerance:final?.5:2,allowed,accept};
    const legs=final
     ?yield* facade.planManeuverSteps(source,goal,{...options,reverseBudget:scale*6})
     :(yield* facade.planManeuverSteps(source,goal,{...options,reverseBudget:0}))
      ??(yield* facade.planManeuverSteps(source,goal,{...options,reverseBudget:scale*(expanded?6:3)}));
    if(!legs)return null;
    const end=yield* checkManeuverSteps(source,legs,scale,allowed,()=>facade.nav.workDeadline);
    return end&&{legs,reached:distance(end,goal)<(final?.65:2)&&(!final||borrowedHomeClear(facade,unit,end))};
   },
   apply:(live,result)=>{
    const legs=result?.legs;
    if(!legs?.length)return false;
    const reservedCorridor=reserveManeuverCorridor(mission,live,legs);if(!reservedCorridor)return false;
    live.detour={legs,blocked:0,parking:false,arrival:final&&result.reached,progressRecovery:!final||!result.reached,continuousPassage:true,
     passedWaypoints:result.reached?passed:[],reservedCorridor};
    this.controls.delete(live.id);
    return true;
   }});
  return true;
 }
 validRoute(mission,job){
  return this.routeInvalidation(mission,job)===null;
 }
 routeInvalidation(mission,job){
  const unit=job.unit;
  if(mission.state!==job.world)return 'world-changed';
  if(mission.nav!==job.nav||mission.nav.topologyRevision!==job.topology)return 'topology-changed';
  if(mission.entity(unit.id)!==unit||unit.hp<=0)return 'owner-removed';
  if(unit.pendingOrder)return 'new-command-pending';
  if(this.routeIntent(unit)!==job.intent)return 'intent-changed';
  if(unit.jointTraffic)return 'joint-maneuver-started';
  if(unit.detour)return 'local-maneuver-started';
  if(this.planner.activeFor(unit)||job.kind==='maneuver'&&this.planner.pendingFor(unit))return 'shared-search-owns-motion';
  if(job.kind==='maneuver'&&unit.overlapRecovery&&unit.overlapRecovery.active!==false)return 'overlap-separation-owns-motion';
  if(job.origin&&(unit.x!==job.origin.x||unit.y!==job.origin.y||unit.heading!==job.origin.heading))return 'owner-pose-changed';
  if(job.valid&&!job.valid())return 'search-condition-changed';
  if(!job.origin&&!job.valid){const goal=this.routeGoal(unit);if(!goal||distance(goal,job.goal)>=.01)return 'goal-changed';}
  return null;
 }
 advancePlanning(mission,budgetMs){
  const started=performance.now(),budget=Math.max(0,budgetMs),deadline=started+budget;
  this.planningDeadline=deadline;
  if(!budget)return;
  this.publishPlanning(mission,deadline);
  for(const [id,job] of this.routes)if(job!==this.routeJob&&job!==this.maneuverJob&&!this.validRoute(mission,job)){
   job.iterator?.return();this.traceRoute(mission,job,'cancelled',{reason:this.routeInvalidation(mission,job),stage:job.finished?'publish':job.iterator?'search':'queue'});
   this.routes.delete(id);this.stats.routeDiscards++;
  }
  // Route requests must not queue behind expensive pose-space manoeuvres.
  // Two private search contexts let both make progress within the same total
  // frame budget, without restarting either suspended search.
  this.advanceRoutes(mission,started+budget*.35,false);
  if(performance.now()<deadline)this.planner.advance(mission,Math.min(budget*.5,deadline-performance.now()));
  this.advanceRoutes(mission,deadline,true);
  if(performance.now()<deadline)this.advanceRoutes(mission,deadline,false);
  this.publishPlanning(mission,deadline);
  const elapsed=performance.now()-started;
  this.stats.maxPlanningMs=Math.max(this.stats.maxPlanningMs??0,elapsed);
  this.stats.maxPlanningOverrunMs=Math.max(this.stats.maxPlanningOverrunMs??0,elapsed-budget);
  this.planningDeadline=-Infinity;
 }
 advanceFixedPlanning(mission){
  // A bounded amount of the same searches, once at a simulation boundary.
  // -Infinity makes their existing cooperative checkpoints yield by work,
  // not by elapsed CPU time. No collision or route admission is bypassed.
  this.publishPlanning(mission,Infinity);
  this.advanceRoutes(mission,Infinity,false,256);
  this.planner.advance(mission,1,512);
  this.advanceRoutes(mission,Infinity,true,256);
  this.publishPlanning(mission,Infinity);
 }
 advanceRoutes(mission,deadline,maneuver,steps=Infinity){
  const fixed=Number.isFinite(steps);
  const jobKey=maneuver?'maneuverJob':'routeJob',navKey=maneuver?'maneuverNav':'routeNav';
  while(steps-->0&&performance.now()<deadline){
   let job=this[jobKey];
   if(job&&!this.validRoute(mission,job)){
    this.traceRoute(mission,job,'cancelled',{reason:this.routeInvalidation(mission,job),stage:'search'});
    job.iterator?.return();if(this.routes.get(job.unit.id)===job)this.routes.delete(job.unit.id);
    this[jobKey]=null;this.stats.routeDiscards++;continue;
   }
   if(!job){
    job=[...this.routes.values()].find(item=>!item.finished&&(item.kind==='maneuver')===maneuver);
    if(!job)return;
    if(!this.validRoute(mission,job)){this.traceRoute(mission,job,'cancelled',{reason:this.routeInvalidation(mission,job),stage:'queue'});this.routes.delete(job.unit.id);this.stats.routeDiscards++;continue;}
    this[navKey]??=mission.nav.createSearchContext();this[navKey].refreshContext();
    // Only navigator scratch space and this source pose are private. There
    // is no copy of the simulation and no search for a complete yield chain.
    const facade=Object.create(mission);facade.nav=this[navKey];
    job.source={...job.unit,path:job.unit.path.map(point=>({...point}))};
    const obstacles=mission.state.units.map(body=>({id:body.id,kind:body.kind,hp:body.hp,owner:body.owner,
     commandRevision:body.commandRevision,trafficPassThrough:body.trafficPassThrough&&structuredClone(body.trafficPassThrough),
     factoryVisit:body.factoryVisit&&{phase:body.factoryVisit.phase},
     x:body.x,y:body.y,heading:body.heading,path:body.path?.length?[{}]:[]}));
    job.iterator=job.make?job.make(facade,job.source)
     :facade.vehiclePathSteps(job.source,job.goal,{avoidMoving:true,maxGoalDistance:.01,fallback:true,obstacles});
    this[jobKey]=job;this.stats.routeSearches++;this.traceRoute(mission,job,'started');
   }
   if(performance.now()>=deadline)break;
   this[navKey].workDeadline=fixed?-Infinity:deadline;
   const nextAt=performance.now(),step=job.iterator.next(),nextMs=performance.now()-nextAt;
   job.searchMs=(job.searchMs??0)+nextMs;job.maxNextMs=Math.max(job.maxNextMs??0,nextMs);
   // A generator yields between small geometry checks as well as at its
   // deadline. Spend the remaining budget instead of stretching each cheap
   // check over a separate rendered frame while its car waits for a route.
   if(!step.done)continue;
   const attempt=(job.kind==='maneuver'?this.maneuverAttempts:this.routeAttempts).get(job.unit);
   if(attempt){attempt.retryAt=mission.state.time+2;if(job.kind==='maneuver')attempt.exhausted=!step.value;}
   job.finished=true;job.path=step.value;this[jobKey]=null;
   this.traceRoute(mission,job,'searched',{candidate:!!step.value,points:step.value?.length??step.value?.legs?.length??0,
    outcome:job.kind==='maneuver'?(step.value?'FOUND':'LOCAL_SEARCH_EXHAUSTED'):undefined});
  }
 }
 publishPlanning(mission,deadline=this.planningDeadline??-Infinity){
  if(mission.pendingTick||performance.now()>=deadline)return;
  super.publishPlanning(mission,deadline);
  // Called at a completed simulation boundary. Search results only replace
  // route points; they never restore physical poses, health or old commands.
  for(const [id,job] of this.routes)if(job.finished){
   if(performance.now()>=deadline)break;
   this.routes.delete(id);
   if(!this.validRoute(mission,job)){this.traceRoute(mission,job,'cancelled',{reason:this.routeInvalidation(mission,job),stage:'publish'});this.stats.routeDiscards++;continue;}
   if(job.apply){
    const applied=job.apply(job.unit,job.path);
    if(job.path&&applied!==false)this.stats.routePublications++;
    else this.stats.routeFailures=(this.stats.routeFailures??0)+1;
    this.traceRoute(mission,job,job.path&&applied!==false?'applied':'failed',{reason:job.path?'live-admission':'no-candidate'});
    continue;
   }
   if(!job.path?.length){this.traceRoute(mission,job,'failed',{reason:'no-candidate'});continue;}
   const end=job.path.at(-1);if(distance(end,job.goal)>.01)continue;
   const path=commandPathFromLive(mission,job.unit,job.source,job.path);
   if(!path){this.routeAttempts.delete(job.unit);continue;}
   job.unit.path=path;
   if(job.kind==='route')delete job.unit.routeTopologyPending;
   if(job.loan&&!job.unit.task){
    job.unit.task={type:'move',x:job.goal.x,y:job.goal.y,yieldHome:true};job.loan.phase='routing';
   }
   this.stats.routePublications++;
   this.traceRoute(mission,job,'applied');
  }
 }
 holdRecoveryMotion(mission,unit){
  // A separation correction is already checked by the contact solver. Do
  // not drive back into the same bodies or search from its changing pose.
  // A blocked solver releases ownership explicitly, leaving a checked exit
  // available through the ordinary movement controller.
  if(unit.overlapRecovery&&unit.overlapRecovery.active!==false
   &&!['entering','inside','leaving'].includes(unit.factoryVisit?.phase)){
   unit.driveSpeed=0;this.controls.delete(unit.id);
   navigationDecision(unit,'MANEUVERING','overlap-separation',null,'resolve-overlap');return true;
  }
  const job=this.routes.get(unit.id);
  // Cars waiting behind another search can still use a traffic opening.
  // The next search must claim its pose before this tick drives the owner:
  // otherwise small reversing corrections cancel it before every first slice.
  // Keep that anchor until publication; later queued cars remain free to move.
  const nextManeuver=job?.kind==='maneuver'&&!this.maneuverJob&&[...this.routes.values()].find(item=>item.kind==='maneuver'&&!item.finished);
  if(job?.kind==='maneuver'&&(job.iterator||job.finished||job===nextManeuver)&&this.validRoute(mission,job)){
   unit.driveSpeed=0;this.controls.delete(unit.id);
   navigationDecision(unit,'LOCAL_REPLAN',job.finished?'local-turn-publication':'local-turn-search',
    mission.navigationDiagnostics?.dependencies?.get(unit.id)??[],job.finished?'apply-checked-turn':'continue-local-search');return true;
  }
  return false;
 }
 *prepareUnitSteps(mission,unit,spec,dt){
  if(holdRetreatYield(mission,unit))return true;
  if(unit.retreatPushedAt===mission.state.time){unit.driveSpeed=0;return true;}
  if(stepRetreatContact(mission,unit,dt,integrateControl))return true;
  if(this.holdRecoveryMotion(mission,unit))return true;
  if(unit.detour?.recoveryTurn&&this.stepStuckTurn(mission,unit,dt))return true;
  if(!unit.pendingOrder&&(unit.detour||unit.jointTraffic||unit.traffic)&&!steeringManeuverReady(unit,dt)){
   unit.driveSpeed=0;navigationDecision(unit,'BLOCKED','steering-jammed',null,'wait-for-steering-release');return true;
  }
  return yield* super.prepareUnitSteps(mission,unit,spec,dt);
 }
 startStuckTurn(mission,unit){
  if(isInfantry(unit)||unit.pendingOrder||unit.routeTopologyPending||unit.jointTraffic||unit.detour||unit.yieldReturn||unit.traffic||unit.trafficHold
   ||unit.builderWorking||unit.tool>0||unit.foldTime>0||(unit.driveSpeed??0)>.01
   ||(unit.navigation?.waitSeconds??0)<2||!unit.path.length)return false;
  // Recover toward the accepted route. A temporary passing waypoint can
  // point straight ahead while the destination is behind; using that point
  // made two stopped cars endlessly wait for a turn they never requested.
  const target=unit.path[0];
  if(!target||distance(unit,target)<1)return false;
  const heading=Math.atan2(unit.x-target.x,target.y-unit.y),turn=wrap(heading-unit.heading);
  if(Math.abs(turn)<.35)return false;
  const pose={x:unit.x,y:unit.y,heading,kind:unit.kind},blockers=new Set();
  // Owner-authorized exception: a stuck car may rotate at fixed x/y without
  // sweeping the intermediate headings. The final hull and neighbours'
  // stopping paths must be clear; translation still uses normal collisions.
  const admitted=mission.vehicleMotionClear(unit,pose,pose,.52,blockers,mission.vehicleMotionNeighbours(unit,pose,pose));
  const braking=admitted&&maneuverAdmissionBlocker(mission,unit,pose,pose,mission.config.simulationStep);
  if(!admitted||braking){
   if(braking)blockers.add(braking);
   const ids=[...blockers].map(body=>body.id),key=JSON.stringify([unit.commandRevision,ids]);
   const previous=this.turnAttempts.get(unit);
   if(previous?.key!==key||mission.state.time-previous.at>=2){
    this.turnAttempts.set(unit,{key,at:mission.state.time});
    mission.emit('navigation-stuck-turn-rejected',{unit:unit.id,heading,reason:ids.length?'end-occupied':'end-terrain-or-reservation',blockers:ids});
   }
   return false;
  }
  const recoveryTurn={fromHeading:unit.heading,heading,x:unit.x,y:unit.y,startedAt:mission.state.time,
   intent:this.routeIntent(unit),revision:unit.commandRevision,target:{x:target.x,y:target.y}};
  unit.detour={legs:[],parking:false,recoveryTurn,reservedCorridor:[{from:pose,to:{...pose}}]};
  unit.driveSpeed=0;unit.reversing=false;unit.steering=0;this.controls.delete(unit.id);
  invalidateTrafficCorridors(mission);
  mission.emit('navigation-stuck-turn-started',{unit:unit.id,...recoveryTurn});return true;
 }
 stepStuckTurn(mission,unit,dt){
  const plan=unit.detour,turn=plan?.recoveryTurn;if(!turn)return false;
  const changed=unit.pendingOrder||unit.commandRevision!==turn.revision||this.routeIntent(unit)!==turn.intent
   ||Math.hypot(unit.x-turn.x,unit.y-turn.y)>1e-5;
  if(changed){
   delete unit.detour;invalidateTrafficCorridors(mission);
   mission.emit('navigation-stuck-turn-cancelled',{unit:unit.id,reason:'command-or-position-changed',heading:unit.heading});return false;
  }
  const end={...unit,heading:turn.heading},blockers=new Set();
  const admitted=mission.vehicleMotionClear(unit,end,end,.52,blockers,mission.vehicleMotionNeighbours(unit,end,end));
  const braking=admitted&&maneuverAdmissionBlocker(mission,unit,end,end,dt);
  unit.driveSpeed=0;unit.reversing=false;unit.steering=0;
  if(!admitted||braking){
   if(braking)blockers.add(braking);
   navigationDecision(unit,'BLOCKED','stuck-turn-end-occupied',[...blockers].map(body=>body.id),'wait-for-turn-end');
   return true;
  }
  const remaining=wrap(turn.heading-unit.heading),step=vehicleDynamics(unit).pivotRate*Math.max(0,dt);
  unit.heading=wrap(unit.heading+clamp(remaining,-step,step));
  navigationDecision(unit,'MANEUVERING','stuck-turn-in-place',null,'finish-stuck-turn');
  if(Math.abs(remaining)<=step){
   unit.heading=turn.heading;delete unit.detour;delete unit.driveWatch;delete unit.passingLane;
   this.motionProgress.delete(unit);this.maneuverAttempts.delete(unit);invalidateTrafficCorridors(mission);
   mission.emit('navigation-stuck-turn-finished',{unit:unit.id,x:unit.x,y:unit.y,fromHeading:turn.fromHeading,
    heading:unit.heading,seconds:mission.state.time-turn.startedAt,revision:unit.commandRevision});
  }
  return true;
 }
 trimClearedDetour(mission,unit){
  if(unit.path.length<3||unit.pendingOrder||unit.detour||unit.jointTraffic||unit.yieldReturn||unit.passage||unit.trafficHold)return;
  const scale=mission.config.worldScale,candidates=[];
  let previous=unit,travel=0;
  // Reconsider only the nearby prefix of an existing route. Dynamic traffic
  // can leave an obsolete loop after moving away; no new route is searched.
  for(let index=0;index<Math.min(8,unit.path.length);index++){
   const point=unit.path[index];travel+=distance(previous,point);previous=point;
   const direct=distance(unit,point),saved=travel-direct;
   if(index<1||direct>scale*24||saved<scale*4||direct>travel*.8)continue;
   const heading=Math.atan2(unit.x-point.x,point.y-unit.y);
   if(Math.abs(wrap(heading-unit.heading))>Math.PI/3)continue;
   candidates.push({index,point,heading,saved});
  }
  candidates.sort((a,b)=>b.saved-a.saved);
  for(const candidate of candidates.slice(0,2)){
   if(!mission.state.m02&&performance.now()>=(mission.nav.workDeadline??Infinity))return;
   const {index,point,heading,saved}=candidate,end={...point,heading,kind:unit.kind};
   if(!mission.nav.lineClear(unit,point,false,true)||!mission.vehicleMotionClear(unit,unit,end)
    ||maneuverAdmissionBlocker(mission,unit,unit,end,mission.config.simulationStep))continue;
   unit.path.splice(0,index);
   mission.emit('navigation-route-shortened',{unit:unit.id,skipped:index,saved,waypoint:point,goal:unit.routeOrder?.destination});
   return;
  }
 }
 *prepareMovementSteps(mission,unit,dt){
  if(this.holdRecoveryMotion(mission,unit))return false;
  // Factory departure enters through moveSteps without prepareUnitSteps.
  // Resume an existing pivot before the generic arc-leg executor sees it.
  if(unit.detour?.recoveryTurn&&this.stepStuckTurn(mission,unit,dt))return true;
  if(this.startStuckTurn(mission,unit))return this.stepStuckTurn(mission,unit,dt);
  // Shared searches are anchored to every participant's stopped pose, just
  // like a single-car turn search. Queued requests leave normal driving free;
  // an active search owns its participants until publication or cancellation.
  // Even integrating a zero-speed control can change heading by roundoff and
  // invalidate the exact snapshot while another controller is planning it.
  if(!unit.pendingOrder&&!unit.detour&&!unit.jointTraffic&&this.planner.activeFor(unit)){
   navigationDecision(unit,'LOCAL_REPLAN','shared-passage-planning',
    mission.navigationDiagnostics?.dependencies?.get(unit.id)??[],'apply-shared-passage');return false;
  }
  // A routed return follows its original accepted destination through the
  // same local controller as a player move. Its home remains reserved until
  // physical arrival; a failed local parking proof does not stop it forever.
  const strandedLoan=unit.yieldReturn&&!unit.path.length&&!unit.task&&!unit.detour&&!unit.jointTraffic
   &&unit.yieldReturn.phase!=='outward'&&!unit.yieldReturn.cooperativeRequester
   &&(unit.yieldReturn.failedReturn||unit.yieldReturn.failedRoute||(unit.navigation?.waitSeconds??0)>5
    ||mission.navigationDiagnostics?.deadlockedIds?.has(unit.id));
  if(strandedLoan){
   this.requestRoute(mission,unit);
   if(this.routes.has(unit.id)){
    unit.driveSpeed=0;navigationDecision(unit,'GLOBAL_REPLAN','return-route-queued',unit.yieldReturn.waitingFor??null,'await-dispatcher-route');return false;
   }
  }
  const returning=unit.yieldReturn?.phase==='routing'&&unit.task?.yieldHome
   &&(unit.routeOrder?.destination??unit.yieldReturn.home);
  if(returning&&distance(unit,returning)<1&&borrowedHomeClear(mission,unit)&&mission.vehicleMotionClear(unit,unit,unit)){
   delete unit.yieldReturn;unit.path=[];unit.task=null;unit.driveSpeed=0;this.controls.delete(unit.id);return true;
  }
  if(unit.yieldReturn&&!returning||unit.jointTraffic||unit.detour
    ||unit.traffic||unit.trafficHold||unit.passage||unit.routeContinuation
    ||!['move','attack-move','attack','combat-position','scav-search','scav-return'].includes(unit.task?.type))return yield* super.prepareMovementSteps(mission,unit,dt);
  while(unit.path.length&&distance(unit,unit.path[0])<(unit.path.length>1?4:.5)
   &&(unit.path.length>1||borrowedHomeClear(mission,unit)))unit.path.shift();
  if(!unit.path.length){unit.driveSpeed=0;this.controls.delete(unit.id);return false;}
  this.trimClearedDetour(mission,unit);
  // A nearby lateral slot lies inside the car's minimum turning circle.
  // Prove its short parking manoeuvre before the greedy rollout alternates
  // gears or drives a complete loop. Use the existing sliced search queue.
  if(unit.path.length===1&&(unit.driveSpeed??0)<.01){
   const goal=unit.path[0],dynamics=vehicleDynamics(unit),radius=dynamics.wheelbase*mission.config.worldScale/Math.tan(dynamics.steeringLimit);
   if(distance(unit,goal)<2*radius*Math.abs(Math.sin(angle(unit,goal)))){
    this.requestManeuver(mission,unit);
    if(this.holdRecoveryMotion(mission,unit))return false;
   }
  }
  // Follow the next visible section instead of turning back to touch a grid
  // corner just passed by the car. The final accepted destination is retained.
  const lookahead=mission.config.worldScale*4;
  while(unit.path.length>1){
   const first=unit.path[0],next=unit.path[1];
   // A displaced car may already be beyond a corner along the following
   // segment even outside the proximity radius. Do not turn back to touch
   // that grid vertex; the direct static connector must still be clear.
   const beyond=(unit.x-first.x)*(next.x-first.x)+(unit.y-first.y)*(next.y-first.y)>=0;
   if(!beyond&&distance(unit,first)>=lookahead||!mission.nav.lineClear(unit,next,false,true))break;
   unit.path.shift();
  }
  const point=unit.path[0],key=JSON.stringify([this.routeIntent(unit),point.x,point.y]);
  let progress=this.motionProgress.get(unit);
  // A few centimetres of alternating crawl do not mean a jam has cleared.
  // Count an actual displacement or turn, rather than resetting on any
  // nonzero speed. This still permits normal slow parking and car turns.
  if(!progress||progress.key!==key||distance(progress,unit)>mission.config.worldScale*.5
    ||Math.abs(wrap(unit.heading-progress.heading))>.18){
   progress={key,x:unit.x,y:unit.y,heading:unit.heading,at:mission.state.time};this.motionProgress.set(unit,progress);
  }
  if(unit.navigation?.reason!=='stuck-turn-in-place'&&((unit.navigation?.waitSeconds??0)>.5||mission.state.time-progress.at>1)){
   // Temporary traffic must not launch another whole-map route search.
   // A route replacement is for a broken terrain/building connection only.
   const waypoint=unit.path[0];
   // A route can start inside a building's conservative grid margin using
   // a checked physical connector. Do not classify that same margin as a
   // broken route here: repeating A* returns the same connector forever and
   // prevents the local arrival manoeuvre from running.
   const disconnected=!mission.nav.lineClear(unit,waypoint,false,true)
    &&mission.vehicleTerrainSweep(unit,unit,{...unit,x:waypoint.x,y:waypoint.y})===false;
   if(disconnected)this.requestRoute(mission,unit);
   else this.requestManeuver(mission,unit);
  }
  if(this.holdRecoveryMotion(mission,unit))return false;
  // The dispatcher already chose the shoulder target for an opposing pair.
  // Executing the raw path point here ignored that target while still obeying
  // its braking limit, so both cars stopped without steering into the passing
  // space. Execute the same intent used to reserve the approach.
  const next=unit.path[0];let prepared=this.intents.get(unit.id);
  // Consuming a waypoint invalidates field passing targets too, not just
  // road lanes. Recompute it before driving instead of aiming at the centre.
  if(!prepared||prepared.point.x!==next.x||prepared.point.y!==next.y){
   const d=Math.max(.001,distance(unit,next));
   prepared=mission.drivingIntent(unit,next,{x:(next.x-unit.x)/d,y:(next.y-unit.y)/d},mission.config.worldScale);
   this.intents.set(unit.id,prepared);
  }
  const target=prepared?.point?.x===next.x&&prepared.point.y===next.y?prepared.waypoint:next;
  const passingLane=prepared.passingLane??null;
  return yield* this.driveSteps(mission,unit,target,dt,unit.path.length===1&&target.x===next.x&&target.y===next.y,prepared.roadLane,passingLane);
 }
 *driveSteps(mission,unit,goal,dt,final,roadLane=null,passingLane=null){
  const scale=mission.config.worldScale,dynamics=vehicleDynamics(unit),world=mission.state;
  const origin={x:unit.x,y:unit.y,heading:unit.heading},intent=this.routeIntent(unit);
  let sliceAt=performance.now(),cpuMs=0;
  const account=()=>{const elapsed=performance.now()-sliceAt;cpuMs+=elapsed;
   this.stats.maxControlSliceMs=Math.max(this.stats.maxControlSliceMs??0,elapsed);};
  const finish=()=>{account();this.stats.maxDecisionMs=Math.max(this.stats.maxDecisionMs,cpuMs);};
  const remaining=distance(unit,goal),maxSpeed=retreatSpeed(unit,mission.unitSpec(unit).speed*mission.nav.roads.factor(unit.x,unit.y)*damageMobility(unit.damage));
  const topology=mission.nav.topologyRevision;
  const regionSolids=mission.nav.nearbySolids(unit,Math.max(maxSpeed,unit.driveSpeed??0)*horizon+vehicleRadiusBound(unit.kind,scale)+scale*5);
  const targetSpeed=passingLane?maxSpeed:Math.min(maxSpeed,Math.sqrt(2*dynamics.braking*Math.max(0,remaining-(final?.2:0))));
  const turn=angle(unit,goal),preferred=routeSteering(unit,goal,scale,targetSpeed);
  const reversePreferred=-routeSteering({...unit,heading:wrap(unit.heading+Math.PI)},goal,scale,dynamics.maneuverReverse);
  const previous=this.controls.get(unit.id),steerings=[preferred,reversePreferred,0,-dynamics.steeringLimit,dynamics.steeringLimit,
   -dynamics.steeringLimit/2,dynamics.steeringLimit/2,previous?.steering??0];
  const intervals=[dt,...Array(9).fill(Math.max(0,horizon-dt)/9)];
  const radius=dynamics.wheelbase*scale/Math.tan(dynamics.steeringLimit);
  // A lane preview is a moving steering target, not a parking destination.
  // Forecast the same advancing preview as execution over the full horizon;
  // otherwise reaching that short preview rewards braking and full-lock arcs.
  const passingProgress=pose=>passingLane?(pose.x-origin.x)*passingLane.ux+(pose.y-origin.y)*passingLane.uy:0;
  // Field passing has the same moving lookahead as a road lane. Treating
  // its short lateral target as a parking spot made both cars crawl.
  const lanePose=(car,pose,lane)=>({...car,...pose,navigation:{waitSeconds:0},
   ...(lane.retreatShoulder?{combatRetreat:{...car.combatRetreat,shoulderSide:lane.retreatSide,shoulderPath:lane.path,shoulderDirection:lane.direction}}:{})});
  const preview=pose=>roadLane?roadDrivingLane(mission,lanePose(unit,pose,roadLane),unit.path[0],scale)??goal
   :passingLane?{x:goal.x+passingLane.ux*passingProgress(pose),y:goal.y+passingLane.uy*passingProgress(pose)}:goal;
  const motionCost=pose=>{
   // Parking specifies a position, not a final heading. An already reached
   // slot must not be scored as another full turn to face its centre.
   if(final&&distance(pose,goal)<.5)return 0;
   if(passingLane)return approachCost(pose,preview(pose),radius)-passingProgress(pose);
   if(!roadLane)return approachCost(pose,goal,radius);
   const at=mission.nav.roads.nearest(pose,roadLane.retreatShoulder?scale*8:0),target=preview(pose);
   const progress=at?.segment.pathId===roadLane.path
    ?(at.segment.progress+at.along)*roadLane.direction-roadLane.progress:0;
   return approachCost(pose,target,radius)-progress;
  };
  const initialCost=motionCost(unit);
  // Keep evaluating the same reverse approach while braking or backing.
  // Crossing a bearing threshold must not turn yesterday's useful reverse
  // arc into a forward-facing cost and force another gear change.
  const backingArrival=final&&remaining<radius*3&&(Math.abs(turn)>Math.PI/3||unit.reversing||previous?.speed<0);
  const nearby=mission.nearbyUnits(unit,100).filter(other=>other!==unit&&other.hp>0);
  const neighbours=[];
  const bodies=nearby.map(other=>{
   const collides=trafficCollisionRequired(unit,other);
   if(collides)neighbours.push(other);
   return [other,collides];
  });
  const current=()=>mission.state===world&&mission.nav.topologyRevision===topology&&unit.hp>0&&!unit.pendingOrder&&unit.x===origin.x&&unit.y===origin.y
   &&unit.heading===origin.heading&&this.routeIntent(unit)===intent
   &&bodies.every(([body,collides])=>trafficCollisionRequired(unit,body)===collides);
  const forecasts=neighbours.map(other=>{
   const lane=this.intents.get(other.id)?.roadLane;
   const key=[other.x,other.y,other.heading,other.kind,other.driveSpeed,other.reversing,other.steering,
    other.steeringRequested,other.steeringFault?.episodes,mission.state.time,dt,scale,lane?.path,lane?.direction,lane?.retreatSide,other.path?.[0]];
   const cached=this.forecasts.get(other);
   if(cached&&key.every((value,i)=>value===cached.key[i])){
    this.stats.forecastCacheHits=(this.stats.forecastCacheHits??0)+1;return cached.value;
   }
   let shapes;
   if(!(other.driveSpeed??0))shapes=intervals.map(()=>vehicleEnvelope(other,scale,mission.field));
   else{
    let pose=other,time=mission.state.time;shapes=[];
    const control={speed:other.driveSpeed*(other.reversing?-1:1),steering:other.steeringRequested??other.steering??0,fault:other.steeringFault};
    const followsLane=lane&&other.path?.length&&!other.reversing&&!other.detour&&!other.jointTraffic
     &&-Math.sin(other.heading)*lane.ux+Math.cos(other.heading)*lane.uy>.75;
    for(const step of intervals){
     const target=followsLane?roadDrivingLane(mission,lanePose(other,pose,lane),other.path[0],scale):null;
     const steering=target?routeSteering(pose,target,scale,control.speed):control.steering;
     pose=integrateControl(pose,{...control,steering,time},step,scale);shapes.push(vehicleEnvelope(pose,scale,mission.field));time+=step;
    }
   }
   const value={other,shapes};this.forecasts.set(other,{key,value});return value;
  });
  let best=null;const blockers=new Set();let preferredBlockers=[];
  // Full and half speed can both overshoot a tight turn in the forecast.
  // If neither gives forward progress, also consider a slow approach instead
  // of repeatedly choosing Stop and asking for the same global route.
  const trafficLimit=this.limit(unit),forwardSpeed=Math.min(targetSpeed,trafficLimit);
  // A forward right-of-way cap does not forbid backing out of the conflict.
  // Reverse candidates still pass the same live swept-body/reservation check
  // and every forecast sample; they cannot move through a following vehicle.
  const speedPasses=[[forwardSpeed,forwardSpeed*.5,forwardSpeed*.25],
   [0,-Math.min(dynamics.maneuverReverse,targetSpeed),-Math.min(dynamics.maneuverReverse*.5,targetSpeed)]];
  for(let pass=0;pass<speedPasses.length;pass++){
   // Keep a productive forward arc. Reverse is an escape when no forward
   // sample makes progress, not a competing preference on every frame.
   if(pass&&!backingArrival&&best&&best.score<initialCost-.05)break;
   for(const steering of new Set(steerings))for(const speed of speedPasses[pass]){
   this.stats.samples++;
   const control={speed,steering},rejected=new Set();let pose=unit,first=null,clearance=Infinity,valid=true,travel=0,time=mission.state.time;
   // Execution is exactly the first predicted interval, including braking.
   // It must not execute a faster, separately calculated approach step.
   for(let i=0;i<10;i++){
    if(performance.now()>=mission.nav.workDeadline){
     account();this.stats.controlYields=(this.stats.controlYields??0)+1;yield;sliceAt=performance.now();
     // A new command or changed collision permissions can invalidate a search
     // while it is suspended between frames.
     if(!current()){this.stats.controlDiscards=(this.stats.controlDiscards??0)+1;finish();return false;}
    }
    const step=intervals[i],target=preview(pose),feedback=steering===preferred&&speed>=0?routeSteering(pose,target,scale,speed)
     :steering===reversePreferred&&speed<0?-routeSteering({...pose,heading:wrap(pose.heading+Math.PI)},target,scale,speed):steering;
    const next=integrateControl(pose,{...(passingLane?control:approachingControl(pose,control,target,step,dynamics.braking,final)),steering:feedback,time,fault:unit.steeringFault},step,scale);
    time+=step;this.stats.projections++;
    if(i===0){first=next;if(!mission.vehicleMotionClear(unit,unit,first,.52,rejected)){valid=false;break;}}
    if(mission.vehicleTerrainSweep(unit,pose,next,.52,regionSolids)===false){valid=false;break;}
    // Reuse each predicted envelope across all neighbours and candidates.
    // The threshold must also prove the preferred-control clearance below;
    // a smaller early-out bound could needlessly reject that fast path.
    const shape=vehicleEnvelope(next,scale,mission.field);
    for(const forecast of forecasts){
     const gap=envelopeClearance(shape,forecast.shapes[i],scale*.8+.001);
     clearance=Math.min(clearance,gap);
     if(gap<scale*.055+.02){rejected.add(forecast.other);valid=false;break;}
    }
    if(!valid)break;travel+=distance(pose,next);pose=next;
   }
   for(const body of rejected)blockers.add(body);
   if(steering===preferred&&speed===forwardSpeed)preferredBlockers=[...rejected];
   if(!valid)continue;
   // A nearby final slot has no required body heading. Score a reversing
   // approach by its travel direction, otherwise a short safe back-up loses
   // to repeated forward loops solely because the bonnet faces away.
   const scoringPose=backingArrival&&speed<0?{...pose,heading:wrap(pose.heading+Math.PI)}:pose;
   const score=motionCost(scoringPose)+(speed<0?travel*.3:0)
    +(previous?Math.abs(steering-previous.steering)*.1:0)+.1/(Math.max(0,clearance)+1);
   if(!best||score<best.score)best={score,control,pose:first};
   // A safe, productive route-following rollout already corrects its wheel
   // angle as it approaches the target. Do not replace it with an alternating
   // full-lock sample merely for a tiny terminal score difference.
   if(!backingArrival&&steering===preferred&&speed===forwardSpeed&&first.driveSpeed>.01&&clearance>scale*.8&&motionCost(pose)<initialCost-.05){
    if(!mission.vehicleMotionClear(unit,unit,first,.52,blockers))continue;
    Object.assign(unit,first);this.controls.set(unit.id,control);
    navigationDecision(unit,'MOVING','following-clear-route',null,'follow-route',targetSpeed);
    finish();return true;
   }
  }
   }
  if(best&&!mission.vehicleMotionClear(unit,unit,best.pose,.52,blockers))best=null;
  if(best){Object.assign(unit,best.pose);this.controls.set(unit.id,best.control);}
  else{
   if(unit.driveSpeed>.01)this.stats.emergencyStops++;
   unit.driveSpeed=0;this.controls.delete(unit.id);
  }
  const dependencies=best?preferredBlockers:[...blockers];
  if(trafficLimit<.01)for(const id of this.blockingVehicles(unit))if(!dependencies.some(other=>other.id===id)){
   const owner=mission.entity(id);if(owner)dependencies.push(owner);
  }
  navigationDecision(unit,unit.driveSpeed>.01?'MOVING':'BLOCKED',unit.driveSpeed>.01?'predictive-control':dependencies.length?'local-traffic':'local-manoeuvre-required',
   unit.driveSpeed>.01?null:dependencies.map(other=>other.id),'sample-local-controls',targetSpeed);
  finish();
  return !!best;
 }
}
