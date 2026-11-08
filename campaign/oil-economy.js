// The energy/energyRate save fields remain compatible with existing campaigns;
// their amounts represent stored oil and oil extraction, not electricity.
export function oilPowerStatus(state, config) {
  const ready = state.buildings.filter(b => b.owner === 'rai' && b.hp > 0 && b.completed);
  const stations = ready.filter(b => b.kind === 'generator');
  const wells = ready.filter(b => b.kind === 'derrick').length;
  const perStation = config.buildings.generator.oilSlots ?? 4;
  const capacity = stations.length * perStation;
  return {stations:stations.length, wells, capacity, connected:Math.min(wells,capacity), unpowered:Math.max(0,wells-capacity), perStation};
}
