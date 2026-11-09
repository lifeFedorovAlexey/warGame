export const isCampPerimeter = entity => entity.kind === 'scav-fence' || entity.kind === 'scav-gate';

// Losing the buildings collapses this camp's perimeter, independently of any
// surviving troops. Dead structures may already have left the wreck pool.
export function updateCampPerimeters(mission) {
  const camps = new Map(mission.state.camps.map(camp => [camp.id, {walls:[], buildings:false}]));
  for (const building of mission.state.buildings) {
    if (building.owner !== 'scavs' || building.hp <= 0) continue;
    const camp = camps.get(building.campId);
    if (!camp) continue;
    if (isCampPerimeter(building)) camp.walls.push(building);
    else camp.buildings = true;
  }
  const time = mission.state.time;
  for (const camp of camps.values()) {
    if (camp.buildings) continue;
    for (const [index, wall] of camp.walls.entries()) {
      // A short chain of ordinary wreck explosions, saved in simulation time.
      wall.campDemolitionAt ??= time + index * .06;
      if (time + 1e-6 >= wall.campDemolitionAt) mission.damage(wall, wall.hp);
    }
  }
}
