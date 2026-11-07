const threat = ({x, y}, label, distance) => ({x, y, label, distance, kind:'threat'});

export function visibleRaidContact(mission) {
  const {flags, units} = mission.state;
  if (!flags.raidStarted || flags.raidWon) return null;
  return units.find(unit => flags.raidIds?.includes(unit.id) && unit.hp > 0 && mission.visibleAt(unit.x, unit.y));
}

export function raidApproachSignal(mission) {
  const {config, field, state} = mission;
  if (!state.flags.contact || state.flags.raidWon || !config.raidApproachGrid) return null;
  const point = field.gridToWorld(config.raidApproachGrid);
  return mission.exploredAt(point.x, point.y) ? threat(point, 'К въезду', 420) : null;
}

export function waterTower(mission) {
  const campId = mission.state.camps[2]?.id;
  if (!campId) return null;
  return mission.state.buildings.find(b => b.campId === campId && b.kind === 'mg-tower' && b.hp > 0);
}

export function waterTowerSignal(mission) {
  const tower = waterTower(mission);
  return mission.state.flags.thirdSighted && tower && mission.exploredAt(tower.x, tower.y)
    ? threat(tower, 'К башне', 440) : null;
}
