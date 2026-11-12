import fs from 'node:fs';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {makeMission} from './m02-fixture.mjs';
import {createM03Field,m03Point} from '../campaign/mission03-terrain.js';
const original=JSON.parse(fs.readFileSync('campaign/previews/m03/travel.json','utf8')),results=[];
const routes={centre:[[17,76],[18,65],[19,55],[19,43],[20,31],[18,22],[16.5,12.5]],east:[[31,84],[37,70],[37,60],[38,46],[38,29],[37,16],[30,18],[28,16],[24,16],[20,14],[16.5,12.5]],west:[[17,76],[18,65],[19,55],[19,43],[12,36],[8,38],[7,22],[6,16],[13,18],[16.5,12.5]]};
for(const [routeId,grids] of Object.entries(routes)){
 const m=makeMission(createM03Field());m.load(structuredClone(original));
 for(const spec of [...Object.values(m.config.units),...Object.values(m.config.buildings)])spec.damage=0;
 m.advance(185);const u=m.state.units.find(v=>v.owner==='rai'&&v.kind==='bukhanka'),points=grids.map(m03Point);
 const started=performance.now(),startTime=m.state.time;let worstGrade=0,checks=0;
 // Execute the actual navigator and vehicle controller through the full road.
 for(const [index,desired] of points.entries()){
  let point=desired;if(index<points.length-1){const candidates=[];for(let dx=-72;dx<=72;dx+=8)for(let dy=-72;dy<=72;dy+=8){const p={x:desired.x+dx,y:desired.y+dy};if(m.vehicleMotionClear(u,{...u,...p},{...u,...p}))candidates.push(p);}candidates.sort((a,b)=>Math.hypot(a.x-desired.x,a.y-desired.y)-Math.hypot(b.x-desired.x,b.y-desired.y));point=candidates.find(p=>m.nav.findPath(u,p)?.length);assert(point,'Reachable pass waypoint '+routeId+' '+index);}
  assert(m.submitOrder([u.id],'move',point,{expandGroup:false}).ok);let reached=false;
  for(let i=0;i<240;i++){m.advance(.5);const g=m.field.gradientAt(u.x,u.y);worstGrade=Math.max(worstGrade,Math.hypot(g.x,g.y));checks++;assert(m.nav.terrainAllowed.clearSegment(u,u),'Vehicle crosses a cliff');if(Math.hypot(u.x-point.x,u.y-point.y)<(index===points.length-1?24:32)){reached=true;break;}}
  if(!reached)fs.writeFileSync('campaign/previews/m03/drive-stuck.json',m.save());
  assert(reached,`${routeId} waypoint ${index}: ${Math.round(u.x)},${Math.round(u.y)} -> ${Math.round(point.x)},${Math.round(point.y)}; ${JSON.stringify(u.pendingOrder)}`);
 }
 m.advance(.5);assert.equal(m.state.m03.artifact.carrierId,u.id);results.push({route:routeId,simulationSeconds:m.state.time-startTime,cpuMs:performance.now()-started,worstGrade,checks});
}
fs.writeFileSync('campaign/previews/m03/drive.json',JSON.stringify(results,null,2));console.log('PASS',JSON.stringify(results));
