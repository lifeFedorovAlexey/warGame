import {vehicleEnvelope,footprintSupport,vehicleSweep,footprintCast,trafficCollisionRequired} from './vehicle-collision.js';
import {updatePassageReservations} from './passage-reservations.js';
import {vehicleDynamics} from './vehicle-dynamics.js';
import {checkManeuver} from './vehicle-motion.js';
import {corridorSpeedLimit} from './traffic-corridor.js';
import {navigationDecision} from './navigation-state.js';
import {CommandPlanner} from './command-planner.js';
import {shouldAutoRetreat,startAutomaticRetreat,updateCombatRetreat} from './combat-policy.js';
import {retreatReturnOrder} from './factory-repair.js';
import {TrafficPlanner} from './traffic-planner.js';
import {recoverWaitCycle} from './traffic-cycle.js';
import {stepJointTraffic,commitJointPlanSteps} from './traffic-joint.js';
import {planMovingPassage} from './traffic-passage.js';
import {rememberYieldHome,recordYieldStep,resumeYieldHome,checkedCooperativeArrival,cooperativeArrivalReady,prepareTrafficDeparture} from './traffic-start.js';
import {waitingForContinuation} from './route-continuation.js';
import {updateCombatParking} from './combat-deployment.js';
import {immediateCommand,stepCommandIntent,commandSteeringTarget} from './command-motion.js';

export const TRAFFIC_LIMITS={groupSize:100,zoneSize:256,horizon:3,leases:1024};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const cross=(a,b)=>a.x*b.y-a.y*b.x;
const dot=(a,b)=>a.x*b.x+a.y*b.y;

function crossingReleased(lease,byId,scale,field){
 const zone=lease.zone,winner=byId.get(lease.winner);
 if(!zone||!winner)return !winner;
 const shape=vehicleEnvelope(winner,scale,field),side=(shape.x-zone.x)*zone.nx+(shape.y-zone.y)*zone.ny;
 const clearance=footprintSupport(shape,zone.nx,zone.ny)+zone.width;
 if(side*zone.exitSign>clearance)return true;
 if(zone.ux!==undefined){
  const transverse=(shape.x-zone.x)*-zone.uy+(shape.y-zone.y)*zone.ux;
  if(Math.abs(transverse)>footprintSupport(shape,-zone.uy,zone.ux)+zone.ownerWidth+scale*.055)return true;
 }
 // A cancelled/replaced route outside the occupied crossing no longer owns
 // its old approach. Cancellation while a body is inside does not erase it.
 const goal=commandSteeringTarget(winner)??winner.path?.at(-1),waypoint=commandSteeringTarget(winner)??winner.path?.[0];
 const changed=!goal||goal.x!==zone.goalX||goal.y!==zone.goalY
  ||zone.waypointX!==undefined&&(waypoint?.x!==zone.waypointX||waypoint?.y!==zone.waypointY);
 return changed&&Math.abs(side)>clearance;
}

function grantCrossing(lease,winner,other,along,scale,now){
 const nx=-other.course.y,ny=other.course.x,goal=commandSteeringTarget(winner.unit)??winner.unit.path.at(-1),waypoint=commandSteeringTarget(winner.unit)??winner.unit.path[0];
 lease.grantedAt??=now;
 lease.zone={x:winner.unit.x+winner.course.x*along,y:winner.unit.y+winner.course.y*along,nx,ny,
  width:footprintSupport(other.shape,nx,ny)+scale*.45,exitSign:Math.sign(winner.course.x*nx+winner.course.y*ny),
  ux:winner.course.x,uy:winner.course.y,ownerWidth:footprintSupport(winner.shape,-winner.course.y,winner.course.x),
  goalX:goal.x,goalY:goal.y,waypointX:waypoint.x,waypointY:waypoint.y};
}

