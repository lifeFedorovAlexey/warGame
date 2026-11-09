import {automaticCombatTarget,combatPolicy} from './combat-policy.js';
import {assignFormationSteps} from './formation-assignment.js';
import {commandPathFromLive} from './command-motion.js';
import {checkManeuver} from './vehicle-motion.js';
import {navigationDecision} from './navigation-state.js';
import {movementCombatTarget} from './combat-orders.js';
import {checkedCycleActive} from './traffic-cycle.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const combatTask=task=>['attack','attack-move'].includes(task?.type);
const resetMotion=unit=>{
  for(const key of ['passage','detour','traffic','trafficHold','passingLane','driveWatch','failedArcs','reverseDebt','combatArrivalBlockedAt','combatArrivalGoal','combatParking'])delete unit[key];
};
export function cancelCombatDeployment(unit){delete unit.combatDeployment;delete unit.combatGroup;delete unit.combatContactAt;delete unit.combatResume;delete unit.combatArrivalBlockedAt;delete unit.combatArrivalGoal;delete unit.combatParking;delete unit.attackRouteTarget;delete unit.attackFailedConditions;delete unit.combatDisengage;}
function firingSlots(spec,scale,angle,anchor){
  const spacing=scale*7,slots=[];
  for(let radius=spec.range*.78;radius>=spec.range*.38;radius-=spacing){
    const columns=Math.max(2,Math.floor(radius*Math.PI*2/spacing/2)*2);
    for(let column=0;column<columns;column++){
      const offset=(column%2?1:-1)*(Math.floor(column/2)+.5)*spacing/radius;
      slots.push({x:anchor.x+Math.cos(angle+offset)*radius,y:anchor.y+Math.sin(angle+offset)*radius});
    }
  }
  return slots;
}
function* reserveSlot(mission,unit,deployment){
  const slots=firingSlots(mission.unitSpec(unit),mission.config.worldScale,deployment.angle,deployment.anchor);
  const reserved=mission.state.units.filter(other=>other!==unit&&other.hp>0&&other.combatDeployment?.group===deployment.group)
    .map(other=>other.combatDeployment.goal??other.combatDeployment.slot).filter(Boolean);
  const target=mission.entity(deployment.targetId);
  const eligible=[];
  for(let index=0;index<slots.length;index++){
    if(index%8===0)yield;
    const slot=slots[index];if(target&&validPosition(mission,unit,target,slot,reserved))eligible.push({slot,index,cost:slotCost(unit,slot,mission.config.worldScale)});
  }
  if(unit.combatDeployment!==deployment||unit.pendingOrder)return false;
  eligible.sort((a,b)=>a.cost-b.cost||a.index-b.index);
  const rejected=deployment.rejectedSlots??=[];
  const available=eligible.filter(({index})=>!rejected.includes(index));
  // Failed approaches remain rejected until the actual obstacles or reserved
  // positions change. Exhausting a list must not restart an identical search.
  const index=available[0]?.index??-1;
  if(index<0)return false;
  deployment.index=index;deployment.slot=slots[index];deployment.status='planning';return true;
}
export function combatPositionConditions(mission,unit,anchor){
  let cache=mission.combatConditions;
  if(!cache||cache.time!==mission.state.time)cache=mission.combatConditions={time:mission.state.time,values:new Map()};
  const radius=mission.unitSpec(unit).range+mission.config.worldScale*20,key=unit.combatGroup+'|'+anchor.x+','+anchor.y+'|'+radius;
  let value=cache.values.get(key);
  if(value===undefined){
    const nearby=mission.nearbyUnits(anchor,radius).filter(other=>other.hp>0);
    value=[mission.nav.topologyRevision,...nearby.map(other=>{
      const goal=other.combatDeployment?.goal??other.combatDeployment?.slot??other.combatRetreat?.destination??other.path.at(-1);
      return other.id+':'+(other.path.length?'moving:'+(goal?goal.x+','+goal.y:''):other.x+','+other.y+','+other.heading)+':'+(other.pendingOrder?.revision??'');
    })].join('|');cache.values.set(key,value);
  }
  return unit.x+','+unit.y+','+unit.heading+'|'+value;
}
function slotCost(unit,point,scale){
  const d=distance(unit,point),heading=Math.atan2(unit.x-point.x,point.y-unit.y);
  const turn=Math.atan2(Math.sin(heading-unit.heading),Math.cos(heading-unit.heading));
  return d*d+turn*turn*scale*scale*12;
}

