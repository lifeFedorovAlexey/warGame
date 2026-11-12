import assert from 'node:assert/strict';
import {createPolylineQuery} from '../campaign/polyline-query.js';
function reference(points,x,y){
 let best=null;
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
  if(!length)continue;
  const t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(length*length))),px=a.x+dx*t,py=a.y+dy*t,distance=Math.hypot(x-px,y-py);
  if(!best||distance<best.distance)best={distance,x:px,y:py,z:a.z+(b.z-a.z)*t,along:a.along+(b.along-a.along)*t,nx:-dy/length,ny:dx/length,index:i,t};
 }return best;
}
let seed=71;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/2**32);
for(const points of [[],[{x:0,y:0,z:0,along:0},{x:0,y:0,z:0,along:0}],
 Array.from({length:100},(_,i)=>({x:random()*1500-750,y:random()*1500-750,z:random()*10,along:i*50})),
 [{x:-64,y:0,z:0,along:0},{x:64,y:0,z:0,along:128},{x:-64,y:0,z:0,along:256}]]){
 const query=createPolylineQuery(points);
 for(let i=0;i<4000;i++){
  const x=i%9===0?0:random()*2000-1000,y=i%17===0?64:random()*2000-1000,expected=reference(points,x,y);
  assert.deepEqual(query.nearest(x,y),expected);
  for(const radius of [0,21,43,67,expected?.distance??0]){
   assert.deepEqual(query.nearest(x,y,radius),expected&&expected.distance<=radius?expected:null);
   for(let repeat=0;repeat<2;repeat++)assert.equal(query.withinDistance(x,y,radius),!!expected&&expected.distance<radius);
  }
 }
}
console.log('PASS 96,000 exact polyline queries: empty/duplicate points, intersections, strict ties, negative cells and radius boundaries');