// A granted crossing remains binding even when a later ETA comparison or a
// changing steering target no longer rediscovers the original pair. Clip the
// loser's current approach against the saved finite crossing, expanded by its
// complete body. An already entered car must finish clearing, not park inside.
function retainedCrossingLimit(lease,plan,scale,dt){
 const z=lease.zone;if(!z||z.ux===undefined)return Infinity;
 const {shape,course}=plan;let enter=0,exit=Infinity;
 for(const [x,y,half] of [[z.nx,z.ny,z.width],[-z.uy,z.ux,z.ownerWidth+scale*.45]]){
  const offset=(shape.x-z.x)*x+(shape.y-z.y)*y,rate=course.x*x+course.y*y,
   radius=half+footprintSupport(shape,x,y);
  if(Math.abs(rate)<1e-7){if(Math.abs(offset)>radius)return Infinity;continue;}
  const a=(-radius-offset)/rate,b=(radius-offset)/rate;
  enter=Math.max(enter,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));
 }
 if(exit<enter||enter<=0||enter>plan.length)return Infinity;
 const braking=vehicleDynamics(plan.unit).braking,reaction=braking*dt;
 return Math.max(0,Math.sqrt(2*braking*Math.max(0,enter-.02)+reaction**2)-reaction);
}

// A changed physical queue may invalidate a future crossing promise. It can
// be renegotiated only after both participants stop and its owner is outside.
// An empty intersection may be released; an intersection occupied solely by
// the waiting participant may be handed to it to finish clearing. A third
// body's footprint/stopping sweep forbids either operation. Occupied owner
// rights never expire, including when that owner has received Stop.
function crossingReschedule(lease,mission,byId,scale){
 const z=lease.zone,a=byId.get(lease.a),b=byId.get(lease.b);
 if(!z||z.ux===undefined||!a||!b||(a.driveSpeed??0)>.001||(b.driveSpeed??0)>.001)return null;
 const loser=lease.winner===lease.a?lease.b:lease.a;let occupant=null;
 const ownX=-z.uy,ownY=z.ux,width=z.ownerWidth+scale*.45;
 const intersects=(shape,padding=0)=>Math.abs((shape.x-z.x)*z.nx+(shape.y-z.y)*z.ny)<=z.width+footprintSupport(shape,z.nx,z.ny)+padding
  &&Math.abs((shape.x-z.x)*ownX+(shape.y-z.y)*ownY)<=width+footprintSupport(shape,ownX,ownY)+padding;
 const radius=(z.width+width)/Math.max(.01,Math.abs(z.nx*ownY-z.ny*ownX));
 for(const unit of byId.values()){
  const dynamics=vehicleDynamics(unit),speed=unit.driveSpeed??0,dt=mission.config.simulationStep??.1;
  const stopping=speed*dt+speed*speed/(2*dynamics.braking),shape=vehicleEnvelope(unit,scale,mission.field);
  if(Math.hypot(shape.x-z.x,shape.y-z.y)>radius+Math.hypot(shape.width,shape.depth)+stopping)continue;
  if(intersects(shape)){
   // An already-entered loser must be allowed to clear ahead of a stopped
   // owner outside. This is an occupancy-preserving transfer, not an empty
   // zone. A stopped owner or any third body forbids renegotiation.
   if(unit.id!==loser)return null;
   occupant=loser;continue;
  }
  if(stopping>.001){
   const direction=unit.reversing?-1:1,curve=Math.tan(unit.steering??0)*direction;
   const clear=checkManeuver(unit,[{direction,curve,remaining:stopping}],scale,(from,to)=>{
    const sweep=vehicleSweep(from,to,scale,mission.field);
    const poses=[sweep.start,sweep.middle,sweep.end];
    // Test the union of support intervals over the complete small sweep.
    // Three isolated OBB tests could miss a short corner crossing between
    // samples; this conservative swept projection cannot declare it empty.
    const overlaps=(x,y,half)=>{
     const low=Math.min(...poses.map(p=>(p.x-z.x)*x+(p.y-z.y)*y-footprintSupport(p,x,y)))-sweep.padding;
     const high=Math.max(...poses.map(p=>(p.x-z.x)*x+(p.y-z.y)*y+footprintSupport(p,x,y)))+sweep.padding;
     return low<=half&&high>=-half;
    };
    return !(overlaps(z.nx,z.ny,z.width)&&overlaps(ownX,ownY,width));
   });
   if(!clear)return null;
  }
 }
 return {occupant};
}

