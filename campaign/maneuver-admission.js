import {checkManeuver,clearOfVehicles} from './vehicle-motion.js';
import {vehicleDynamics} from './vehicle-dynamics.js';
import {vehicleSweep,vehicleRadiusBound} from './vehicle-collision.js';

// A neighbour's unavoidable stopping path is identical for every point of
// our candidate arc until its physical state changes. Retain only one lazy
// path per object; sequential movement invalidates it immediately, not at
// the end of a frame. Terrain/topology changes also invalidate its sweeps.
const stoppingPaths=new WeakMap();
const worldBounds=new WeakMap();
function minimumBraking(mission){
 const kinds=mission.config.units;
 let bounds=worldBounds.get(kinds);
 if(!bounds){bounds={braking:Infinity};for(const kind of Object.keys(kinds)){
  bounds.braking=Math.min(bounds.braking,vehicleDynamics({kind}).braking);
 }worldBounds.set(kinds,bounds);}
 return bounds.braking;
}
export function maneuverAdmissionRadius(mission,unit,dt){
 if(!mission.unitIndexActive)return Infinity;
 const scale=mission.config.worldScale,speed=mission.unitIndex.maxSpeed;
 return vehicleRadiusBound(unit.kind,scale)+mission.unitIndex.maxBodyRadius*scale+scale*.055+.02
  +speed*dt+speed*speed/(2*minimumBraking(mission));
}
function stoppingPath(mission,other,dt,scale){
 let path=stoppingPaths.get(other);
 if(!path||path.x!==other.x||path.y!==other.y||path.heading!==other.heading||path.speed0!==other.driveSpeed
   ||path.steering!==other.steering||path.reversing!==other.reversing||path.kind!==other.kind||path.dt!==dt
   ||path.scale!==scale||path.field!==mission.field||path.topology!==mission.nav.topologyRevision){
  path={x:other.x,y:other.y,heading:other.heading,speed0:other.driveSpeed,steering:other.steering,
   reversing:other.reversing,kind:other.kind,dt,scale,field:mission.field,topology:mission.nav.topologyRevision,
   speed:other.driveSpeed,pose:{x:other.x,y:other.y,heading:other.heading,kind:other.kind},segments:[],complete:false};
  stoppingPaths.set(other,path);
 }
 return path;
}

// A parking arc may be clear of today's poses but enter a nearby vehicle's
// unavoidable braking path. Admit it only when that physical path is clear;
// this is recomputed from actual velocities, not a timed parking lease.
export function maneuverAdmissionBlocker(mission,unit,from,to,dt){
 const scale=mission.config.worldScale;let obstacles;
 const ownRadius=vehicleRadiusBound(unit.kind,scale),skin=scale*.055+.02;
 // The query surrounds the FUTURE tested body. Its initial position may be
 // far behind it on a turn. The spatial aggregate includes actual speeds,
 // even a fast legacy save, and only grows during sequential tick updates.
 const radius=maneuverAdmissionRadius(mission,unit,dt);
 for(const other of mission.nearbyUnits(to,radius)){
  if(other===unit||other.hp<=0||(other.driveSpeed??0)<.01)continue;
  const braking=vehicleDynamics(other).braking,direction=other.reversing?-1:1,curve=Math.tan(other.steering??0)*direction;
  const speed=other.driveSpeed;
  const distance=Math.hypot(other.x-to.x,other.y-to.y);
  if(distance>speed*speed/(2*braking)+speed*dt+ownRadius+vehicleRadiusBound(other.kind,scale)+skin)continue;
  const path=stoppingPath(mission,other,dt,scale);obstacles??=[{...to,kind:unit.kind,hp:1}];
  // Include one reaction step before maximum normal deceleration.
  for(let step=0;step<64;step++){
   let segment=path.segments[step];
   if(!segment){
    if(path.complete||path.speed<=.001)break;
    const interval=step?.1:dt;
    if(step)path.speed=Math.max(0,path.speed-braking*interval);
    const length=path.speed*interval;
    if(!length){path.complete=true;break;}
    const next=checkManeuver(path.pose,[{direction,curve,remaining:length}],scale,()=>true);
    segment={from:path.pose,to:next,sweep:vehicleSweep(path.pose,next,scale,mission.field)};
    path.segments.push(segment);path.pose=next;
   }
   if(!clearOfVehicles(other,segment.to,obstacles,scale,false,segment.from,mission.field,undefined,segment.sweep))return other;
  }
 }
 return null;
}
