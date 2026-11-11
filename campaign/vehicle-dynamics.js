import {isInfantry} from './scav-unit-profiles.js';
import {fieldEffects} from './field-modifications.js';
// Game handling profiles in world units/second and radians. Top speed and
// health still come from the existing unit specification. All safety probes
// use these same acceleration/braking limits as the actual executor.
const standard=Object.freeze({acceleration:28,braking:22,steeringLimit:.67,steeringRate:3.6,pivotRate:Math.PI,turnPenalty:1.9,wheelbase:2.6,maneuverForward:13,maneuverReverse:9});
// C01 chassis + B01 body are shared by all three module variants. Scale
// belongs to that assembly, independent of the gun/projector or its paint.
const modularKinds=new Set(['bukhanka','flamer','builder','twin-machinegun','sensor']),modularScale=.9;
export const vehicleSizeScale=unit=>modularKinds.has(typeof unit==='string'?unit:unit.kind)?modularScale:1;
const modular=Object.freeze({...standard,wheelbase:standard.wheelbase*modularScale});
const light=Object.freeze({...modular,acceleration:36,braking:26,steeringLimit:.72,turnPenalty:.85,maneuverForward:17,maneuverReverse:11});
const loadedDynamics=new WeakMap();
export function vehicleDynamics(unit){
 const base=unit.kind==='bukhanka'?light:modularKinds.has(unit.kind)?modular:standard,effects=fieldEffects(unit);
 if(!effects.massKg)return base;
 const saved=loadedDynamics.get(unit);if(saved?.effects===effects&&saved.base===base)return saved.value;
 const value={...base,acceleration:base.acceleration*effects.acceleration,braking:base.braking*effects.braking,steeringRate:base.steeringRate*effects.steeringRate,maneuverForward:base.maneuverForward*effects.speed,maneuverReverse:base.maneuverReverse*effects.speed};
 loadedDynamics.set(unit,{base,effects,value});return value;
}

// Red matches the existing HP bar. Roll only when damage crosses that boundary.
export const STEERING_DAMAGE={redFraction:.28,chance:.30};
export function rollSteeringDamage(mission,unit,previousFraction){
 if(!mission.config.units[unit.kind]||isInfantry(unit)||unit.hp<=0||unit.steeringFault
  ||previousFraction<=STEERING_DAMAGE.redFraction||unit.hp/unit.maxHp>STEERING_DAMAGE.redFraction)return;
 const roll=mission.random(),failed=roll<STEERING_DAMAGE.chance;
 mission.emit('vehicle-steering-damage-roll',{unit:unit.id,hp:unit.hp,maxHp:unit.maxHp,chance:STEERING_DAMAGE.chance,roll,failed});
 if(!failed)return;
 unit.steeringFault={since:mission.state.time,seed:(mission.random()*4294967296)>>>0,episodes:[],nextAt:mission.state.time+.15};
 updateSteeringDamage(mission,unit);
}
export function updateSteeringDamage(mission,unit){
 unit.steeringClock=mission.state.time;
 const fault=unit.steeringFault;if(!fault)return;
 if(unit.hp>=unit.maxHp){delete unit.steeringFault;mission.emit('vehicle-steering-repaired',{unit:unit.id});return;}
 const now=mission.state.time;
 fault.episodes=fault.episodes.filter(e=>e.at+e.duration>=now-.2);
 const random=()=>{fault.seed=(Math.imul(fault.seed,1664525)+1013904223)>>>0;return fault.seed/4294967296;};
 // Prepare a short deterministic horizon once per live tick. Searching and
 // forecasting read it without drawing random numbers or changing the fault.
 while(fault.nextAt<now+6){
  const duration=.55+random()*1.65,angle=(random()<.5?-1:1)*(.06+.28*random()**1.5),strength=.65+random()*.30;
  fault.episodes.push({at:fault.nextAt,duration,angle,strength});
  fault.nextAt+=duration+.65+random()*2.65;
 }
}
export function steeringDamageAt(fault,time){
 const episode=fault?.episodes?.find(e=>time>=e.at&&time<=e.at+e.duration);
 if(!episode)return {strength:0,angle:0};
 const t=(time-episode.at)/episode.duration,ramp=Math.max(0,Math.min(1,t/.25,(1-t)/.30));
 return {strength:episode.strength*ramp*ramp*(3-2*ramp),angle:episode.angle};
}
export function steeringResponse(unit,requested,dt,time=unit.steeringClock??0,fault=unit.steeringFault){
 const dynamics=vehicleDynamics(unit),{strength,angle}=steeringDamageAt(fault,time+dt/2);
 const desired=Math.max(-dynamics.steeringLimit,Math.min(dynamics.steeringLimit,requested*(1-strength)+angle*strength));
 const previous=unit.steering??0,step=dynamics.steeringRate*(1-.65*strength)*dt;
 return previous+Math.max(-step,Math.min(step,desired-previous));
}
export function steeringManeuverReady(unit,dt){
 const time=unit.steeringClock??0,fault=unit.steeringFault;
 return !fault||[time,time+dt/2,time+dt].every(t=>steeringDamageAt(fault,t).strength<.02);
}