// Nearly parallel routes can converge laterally. Following distance alone
// only notices their bodies after the side clearance has nearly vanished.
// Cast the actual footprints over the same short horizon;
// equal-speed independent lanes never acquire a conflict from this check.
function parallelMerge(a,b,scale,horizon){
 const speedA=a.unit.driveSpeed??0,speedB=b.unit.driveSpeed??0;
 const vx=-Math.sin(b.unit.heading)*speedB+Math.sin(a.unit.heading)*speedA;
 const vy=Math.cos(b.unit.heading)*speedB-Math.cos(a.unit.heading)*speedA;
 const dx=b.shape.x-a.shape.x,dy=b.shape.y-a.shape.y;
 const duration=Math.min(horizon,a.length/Math.max(1,speedA),b.length/Math.max(1,speedB));
 if(!Number.isFinite(footprintCast(a.shape,{x:-vx,y:-vy},duration,b.shape,scale*.055+.02)))return null;
 const length=Math.hypot(a.course.x+b.course.x,a.course.y+b.course.y);
 const course={x:(a.course.x+b.course.x)/length,y:(a.course.y+b.course.y)/length};
 return {along:dx*course.x+dy*course.y,
  clearance:footprintSupport(a.shape,course.x,course.y)+footprintSupport(b.shape,course.x,course.y)+scale*.055+.02};
}

