import assert from 'node:assert/strict';
import * as T from '../demo/vendor/three.module.js';
import {createTrafficVisibility} from '../campaign/traffic-visibility.js';
import {referenceVisibility} from './fixtures/traffic-visibility-reference.mjs';

// Execute the frozen pre-optimization function as the independent oracle.
const field={heightAt:(x,y)=>Math.sin(x*.01)*3+Math.cos(y*.02)*5};
const config={worldScale:2,simulationStep:.1,units:{bukhanka:{speed:30},builder:{speed:20},'scav-bus':{speed:22},'scav-rifleman':{speed:8}}};
const camera=new T.PerspectiveCamera(43,16/9,1,22000);camera.up.set(0,0,1);
const oracle=referenceVisibility(T,camera,field,config);
let seed=0x713c;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
const units=Array.from({length:96},(_,i)=>({id:'u'+i,x:random()*900-450,y:random()*900-450,kind:i%4?'bukhanka':'builder',owner:'rai',hp:100}));
const a={state:{time:0,units}},b={state:{time:0,units:structuredClone(units)}},cached=createTrafficVisibility(T,camera,field,config);
const check=()=>{oracle(a);cached.update(b);assert.deepEqual(b.state.units.map(u=>u.trafficOnScreen),a.state.units.map(u=>u.trafficOnScreen));assert.equal(b.trafficCamera.visible,a.trafficCamera.visible);assert.equal(b.trafficCamera.hidden,a.trafficCamera.hidden);};
camera.position.set(100,-360,360);camera.lookAt(0,0,0);check();
const first=cached.stats.bodyChecks;for(let i=0;i<100;i++)check();assert.equal(cached.stats.bodyChecks,first,'Unchanged boundary calls reuse every sphere');
for(let frame=0;frame<600;frame++){
 a.state.time=b.state.time=frame*.1;
 if(frame%7===0){camera.position.x+=13;camera.lookAt(frame%80,0,0);}
 if(frame%19===0){camera.aspect=frame%38?8/9:16/9;camera.updateProjectionMatrix();}
 const index=frame%a.state.units.length,u=a.state.units[index];u.x+=random()*15-7.5;u.y+=random()*15-7.5;
 if(frame%17===0)u.kind=['bukhanka','builder','scav-bus','scav-rifleman'][frame%4];
 if(frame%23===0)u.owner=u.owner==='rai'?'scavs':'rai';
 if(frame%31===0)u.hp=u.hp>0?0:100;
 if(frame%43===0){const spawn={id:'spawn'+frame,x:30,y:30,kind:'bukhanka',owner:'rai',hp:100};a.state.units.push(spawn);b.state.units.push({...spawn});}
 if(frame%47===0){a.state.units.reverse();b.state.units.reverse();}
 // Preserve identities in the cached side, as in the real mutable mission.
 for(let i=0;i<a.state.units.length;i++){const {trafficOnScreen,...input}=a.state.units[i];Object.assign(b.state.units[i],input);}
 if(frame===200){a.state={...a.state,units:structuredClone(a.state.units)};b.state={...b.state,units:structuredClone(b.state.units)};}
 if(frame%61===0){config.worldScale+=.001;config.units.bukhanka.speed+=.1;}
 check();check();
}
assert(cached.stats.cacheHits>cached.stats.bodyChecks,'Cached duplicate calls reduce actual sphere work');
console.log(JSON.stringify({passed:true,frames:600,stableChecks:100,oracle:'frozen original world.updateTrafficVisibility',...cached.stats}));
