import {automaticCombatTarget,combatPolicy} from './combat-policy.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const combatTask=task=>['attack','attack-move'].includes(task?.type);
const resetMotion=unit=>{
  for(const key of ['passage','detour','traffic','trafficHold','passingLane','driveWatch','failedArcs','reverseDebt'])delete unit[key];
};
export function cancelCombatDeployment(unit){delete unit.combatDeployment;delete unit.combatGroup;delete unit.combatContactAt;}
function firingSlots(spec,scale,angle,anchor){
  const spacing=scale*7,slots=[];
  for(let radius=spec.range*.78;radius>=spec.range*.38;radius-=spacing){
    const columns=Math.max(2,Math.floor(radius*2.2/spacing/2)*2);
    for(let column=0;column<columns;column++){
      const offset=(column%2?1:-1)*(Math.floor(column/2)+.5)*spacing/radius;
      slots.push({x:anchor.x+Math.cos(angle+offset)*radius,y:anchor.y+Math.sin(angle+offset)*radius});
    }
  }
  return slots;
}
function reserveSlot(mission,unit,deployment){
  const occupied=new Set(mission.state.units.filter(other=>other!==unit&&other.hp>0&&other.combatDeployment?.group===deployment.group)
    .map(other=>other.combatDeployment.index));
  const slots=firingSlots(mission.unitSpec(unit),mission.config.worldScale,deployment.angle,deployment.anchor);
  const index=slots.findIndex((_,index)=>!occupied.has(index));
  if(index<0)return false;
  deployment.index=index;deployment.slot=slots[index];deployment.status='planning';return true;
}

// One contact turns a marching group into reserved firing positions. The state
// is serializable; searches yield through the existing simulation budget.
function beginDeployment(mission,unit,target){
  const members=mission.state.units.filter(other=>other.owner===unit.owner&&other.hp>0
    &&other.combatGroup===unit.combatGroup&&combatTask(other.task)&&!other.combatRetreat&&!other.combatDeployment
    &&(other.task.type==='attack'||combatPolicy(other).response!=='ignore')
    &&distance(other,unit)<mission.unitSpec(unit).vision*3)
    .sort((a,b)=>distance(a,target)-distance(b,target)||a.id.localeCompare(b.id)).slice(0,100);
  if(members.length<2)return false;
  const angle=Math.atan2(unit.y-target.y,unit.x-target.x);
  const group=unit.combatGroup;
  for(const member of members){
    const deployment=member.combatDeployment={targetId:target.id,group,angle,index:null,slot:null,anchor:{x:target.x,y:target.y},
      resume:{...member.task},retryAt:0,status:'reserve'};
    reserveSlot(mission,member,deployment);
    member.task={type:'combat-position',...(deployment.slot??{x:member.x,y:member.y})};member.path=[];resetMotion(member);
  }
  return true;
}
function validPosition(mission,unit,target,point,reserved){
  const scale=mission.config.worldScale,spec=mission.unitSpec(unit);
  if(!mission.inBounds(point.x,point.y)||!mission.exploredAt(point.x,point.y)
    ||distance(point,target)>spec.range*.97||distance(point,target)<spec.range*.36
    ||reserved.some(other=>distance(point,other)<scale*5.3))return false;
  const pose={...unit,...point,heading:Math.atan2(point.x-target.x,target.y-point.y)};
  return mission.lineOfSight(pose,target)&&mission.vehicleMotionClear(unit,pose,pose);
}
export function* updateCombatDeployment(mission,unit,spec,dt){
  if(unit.owner!=='rai'||!unit.combatGroup)return false;
  let deployment=unit.combatDeployment;
  if(!deployment){
    if(!combatTask(unit.task))return false;
    if(mission.state.time<(unit.combatContactAt??0))return false;
    unit.combatContactAt=mission.state.time+.25;
    const target=unit.task.type==='attack'?mission.entity(unit.task.targetId)
      :automaticCombatTarget(mission,unit,{...spec,range:spec.vision});
    if(!target||!mission.visibleAt(target.x,target.y)||distance(unit,target)>spec.vision||!beginDeployment(mission,unit,target))return false;
    deployment=unit.combatDeployment;
  }
  const target=mission.entity(deployment.targetId);
  if(!target||target.hp<=0||!mission.visibleAt(target.x,target.y)
    ||deployment.resume.type==='attack-move'&&combatPolicy(unit).response==='ignore'){
    const resume=deployment.resume;delete unit.combatDeployment;resetMotion(unit);unit.path=[];
    unit.task=resume.type==='attack'&&!target?null:resume;
    if(unit.task?.type==='attack-move')unit.path=(yield* mission.vehiclePathSteps(unit,unit.task))??[];
    return false;
  }
  const fireTarget=deployment.resume.type==='attack'?target:automaticCombatTarget(mission,unit,spec);
  if(fireTarget)mission.attack(unit,fireTarget,spec);
  // A finite firing frontage cannot hold a hundred overlapping hulls. The
  // reserve replaces losses/withdrawals instead of driving into occupied slots.
  if(deployment.status==='reserve'){
    unit.driveSpeed=0;
    if(mission.state.time<deployment.retryAt)return true;
    deployment.retryAt=mission.state.time+2;
    if(!reserveSlot(mission,unit,deployment))return true;
    deployment.retryAt=0;
  }
  if(deployment.status==='arrived'&&distance(unit,target)<=spec.range&&mission.lineOfSight(unit,target)){
    unit.driveSpeed=0;return true;
  }
  if(!unit.path.length&&mission.state.time>=deployment.retryAt){
    const moved=distance(deployment.anchor,target);
    if(moved>spec.range*.2){
      deployment.slot.x+=target.x-deployment.anchor.x;deployment.slot.y+=target.y-deployment.anchor.y;
      deployment.anchor={x:target.x,y:target.y};
    }
    const reserved=mission.state.units.filter(other=>other!==unit&&other.hp>0&&other.combatDeployment?.group===deployment.group)
      .map(other=>other.combatDeployment.goal??other.combatDeployment.slot).filter(Boolean);
    const scale=mission.config.worldScale,candidates=[deployment.slot];
    for(const radius of [scale*5.5,scale*10])for(let sector=0;sector<8;sector++){
      const a=sector*Math.PI/4;candidates.push({x:deployment.slot.x+Math.cos(a)*radius,y:deployment.slot.y+Math.sin(a)*radius});
    }
    for(const goal of candidates){
      yield;
      if(!validPosition(mission,unit,target,goal,reserved))continue;
      const path=yield* mission.vehiclePathSteps(unit,goal,{fallback:false,maxGoalDistance:4});
      const end=path?.at(-1);if(!end||!validPosition(mission,unit,target,end,reserved))continue;
      unit.path=path;unit.task={type:'combat-position',...end};deployment.goal={...end};deployment.status='moving';break;
    }
    deployment.retryAt=mission.state.time+2;
    if(!unit.path.length){deployment.status='blocked';unit.driveSpeed=0;}
  }
  if(unit.path.length)yield* mission.moveSteps(unit,dt);
  if(deployment.goal&&!unit.path.length&&distance(unit,deployment.goal)<8){deployment.status='arrived';unit.driveSpeed=0;}
  return true;
}
