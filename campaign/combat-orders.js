import {automaticCombatTarget} from './combat-policy.js';

// A fresh ground attack order during an engagement is a position change.
// Keep firing at the old contacts, but do not let them immediately cancel
// that move by reserving the exact firing positions the player just left.
// New contacts still interrupt an attack-move normally. IDs are save data;
// no timer or camera-dependent state controls the player's order.
export function* interruptedCombatTargets(mission,units){
 const ids=new Set();
 for(const [index,unit] of units.entries()){
  if(index%8===0||performance.now()>=(mission.nav.workDeadline??Infinity))yield;
  for(const id of unit.combatDisengage??[])ids.add(id);
  const explicit=unit.combatDeployment?.targetId??(unit.task?.type==='attack'?unit.task.targetId:null);
  if(explicit)ids.add(explicit);
  const target=automaticCombatTarget(mission,unit,mission.unitSpec(unit));
  if(target)ids.add(target.id);
 }
 return [...ids];
}

export function movementCombatTarget(mission,unit,spec){
 if(unit.combatDisengage){
  const goal=unit.routeOrder?.destination??unit.task;
  if(!unit.path.length&&goal&&Math.hypot(unit.x-goal.x,unit.y-goal.y)<2)delete unit.combatDisengage;
  else{
   unit.combatDisengage=unit.combatDisengage.filter(id=>{
    const target=mission.entity(id);
    return target?.hp>0&&Math.hypot(unit.x-target.x,unit.y-target.y)<=spec.vision;
   });
   if(!unit.combatDisengage.length)delete unit.combatDisengage;
  }
 }
 return automaticCombatTarget(mission,unit,spec,unit.combatDisengage);
}
