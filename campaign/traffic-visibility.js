import {vehicleRadiusBound} from './vehicle-collision.js';
import {isInfantry} from './scav-unit-profiles.js';

// Preserve the pre-simulation AND post-movement visibility boundaries. Cache
// unchanged inputs instead of dropping a boundary read by synchronous orders,
// save/production handlers and suspended physical ticks between rAF callbacks.
export function createTrafficVisibility(T,camera,field,config,{cache=true}={}){
 const frustum=new T.Frustum(),projection=new T.Matrix4(),sphere=new T.Sphere();
 const previous=new Float64Array(16).fill(NaN),bodies=new WeakMap();let revision=0;
 const stats={calls:0,frustumBuilds:0,bodyChecks:0,cacheHits:0};
 function update(mission){
  // m02 has a camera-independent simulation contract. Keep the existing
  // collision policy fully enabled, including in suspended planning snapshots.
  if(mission.state.m02){for(const unit of mission.state.units)unit.trafficOnScreen=true;return;}
  stats.calls++;camera.updateMatrixWorld();projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
  let changed=!cache;
  for(let i=0;i<16;i++)if(previous[i]!==projection.elements[i]){changed=true;previous[i]=projection.elements[i];}
  if(changed){frustum.setFromProjectionMatrix(projection);revision++;stats.frustumBuilds++;}
  let visible=0,hidden=0;
  for(const unit of mission.state.units){
   if(unit.hp<=0||unit.owner!=='rai'||isInfantry(unit))continue;
   const scale=config.worldScale,step=(config.units[unit.kind]?.speed??0)*config.simulationStep;
   let saved=bodies.get(unit);
   if(!cache||!saved||saved.revision!==revision||saved.x!==unit.x||saved.y!==unit.y||saved.kind!==unit.kind||saved.scale!==scale||saved.step!==step){
    const radius=vehicleRadiusBound(unit.kind,scale);
    sphere.center.set(unit.x,unit.y,field.heightAt(unit.x,unit.y)+scale*1.5);
    sphere.radius=Math.hypot(radius,scale*1.8)+step;
    saved??={};saved.revision=revision;saved.x=unit.x;saved.y=unit.y;saved.kind=unit.kind;saved.scale=scale;saved.step=step;saved.visible=frustum.intersectsSphere(sphere);
    bodies.set(unit,saved);stats.bodyChecks++;
   }else stats.cacheHits++;
   unit.trafficOnScreen=saved.visible;
   if(saved.visible)visible++;else hidden++;
  }
  const counters=mission.trafficCamera??={};
  counters.visible=visible;counters.hidden=hidden;counters.sampledAt=mission.state.time;counters.countedAt=mission.state.time;
 }
 return {update,stats};
}
