import assert from 'node:assert/strict';
import fs from 'node:fs';
import {TerrainNavigator} from '../campaign/navigation.js';
import {referenceLineClear} from './fixtures/navigation-line-clear-reference.mjs';
import {createHeightfield} from '../demo/map-route.js';
import {shapeMesaRims} from '../demo/mesa-shaping.js';
import {refineRoadHeightfield} from '../demo/road-heightfield.js';
import {applyRoadGrades} from '../demo/road-grading.js';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const raw=createHeightfield(read('assets/maps/alpha/heightfield.json'));shapeMesaRims(raw);
const field=refineRoadHeightfield(raw);applyRoadGrades(field,read('assets/maps/alpha/roads.json'));
const nav=new TerrainNavigator(field,{bounds:[0,0,127,127]}),size=nav.size,directions=[];
for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(dx||dy)directions.push([dx,dy]);
let checks=0,forbidden=0,fastCalls=0;const fast=nav.terrainGridEdgeClear;
nav.terrainGridEdgeClear=function(...args){fastCalls++;return fast.apply(this,args);};
for(let row=0;row<size;row++)for(let col=0;col<size;col++)for(const [dx,dy] of directions){
 const x=col+dx,y=row+dy;if(x<0||y<0||x>=size||y>=size)continue;
 const a=nav.position(col,row),b=nav.position(x,y),expected=referenceLineClear.call(nav,a,b,true);
 assert.equal(nav.lineClear(a,b,true),expected,`Grid edge mismatch ${col},${row}->${x},${y}`);checks++;
 if(!nav.walkable[row*size+col]||!nav.walkable[y*size+x])forbidden++;
 // Vary grades on a deterministic lattice, including map borders and all
 // triangle directions. The full grid above always uses the actual .52 limit.
 if((col*17+row*31)%997===0||!col||!row||col===size-1||row===size-1)
  for(const grade of [0,.2,.52,.76,Infinity]){assert.equal(nav.lineClear(a,b,true,false,grade),referenceLineClear.call(nav,a,b,true,false,grade));checks++;}
}
const beforeFallback=fastCalls,a=nav.position(20,20),b=nav.position(21,21);
for(const args of [[a,b,false],[a,b,true,true],[a,b,true,false,.52,true],[a,b,true,false,.52,false,true],
 [a,b,true,false,.52,false,false,{x:a.x,y:a.y,height:0,radius:50}],
 [{x:a.x+.001,y:a.y},b,true],[a,nav.position(22,22),true],[nav.position(-1,0),nav.position(0,0),true]])
 assert.equal(nav.lineClear(...args),referenceLineClear.call(nav,...args));
const oldCell=field.renderCell;field.renderCell=16;assert.equal(nav.lineClear(a,b,true),referenceLineClear.call(nav,a,b,true));field.renderCell=oldCell;
const oldOrigin=field.half;field.half+=.1;assert.equal(nav.lineClear(a,b,true),referenceLineClear.call(nav,a,b,true));field.half=oldOrigin;
assert.equal(fastCalls,beforeFallback,'Physical, escape, noncanonical and nonmatching-grid calls retain the original implementation');
const sample=[];for(let row=0;row<size;row+=7)for(let col=0;col<size;col+=7)for(const [dx,dy] of directions)
 if(col+dx>=0&&row+dy>=0&&col+dx<size&&row+dy<size)sample.push([nav.position(col,row),nav.position(col+dx,row+dy)]);
const timed=method=>{let accepted=0;const began=performance.now();for(const [a,b] of sample)if(method.call(nav,a,b,true))accepted++;return{ms:performance.now()-began,accepted};};
const timings=[{kind:'reference',...timed(referenceLineClear)},{kind:'fast',...timed(nav.lineClear)},{kind:'fast',...timed(nav.lineClear)},{kind:'reference',...timed(referenceLineClear)}];
assert.equal(new Set(timings.map(t=>t.accepted)).size,1);
const report={passed:true,checks,forbiddenEdges:forbidden,fastCalls,directions:directions.length,fallback:true,timings};
fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/navigation-grid-edge-equivalence.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
