import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../demo/vendor/three.module.js';
import {baseApproachRoads} from '../campaign/base-roads.js';
import {createLocalRoadMask} from '../demo/local-road-mask.js';
import {createRoadJunctionCutout} from '../campaign/road-junction-cutout.js';
const config=JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/gameplay.json','utf8'));
const network=JSON.parse(fs.readFileSync('assets/maps/alpha/roads.json','utf8'));
const field={gridToWorld:([x,y])=>({x:(x-63.5)*32,y:(63.5-y)*32}),roadNetwork:network};
const roads=baseApproachRoads(field,config),street=roads[0],mask=createLocalRoadMask(T);mask.setRoads(roads);
const east=street.points[1],survey=network.paths.find(p=>p.from==='player'),join=survey.points.find(p=>p.x>=east.x+190);
assert(street.points.some(p=>p.x===join.x&&p.y===join.y),'Join follows actual road centre');
const tail=street.points.at(-1),source=survey.points.find(p=>p.x===tail.x);assert.equal(tail.y,source.y);assert.equal(tail.width,source.width);
let angle=0,maxTurn=0,previousWidth=30;
for(let i=2;i<street.points.length;i++){
 const a=street.points[i-1],b=street.points[i],next=Math.atan2(b.y-a.y,b.x-a.x);
 maxTurn=Math.max(maxTurn,Math.abs(next-angle));angle=next;
 assert(b.width<=previousWidth+1e-7&&b.width>=24,'No widening hump');previousWidth=b.width;
}
assert(maxTurn<.06,'No sharp turn at either end: '+maxTurn);
// The old alignment used to protrude above the new road at this exact spot.
assert(mask.blendAt(east.x+35,east.y+27,1)<.1,'Old asphalt must be erased outside the replacement carriageway');
assert(mask.blendAt(east.x+35,east.y+4,0)>.9,'New carriageway remains continuous');
assert(mask.blendAt(join.x,join.y,0)>.9,'Connection to surveyed road has no sand gap');
const fallback=baseApproachRoads({gridToWorld:field.gridToWorld},config)[0];assert(fallback.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
const cached=createLocalRoadMask(T),reference=createLocalRoadMask(T);
const driveway={width:27,points:[{x:east.x-36,y:east.y-58},{x:east.x,y:east.y}]};
const extended={...driveway,points:[{x:east.x-36,y:east.y-220},driveway.points[1]]};
const verify=(base,access)=>{
 const paths=[...base,...access];
 cached.setRoads(paths,base.length);reference.setRoads(paths);
 const a=cached.uniforms,b=reference.uniforms;
 assert.deepEqual(a.localRoadBounds.value.toArray(),b.localRoadBounds.value.toArray());
 const bytes=u=>Buffer.from(u.localRoadMask.value.image.data.buffer);
 assert(bytes(a).equals(bytes(b)),'Cached raster matches a full raster byte for byte');
};
verify(roads,[]);verify(roads,[driveway]);verify(roads,[extended]);verify(roads,[]);
verify(roads.map(road=>({...road,width:road.width+1})),[driveway]);verify(roads,[driveway]);

// Exercise the asynchronous publisher with controllable replies, independent
// of the browser's worker scheduling.
let worker;
globalThis.Worker=class {
 requests=[];
 constructor(){worker=this;}
 postMessage(request){this.requests.push(request);}
};
try{
 const cutout=createRoadJunctionCutout(T),material=new T.MeshBasicMaterial(),shader={uniforms:{},vertexShader:'',fragmentShader:''};
 cutout.apply(material);material.onBeforeCompile(shader);
 const publish=({revision,roads})=>{
  reference.setRoads(roads);
  const {localRoadBounds,localRoadMask}=reference.uniforms;
  const {data,width:size}=localRoadMask.value.image;
  worker.onmessage({data:{revision,bounds:localRoadBounds.value.toArray(),data,size}});
 };
 cutout.setRoads([driveway]);cutout.setRoads([extended]);cutout.setRoads([driveway,extended]);
 assert.equal(worker.requests.length,1,'Only one raster can be in flight');
 publish(worker.requests[0]);assert.equal(shader.uniforms.junctionEnabled.value,0,'A stale reply cannot replace the current mask');
 assert.equal(worker.requests.length,2);assert.equal(worker.requests[1].roads.length,2,'Intermediate requests coalesce');
 publish(worker.requests[1]);assert.equal(shader.uniforms.junctionEnabled.value,1);
 assert.deepEqual(shader.uniforms.junctionBounds.value.toArray(),reference.uniforms.localRoadBounds.value.toArray());
 cutout.setRoads([driveway]);cutout.setRoads([]);publish(worker.requests[2]);
 assert.equal(shader.uniforms.junctionEnabled.value,0,'Removing the last road invalidates an in-flight reply');
}finally{delete globalThis.Worker;}
console.log('PASS: surveyed join, old asphalt removal, byte-identical cached raster, coalesced junction updates and stale reply rejection');
