import {updateWrecks} from './wreck-lifecycle.js';

export const isCampPerimeter = entity => entity.kind === 'scav-fence' || entity.kind === 'scav-gate';

// One rule for every base: living hostile buildings hold the perimeter.
// Troops, captured buildings and already removed wrecks do not.
function demolitionGroups(mission) {
  const s=mission.state,bases=s.m02?.bases??{};
  const camps=new Map([...s.camps,...Object.values(bases)].map(base=>[base.id,{walls:[],buildings:false}]));
  for(const building of s.buildings){
    if(building.owner!=='scavs'||building.hp<=0)continue;
    const id=bases[building.m02Base]?.id??building.campId,camp=camps.get(id);
    if(!camp)continue;
    if(isCampPerimeter(building))camp.walls.push(building);
    else camp.buildings=true;
  }
  return [...camps.values()].filter(camp=>!camp.buildings&&camp.walls.length);
}

export const hasPendingCampDemolition = mission => demolitionGroups(mission).length>0;

// Victory freezes combat/production, but finishes the already earned collapse.
// Saved simulation timestamps are used before and after loading.
export function advanceCampDemolition(mission,seconds) {
  if(mission.state.status!=='victory'||!(seconds>0)||!hasPendingCampDemolition(mission))return 0;
  updateCampPerimeters(mission);
  let ticks=0;
  while(seconds>1e-8&&hasPendingCampDemolition(mission)){
    const dt=Math.min(seconds,mission.config.simulationStep);
    mission.state.time+=dt;seconds-=dt;ticks++;
    updateCampPerimeters(mission);updateWrecks(mission);
  }
  if(mission.navigationDirty)mission.rebuildNavigation();
  return ticks;
}

export function updateCampPerimeters(mission) {
  const time=mission.state.time;
  for(const camp of demolitionGroups(mission)){
    for(const [index,wall] of camp.walls.entries()){
      // A saved deadline prevents restarting the chain after loading.
      wall.campDemolitionAt??=time+index*.06;
      if(time+1e-6>=wall.campDemolitionAt)mission.damage(wall,wall.hp);
    }
  }
}
