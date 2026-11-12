import {UnitSpatialIndex} from './unit-spatial-index.js';

// A search owns this buffer until disposal. No render damage cage, decals,
// economy, dialogue, salvage or mission history belongs to a traffic proof.
const unitFields=('id kind owner hp maxHp x y heading path task routeOrder commandRevision pendingOrder '+
 'driveSpeed reversing steering steeringRequested steeringClock steeringFault wheelDistance trafficPassThrough '+
 'detour traffic trafficHold driveWatch reverseDebt failedArcs passage passingLane yieldReturn jointTraffic '+
 'cycleContinuation trafficRecoveryUntil terrainEscape navigation tool foldTime builderWorking '+
 'combatPolicy combatRetreat retreatSuppressed combatDeployment combatResume factoryVisit overlapRecovery '+
 'routeContinuation routeTopologyPending commandStartAfter mergeTraffic').split(' ');
const buildingFields=('id kind owner hp maxHp x y rotation halfWidth halfDepth completed clearing groundHeight garageGate').split(' ');
function copy(value,previous,seen){
 if(value===null||typeof value!=='object')return value;
 if(seen.has(value))return seen.get(value);
 if(value instanceof Map){const out=previous instanceof Map?previous:new Map();out.clear();seen.set(value,out);for(const [k,v] of value)out.set(copy(k,undefined,seen),copy(v,undefined,seen));return out;}
 if(value instanceof Set){const out=previous instanceof Set?previous:new Set();out.clear();seen.set(value,out);for(const v of value)out.add(copy(v,undefined,seen));return out;}
 const array=Array.isArray(value),out=previous&&typeof previous==='object'&&Array.isArray(previous)===array?previous:array?[]:{};
 seen.set(value,out);
 for(const key of Object.keys(out))if(!Object.hasOwn(value,key))delete out[key];
 for(const key of Object.keys(value))out[key]=copy(value[key],out[key],seen);
 if(array)out.length=value.length;
 return out;
}
function row(source,target,fields,seen){
 for(const key of Object.keys(target))if(key!=='damage'&&(!fields.includes(key)||!Object.hasOwn(source,key)))delete target[key];
 for(const key of fields)if(Object.hasOwn(source,key))target[key]=copy(source[key],target[key],seen);
 return target;
}
export function createTrafficBuffer(){return {units:[],buildings:[],visible:new Uint8Array(128**2),unitIndex:new UnitSpatialIndex()};}
export function captureTrafficState(mission,buffer){
 const seen=new Map();
 for(let i=0;i<mission.state.units.length;i++){
  const source=mission.state.units[i],target=buffer.units[i]??={};seen.set(source,target);row(source,target,unitFields,seen);
  if(source.damage){
   const damage=target.damage??={parts:{}};damage.wreck=!!source.damage.wreck;
   for(let id=1;id<=4;id++)(damage.parts[id]??={}).detached=!!source.damage.parts?.[id]?.detached;
  }else delete target.damage;
 }
 buffer.units.length=mission.state.units.length;
 for(let i=0;i<mission.state.buildings.length;i++)row(mission.state.buildings[i],buffer.buildings[i]??={},buildingFields,seen);
 buffer.buildings.length=mission.state.buildings.length;
 buffer.visible.set(mission.visible);buffer.unitIndex.rebuild(buffer.units);
 // A new state identity invalidates world-scoped WeakMap proofs on reuse.
 return {time:mission.state.time,status:mission.state.status,bounds:mission.state.bounds.slice(),units:buffer.units,buildings:buffer.buildings,
  trafficControl:copy(mission.state.trafficControl,undefined,seen)};
}
