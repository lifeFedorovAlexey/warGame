import {canReceiveAttack} from './combat-retreat-state.js';

// Mass selection follows combat availability without cancelling any orders or
// recalling a repair visitor. Manual selection still permits ground movement.
export function armySelectionIds(mission){
 return mission.state.units.filter(unit=>{
  if(unit.owner!=='rai'||unit.hp<=0)return false;
  const spec=mission.unitSpec(unit);
  if(!spec||spec.role==='builder'||!(spec.damage>0||spec.role==='combat'||spec.role==='command'))return false;
  if(unit.factoryVisit||unit.combatRetreat&&unit.combatRetreat.service!=='complete')return false;
  return canReceiveAttack(unit,spec);
 }).map(unit=>unit.id);
}
