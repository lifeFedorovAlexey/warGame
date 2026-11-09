import assert from 'node:assert/strict';
import {vehicleEnvelope,vehicleClearance,envelopeClearance,vehicleSweep,sweepClearsVehicle,footprintGap,collisionStatistics} from '../campaign/vehicle-collision.js';

// The old rectangle/terrain-projection oracle describes the pre-r37 model.
// The owner now requires model-bound ellipses independent of visual terrain.
// Check the optimized queries against an independent angular support oracle.
const directions=Array.from({length:2048},(_,i)=>[Math.cos(i*Math.PI/1024),Math.sin(i*Math.PI/1024)]);
const support=(p,x,y)=>p.ellipse?Math.hypot(p.width*(p.c*x+p.s*y),p.depth*(p.c*y-p.s*x))
 :p.width*Math.abs(p.c*x+p.s*y)+p.depth*Math.abs(p.c*y-p.s*x);
const oracle=(a,b)=>{let best=-Infinity;for(const [x,y] of directions)
 best=Math.max(best,(b.x-a.x)*x+(b.y-a.y)*y-support(a,x,y)-support(b,x,y));return best;};
let seed=153737;const random=()=>((seed=Math.imul(seed,1664525)+1013904223|0)>>>0)/2**32;
const kinds=['bukhanka','builder','raider','scav-bus','scav-firetruck'];
let pairs=0,clearSweeps=0;const started=performance.now();
for(let i=0;i<1600;i++){
 const scale=i%3?4.5:1,skin=scale*.055;
 const a={id:'a',hp:100,kind:kinds[i%5],x:random()*400-200,y:random()*400-200,heading:random()*Math.PI*2};
 const b={id:'b',hp:100,kind:kinds[(i+1)%5],x:a.x+random()*90-45,y:a.y+random()*90-45,heading:random()*Math.PI*2};
 const aa=vehicleEnvelope(a,scale),bb=vehicleEnvelope(b,scale),exact=oracle(aa,bb);
 assert(Math.abs(vehicleClearance(a,b,scale)-exact)<.01,'Signed ellipse gap agrees with independent angular supports');
 for(const threshold of [0,skin,scale*.8+.001]){
  const gap=vehicleClearance(a,b,scale,null,threshold);
  if(gap>=threshold)assert(exact>=threshold-.002,'No false clearance from circle/axis early-out');
  if(exact>threshold+.01)assert(gap>=threshold,'Separated ellipses must not be reported as overlapping');
  assert.equal(gap,envelopeClearance(aa,bb,threshold));pairs++;
 }
 // Terrain identity is irrelevant, physical pose changes always invalidate.
 assert.equal(vehicleEnvelope(a,scale,{heightAt:()=>500}),aa);
 const old=vehicleClearance(a,b,scale);b.x+=35;
 const moved=vehicleClearance(a,b,scale);assert.equal(moved,footprintGap(aa,vehicleEnvelope(b,scale)));assert.notEqual(old,moved);
 b.x-=35;
 if(i%4||exact<=skin+.02)continue;
 const end={...a,x:a.x+random()*12-6,y:a.y+random()*12-6,heading:a.heading+random()-.5};
 const sweep=vehicleSweep(a,end,scale);
 if(!sweepClearsVehicle(sweep,bb,skin))continue;
 clearSweeps++;
 for(const t of [0,.25,.5,.75,1]){
  const pose=vehicleEnvelope({...a,x:a.x+(end.x-a.x)*t,y:a.y+(end.y-a.y)*t,heading:a.heading+(end.heading-a.heading)*t},scale);
  assert(oracle(pose,bb)>=skin-.002,'An admitted swept oval must stay clear');
 }
}
// A thin diagonal ellipse can have separated centres while its ends collide.
const a={kind:'bukhanka',x:0,y:0,heading:Math.PI/4},b={...a,x:5,y:-5};
assert(vehicleClearance(a,b,4.5)<0);assert(vehicleClearance(a,b,4.5,null,0)<0);
console.log(JSON.stringify({passed:true,pairs,clearSweeps,cpuMs:performance.now()-started,statistics:collisionStatistics,
 note:'Independent ellipse support and swept safety checks. CPU only, not game FPS.'},null,2));
