// Enemy contacts are observations, not a view of the player's fog or live
// coordinates of an unseen target. Shared alerts retain their original time.
const memorySeconds=8;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const snapshot=(mission,target)=>({id:target.id,kind:target.kind,x:target.x,y:target.y,time:mission.state.time});
const allowedContact=(mission,unit,point,spec)=>mission.inBounds(point.x,point.y)
  &&(unit.raid||!unit.guard||distance(unit.guard,point)<=Math.max(280,spec.vision*2));

export function alertScavs(mission,victim,attacker){
  if(victim.owner!=='scavs'||!attacker?.id||attacker.owner!=='rai')return;
  const contact=snapshot(mission,attacker);
  for(const unit of mission.state.units){
    if(unit.owner!=='scavs'||unit.hp<=0||!mission.inBounds(unit.x,unit.y))continue;
    const direct=unit===victim,spec=mission.unitSpec(unit);
    if(!spec.damage||!allowedContact(mission,unit,contact,spec))continue;
    if(unit.raidReserve&&!direct)continue;
    const sameCamp=unit.campId&&unit.campId===victim.campId;
    if(!direct&&distance(unit,victim)>(sameCamp?spec.vision*2:spec.vision))continue;
    unit.scavContact={...contact};
    if(direct)unit.raidReserve=false;
  }
}

function resumeOrder(unit){
  if(unit.task?.type==='attack'||unit.task?.type==='scav-search'){
    unit.task=unit.scavResumeTask??null;unit.path=[];
    delete unit.scavResumeTask;
  }
}

export function* updateScavCombat(mission,unit,spec,dt){
  if(unit.owner!=='scavs')return false;
  if(unit.raidReserve||!mission.inBounds(unit.x,unit.y))return true;
  if(!spec.damage)return false;
  const now=mission.state.time;
  const visible=target=>mission.enemyOf(unit,target)&&allowedContact(mission,unit,target,spec)
    &&distance(unit,target)<=spec.vision&&mission.lineOfSight(unit,target);
  const previous=unit.scavContact&&mission.entity(unit.scavContact.id);
  const target=previous&&visible(previous)?previous:mission.nearestEnemy(unit,spec.vision,visible);
  if(target){
    unit.scavContact=snapshot(mission,target);
    if(now-(unit.scavAlertAt??-Infinity)>=1){alertScavs(mission,unit,target);unit.scavAlertAt=now;}
  }else if(unit.scavContact&&(now-unit.scavContact.time>memorySeconds||!previous||previous.hp<=0)){
    delete unit.scavContact;
  }
  const contact=unit.scavContact;
  if(contact&&allowedContact(mission,unit,contact,spec)){
    if(unit.guard&&!unit.raid)unit.scavHome??={x:unit.x,y:unit.y};
    if(['move','attack-move'].includes(unit.task?.type)&&!unit.scavResumeTask)unit.scavResumeTask={...unit.task};
    if(target){
      unit.task={type:'attack',targetId:target.id};
      if(distance(unit,target)<=spec.range&&mission.lineOfSight(unit,target)){
        unit.path=[];unit.driveSpeed=0;unit.steering=(unit.steering??0)*.68;
        mission.attack(unit,target,spec);return true;
      }
      if(now-(unit.scavRepathAt??-Infinity)>=1.2){
        const path=yield* mission.attackPathSteps(unit,target);
        if(path)unit.path=path;
        unit.scavRepathAt=now;
      }
    }else{
      // Search the last reported position, never chase its unseen replacement.
      unit.task={type:'scav-search',x:contact.x,y:contact.y};
      if(distance(unit,contact)<18){unit.path=[];unit.driveSpeed=0;return true;}
      if(now-(unit.scavRepathAt??-Infinity)>=1.2){
        const path=yield* mission.vehiclePathSteps(unit,contact,{maxGoalDistance:16});
        if(path)unit.path=path;
        unit.scavRepathAt=now;
      }
    }
    yield* mission.moveSteps(unit,dt);
    // A short-range unit can fire as soon as its approach enters range.
    if(target)mission.attack(unit,target,spec);
    return true;
  }
  delete unit.scavContact;resumeOrder(unit);
  if(unit.task&&unit.task.type!=='scav-return')return false;
  if(unit.scavHome&&!unit.raid&&distance(unit,unit.scavHome)>14){
    unit.task={type:'scav-return',x:unit.scavHome.x,y:unit.scavHome.y};
    if(now-(unit.scavRepathAt??-Infinity)>=2){
      const path=yield* mission.vehiclePathSteps(unit,unit.scavHome,{maxGoalDistance:16});
      if(path)unit.path=path;
      unit.scavRepathAt=now;
    }
    yield* mission.moveSteps(unit,dt);return true;
  }
  if(unit.task?.type==='scav-return'){unit.task=null;unit.path=[];unit.driveSpeed=0;}
  return false;
}