// Only members with their own nearby contact leave an attack-move route.
// A front car must not halt a distant column to reorganize around its enemy.
function* beginDeployment(mission,unit,target){
  const members=mission.state.units.filter(other=>other.owner===unit.owner&&other.hp>0
    &&other.combatGroup===unit.combatGroup&&combatTask(other.task)&&!other.pendingOrder&&!other.combatRetreat&&!other.combatDeployment
    &&!checkedCycleActive(mission,other)
    &&(other.task.type==='attack'||combatPolicy(other).response!=='ignore')
    &&(other.task.type==='attack'||!other.combatDisengage?.includes(target.id))
    &&(other.task.type==='attack'||distance(other,target)<=mission.unitSpec(other).vision&&mission.lineOfSight(other,target)))
    .sort((a,b)=>distance(a,target)-distance(b,target)||a.id.localeCompare(b.id)).slice(0,100);
  const existing=mission.state.units.filter(other=>other.hp>0&&other.combatDeployment?.group===unit.combatGroup&&other.combatDeployment.targetId===target.id);
  if(members.length<2&&!existing.length)return false;
  const centre=members.reduce((p,u)=>({x:p.x+u.x/members.length,y:p.y+u.y/members.length}),{x:0,y:0});
  const angle=existing[0]?.combatDeployment.angle??Math.atan2(centre.y-target.y,centre.x-target.x);
  const group=unit.combatGroup;
  for(const member of members){
    // A new contact can interrupt a group-wide resumption before every member
    // has planned its march. That old phase must not process combat-position
    // as if it were the player's arrival destination on the next update.
    delete member.combatResume;
    const deployment=member.combatDeployment={targetId:target.id,group,angle,index:null,slot:null,anchor:{x:target.x,y:target.y},
      resume:{...member.task},marchPath:member.path.map(point=>({...point})),
      marchOrigin:{x:member.x,y:member.y,heading:member.heading},marchTopology:mission.nav.topologyRevision,retryAt:0,status:'reserve'};
    // A vehicle already in a sound firing position need not drive circles
    // merely to satisfy a formation template.
    const spec=mission.unitSpec(member);
    if(distance(member,target)<=spec.range&&mission.lineOfSight(member,target)){
      deployment.index='hold:'+member.id;deployment.slot=deployment.goal={x:member.x,y:member.y};deployment.status='arrived';
    }
    member.task={type:'combat-position',...(deployment.slot??{x:member.x,y:member.y})};member.path=[];resetMotion(member);
  }
  const moving=members.filter(member=>member.combatDeployment.status!=='arrived'),scale=mission.config.worldScale;
  const held=[...existing,...members].map(member=>member.combatDeployment.goal??member.combatDeployment.slot).filter(Boolean);
  const options=moving.map(member=>firingSlots(mission.unitSpec(member),scale,angle,target)),count=Math.max(0,...options.map(slots=>slots.length));
  const deployments=moving.map(member=>member.combatDeployment),costs=[];
  for(const [row,member] of moving.entries()){
    const values=[];costs.push(values);
    for(let index=0;index<count+moving.length;index++){
      if(index%8===0)yield;
      const point=options[row][index];values.push(point&&validPosition(mission,member,target,point,held)?slotCost(member,point,scale):1e8+index);
    }
  }
  const assignments=yield* assignFormationSteps(costs);
  for(const [row,index] of assignments.entries())if(index<count&&costs[row][index]<1e8&&moving[row].combatDeployment===deployments[row]&&!moving[row].pendingOrder){
    const member=moving[row],deployment=member.combatDeployment;
    deployment.index=index;deployment.slot=options[row][index];deployment.status='planning';
    member.task={type:'combat-position',...deployment.slot};
  }
  return true;
}
export function validPosition(mission,unit,target,point,reserved){
  const scale=mission.config.worldScale,spec=mission.unitSpec(unit);
  if(!mission.inBounds(point.x,point.y)||!mission.exploredAt(point.x,point.y)
    ||distance(point,target)>spec.range*.97||distance(point,target)<spec.range*.36
    ||reserved.some(other=>distance(point,other)<scale*5.3))return false;
  const pose={...unit,...point,heading:Math.atan2(point.x-target.x,target.y-point.y)};
  return mission.lineOfSight(pose,target)&&mission.vehicleMotionClear(unit,pose,pose);
}
// Pure proposal: no vehicle state is changed while the search is suspended.
// The dispatcher can run this outside the physical simulation step and
// recheck the endpoint against current reservations before publication.
export function* findFiringApproach(mission,unit,deployment,target){
  if(!deployment.slot)return null;
  const reserved=mission.state.units.filter(other=>other.id!==unit.id&&other.hp>0&&other.combatDeployment?.group===deployment.group)
    .map(other=>other.combatDeployment.goal??other.combatDeployment.slot).filter(Boolean);
  const scale=mission.config.worldScale,candidates=[{...deployment.slot}];
  for(const radius of [scale*5.5,scale*10])for(let sector=0;sector<8;sector++){
    const a=sector*Math.PI/4;candidates.push({x:deployment.slot.x+Math.cos(a)*radius,y:deployment.slot.y+Math.sin(a)*radius});
  }
  if(deployment.relocateAt)candidates.sort((a,b)=>slotCost(unit,a,scale)-slotCost(unit,b,scale));
  for(const goal of candidates){
    yield;
    if(!validPosition(mission,unit,target,goal,reserved))continue;
    const path=yield* mission.vehiclePathSteps(unit,goal,{fallback:false,maxGoalDistance:4});
    const end=path?.at(-1);
    if(end&&validPosition(mission,unit,target,end,reserved))return path;
  }
  return null;
}
function resumeMarch(mission,unit,all){
  const deployment=unit.combatDeployment;
  const members=all?mission.state.units.filter(other=>other.hp>0&&other.combatDeployment?.group===deployment.group
    &&other.combatDeployment.targetId===deployment.targetId):[unit];
  // Release the whole group before path searches: vehicles about to leave
  // must not be mistaken for permanent parked obstacles by the first search.
  for(const member of members){
    const previous=member.combatDeployment,resume=previous.resume;
    delete member.combatDeployment;resetMotion(member);member.path=[];
    member.task=resume.type==='attack'&&!mission.entity(resume.targetId)?null:resume;
    if(member.task?.type==='attack-move'){
      member.combatResume={group:deployment.group};
      if(member.routeOrder)member.routeOrder.destination={x:resume.x,y:resume.y};
      // Contact temporarily interrupts a march; it does not revoke its route
      // or arrival slot. Rejoin the retained route without another search.
      if(previous.marchTopology===mission.nav.topologyRevision&&previous.marchPath?.length){
        const path=commandPathFromLive(mission,member,previous.marchOrigin,previous.marchPath);
        if(path)applyMarchResume(mission,member,path);
      }
    }
  }
}
export function* findMarchResume(mission,unit){
  // The original command already owns this destination. Moving allies are
  // local traffic, just as for a new player command, not permanent A* walls.
  // Recomputing parking for the whole group here made every resuming car
  // wait for its neighbours to leave before any of them had a route.
  return yield* mission.vehiclePathSteps(unit,{x:unit.task.x,y:unit.task.y},
    {obstacles:mission.state.units.filter(other=>other.hp<=0||other.damage?.wreck),fallback:false,maxGoalDistance:.01});
}
export function applyMarchResume(mission,unit,path,conditions){
  if(!path?.length){
    unit.path=[];unit.driveSpeed=0;unit.combatResume.failedConditions=conditions;
    navigationDecision(unit,'BLOCKED','march-route-unavailable',null,'retry-on-obstacle-change');return false;
  }
  unit.path=path;Object.assign(unit.task,path.at(-1));
  if(unit.routeOrder)unit.routeOrder.destination={...path.at(-1)};
  delete unit.combatParking;
  delete unit.combatResume;return true;
}
export function* updateCombatDeployment(mission,unit,spec,dt){
  if(unit.owner!=='rai'||!unit.combatGroup)return false;
  if(checkedCycleActive(mission,unit)){
    const enemy=automaticCombatTarget(mission,unit,spec);if(enemy)mission.attack(unit,enemy,spec);
    yield* mission.moveSteps(unit,dt);return true;
  }
  if(unit.combatResume){
    const resume=unit.combatResume,task=unit.task;
    const enemy=automaticCombatTarget(mission,unit,spec);if(enemy)mission.attack(unit,enemy,spec);
    const conditions=combatPositionConditions(mission,unit,unit.task);
    if(unit.combatResume.failedConditions===conditions){
      navigationDecision(unit,'BLOCKED','march-route-unavailable',null,'retry-on-obstacle-change');return true;
    }
    navigationDecision(unit,'GLOBAL_REPLAN','resuming-march',null,'apply-route');
    if(mission.trafficCoordinator.requestMarchResume){
      mission.trafficCoordinator.requestMarchResume(mission,unit,conditions);return true;
    }
    const path=yield* findMarchResume(mission,unit);
    if(unit.combatResume!==resume||unit.task!==task||unit.pendingOrder)return true;
    if(!applyMarchResume(mission,unit,path,conditions))return true;
  }
  let deployment=unit.combatDeployment;
  if(!deployment){
    if(!combatTask(unit.task))return false;
    if(mission.state.time<(unit.combatContactAt??0))return false;
    unit.combatContactAt=mission.state.time+.25;
    const target=unit.task.type==='attack'?mission.entity(unit.task.targetId)
      :movementCombatTarget(mission,unit,{...spec,range:spec.vision});
    if(!target||!mission.visibleAt(target.x,target.y)||distance(unit,target)>spec.vision||!(yield* beginDeployment(mission,unit,target)))return false;
    deployment=unit.combatDeployment;
    if(!deployment||unit.pendingOrder)return true;
  }
  const target=mission.entity(deployment.targetId);
  // Existing saves may contain far-away members recruited by the former
  // group-wide contact radius. Release those cars back to their march too.
  if(target&&deployment.resume.type==='attack-move'&&distance(unit,target)>spec.vision){
    resumeMarch(mission,unit,false);
    return yield* updateCombatDeployment(mission,unit,spec,dt);
  }
  if(!target||target.hp<=0||!mission.visibleAt(target.x,target.y)
    ||deployment.resume.type==='attack-move'&&combatPolicy(unit).response==='ignore'){
    resumeMarch(mission,unit,!target||!mission.visibleAt(target.x,target.y));
    return yield* updateCombatDeployment(mission,unit,spec,dt);
  }
  const fireTarget=deployment.resume.type==='attack'?target:automaticCombatTarget(mission,unit,spec);
  if(fireTarget)mission.attack(unit,fireTarget,spec);
  if(unit.detour?.idleYield){
    yield* mission.moveSteps(unit,dt);
    if(deployment.status==='arrived'){
      deployment.slot=deployment.goal={x:unit.x,y:unit.y};unit.task={type:'combat-position',...deployment.goal};
    }
    return true;
  }
  const inFirePosition=fireTarget&&distance(unit,fireTarget)<=spec.range&&mission.lineOfSight(unit,fireTarget);
  if(!unit.path.length&&distance(deployment.anchor,target)>spec.range*.2){
    if(deployment.slot){deployment.slot.x+=target.x-deployment.anchor.x;deployment.slot.y+=target.y-deployment.anchor.y;}
    deployment.anchor={x:target.x,y:target.y};deployment.rejectedSlots=[];deployment.retryAt=0;delete deployment.conditions;
  }
  const stalled=(unit.driveWatch?.attempts??0)>0;
  if(stalled&&inFirePosition&&!unit.detour?.parking){
    deployment.slot=deployment.goal={x:unit.x,y:unit.y};deployment.status='arrived';
    unit.task={type:'combat-position',...deployment.goal};unit.path=[];resetMotion(unit);
  }else if((unit.driveWatch?.attempts??0)>=2&&!unit.detour&&mission.state.time>=(deployment.relocateAt??0)){
    // A feasible path endpoint can still be a poor approach for a car. After
    // failed local turns, seek a firing position near the actual vehicle.
    deployment.slot={x:unit.x,y:unit.y};deployment.relocateAt=mission.state.time+4;
    deployment.status='planning';deployment.retryAt=0;unit.path=[];resetMotion(unit);
  }
  // A finite firing frontage cannot hold a hundred overlapping hulls. The
  // reserve replaces losses/withdrawals instead of driving into occupied slots.
  if(deployment.status==='reserve'){
    unit.driveSpeed=0;
    const conditions=combatPositionConditions(mission,unit,deployment.anchor);
    if(deployment.conditions!==conditions){deployment.conditions=conditions;deployment.rejectedSlots=[];delete deployment.exhausted;}
    navigationDecision(unit,'WAITING_RESERVATION','no-free-firing-position',null,'retry-on-position-change');
    if(deployment.exhausted)return true;
    if(!(yield* reserveSlot(mission,unit,deployment))){if(unit.combatDeployment===deployment&&!unit.pendingOrder)deployment.exhausted=true;return true;}
    deployment.retryAt=0;
  }
  if(deployment.status==='arrived'&&distance(unit,target)<=spec.range&&mission.lineOfSight(unit,target)){
    navigationDecision(unit,'ARRIVED','firing-position',null,'engage-target');
    unit.driveSpeed=0;return true;
  }
  if(!unit.path.length){
    navigationDecision(unit,'LOCAL_REPLAN','seeking-firing-position',null,'check-approach');
    if(mission.trafficCoordinator.requestFiringApproach){
      mission.trafficCoordinator.requestFiringApproach(mission,unit,deployment,target);return true;
    }
    const reserved=mission.state.units.filter(other=>other!==unit&&other.hp>0&&other.combatDeployment?.group===deployment.group)
      .map(other=>other.combatDeployment.goal??other.combatDeployment.slot).filter(Boolean);
    const scale=mission.config.worldScale,candidates=[deployment.slot];
    for(const radius of [scale*5.5,scale*10])for(let sector=0;sector<8;sector++){
      const a=sector*Math.PI/4;candidates.push({x:deployment.slot.x+Math.cos(a)*radius,y:deployment.slot.y+Math.sin(a)*radius});
    }
    if(deployment.relocateAt)candidates.sort((a,b)=>slotCost(unit,a,scale)-slotCost(unit,b,scale));
    for(const goal of candidates){
      yield;
      if(unit.combatDeployment!==deployment||unit.pendingOrder)return true;
      if(!validPosition(mission,unit,target,goal,reserved))continue;
      const path=yield* mission.vehiclePathSteps(unit,goal,{fallback:false,maxGoalDistance:4});
      if(unit.combatDeployment!==deployment||unit.pendingOrder)return true;
      const end=path?.at(-1);if(!end||!validPosition(mission,unit,target,end,reserved))continue;
      unit.path=path;unit.task={type:'combat-position',...end};deployment.goal={...end};deployment.status='moving';break;
    }
    deployment.retryAt=mission.state.time;
    if(!unit.path.length){
      // Other members can settle beside their original slot and close this
      // approach. Release it and choose a feasible free part of the frontage.
      if(Number.isInteger(deployment.index)){
        const rejected=deployment.rejectedSlots??=[];
        if(!rejected.includes(deployment.index))rejected.push(deployment.index);
      }
      delete deployment.failedSlot;
      deployment.index=null;deployment.slot=null;deployment.goal=null;deployment.status='reserve';unit.driveSpeed=0;
      navigationDecision(unit,'BLOCKED','firing-approach-unavailable',null,'try-next-firing-position');
    }
  }
  if(unit.path.length)yield* mission.moveSteps(unit,dt);
  // The motion solver may accept a nearby parking point. Keep that accepted
  // destination instead of repeatedly driving back to the old exact slot.
  if(deployment.goal&&unit.task?.type==='combat-position'&&distance(unit.task,deployment.goal)>.01){
    deployment.slot=deployment.goal={x:unit.task.x,y:unit.task.y};
  }
  if(deployment.goal&&inFirePosition&&distance(unit,deployment.goal)<mission.config.worldScale*2.5&&!unit.detour){
    deployment.goal={x:unit.x,y:unit.y};unit.path=[];resetMotion(unit);
  }
  if(deployment.goal&&!unit.path.length&&distance(unit,deployment.goal)<8){deployment.status='arrived';unit.driveSpeed=0;}
  return true;
}

