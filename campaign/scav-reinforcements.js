import {updateScavProduction} from './scav-production.js';
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

export const updateScavReinforcements = updateScavProduction;
