import assert from 'node:assert/strict';
import {ForecastClearance} from '../campaign/forecast-clearance.js';
import {vehicleEnvelope,envelopeClearance} from '../campaign/vehicle-collision.js';
let seed=42;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
const kinds=['bukhanka','builder','raider','flamer'];
const shape=(x,y)=>vehicleEnvelope({kind:kinds[Math.floor(random()*kinds.length)],x,y,heading:random()*Math.PI*2},4.5);
const reference=(forecasts,pose,step)=>{
 let clearance=Infinity,blocker=null;
 for(const f of forecasts){const gap=envelopeClearance(pose,f.shapes[step],4.5*.8+.001);clearance=Math.min(clearance,gap);if(gap<4.5*.055+.02){blocker=f.other;break;}}
 return {clearance,blocker};
};
let queries=0;const stats={};
for(const moving of [false,true])for(let scene=0;scene<30;scene++){
 const forecasts=Array.from({length:50},(_,i)=>{
  const x=random()*250-125,y=random()*250-125,initial=shape(x,y);
  return {other:{id:'u'+i,owner:i%2?'rai':'scavs'},shapes:Array.from({length:10},(_,k)=>moving&&i%3?shape(x+k*1.5,y-k):initial)};
 });
 const query=new ForecastClearance(forecasts,4.5,stats);
 for(let i=0;i<40;i++){
  const pose=shape(random()*250-125,random()*250-125);
  for(let step=0;step<10;step++){
   const expected=reference(forecasts,pose,step);assert.deepEqual(query.query(pose,step,true),expected);queries++;
   assert.deepEqual(query.query(pose,step,true),expected);queries++;
  }
 }
 const pose=shape(1000,1000);query.query(pose,0,true);
 forecasts[0].shapes[0]=pose;query.clear();assert.deepEqual(query.query(pose,0,true),reference(forecasts,pose,0));
}
assert(stats.forecastPairsCulled>0&&stats.forecastClearanceHits>0);
assert.deepEqual(new ForecastClearance([],4.5).query(shape(0,0),0),{clearance:Infinity,blocker:null});
console.log(JSON.stringify({passed:true,queries,stats}));
