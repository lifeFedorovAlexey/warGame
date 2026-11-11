import assert from 'node:assert/strict';
import * as T from '../demo/vendor/three.module.js';
import {createTrafficVisibility} from '../campaign/traffic-visibility.js';
import {trafficCollisionRequired} from '../campaign/vehicle-collision.js';

const camera=new T.PerspectiveCamera(43,16/9,1,22000),field={heightAt:()=>0},config={worldScale:4.5};
const visibility=createTrafficVisibility(T,camera,field,config);
for(const m02 of [undefined,{}]){
 const units=Array.from({length:50},(_,i)=>({id:'u'+i,x:i*30,y:0,kind:'bukhanka',owner:'rai',hp:100,trafficOnScreen:i%2===0}));
 const mission={state:{time:0,units,m02}};
 for(let frame=0;frame<100;frame++){
  camera.position.set(frame*100,0,100);camera.lookAt(frame%2?0:10000,0,0);camera.updateMatrixWorld();
  visibility.update(mission);
  assert(units.every(u=>u.trafficOnScreen===true),'Camera and mission must not change traffic physics');
  assert(trafficCollisionRequired(units[0],units[1]),'Allied collision remains active off screen');
 }
}
assert.equal(visibility.stats.frustumBuilds,0,'Traffic physics does not depend on the rendering frustum');
console.log(JSON.stringify({passed:true,missions:2,cameraPositions:100,...visibility.stats}));
