import {checkManeuver} from './vehicle-motion.js';
import {vehicleSweep} from './vehicle-collision.js';
import {vehicleDynamics} from './vehicle-dynamics.js';
import {maneuverAdmissionBlocker} from './maneuver-admission.js';

// A turning rear corner can hit a neighbour which is behind the centre's
// forward corridor. Probe only the current Ackermann arc up to the braking
// distance; this is a bounded collision query, not a path/recovery search.
export function turningHeadway(mission,unit,point,dt,scale,blockers,grade=.52,actualCurve){
 const angle=Math.atan2(Math.sin(Math.atan2(unit.x-point.x,point.y-unit.y)-unit.heading),
  Math.cos(Math.atan2(unit.x-point.x,point.y-unit.y)-unit.heading));
 const dynamics=vehicleDynamics(unit),speed=(unit.reversing?0:unit.driveSpeed??0)+dynamics.acceleration*dt;
 const horizon=Math.min(Math.hypot(point.x-unit.x,point.y-unit.y),speed*speed/(2*dynamics.braking)+dt*speed);
 if(horizon<.001)return Infinity;
 // Include both full bodies, not just the centre's own half-length. During
 // opposite turns their front corners meet while the centres remain farther
 // apart than four scale units. A sharp turn also probes approaching traffic.
 const curve=actualCurve??Math.tan(Math.max(-dynamics.steeringLimit,Math.min(dynamics.steeringLimit,angle*1.55)));
 const turning=Math.abs(curve)>1e-4,radius=horizon+scale*7;
 if(!mission.nearbyUnits(unit,turning?Math.max(radius,scale*24):radius).some(other=>other!==unit&&other.hp>0)
  &&!mission.nav.nearbySolids(unit,radius).length)return Infinity;
 // A straight route intent does not describe a body still following a
 // curved approach. The selected physical arc cannot enter a neighbour's
 // unavoidable braking path, even after the nose faces its waypoint.
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
  if(turning){
   const approaching=maneuverAdmissionBlocker(mission,unit,from,to,dt);
   if(approaching){blockers?.add(approaching);return false;}
  }
  clearDistance+=Math.hypot(to.x-from.x,to.y-from.y);return true;
 });
 if(safe||terrainOnly)return Infinity;
 const reaction=dynamics.braking*dt;
 return Math.max(0,Math.sqrt(2*dynamics.braking*Math.max(0,clearDistance-.02)+reaction*reaction)-reaction);
}
