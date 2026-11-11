import assert from 'node:assert/strict';
import * as T from '../demo/vendor/three.module.js';
import {keepCameraAboveTerrain,campaignCameraLimits} from '../campaign/camera-limits.js';
const target=new T.Vector3(),camera=new T.PerspectiveCamera(),controls={target,maxDistance:campaignCameraLimits.far};camera.up.set(0,0,1);
for(const [name,heightAt] of [['flat',()=>0],['high ridge',x=>x>800?900:0],['sloped ridge',(x,y)=>800*Math.exp(-((x-1200)**2+y*y)/100000)]]){
 for(const angle of [0,.7,1.5,2.7])for(const height of [40,80,300]){
  const radius=Math.sqrt(controls.maxDistance**2-height**2);
  camera.position.set(Math.cos(angle)*radius,Math.sin(angle)*radius,height);
  keepCameraAboveTerrain(camera,controls,{heightAt},40);
  assert(camera.position.distanceTo(target)<=controls.maxDistance+.001,name+': terrain correction must preserve far limit');
  assert(camera.position.z>=heightAt(camera.position.x,camera.position.y)+39.99,name+': camera must clear terrain');
 }
}
console.log('PASS: far zoom bound and ground clearance on flat ground, slopes and a high ridge');
