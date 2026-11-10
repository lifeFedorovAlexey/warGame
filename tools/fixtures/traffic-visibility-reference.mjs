import {vehicleRadiusBound} from '../../campaign/vehicle-collision.js';
import {isInfantry} from '../../campaign/scav-unit-profiles.js';

// Frozen original world.updateTrafficVisibility, before frame optimizations.
// Keep independent of the cached implementation; this is the test oracle.
export function referenceVisibility(T,camera,field,config){
 const trafficFrustum=new T.Frustum(),trafficProjection=new T.Matrix4(),trafficSphere=new T.Sphere();
 return function updateTrafficVisibility(mission){
  camera.updateMatrixWorld();trafficFrustum.setFromProjectionMatrix(trafficProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  let visible=0,hidden=0;
  for(const unit of mission.state.units){
   if(unit.hp<=0||unit.owner!=='rai'||isInfantry(unit))continue;
   const scale=config.worldScale,radius=vehicleRadiusBound(unit.kind,scale);
   trafficSphere.center.set(unit.x,unit.y,field.heightAt(unit.x,unit.y)+scale*1.5);
   trafficSphere.radius=Math.hypot(radius,scale*1.8)+(config.units[unit.kind]?.speed??0)*config.simulationStep;
   unit.trafficOnScreen=trafficFrustum.intersectsSphere(trafficSphere);
   if(unit.trafficOnScreen)visible++;else hidden++;
  }
  mission.trafficCamera={visible,hidden};
 };
}
