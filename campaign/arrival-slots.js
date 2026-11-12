import {vehicleClearance,vehicleObstacle,vehicleRadiusBound} from './vehicle-collision.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

// Temporary passing permission is not permission to park inside a neighbour.
export function unoccupiedArrival(m,unit,point){
  const scale=m.config.worldScale,pose={...unit,...point},radius=vehicleRadiusBound(unit.kind,scale)+scale*10;
  return m.nearbyUnits(pose,radius).every(other=>other.id===unit.id||!vehicleObstacle(other)
    ||distance(other,pose)>radius||vehicleClearance(pose,other,scale,m.field)>scale*.055);
}

// A reservation is protected on the final approach. Otherwise the physically
// nearer arrival can take it. Neither speed nor predicted arrival time decides.
export function canFillBefore(unit,owner,point,scale){
  return distance(owner,point)>Math.max(scale*7,distance(unit,point)+scale*2);
}

// Retain all accepted route segments before the new destination's closest
// projection. Check just the new connector, not a new route for every member.
export function reuseArrivalPath(m,unit,goal,scale){
  const points=[unit,...unit.path];let nearest=null;
  for(let index=0;index<points.length-1;index++){
    const a=points[index],b=points[index+1],dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
    const t=length?Math.max(0,Math.min(1,((goal.x-a.x)*dx+(goal.y-a.y)*dy)/length)):0;
    const point={x:a.x+t*dx,y:a.y+t*dy},d=distance(point,goal);
    if(!nearest||d<nearest.distance)nearest={index,point,distance:d,heading:Math.atan2(-dx,dy)};
  }
  if(nearest&&nearest.distance<=scale*7){
    const from={...unit,...nearest.point,heading:nearest.heading},to={...from,...goal};
    if(m.vehicleTerrainSweep(unit,from,to)!==false){
      const path=unit.path.slice(0,nearest.index);
      if(distance(path.at(-1)??unit,nearest.point)>.1&&distance(nearest.point,goal)>.1)path.push(nearest.point);
      path.push({...goal});return path;
    }
  }
  if(!unit.path.length&&m.vehicleTerrainSweep(unit,unit,{...unit,...goal})!==false)return [{...goal}];
  return null;
}