// Shared right of way, decided before any unit moves. A coordinator is a role,
// not a spawned vehicle. Pair leases cross zone boundaries and survive saves.
export class TrafficCoordinator{
 constructor({backgroundRecovery=false}={}){this.groups=[];this.decisions=new Map();this.passageDecisions=new Map();this.queues=new Set();this.intents=new Map();this.statistics={};this.inputRevision=0;this.planner=backgroundRecovery?new TrafficPlanner():null;}
 intentChanged(){this.inputRevision++;}
 advancePlanning(mission,budgetMs){this.planner?.advance(mission,budgetMs);}
 publishPlanning(mission,deadline){this.planner?.publish(mission,deadline);}
 // Geometry helpers propose phases. Only this dispatcher can publish a
 // shared movement, including ownership of every participant's return.
 commitPassage(...args){
  const iterator=this.commitPassageSteps(...args);let step;do{step=iterator.next();}while(!step.done);return step.value;
 }
 *commitPassageSteps(mission,owner,goal,phases,valid,options){
  const members=[...new Set([owner,...phases.map(phase=>phase.body)])];
  if(members.some(body=>body.jointTraffic))return null;
  const plan=yield* commitJointPlanSteps(mission,owner,goal,phases,rememberYieldHome,valid,options);if(!plan)return null;
  for(const body of members){
   delete body.traffic;delete body.trafficHold;delete body.driveWatch;delete body.detour;delete body.cycleContinuation;delete body.passingLane;
  }
  owner.detour=plan;return plan;
 }
 *movingPassageSteps(mission,leader,follower,options){
  const proposal=yield* planMovingPassage(mission,leader,follower,options);if(!proposal)return false;
  const goal=leader.routeOrder?.destination??leader.path.at(-1);
  if(options?.diagnostics)options.diagnostics.stage='corridor-admission';
  const plan=yield* this.commitPassageSteps(mission,leader,goal,proposal.phases,proposal.valid,{preserveLoans:true});
  if(!plan){if(options?.diagnostics)options.diagnostics.outcome=proposal.valid()?'BLOCKED_DYNAMIC':'STALE';return false;}
  for(const {body,path} of proposal.continuations??[])body.path=path;
  return true;
 }
 // Guard the owners of the suspended controller. Local geometric searches
 // separately track their inspected area and revalidate before publication.
 // An order to a distant, unrelated car must not cancel this controller.
 *currentIntentSteps(mission,iterator,participants=[]){
  try{
   while(true){
    const step=iterator.next();if(step.done)return step.value;
    const world=mission.state,topology=mission.nav.topologyRevision;
    const intents=participants.map(unit=>({unit,revision:unit.commandRevision,pending:unit.pendingOrder}));
    yield step.value;
    if(mission.state!==world||mission.nav.topologyRevision!==topology||intents.some(({unit,revision,pending})=>
     mission.entity(unit.id)!==unit||unit.hp<=0||unit.commandRevision!==revision||unit.pendingOrder!==pending))return null;
   }
  }finally{iterator.return();}
 }
 limit(unit){
  const applies=d=>!d?.yieldTo||trafficCollisionRequired(unit,this.liveMission?.entity(d.yieldTo));
  const decision=this.decisions.get(unit.id),intent=this.intents.get(unit.id),passage=this.passageDecisions.get(unit.id);
  return Math.min(applies(decision)?decision?.limit??Infinity:Infinity,applies(intent)?intent?.trafficLimit??Infinity:Infinity,applies(passage)?passage?.limit??Infinity:Infinity);
 }
 blockingVehicles(unit){
  const limit=this.limit(unit);if(!Number.isFinite(limit))return [];
  const intent=this.intents.get(unit.id);
  // Include every binding source of the executed limit, including an
  // opposing-lane approach. A looser junction promise is not its blocker.
  return [...new Set([this.decisions.get(unit.id),this.passageDecisions.get(unit.id),
   {limit:intent?.trafficLimit??Infinity,yieldTo:intent?.yieldTo}]
   .filter(decision=>decision?.yieldTo&&decision.limit<=limit+1e-6
    &&trafficCollisionRequired(unit,this.liveMission?.entity(decision.yieldTo))).map(decision=>decision.yieldTo))];
 }
 queueing(unit){return this.queues.has(unit.id);}
 continuousPassageAllowed(mission,requester,donor,reach){
  // A two-car passage can run through its geometric samples continuously.
  // Shared parking/return chains currently rely on their checked phase order;
  // keep that execution there until their complete multi-car return is owned.
  // Persist this permission on the plan; old saved plans retain their executor.
  return !donor.yieldReturn&&mission.state.units.every(body=>body.hp<=0||body===requester||body===donor
   ||distance(body,requester)>reach&&distance(body,donor)>reach);
 }
 // This is the common dispatch point for command, service and local traffic
 // ownership. Geometry helpers only propose checked plans; they do not run
 // independent per-frame controllers. A pending player order wins immediately.
 *prepareUnitSteps(mission,unit,spec,dt){
  if((unit.pendingOrder||!unit.combatRetreat)&&shouldAutoRetreat(unit,spec))startAutomaticRetreat(mission,unit,spec);
  // A checked shared passage owns a healthy holder as well as the wounded
  // requester. Run it before an arrived firing position can return early.
  if(!unit.pendingOrder&&stepJointTraffic(mission,unit,dt,recordYieldStep))return true;
  if(unit.pendingOrder){
   if(stepCommandIntent(mission,unit,spec,dt))return true;
   unit.driveSpeed=0;
   const pending=unit.pendingOrder,blocked=pending.status==='blocked';
   const unreachable=blocked&&['static-disconnected','route-unreachable','destination-terrain-forbidden'].includes(pending.reason);
   navigationDecision(unit,unreachable?'UNREACHABLE':blocked?'BLOCKED':'GLOBAL_REPLAN',pending.reason??'command-route-pending',pending.blockerId??null,blocked?'await-changed-conditions':'apply-current-order-result');
   return true;
  }
  if(unit.commandStartAfter!==undefined){
   if(mission.state.time<=unit.commandStartAfter){unit.driveSpeed=0;navigationDecision(unit,'WAITING_RESERVATION','await-next-traffic-snapshot',null,'start-on-next-tick');return true;}
   delete unit.commandStartAfter;
  }
  const retreat=unit.combatRetreat;
  if(retreat&&!retreat.forced&&retreat.status==='arrived'&&unit.hp>=unit.maxHp&&!unit.detour&&!unit.yieldReturn){
   const order=retreatReturnOrder(mission,unit);
   if(order){
    // Bypass group expansion: repairing a commander must not overwrite the
    // newer orders of every healthy member when it rejoins its own slot.
    const result=(mission.commandPlanner??=new CommandPlanner(mission)).submit([unit.id],order.action,order.target);
    if(result.ok){delete unit.combatRetreat;return true;}
   }
  }
  if(unit.foldTime>0){
   if(!retreat?.forced)return false;
   unit.foldTime=Math.max(0,unit.foldTime-dt);unit.tool=Math.max(0,unit.tool-dt/2.6);return true;
  }
  return yield* updateCombatRetreat(mission,unit,spec,dt);
 }
 *prepareMovementSteps(mission,unit,dt){
  if(stepJointTraffic(mission,unit,dt,recordYieldStep))return true;
  if(waitingForContinuation(unit))return false;
  if(this.planner?.pendingFor(unit))return null;
  if(!this.planner)yield* recoverWaitCycle(mission,unit);
  if(unit.pendingOrder||unit.hp<=0)return false;
  yield* resumeYieldHome(mission,unit);
  if(unit.pendingOrder||unit.hp<=0)return false;
  if(!unit.yieldReturn&&!unit.detour&&unit.routeOrder?.destination&&(unit.driveSpeed??0)<.01
   &&['move','attack-move'].includes(unit.task?.type)&&cooperativeArrivalReady(mission,unit,unit.routeOrder.destination)){
   const arrival=yield* checkedCooperativeArrival(mission,unit,unit.routeOrder.destination,{cooperate:true});
   if(unit.pendingOrder||unit.hp<=0)return false;
   if(arrival)unit.detour=arrival;
  }
  if(stepJointTraffic(mission,unit,dt,recordYieldStep))return true;
  yield* updateCombatParking(mission,unit);
  yield* prepareTrafficDeparture(mission,unit);
  return null;
 }
 update(mission){
  this.liveMission=mission;
  for(const unit of mission.state.units){
   if(unit.trafficHold&&!trafficCollisionRequired(unit,mission.entity(unit.trafficHold)))delete unit.trafficHold;
   if(unit.traffic?.leader&&!trafficCollisionRequired(unit,mission.entity(unit.traffic.leader))){
    const leader=mission.entity(unit.traffic.leader);if(leader?.cycleContinuation===unit.id)delete leader.cycleContinuation;delete unit.traffic;
   }
  }
  const started=performance.now(),{state,config,field}=mission,now=state.time,scale=config.worldScale;
  const saved=state.trafficControl??={version:1,leases:[],waiting:{}};
  const living=state.units.filter(u=>u.hp>0&&u.factoryVisit?.phase!=='inside'),byId=new Map(living.map(u=>[u.id,u]));
  this.passageDecisions=updatePassageReservations(mission,living);
  const leases=new Map(saved.leases.filter(l=>byId.has(l.a)&&byId.has(l.b)&&trafficCollisionRequired(byId.get(l.a),byId.get(l.b))
   &&(l.zone?!crossingReleased(l,byId,scale,field):l.expires>now)).map(l=>[l.key,l]));
  this.decisions.clear();this.queues.clear();this.intents.clear();this.groups.length=0;
  const zones=new Map();
  for(const u of living){
   const commander=byId.get(u.commanderId),assigned=commander?.owner===u.owner?commander:null;
   const key=u.owner+':'+(assigned?'commander:'+assigned.id:Math.floor(u.x/TRAFFIC_LIMITS.zoneSize)+':'+Math.floor(u.y/TRAFFIC_LIMITS.zoneSize));
   if(!zones.has(key))zones.set(key,[]);zones.get(key).push(u);
  }
  for(const [zone,units] of zones){
   units.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
   const commander=units.find(u=>u.kind==='command')??byId.get(units[0]?.commanderId);
   for(let i=0;i<units.length;i+=TRAFFIC_LIMITS.groupSize){
    const group=units.slice(i,i+TRAFFIC_LIMITS.groupSize);
    this.groups.push({id:zone+':'+i,leaderId:commander?.id??group[0].id,virtual:!commander,units:group.map(u=>u.id)});
   }
  }
  const plans=new Map();
  for(const u of living){
   const pending=immediateCommand(u);
   if(u.pendingOrder&&!pending)continue;
   if(!pending&&(!u.path?.length||u.builderWorking||u.detour||u.trafficHold||u.traffic?.cycle&&u.traffic.phase==='parked'))continue;
   const target=pending?commandSteeringTarget(u):u.path[0],d=distance(target,u);if(d<.1)continue;
   const direct={x:(target.x-u.x)/d,y:(target.y-u.y)/d};
   const intent=pending?{point:target,waypoint:target,course:direct,revision:u.pendingOrder.revision}:mission.drivingIntent(u,target,direct,scale);
   const course=intent.course;this.intents.set(u.id,intent);
   // Local turning/parking is handled by the swept manoeuvre solver. Do not
   // reserve a straight trajectory for a car which is currently reversing.
   if(u.reversing||dot({x:-Math.sin(u.heading),y:Math.cos(u.heading)},course)<.65)continue;
   const shape=vehicleEnvelope(u,scale,field),speed=Math.max(4,u.driveSpeed??0,config.units[u.kind].speed*.45);
   plans.set(u.id,{unit:u,course,shape,speed,length:d});
  }
  let pairs=0,conflicts=0;const followers=new Map(),crossings=[];
  for(const a of plans.values())for(const other of mission.unitIndex.query(a.unit,110)){
   if(other.owner!==a.unit.owner||other.id<=a.unit.id||!trafficCollisionRequired(a.unit,other))continue;
   const b=plans.get(other.id);if(!b)continue;pairs++;
   const admissionA=this.passageDecisions.get(a.unit.id),admissionB=this.passageDecisions.get(b.unit.id);
   // Admission already owns the shared throat and its exit. A waiting
   // entrance may not reserve a hypothetical crossing over that owner's
   // exit. Its actual stationary body still participates in all sweeps and
   // headway checks; this removes only the incompatible future trajectory.
   if(admissionA&&admissionB&&admissionA.key===admissionB.key&&(!admissionA.admitted||!admissionB.admitted))continue;
   const parallel=dot(a.course,b.course),den=cross(a.course,b.course);
   // Following and opposing parallel lanes use lane keeping/headway. They
   // must not contend for a junction reservation indefinitely.
   if(parallel>.82){
    const dx=b.shape.x-a.shape.x,dy=b.shape.y-a.shape.y,along=dx*a.course.x+dy*a.course.y;
    const across=Math.abs(dx*a.course.y-dy*a.course.x);
    if(Math.abs(along)<scale*13&&across<scale*2.2){
     const leader=along>0?b:a,follower=along>0?a:b;
     if(!followers.has(leader.unit.id))followers.set(leader.unit.id,[]);followers.get(leader.unit.id).push(follower.unit.id);
    }
    // Existing same-file headway owns already overlapping lateral corridors.
    const merge=across>=scale*2.2?parallelMerge(a,b,scale,TRAFFIC_LIMITS.horizon):null;
    if(merge){
     const key=[a.unit.id,b.unit.id].sort().join('|');let lease=leases.get(key);
     if(!lease){
      const winner=merge.along===0?(a.unit.id<b.unit.id?a:b):merge.along>0?b:a;
      lease={key,a:a.unit.id,b:b.unit.id,winner:winner.unit.id,expires:now+4};leases.set(key,lease);
     }
     conflicts++;crossings.push({a,b,da:merge.along,db:-merge.along,ca:merge.clearance,cb:merge.clearance,lease,merge:true});
    }
    continue;
   }
   if(parallel<-.97||Math.abs(den)<.06)continue;
   const delta={x:b.unit.x-a.unit.x,y:b.unit.y-a.unit.y},da=cross(delta,b.course)/den,db=cross(delta,a.course)/den;
   // Distance along each approach occupied by the other swept lane. The
   // division by sin(angle) matters at shallow/obtuse crossings; projection
   // onto our own direction alone underestimates that zone.
   const ca=(footprintSupport(a.shape,-b.course.y,b.course.x)+footprintSupport(b.shape,-b.course.y,b.course.x))/Math.abs(den)+scale*.45;
   const cb=(footprintSupport(a.shape,-a.course.y,a.course.x)+footprintSupport(b.shape,-a.course.y,a.course.x))/Math.abs(den)+scale*.45;
   if(da< -ca||db< -cb||da>Math.min(a.length+ca,a.speed*TRAFFIC_LIMITS.horizon+ca)||db>Math.min(b.length+cb,b.speed*TRAFFIC_LIMITS.horizon+cb))continue;
   const enterA=(da-ca)/a.speed,exitA=(da+ca)/a.speed,enterB=(db-cb)/b.speed,exitB=(db+cb)/b.speed;
   if(Math.max(enterA,enterB)>Math.min(exitA,exitB)+.25)continue;
   conflicts++;
   const key=[a.unit.id,b.unit.id].sort().join('|');let lease=leases.get(key);
   if(!lease){
    const committedA=da<=ca+(a.unit.driveSpeed??0)**2/(2*vehicleDynamics(a.unit).braking);
    const committedB=db<=cb+(b.unit.driveSpeed??0)**2/(2*vehicleDynamics(b.unit).braking);
    const waitA=now-(saved.waiting[a.unit.id]??now),waitB=now-(saved.waiting[b.unit.id]??now);
    const scoreA=(committedA?100:0)+waitA*2-Math.max(0,enterA),scoreB=(committedB?100:0)+waitB*2-Math.max(0,enterB);
    const retreatA=!!a.unit.combatRetreat,retreatB=!!b.unit.combatRetreat;
    // Grant an approaching evacuation passage before a healthy arrival, but
    // never take precedence from a body already committed to the crossing.
    // Existing occupied leases and physical dependency edges remain binding.
    const evacuation=!committedA&&!committedB&&retreatA!==retreatB;
    const winner=committedA!==committedB?(committedA?a:b):evacuation?(retreatA?a:b)
     :scoreA===scoreB?(a.unit.id<b.unit.id?a:b):scoreA>scoreB?a:b;
    lease={key,a:a.unit.id,b:b.unit.id,winner:winner.unit.id,expires:now+4,
     reason:evacuation?'retreat-priority':committedA!==committedB?'committed-crossing':'waiting-order'};leases.set(key,lease);
   }
   crossings.push({a,b,da,db,ca,cb,lease});
  }
  // Retain already-issued crossing precedence until the owner's complete
  // body clears the opposing lane. Rebuilding a DAG from scratch could flip
  // a granted pair while both vehicles were already braking towards it.
  const successors=new Map();
  const precedes=(from,to)=>{
   const pending=[from],seen=new Set(pending);
   for(let i=0;i<pending.length;i++)for(const id of successors.get(pending[i])??[]){
    if(id===to)return true;if(!seen.has(id)){seen.add(id);pending.push(id);}
   }
   return false;
  };
  const before=(leader,follower)=>{if(!successors.has(leader))successors.set(leader,new Set());successors.get(leader).add(follower);};
  // A body ahead of a convoy is a mandatory dependency, even if a previous
  // promise would form a cycle with it. Dropping that edge only concealed
  // the real deadlock from the graph while headway still stopped the tail.
  for(const [leader,tail] of followers)for(const follower of tail)before(leader,follower);
  // Headway on a curved approach and borrowed-space returns are just as
  // binding as an aligned convoy. Use the preceding completed controllers'
  // actual stopped-body dependencies, not merely their projected lanes.
  for(const [follower,blockers] of mission.navigationDiagnostics?.dependencies??[])
   for(const blocker of blockers)if(byId.has(blocker)&&byId.has(follower)&&trafficCollisionRequired(byId.get(blocker),byId.get(follower)))before(blocker,follower);
  const withdrawn=[],transferred=[];let occupiedCycles=0;
  for(const lease of [...leases.values()].filter(l=>l.zone).sort((a,b)=>a.grantedAt-b.grantedAt||a.key.localeCompare(b.key))){
   const loser=lease.winner===lease.a?lease.b:lease.a;
   if(precedes(loser,lease.winner)){
    const proof=crossingReschedule(lease,mission,byId,scale);
    if(proof){
     if(!proof.occupant){
      withdrawn.push({key:lease.key,winner:lease.winner,reason:'unoccupied-physical-cycle'});
      delete lease.zone;delete lease.grantedAt;lease.expires=now;
      continue;
     }
     const pair=crossings.find(c=>c.lease===lease&&!c.merge);
     if(pair){
      const winner=proof.occupant===pair.a.unit.id?pair.a:pair.b,other=winner===pair.a?pair.b:pair.a;
      transferred.push({key:lease.key,from:lease.winner,to:winner.unit.id,reason:'physical-occupant-clearing'});
      lease.winner=winner.unit.id;lease.grantedAt=now;
      grantCrossing(lease,winner,other,winner===pair.a?pair.da:pair.db,scale,now);
      before(winner.unit.id,other.unit.id);continue;
     }
    }
    occupiedCycles++;
   }
   before(lease.winner,loser);
  }
  let cyclesPrevented=0;
  for(const {a,b,da,db,ca,cb,lease,merge} of crossings){
   let winner=lease.winner,loserId=winner===a.unit.id?b.unit.id:a.unit.id;
   if(!lease.zone&&precedes(loserId,winner)){[winner,loserId]=[loserId,winner];lease.winner=winner;cyclesPrevented++;}
   before(winner,loserId);
   if(!merge&&!lease.zone)grantCrossing(lease,winner===a.unit.id?a:b,winner===a.unit.id?b:a,winner===a.unit.id?da:db,scale,now);
   const loser=loserId===a.unit.id?a:b,along=loser===a?da:db,clearance=loser===a?ca:cb;
   // Already inside: finish clearing the junction. Stopping there would
   // block its owner and cause a permanent deadlock.
   if(along<0&&!merge)continue;
   const braking=vehicleDynamics(loser.unit).braking,reaction=braking*(config.simulationStep??.1);
   const limit=Math.max(0,Math.sqrt(2*braking*Math.max(0,along-clearance)+reaction**2)-reaction);
   if(limit<(this.decisions.get(loser.unit.id)?.limit??Infinity))this.decisions.set(loser.unit.id,{limit,yieldTo:lease.winner,reason:lease.reason,coordinator:this.groups.find(g=>g.units.includes(loser.unit.id))?.leaderId});
  }
  // A tail waiting behind a junction queue is not stuck. Propagate that fact
  // along the convoy, including across dispatcher-zone boundaries.
  for(const lease of leases.values())if(lease.zone){
   const loser=lease.winner===lease.a?lease.b:lease.a,plan=plans.get(loser);if(!plan)continue;
   const limit=retainedCrossingLimit(lease,plan,scale,config.simulationStep??.1);
   if(limit<(this.decisions.get(loser)?.limit??Infinity))this.decisions.set(loser,{limit,yieldTo:lease.winner,retained:true});
  }
  for(const plan of plans.values()){
   const reserved=corridorSpeedLimit(mission,plan);
   if(reserved&&reserved.limit<(this.decisions.get(plan.unit.id)?.limit??Infinity))this.decisions.set(plan.unit.id,reserved);
  }
  // A car parked at its destination inside an old crossing still occupies
  // that space, but cannot promise to clear it. Keep braking/occupancy rights
  // and let the follower find a checked bypass instead of resetting its
  // recovery clock forever as if this were an advancing queue.
  const queue=[...[...this.decisions].filter(([id,decision])=>{
   const leader=byId.get(decision.yieldTo);
   return leader&&(leader.path?.length||leader.detour||leader.yieldReturn||leader.pendingOrder);
  }).map(([id])=>id),...[...this.passageDecisions].filter(([id,d])=>!d.admitted).map(([id])=>id)];for(const id of queue)this.queues.add(id);
  for(let i=0;i<queue.length;i++)for(const id of followers.get(queue[i])??[])if(!this.queues.has(id)){this.queues.add(id);queue.push(id);}
  const waiting={};
  for(const [id,d] of this.decisions)if(d.limit<config.units[byId.get(id).kind].speed*.65)waiting[id]=saved.waiting[id]??now;
  saved.waiting=waiting;saved.leases=[...leases.values()].slice(-TRAFFIC_LIMITS.leases);
  this.updatedState=state;this.updatedAt=now;
  this.planner?.requestCycles(mission);
  const waitCycles=mission.navigationDiagnostics?.recoveryCycles?.length??0;
  // Physical cycles are exactly the components offered to recovery. Count
  // reservation conflicts separately; they are not the whole wait graph.
  this.statistics={groups:this.groups.length,largestGroup:Math.max(0,...this.groups.map(g=>g.units.length)),controlled:living.length,pairs,conflicts,yielding:this.decisions.size,cyclesPrevented,withdrawn,transferred,reservationCycles:occupiedCycles,occupiedCycles:waitCycles,waitCycles,cpuMs:performance.now()-started};
 }
}
