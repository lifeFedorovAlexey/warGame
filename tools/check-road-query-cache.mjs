import assert from 'node:assert/strict';
import {RoadTraffic} from '../campaign/road-traffic.js';
// Independent exhaustive projection, preserving bucket order and strict ties.
function reference(roads,point,radius=0){
 let result=null,best=Infinity;
 for(let y=Math.floor((point.y-radius)/64);y<=Math.floor((point.y+radius)/64);y++)
 for(let x=Math.floor((point.x-radius)/64);x<=Math.floor((point.x+radius)/64);x++)
 for(const segment of roads.buckets.get(x+','+y)??[]){
  const {a,b,path,ux,uy,length}=segment;
  const along=Math.max(0,Math.min(length,(point.x-a.x)*ux+(point.y-a.y)*uy));
  const px=a.x+ux*along,py=a.y+uy*along;
  const width=(a.width??path.width)+((b.width??path.width)-(a.width??path.width))*along/length;
  const distance=Math.hypot(point.x-px,point.y-py);
  if(distance>=best||distance>width/2+radius)continue;
  best=distance;result={segment,along,x:px,y:py,distance,width};
 }return result;
}
let seed=713;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/2**32);
const paths=Array.from({length:30},(_,id)=>({id,width:20+random()*60,points:Array.from({length:20},()=>({x:random()*1200-600,y:random()*1200-600,width:10+random()*40}))}));
const roads=new RoadTraffic({roadNetwork:{paths}}),point={x:0,y:0};
for(let i=0;i<4000;i++){
 point.x=i%17===0?64*(i%7-3):random()*1500-750;point.y=random()*1500-750;
 for(const radius of [0,24,155,0,24])assert.deepEqual(roads.nearest(point,radius),reference(roads,point,radius));
 const nearest=reference(roads,point),coverage=nearest?Math.max(0,Math.min(1,(nearest.width/2-nearest.distance)/2.5)):0;
 for(let repeat=0;repeat<3;repeat++)assert.equal(roads.coverage(point.x,point.y),coverage,'Surface cache preserves exact road edges');
}
const first=roads.nearest(paths[0].points[0]);first.x+=1000;
assert.deepEqual(roads.nearest(paths[0].points[0]),reference(roads,paths[0].points[0]),'Returned records cannot corrupt the cache');
console.log('PASS 20,000 road queries: exact projections, changing coordinates/radii, bucket edges, ties and result isolation');
