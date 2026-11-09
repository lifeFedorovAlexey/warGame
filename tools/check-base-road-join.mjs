import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../demo/vendor/three.module.js';
import {baseApproachRoads} from '../campaign/base-roads.js';
import {createLocalRoadMask} from '../demo/local-road-mask.js';
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
console.log('PASS: continuous surveyed join, bounded curvature, monotonic width, old-road overlap removed, fallback');
