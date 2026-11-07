import {checkManeuver} from './vehicle-motion.js';
import {vehicleSweep} from './vehicle-collision.js';

// A turning rear corner can hit a neighbour which is behind the centre's
// forward corridor. Probe only the current Ackermann arc up to the braking
// distance; this is a bounded collision query, not a path/recovery search.
export function turningHeadway(mission,unit,point,dt,scale,blockers,grade=.52){
 const angle=Math.atan2(Math.sin(Math.atan2(unit.x-point.x,point.y-unit.y)-unit.heading),
  Math.cos(Math.atan2(unit.x-point.x,point.y-unit.y)-unit.heading));
 const speed=(unit.reversing?0:unit.driveSpeed??0)+14*dt;
 const horizon=Math.min(Math.hypot(point.x-unit.x,point.y-unit.y),speed*speed/44+dt*speed);
 if(horizon<.001)return Infinity;
 const radius=horizon+scale*4;
 if(!mission.nearbyUnits(unit,radius).some(other=>other!==unit&&other.hp>0)
  &&!mission.nav.nearbySolids(unit,radius).length)return Infinity;
 const curve=Math.tan(Math.max(-.67,Math.min(.67,angle*1.55)));
 let clearDistance=0,terrainOnly=false;
 const safe=checkManeuver(unit,[{direction:1,curve,remaining:horizon}],scale,(from,to)=>{
  const hit=new Set();
  if(!mission.vehicleMotionClear(unit,from,to,grade,hit)){
   for(const other of hit)blockers?.add(other);
   const solids=mission.nav.nearbySolids(to,scale*4.8);
   const solid=solids.length&&!mission.nav.clearSolidSweep(vehicleSweep(from,to,scale,mission.field),solids);
   // driveStep can choose a different checked steering arc when the desired
   // arc meets terrain. A zero speed here would prevent it trying that arc.
   terrainOnly=!hit.size&&!solid;return false;
  }
  clearDistance+=Math.hypot(to.x-from.x,to.y-from.y);return true;
 });
 if(safe||terrainOnly)return Infinity;
 const reaction=22*dt;
 return Math.max(0,Math.sqrt(44*Math.max(0,clearDistance-.02)+reaction*reaction)-reaction);
}
