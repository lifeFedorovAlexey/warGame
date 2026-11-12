export const canAutoRetreat=spec=>!!spec&&(spec.damage>0||spec.role==='builder');

export function retreatThresholdReached(unit,spec){
 const threshold={light:.8,heavy:.35}[unit.combatPolicy?.retreat];
 return unit.owner==='rai'&&unit.hp>0&&canAutoRetreat(spec)&&!!threshold
  &&unit.hp<=unit.maxHp*threshold;
}
export const shouldAutoRetreat=(unit,spec)=>!unit.retreatSuppressed&&retreatThresholdReached(unit,spec);

// A manual ground move can override withdrawal. That exception is not a
// permission for a later attack to recall an under-threshold repair vehicle.
export const canReceiveAttack=(unit,spec)=>unit.hp>0&&!retreatThresholdReached(unit,spec)
 &&!inFactoryInterior(unit)&&!isAutomaticRepair(unit,spec);

// Crossing the damage threshold during repair does not finish the visit.
// This status describes repair ownership, not permission for manual control.
// Crossing the HP threshold alone is not an owned repair transaction yet:
// a manual move arriving before auto-retreat starts must still be accepted.
export function isAutomaticRepair(unit,spec){
 return !!unit&&unit.owner==='rai'&&unit.hp>0&&(!!unit.factoryVisit||unit.hp<unit.maxHp&&!unit.combatRetreat?.forced
  &&!!unit.combatRetreat);
}

// Only the physical doorway/interior transfer owns a pose hidden inside the
// building. Approaching and waiting outside remain directly controllable.
export const inFactoryInterior=unit=>['entering','inside','leaving'].includes(unit?.factoryVisit?.phase);
