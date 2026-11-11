export const canAutoRetreat=spec=>!!spec&&(spec.damage>0||spec.role==='builder');

export function shouldAutoRetreat(unit,spec){
 const threshold={light:.8,heavy:.35}[unit.combatPolicy?.retreat];
 return unit.owner==='rai'&&unit.hp>0&&canAutoRetreat(spec)&&!!threshold&&!unit.retreatSuppressed
  &&unit.hp<=unit.maxHp*threshold;
}

// Crossing the damage threshold during repair does not finish the visit.
// This status describes repair ownership, not permission for manual control.
// Crossing the HP threshold alone is not an owned repair transaction yet:
// an explicit order arriving before auto-retreat starts must still be accepted.
export function isAutomaticRepair(unit,spec){
 return !!unit&&unit.owner==='rai'&&unit.hp>0&&(!!unit.factoryVisit||unit.hp<unit.maxHp&&!unit.combatRetreat?.forced
  &&!!unit.combatRetreat);
}

// Only the physical doorway/interior transfer owns a pose hidden inside the
// building. Approaching and waiting outside remain directly controllable.
export const inFactoryInterior=unit=>['entering','inside','leaving'].includes(unit?.factoryVisit?.phase);
