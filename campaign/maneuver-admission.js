import {checkManeuver,clearOfVehicles} from './vehicle-motion.js';

// A parking arc may be clear of today's poses but enter a nearby vehicle's
// unavoidable braking path. Admit it only when that physical path is clear;
// this is recomputed from actual velocities, not a timed parking lease.
export function maneuverAdmissionBlocker(mission,unit,from,to,dt){
 const scale=mission.config.worldScale;
 for(const other of mission.nearbyUnits(unit,scale*24)){
  if(other===unit||other.hp<=0||(other.driveSpeed??0)<.01)continue;
  const direction=other.reversing?-1:1,curve=Math.tan(other.steering??0)*direction;
  let pose=other,speed=other.driveSpeed;
  const distance=Math.hypot(other.x-unit.x,other.y-unit.y);
  if(distance>speed*speed/44+speed*dt+scale*7)continue;
  // Include one reaction step before maximum normal deceleration.
  for(let step=0;step<64&&speed>.001;step++){
   const interval=step?.1:dt;
   if(step)speed=Math.max(0,speed-22*interval);
   const length=speed*interval;if(!length)break;
   const next=checkManeuver(pose,[{direction,curve,remaining:length}],scale,()=>true);
   if(!clearOfVehicles(other,next,[{...to,kind:unit.kind,hp:1}],scale,false,pose,mission.field))return other;
   pose=next;
  }
 }
 return null;
}
