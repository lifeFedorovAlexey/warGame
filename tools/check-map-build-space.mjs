import assert from 'node:assert/strict';
import {createHeightfield} from '../demo/map-route.js';
import {shapeMesaRims} from '../demo/mesa-shaping.js';
import {refineRoadHeightfield} from '../demo/road-heightfield.js';
import {makeMission,readJson} from './m02-fixture.mjs';
import {prepareM02Diagnostic} from '../campaign/mission02-diagnostic.js';

const original=createHeightfield(readJson('assets/maps/alpha/heightfield.json'));shapeMesaRims(original);
const before=refineRoadHeightfield(original,{rockEscarpments:false}),after=refineRoadHeightfield(original),n=before.renderSize,s=before.renderSamples,t=after.renderSamples;
let protectedTriangles=0;
for(let y=0;y<n-1;y++)for(let x=0;x<n-1;x++){
 const i=y*n+x;
 for(const vertices of [[i,i+1,i+n],[i+n+1,i+n,i+1]]){
  const [a,b,c]=vertices;
  if(Math.hypot(s[b]-s[a],s[c]-s[a])/before.renderCell>.28)continue;
  for(const v of vertices)assert.equal(t[v],s[v],'Rock shaping must not change any foundation-suitable triangle');
  protectedTriangles++;
 }
}
assert(after.rockEscarpments.changed>0);
const report={protectedTriangles,escarpments:after.rockEscarpments,missions:[]};
for(const phase of ['m01','m02']){
 const m=phase==='m02'?prepareM02Diagnostic(makeMission()):makeMission();
 m.explored.fill(255);m.visible.fill(255);m.state.storyConstruction={enabled:false};m.state.research['mg-tower']=true;m.state.energy=2400;
 // Southern expansion is assessed after its defenders and wrecks are cleared.
 // Terrain, roads, scenery and existing player infrastructure stay in place.
 if(phase==='m02'){m.state.buildings=m.state.buildings.filter(b=>b.owner==='rai');m.state.units=m.state.units.filter(u=>u.owner==='rai');m.rebuildNavigation();}
 const kinds=Object.keys(m.config.buildings).filter(k=>!m.config.buildings[k].enemyOnly),sites={};
 for(const kind of kinds){
  let selected=null,count=0;
  const candidates=m.config.buildings[kind].requiresOil?m.config.oilFields:
   Array.from({length:phase==='m02'?46:43},(_,row)=>Array.from({length:42},(_,col)=>[7+col,(phase==='m02'?68:20)+row])).flat();
  for(const grid of candidates){
   if(phase==='m02'&&grid[1]<68)continue;
   const p=m.field.gridToWorld(grid),place=m.placement(kind,p.x,p.y,0,{checkMoney:false,snap:false});
   if(place.ok){count++;selected??={grid,place};}
  }
  assert(count>0,phase+' has available space for '+kind);sites[kind]={availableSamples:count,example:selected.grid};
 }
 // The original prepared base pads must still work, with the larger factory
 // and its real two-sided road access, not just a small defensive structure.
 if(phase==='m01')for(const site of m.config.baseSites){
  const p=m.field.gridToWorld(site.grid),place=m.placement(site.kind,p.x,p.y,(site.rotationDegrees??0)*Math.PI/180,{checkMoney:false,snap:false});
  assert(place.ok,site.kind+' prepared pad: '+place.reason);
 }
 report.missions.push({phase,sites});
}
console.log('PASS unchanged buildable terrain, original base pads, and every player building in both mission regions',JSON.stringify(report));
