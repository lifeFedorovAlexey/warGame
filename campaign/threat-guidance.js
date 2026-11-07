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

export function southernApproachSignal(mission) {
  const {state,config,field}=mission;
  if(!state.flags.lastRevealed||state.camps[3]?.cleared)return null;
  const {approachGrid,approachRoad}=config.camps[3]??{};
  if(!approachGrid)return null;
  const rally=field.gridToWorld(approachGrid);
  const known=point=>mission.inBounds(point.x,point.y)&&mission.exploredAt(point.x,point.y);
  if(known(rally))return {...rally,kind:'intel',label:'К точке сбора',distance:440};

  const paths=field.roadNetwork?.paths??[];
  for(let i=(approachRoad?.length??0)-1;i>0;i--){
    const from=approachRoad[i-1],to=approachRoad[i];
    const path=paths.find(road=>road.from===from&&road.to===to||road.from===to&&road.to===from);
    if(!path)continue;
    const {points}=path,forward=path.from===from;
    const pointAt=index=>points[forward?index:points.length-1-index];
    let end=points.length-1;
    if(i===approachRoad.length-1){
      let nearest=Infinity;
      for(let index=0;index<points.length;index++){
        const point=pointAt(index),distance=Math.hypot(point.x-rally.x,point.y-rally.y);
        if(distance<nearest){nearest=distance;end=index;}
      }
    }
    for(let index=end;index>=0;index--){
      const point=pointAt(index);
      if(known(point))return {x:point.x,y:point.y,kind:'recon',label:'К южному шоссе',distance:590};
    }
  }
  return null;
}
