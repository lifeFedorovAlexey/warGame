import assert from 'node:assert/strict';
import fs from 'node:fs';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){return next(s==='three'?new URL('../demo/vendor/three.module.js',import.meta.url).href:s,c);}});
const T=await import('../demo/vendor/three.module.js');
const {createDesertDressing}=await import('../campaign/desert-dressing.js');
const {makeMission}=await import('./m02-fixture.mjs');
const {baseApproachRoads}=await import('../campaign/base-roads.js');
const {scavBaseRoads}=await import('../campaign/scav-base-roads.js');
const {campBaseLayout}=await import('../campaign/scav-base-layout.js');
const {damLayout}=await import('../campaign/dam-layout.js');
const {siteCourts}=await import('../assets/campaign/alpha/mission02/site-plan.js');
const m=makeMission(),f=m.field,dam=damLayout(f,m.config);
const roads=[...f.roadNetwork.paths,...baseApproachRoads(f,m.config),dam.road,...scavBaseRoads(f,m.config),...f.m02Roads];
const before=JSON.stringify({solids:m.nav.solids,heights:Array.from(f.renderSamples),roads:f.localRoads});
const dressing=createDesertDressing(T,f,m.config,roads,dam,()=>{});
const matrix=new T.Matrix4();
function trees(name){
 const mesh=dressing.root.getObjectByName(name),result=[];
 for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);const p=new T.Vector3().setFromMatrixPosition(matrix),s=new T.Vector3().setFromMatrixScale(matrix);result.push({...p,radius:s.x*(name==='birch_trunks'?2.25:2.13),grid:f.worldToGrid(p.x,p.y)});}
 return result;
}
const birches=trees('birch_trunks'),pines=trees('pine_trunks'),bins=Array.from({length:8},()=>[0,0,0]);
for(const p of birches){assert(p.grid[0]>=1&&p.grid[0]<=52&&p.grid[1]>=1&&p.grid[1]<=126);bins[Math.floor(p.grid[1]/(127/8))][Math.floor(p.grid[0]/(53/3))]++;}
assert(bins.every(row=>row.every(n=>n>=2)),'Each broad map region has a birch grove, including the southern extension');
const boxes=[...m.config.camps,...m.config.m01LegacyLayout.camps].map(c=>campBaseLayout({...c,...f.gridToWorld(c.grid)})?.bounds).filter(Boolean);
for(const site of siteCourts){const a=f.gridToWorld(site.rect.slice(0,2)),b=f.gridToWorld(site.rect.slice(2));boxes.push([a.x,b.y,b.x,a.y]);}
let minRoadGap=Infinity,maxGrade=0;
for(const p of [...birches,...pines.filter(p=>p.grid[1]>63)]){
 assert(!boxes.some(([l,b,r,t])=>p.x>l-p.radius-19.99&&p.x<r+p.radius+19.99&&p.y>b-p.radius-19.99&&p.y<t+p.radius+19.99),'Trees stay outside both missions\' camp perimeters');
 const gradient=f.gradientAt(p.x,p.y);maxGrade=Math.max(maxGrade,Math.hypot(gradient.x,gradient.y));assert(maxGrade<=.421,'No trees on steep cliff faces');
 for(const road of roads)for(let i=1;i<road.points.length;i++){
  const a=road.points[i-1],b=road.points[i],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
  minRoadGap=Math.min(minRoadGap,Math.hypot(p.x-a.x-dx*t,p.y-a.y-dy*t)-(road.width??24)/2-p.radius);
 }
}
assert(minRoadGap>=11.99,'Tree crowns leave room beside actual roads');
assert.equal(JSON.stringify({solids:m.nav.solids,heights:Array.from(f.renderSamples),roads:f.localRoads}),before);
const second=createDesertDressing(T,f,m.config,roads,dam,()=>{});
for(const name of ['birch_trunks','small_birches','pine_trunks','small_pines'])assert.deepEqual(second.root.getObjectByName(name).instanceMatrix.array,dressing.root.getObjectByName(name).instanceMatrix.array,'Reload is deterministic');
const p=birches.find(p=>p.grid[1]>90),moved=dressing.setAccessRoads([{width:24,points:[{x:p.x-80,y:p.y},{x:p.x+80,y:p.y}]}]);assert(moved>0);
for(const [a,b] of [['birch_trunks','small_birches'],['pine_trunks','small_pines']])assert.deepEqual(dressing.root.getObjectByName(a).instanceMatrix.array,dressing.root.getObjectByName(b).instanceMatrix.array,'Road moves keep the crown and trunk paired');
const report={birches:birches.length,pines:pines.length,southernBirches:birches.filter(p=>p.grid[1]>63).length,southernPines:pines.filter(p=>p.grid[1]>63).length,birchesPerRegion:bins,minRoadGap,maxGrade,movedForRoad:moved,unchangedTerrainAndCollisions:true};
fs.mkdirSync('docs/playtest-evidence/birches-map',{recursive:true});fs.writeFileSync('docs/playtest-evidence/birches-map/layout.json',JSON.stringify(report,null,2)+'\n');
console.log('PASS',JSON.stringify(report));
