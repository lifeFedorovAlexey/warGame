import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHeightfield} from '../demo/map-route.js';
import {shapeMesaRims} from '../demo/mesa-shaping.js';
import {refineRoadHeightfield} from '../demo/road-heightfield.js';
import {applyRoadGrades} from '../demo/road-grading.js';

const json=path=>JSON.parse(fs.readFileSync(path,'utf8'));
const raw=createHeightfield(json('assets/maps/alpha/heightfield.json'));shapeMesaRims(raw);
const field=refineRoadHeightfield(raw);applyRoadGrades(field,json('assets/maps/alpha/roads.json'));
const reference=(x,y)=>({x:(field.heightAt(x+.1,y)-field.heightAt(x-.1,y))/.2,y:(field.heightAt(x,y+.1)-field.heightAt(x,y-.1))/.2});
let seed=19452;
const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
const points=[];
for(let i=0;i<100000;i++)points.push([(random()-.5)*field.extent,(random()-.5)*field.extent]);
// Include both sides of the shared diagonal, cell borders, and clamped map
// edges: an analytic slope is NOT equivalent to the old sampler there.
for(let i=0;i<300;i++){
 const col=Math.floor(random()*(field.renderSize-1)),row=Math.floor(random()*(field.renderSize-1));
 for(const delta of [-.10001,-.1,-.09999,0,.09999,.1,.10001]){
  points.push([col*field.renderCell-field.half+delta,field.half-(row+.37)*field.renderCell]);
  points.push([(col+.37)*field.renderCell-field.half,field.half-(row+.63)*field.renderCell+delta]);
 }
}
for(const x of [-field.half-.2,-field.half,-field.half+.05,field.half-.05,field.half,field.half+.2])
 for(const y of [-field.half-.2,-field.half,-field.half+.05,field.half-.05,field.half,field.half+.2])points.push([x,y]);
let maximumError=0;
for(const [x,y] of points){
 const a=field.gradientAt(x,y),b=reference(x,y),error=Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
 maximumError=Math.max(maximumError,error);assert.ok(error<1e-9,`gradient mismatch at ${x},${y}: ${error}`);
}
// Height edits remain immediately visible: no stale terrain cache is added.
const at=13*field.renderSize+17,old=field.renderSamples[at];field.renderSamples[at]+=1.25;
const x=(17+.2)*field.renderCell-field.half,y=field.half-(13+.3)*field.renderCell;
assert.ok(Math.abs(field.gradientAt(x,y).x-reference(x,y).x)<1e-9);field.renderSamples[at]=old;
const measure=fn=>{let sum=0;const start=performance.now();for(const [x,y] of points){const g=fn(x,y);sum+=g.x+g.y;}return{ms:performance.now()-start,sum};};
for(let i=0;i<3;i++){measure(reference);measure(field.gradientAt);}
const oldTimes=[],newTimes=[];
for(let i=0;i<7;i++){if(i%2){newTimes.push(measure(field.gradientAt).ms);oldTimes.push(measure(reference).ms);}else{oldTimes.push(measure(reference).ms);newTimes.push(measure(field.gradientAt).ms);}}
const median=values=>values.slice().sort((a,b)=>a-b)[Math.floor(values.length/2)];
const report={passed:true,samples:points.length,maximumError,referenceMedianMs:median(oldTimes),optimizedMedianMs:median(newTimes),note:'Isolated Node gradient microbenchmark, not game FPS or command latency.'};
fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/road-gradient.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
