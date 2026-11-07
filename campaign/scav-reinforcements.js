const waveLimit = 4;
const retrySeconds = 8;
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);

function campAxes(camp) {
  const length=distance(camp,camp.gate)||1;
  return {x:(camp.gate.x-camp.x)/length,y:(camp.gate.y-camp.y)/length};
}

function offset(origin,axis,along,across) {
  return {x:origin.x+axis.x*along-axis.y*across,y:origin.y+axis.y*along+axis.x*across};
}

function freePose(mission,kind,point,heading,reserved) {
  const spacing=mission.config.worldScale*8;
  if(reserved.some(other=>distance(other,point)<spacing))return null;
  const pose={x:point.x,y:point.y,heading,kind,owner:'scavs'};
  return mission.vehicleMotionClear(pose,pose,pose)?pose:null;
}

export function placeExtraCampGuards(mission) {
  const bounds=mission.nav.bounds;
  mission.nav.bounds=mission.config.finalMapBounds??bounds;
  try {
    for(const camp of mission.state.camps){
      const axis=campAxes(camp),guard={...camp.gate},reserved=[];
      for(const type of camp.extraGuards??[]){
        const kind=mission.config.units[type]?type:'raider';
        let placed=false;
        for(const along of [-24,12,-60,42]){
          for(const across of [-45,45,-67,67]){
            const sample=offset(guard,axis,along,across);
            const point=mission.nav.nearest(sample.x,sample.y,2);
            if(!point||mission.visibleAt(point.x,point.y))continue;
            const heading=Math.atan2(point.x-guard.x,guard.y-point.y);
            const pose=freePose(mission,kind,point,heading,reserved);
            if(!pose)continue;
            mission.addUnit(kind,'scavs',pose,{heading,campId:camp.id,guard});
            reserved.push(pose);
            placed=true;
            break;
          }
          if(placed)break;
        }
      }
    }
  } finally {
    mission.nav.bounds=bounds;
  }
}

function planSquad(mission,camp,types) {
  const axis=campAxes(camp),squad=[];
  for(const [index,type] of types.entries()){
    const kind=mission.config.units[type]?type:'raider';
    const flank=index%2?1:-1;
    const target=offset(camp.gate,axis,12,flank*26);
    const rally=mission.nav.nearest(target.x,target.y,2);
    if(!rally)return null;
    let member;
    for(const behind of [72,104,136]){
      for(const across of [36,-36,64,-64,0]){
        const sample=offset(camp,axis,-behind,flank*across);
        const point=mission.nav.nearest(sample.x,sample.y,2);
        if(!point||mission.visibleAt(point.x,point.y)||distance(point,rally)<42)continue;
        const initialHeading=Math.atan2(point.x-rally.x,rally.y-point.y);
        if(!freePose(mission,kind,point,initialHeading,squad))continue;
        const path=mission.nav.findPath(point,rally,{maxGoalDistance:1});
        if(!path?.length)continue;
        const heading=Math.atan2(point.x-path[0].x,path[0].y-point.y);
        const pose=freePose(mission,kind,point,heading,squad);
        if(!pose)continue;
        member={...pose,path,rally};
        break;
      }
      if(member)break;
    }
    if(!member)return null;
    squad.push(member);
  }
  return squad;
}

export function updateScavReinforcements(mission) {
  const {state}=mission;
  for(const {id,wave} of mission.config.camps){
    if(!wave?.units.length)continue;
    const camp=state.camps.find(item=>item.id===id);
    if(!camp||camp.cleared||!mission.inBounds(camp.x,camp.y))continue;
    const core=state.buildings.find(item=>item.campId===id&&item.kind==='camp-core'&&item.hp>0);
    if(!core)continue;
    if(camp.nextWaveAt===undefined){
      if(mission.exploredAt(camp.x,camp.y)||mission.exploredAt(camp.gate.x,camp.gate.y))camp.nextWaveAt=state.time+wave.seconds;
      continue;
    }
    if(state.time<camp.nextWaveAt)continue;
    const active=state.units.filter(unit=>unit.campId===id&&unit.reinforcement&&unit.hp>0).length;
    const squad=active+wave.units.length<=waveLimit&&planSquad(mission,camp,wave.units);
    camp.nextWaveAt=state.time+(squad?wave.seconds:retrySeconds);
    if(!squad)continue;
    for(const {kind,x,y,heading,path,rally} of squad){
      mission.addUnit(kind,'scavs',{x,y},{heading,path,campId:id,reinforcement:true,guard:{...camp.gate},
        task:{type:'move',x:rally.x,y:rally.y}});
    }
    mission.emit('scav-reinforcements',{camp:id,count:squad.length});
  }
}
