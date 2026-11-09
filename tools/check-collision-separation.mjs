import assert from 'node:assert/strict';
import * as fast from '../campaign/vehicle-collision.js';
import * as slow from './fixtures/collision-geometry-reference.mjs';

// Independent pre-optimization implementation, including penetration escape.
let seed=153737;const random=()=>((seed=Math.imul(seed,1664525)+1013904223|0)>>>0)/2**32;
const kinds=['bukhanka','builder','raider','scav-bus','scav-firetruck'];
const field={heightAt:(x,y)=>.08*x+.13*y+Math.sin(x*.014)*5+Math.cos(y*.017)*3};
const samples=[];
for(let i=0;i<16000;i++){
 const unit={id:'a',hp:100,kind:kinds[i%kinds.length],x:random()*400-200,y:random()*400-200,heading:random()*Math.PI*2};
 const to={...unit,x:unit.x+random()*30-15,y:unit.y+random()*30-15,heading:unit.heading+random()-.5};
 const other={id:'b',hp:i%47?100:0,kind:kinds[(i+1)%kinds.length],x:unit.x+random()*90-45,y:unit.y+random()*90-45,heading:random()*Math.PI*2};
 const scale=i%3?4.5:1,terrain=i%4?field:undefined;
 const obstacle={x:other.x,y:other.y,halfWidth:random()*12,halfDepth:random()*20};
 samples.push({unit,to,other,scale,terrain,obstacle});
}
let comparisons=0;
function run(lib,verify){let clear=0;
 for(const s of samples){
  const{unit,to,other,scale,terrain,obstacle}=s;
  const sweep=lib.vehicleSweep(unit,to,scale,terrain);
  for(const strict of [true,false]){
   const blocked=new Set(),result=lib.clearOfVehicles(unit,to,[other],scale,strict,unit,terrain,blocked,sweep);
   clear+=Number(result);
   if(verify){const expected=new Set();assert.equal(result,slow.clearOfVehicles(unit,to,[other],scale,strict,unit,terrain,expected,sweep));assert.deepEqual([...blocked],[...expected]);comparisons++;}
  }
  if(verify&&other.hp>0){assert.equal(fast.sweepClearsVehicle(sweep,fast.vehicleEnvelope(other,scale,terrain),.055*scale),
   slow.clearOfVehicles(unit,to,[other],scale,false,unit,terrain,undefined,sweep));comparisons++;}
  const result=lib.sweepAvoidsFootprint(sweep,obstacle,.055*scale);clear+=Number(result);
  if(verify){assert.equal(result,slow.sweepAvoidsFootprint(sweep,obstacle,.055*scale));comparisons++;}
 }return clear;
}
run(fast,true);run(slow);run(fast);
const bench=lib=>{const start=performance.now();let clear=0;for(let i=0;i<5;i++)clear+=run(lib);return{ms:performance.now()-start,clear};};
const before=bench(slow),after=bench(fast);assert.equal(before.clear,after.clear);
console.log(JSON.stringify({passed:true,comparisons,before,after,note:'Exact collision/penetration equivalence. Node microbenchmark only; not game FPS.'},null,2));
