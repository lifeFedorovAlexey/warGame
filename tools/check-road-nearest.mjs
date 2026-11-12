import assert from 'node:assert/strict';
import fs from 'node:fs';
import {RoadTraffic} from '../campaign/road-traffic.js';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function reference(point,radius=0){
 const x0=Math.floor((point.x-radius)/64),x1=Math.floor((point.x+radius)/64),y0=Math.floor((point.y-radius)/64),y1=Math.floor((point.y+radius)/64);
 let nearest=null,shortest=Infinity;
 for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)for(const segment of this.buckets.get(x+','+y)??[]){
  const {a,b,path,ux,uy,length}=segment,along=clamp((point.x-a.x)*ux+(point.y-a.y)*uy,0,length);
  const px=a.x+ux*along,py=a.y+uy*along,distance=Math.hypot(point.x-px,point.y-py);
  const width=(a.width??path.width)+((b.width??path.width)-(a.width??path.width))*along/length;
  if(distance>=shortest||distance>width/2+radius)continue;
  shortest=distance;nearest={segment,along,x:px,y:py,distance,width};
 }
 return nearest;
}
const field={roadNetwork:{paths:[
 {id:'varying',width:20,points:[{x:-200,y:0,width:8},{x:200,y:0,width:64}]},
 {id:'diagonal',width:12,points:[{x:-200,y:-200},{x:200,y:200}]},
 {id:'tie-first',width:10,points:[{x:-20,y:100},{x:-20,y:200}]},
 {id:'tie-second',width:10,points:[{x:20,y:100},{x:20,y:200}]}]}};
const roads=new RoadTraffic(field),points=[];let seed=19452;
const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
for(let i=0;i<12000;i++)points.push({point:{x:random()*600-300,y:random()*600-300},radius:[0,5,32,155][i%4]});
for(const x of [-200,-100,0,100,200])for(const radius of [0,5,32])for(const epsilon of [-1e-10,0,1e-10]){
 const width=8+(64-8)*(x+200)/400;points.push({point:{x,y:width/2+radius+epsilon},radius});
}
for(const {point,radius} of points)assert.deepEqual(roads.nearest(point,radius),reference.call(roads,point,radius));
assert.equal(roads.nearest({x:0,y:150},20).segment.pathId,'tie-first','The equal-distance winner retains insertion order');
const waypoint={x:0,y:150};
assert.equal(roads.nearestWaypoint(waypoint,0),null);
const projected=roads.nearestWaypoint(waypoint,20);
assert.equal(roads.nearestWaypoint(waypoint,20),projected,'Repeated steering previews reuse the same projection');
assert.deepEqual(projected,roads.nearest(waypoint,20));
waypoint.x=20;
assert.deepEqual(roads.nearestWaypoint(waypoint,20),roads.nearest(waypoint,20),'Moving a waypoint invalidates the projection');
const authored=new RoadTraffic({roadNetwork:JSON.parse(fs.readFileSync('assets/maps/alpha/roads.json','utf8'))});
const realPoints=Array.from({length:12000},(_,i)=>({point:{x:random()*4096-2048,y:random()*4096-2048},radius:[0,5,32,155][i%4]}));
for(const {point,radius} of realPoints)assert.deepEqual(authored.nearest(point,radius),reference.call(authored,point,radius));
const run=fn=>{let found=0;const started=performance.now();for(let pass=0;pass<4;pass++)for(const {point,radius} of realPoints)if(fn.call(authored,point,radius))found++;return {ms:performance.now()-started,found};};
const timings=[{kind:'reference',...run(reference)},{kind:'broadphase',...run(authored.nearest)},{kind:'broadphase',...run(authored.nearest)},{kind:'reference',...run(reference)}];
assert.equal(new Set(timings.map(t=>t.found)).size,1);
const report={passed:true,exactComparisons:points.length+realPoints.length,tie:true,timings};
fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/road-nearest-equivalence.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
