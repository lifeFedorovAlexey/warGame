// Simulation time, including saves. Rendering/visibility never extend a corpse's life.
export const WRECK_LIMITS={vehicleSeconds:12,buildingSeconds:6,vehicles:64,buildings:32};
export function scheduleWreck(mission,entity){
  if(entity.hp>0)return;
  entity.destroyedAt??=mission.state.time;
  entity.removeAt??=entity.destroyedAt+(mission.config.units[entity.kind]?WRECK_LIMITS.vehicleSeconds:WRECK_LIMITS.buildingSeconds);
}
export function updateWrecks(mission){
  let removed=false;
  for(const [key,limit] of [['units',WRECK_LIMITS.vehicles],['buildings',WRECK_LIMITS.buildings]]){
    const list=mission.state[key],dead=list.filter(e=>e.hp<=0);
    for(const entity of dead)scheduleWreck(mission,entity);
    const excess=new Set(dead.slice().sort((a,b)=>a.destroyedAt-b.destroyedAt).slice(0,Math.max(0,dead.length-limit)));
    const keep=list.filter(e=>e.hp>0||e.removeAt>mission.state.time&&!excess.has(e));
    if(keep.length!==list.length){mission.state[key]=keep;removed=true;}
  }
  if(removed)mission.navigationDirty=true;
  return removed;
}