// A blocked parking slot is replanned as a real route, never completed by a
// timeout. Keep the search around the committed arrival area so successive
// attempts cannot walk the destination away from the player's order.
export function* updateCombatParking(mission,unit){
  const scale=mission.config.worldScale,now=mission.state.time;
  if(!unit.combatGroup||unit.task?.type!=='attack-move'||unit.passage||unit.combatResume||unit.combatDeployment)return;
  // A fresh player order already owns a feasible arrival slot. Use ordinary
  // exact-goal recovery for it, instead of creating an adaptive combat slot
  // merely because the order is named attack-move.
  if(unit.routeOrder&&!unit.combatParking)return;
  // Older saves and a march without a preceding encounter use the same
  // arrival contract once they enter the destination area.
  const parking=unit.combatParking??={anchor:{x:unit.task.x,y:unit.task.y},goal:{x:unit.task.x,y:unit.task.y},
    best:distance(unit,unit.task),progressAt:now,retryAt:0,failed:[]};
  const remaining=distance(unit,unit.task);
  if(distance(parking.goal,unit.task)>.01){parking.goal={x:unit.task.x,y:unit.task.y};parking.best=remaining;parking.progressAt=now;}
  if(mission.trafficCoordinator.queueing(unit)||unit.detour?.parking||unit.detour?.arrival||unit.traffic||unit.trafficHold){parking.best=remaining;parking.progressAt=now;return;}
  if(remaining<parking.best-scale*.75){parking.best=remaining;parking.progressAt=now;}
  const stopped=(unit.navigation?.waitSeconds??0)>.50001&&(unit.navigation?.speed??0)<.05;
  if(distance(unit,parking.anchor)>scale*18||!stopped&&(unit.driveWatch?.attempts??0)<2)return;
  const conditions=combatPositionConditions(mission,unit,parking.anchor);
  if(parking.failedConditions===conditions){navigationDecision(unit,'BLOCKED','arrival-space-unavailable',null,'retry-on-position-change');return;}
  navigationDecision(unit,'LOCAL_REPLAN','arrival-approach-blocked',null,'reserve-alternate-position');
  if(!parking.failed.some(goal=>distance(goal,parking.goal)<.01))parking.failed.push({...parking.goal});
  if(parking.failed.length>32)parking.failed.length=32;
  const reserved=mission.state.units.filter(other=>other!==unit&&other.hp>0&&other.combatGroup===unit.combatGroup)
    .map(other=>other.task?.type==='attack-move'?other.task:other);
  const allowed=point=>distance(point,parking.anchor)<=scale*14
    &&!parking.failed.some(goal=>distance(goal,point)<scale*2)
    &&mission.vehicleMotionClear(unit,{...unit,...point},{...unit,...point});
  // A free grid cell may require driving around the whole parked formation.
  // First seek a reachable nearby pose, then reserve that actual endpoint.
  // The manoeuvre must physically finish before arrival can be accepted.
  const sweep=(from,to)=>mission.vehicleMotionClear(unit,from,to);
  const legs=yield* mission.planManeuverSteps(unit,parking.anchor,{scale,allowed:sweep,attempts:2,maximumLegs:7,
    reverseBudget:Math.max(0,scale*4-(unit.reverseDebt??0)),accept:pose=>distance(unit,pose)>=scale*2.5
      &&allowed(pose)&&reserved.every(other=>distance(pose,other)>=scale*5.5)});
  if(unit.combatParking!==parking||unit.pendingOrder)return;
  if(legs){
    const end=checkManeuver(unit,legs,scale,sweep),goal={x:end.x,y:end.y};
    unit.path=[goal];Object.assign(unit.task,goal);
    if(unit.routeOrder)unit.routeOrder.destination={...goal};
    parking.goal=goal;parking.best=distance(unit,goal);parking.progressAt=now;
    unit.detour={legs,arrival:true,blocked:0};delete unit.driveWatch;delete unit.failedArcs;
    return;
  }
  const path=yield* mission.movePathSteps(unit,parking.anchor,reserved,scale*14,false,allowed,
    {fallback:false,maxGoalDistance:4,compareDetours:true});
  if(unit.combatParking!==parking||unit.pendingOrder)return;
  if(!path?.length){parking.failedConditions=conditions;navigationDecision(unit,'BLOCKED','arrival-space-unavailable',null,'retry-on-position-change');return;}
  unit.path=path;Object.assign(unit.task,path.at(-1));
  if(unit.routeOrder)unit.routeOrder.destination={...path.at(-1)};
  parking.goal={...path.at(-1)};parking.best=distance(unit,parking.goal);parking.progressAt=now;
  delete unit.detour;delete unit.driveWatch;delete unit.failedArcs;
}
