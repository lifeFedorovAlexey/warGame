import assert from 'node:assert/strict';
import fs from 'node:fs';
import {registerHooks} from 'node:module';
import {makeMission} from './m02-fixture.mjs';
import {prepareM02Diagnostic} from '../campaign/mission02-diagnostic.js';
import {siteCourts} from '../assets/campaign/alpha/mission02/site-plan.js';
import {updateWrecks} from '../campaign/wreck-lifecycle.js';
import {sightVolumes} from '../campaign/combat-sight.js';
registerHooks({resolve(s,c,next){return next(s==='three'?new URL('../demo/vendor/three.module.js',import.meta.url).href:s,c);}});
const T=await import('../demo/vendor/three.module.js');
const {createBuildingPrefab}=await import('../campaign/prefabs.js');
const {createScavBasePrefab}=await import('../campaign/scav-base-prefabs.js');
const {styleM02Workshop}=await import('../campaign/mission02-workshop-style.js');
const {prepareDamageGeometry,createDamageCollider}=await import('../campaign/damage-geometry.js');
const {createDamageState}=await import('../campaign/damage-state.js');
const fresh=()=>prepareM02Diagnostic(makeMission()),m=fresh(),f=m.field,report={coverage:[],drives:[]};
const normal=edge=>[{x:0,y:-1},{x:-1,y:0},{x:0,y:1},{x:1,y:0}][edge];
const coverage=(site,p)=>{
 const target={...p,kind:'bukhanka',owner:'rai',hp:320};
 return m.state.buildings.filter(b=>b.m02Base===site&&b.hp>0&&m.buildingSpec(b).damage&&Math.hypot(b.x-p.x,b.y-p.y)<m.buildingSpec(b).range&&m.lineOfSight(b,target));
};
for(const site of siteCourts){
 const [l,t,r,b]=site.rect,corners=[[l,t],[r,t],[r,b],[l,b]].map(f.gridToWorld);
 const walls=m.state.buildings.filter(b=>b.m02Base===site.id&&b.kind==='scav-fence');
 // Probe the actual perimeter in world space, independently of tile generation.
 for(let edge=0;edge<4;edge++){
  const a=corners[edge],b=corners[(edge+1)%4],length=Math.hypot(b.x-a.x,b.y-a.y),n=normal(edge);
  for(let d=0;d<=length;d+=2){
   const p={x:a.x+(b.x-a.x)*d/length,y:a.y+(b.y-a.y)*d/length};
   if(site.gates.some(g=>{const q=f.gridToWorld(g.grid);return g.edge===edge&&Math.hypot(p.x-q.x,p.y-q.y)<=g.width/2;}))continue;
   assert(walls.some(w=>Math.abs(p.x-w.x)<=w.halfWidth+.01&&Math.abs(p.y-w.y)<=w.halfDepth+.01),site.id+' has an unintended perimeter hole');
  }
  const p={x:(a.x+b.x)/2-n.x*32,y:(a.y+b.y)/2-n.y*32},guns=coverage(site.id,p);
  assert(guns.length>=2,site.id+' edge '+edge+' needs overlapping fire');
  report.coverage.push({site:site.id,edge,guns:guns.length});
 }
 for(const gate of site.gates){
  const p=f.gridToWorld(gate.grid),n=normal(gate.edge),guns=coverage(site.id,{x:p.x-n.x*45,y:p.y-n.y*45});
  assert(guns.length>=2,site.id+' gate has overlapping fire');
  const target=m.addUnit('bukhanka','rai',{x:p.x-n.x*45,y:p.y-n.y*45});
  for(const gun of guns){const hp=target.hp;gun.cooldown=0;assert(m.attack(gun,target,m.buildingSpec(gun)));assert(target.hp<hp,'Gate defense fires real damaging shots');target.hp=target.maxHp;}
  m.state.units=m.state.units.filter(u=>u!==target);
  for(const side of [-8,0,8]){
   const pose={x:p.x-n.y*side,y:p.y+n.x*side,kind:'scav-bus',owner:'rai',heading:Math.atan2(-n.x,n.y)};
   const clear=m.vehicleMotionClear(pose,{...pose,x:pose.x-n.x*35,y:pose.y-n.y*35},{...pose,x:pose.x+n.x*35,y:pose.y+n.y*35},.52,undefined,[]);
   assert.equal(clear,!gate.closed,site.id+' bus corridor matches gate state');
  }
 }
}
const station=m.state.buildings.find(b=>b.m02Base==='energy_hub'&&b.kind==='generator');
assert.deepEqual([station.halfWidth,station.halfDepth],[63,54]);
assert.equal(m.state.buildings.filter(b=>b.m02Base==='energy_hub'&&['generator','scav-generator'].includes(b.kind)).length,1,'No duplicate miniature reactor');
const spec=m.config.buildings.generator,root=createBuildingPrefab(T,'generator',spec),geometries=[];
const priorFoundation=new T.Box3().setFromObject(root.getObjectByName('building_foundation')).getSize(new T.Vector3());
root.traverse(n=>{if(n.isMesh)geometries.push([n,n.geometry]);});
styleM02Workshop(T,root,'generator',spec);root.updateMatrixWorld(true);
assert(geometries.every(([n,g])=>n.geometry===g),'Existing station geometry is reused');
const foundation=new T.Box3().setFromObject(root.getObjectByName('building_foundation')).getSize(new T.Vector3());
assert(Math.abs(foundation.x/priorFoundation.x-2)<.01&&Math.abs(foundation.y/priorFoundation.y-2)<.01,'Whole existing asset doubles uniformly');
const bindings=[];root.getObjectByName('building_structure').traverse(n=>{if(n.isMesh&&n.visible)bindings.push(prepareDamageGeometry(T,n,'building',0));});
assert(createDamageCollider(T,bindings).trace([-8,1.36,15],[0,0,-1],createDamageState()),'Actual damage ray hits the enlarged hall beyond its former bounds');
assert(sightVolumes(station,spec,m.config.worldScale)[0][3]>10,'Line of sight uses the enlarged hall too');
for(const b of m.state.buildings.filter(b=>b.m02Gate)){
 const gate=createScavBasePrefab(T,b.kind,b.campId,b.fenceSpan,b.scavVariant,b.fenceProfile);
 gate.traverse(n=>{if(n.isMesh)assert(n.geometry.attributes.damagePart,'Every gate mesh is damageable');});
}
assert(!m.nav.solids.some(b=>b.environment),'Decoration has no collision solids');
// Simulate an older save with a damaged station, a destroyed wall and a cleared
// outpost. Upgrading must retain those facts and must be idempotent.
const legacy=fresh(),oldWall=legacy.state.buildings.find(b=>b.m02Base==='energy_hub'&&b.kind==='scav-fence'&&!b.m02Gate);
oldWall.id='m02.fort.energy_hub.legacy';oldWall.hp=0;oldWall.damage={wreck:true};oldWall.destroyedAt=legacy.state.time;
legacy.state.buildings=legacy.state.buildings.filter(b=>!b.m02Fortification||b===oldWall);
for(const base of Object.values(legacy.state.m02.bases))base.structureIds=base.structureIds.filter(id=>!id.startsWith('m02.fort.'));
legacy.state.m02.bases.sensor_outpost.state='neutralized';legacy.state.m02.fortificationVersion=1;
const damaged=legacy.state.buildings.find(b=>b.id===station.id);damaged.hp=475;damaged.halfWidth=31.5;damaged.halfDepth=27;
legacy.load(legacy.save());assert.equal(legacy.entity(station.id).hp,475);assert.equal(legacy.entity(station.id).halfWidth,63);
assert(legacy.state.buildings.some(b=>b.m02Base==='energy_hub'&&b.m02Fortification&&b.hp===0));
assert(!legacy.state.buildings.some(b=>b.m02Base==='sensor_outpost'&&b.m02Fortification));
const migrated=legacy.save();legacy.load(migrated);assert.equal(legacy.state.buildings.length,JSON.parse(migrated).state.buildings.length);
const revision=fresh(),watch=revision.state.buildings.find(b=>b.m02Fortification&&b.kind==='mg-tower'),watchId=watch.id;
watch.hp=211;revision.state.m02.fortificationVersion=2;
const watchCount=revision.state.buildings.filter(b=>b.m02Fortification&&b.kind==='mg-tower').length;
revision.load(revision.save());assert.equal(revision.entity(watchId).hp,211,'An existing wounded defender must survive a layout revision');
assert.equal(revision.state.buildings.filter(b=>b.m02Fortification&&b.kind==='mg-tower').length,watchCount);
// Physical driving, not just navigation paths: a full bus enters and leaves
// each compound through its main gate with the walls and leaves still present.
for(const site of siteCourts){
 const d=fresh();d.state.units=[];
 for(const spec of [...Object.values(d.config.units),...Object.values(d.config.buildings)])spec.damage=0;
 for(const base of Object.values(d.state.m02.bases))if(base.production)base.production.stopped=true;
 d.state.m02.observer.outcome='escaped';
 const gate=site.gates.find(g=>g.id==='main'),p=d.field.gridToWorld(gate.grid),n=normal(gate.edge),outside={x:p.x-n.x*70,y:p.y-n.y*70},inside={x:p.x+n.x*65,y:p.y+n.y*65};
 const bus=d.addUnit('scav-bus','rai',outside,{heading:Math.atan2(-n.x,n.y)});
 // Keep the diagnostic simulation running while the test drives an enemy hull.
 d.addUnit('builder','rai',d.field.gridToWorld(d.config.startGrid));
 const service=site.id==='sensor_outpost'?site.gates.find(g=>g.id==='service'):null,servicePoint=service&&d.field.gridToWorld(service.grid),serviceNormal=service&&normal(service.edge);
 const exit=service?{x:servicePoint.x-serviceNormal.x*60,y:servicePoint.y-serviceNormal.y*60}:outside;
 for(const [label,goal] of [['in',inside],['out',exit]]){
  assert(d.order([bus.id],'move',goal).ok);let seconds=0;
  while(seconds++<90&&Math.hypot(bus.x-goal.x,bus.y-goal.y)>14){d.advance(1);d.drainEffects();d.drainEvents();}
  assert(Math.hypot(bus.x-goal.x,bus.y-goal.y)<=14,site.id+' bus physically drives '+label+' '+JSON.stringify({distance:Math.hypot(bus.x-goal.x,bus.y-goal.y),grid:d.field.worldToGrid(bus.x,bus.y),heading:bus.heading,task:bus.task,path:bus.path,status:d.state.status}));
  report.drives.push({site:site.id,direction:label,seconds});
 }
}
const ids=new Set(m.state.buildings.filter(b=>b.m02Base).map(b=>b.id));
for(const b of m.state.buildings.filter(b=>ids.has(b.id)))m.damage(b,b.hp);
m.state.time+=8;updateWrecks(m);m.rebuildNavigation();m.load(m.save());
assert(!m.state.buildings.some(b=>ids.has(b.id)&&b.hp>0));assert(!m.nav.solids.some(b=>ids.has(b.id)),'Cleared compounds leave no invisible barriers');
fs.mkdirSync('docs/playtest-evidence/m02-compounds',{recursive:true});fs.writeFileSync('docs/playtest-evidence/m02-compounds/checks.json',JSON.stringify(report,null,2));
console.log('PASS complete perimeters, overlapping live fire, bus gate sweeps/drives, reused station, matching damage/LOS, destructible gates, save migration and wreck cleanup',JSON.stringify(report));
