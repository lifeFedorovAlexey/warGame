import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){return next(s==='three'?new URL('../demo/vendor/three.module.js',import.meta.url).href:s,c);}});
const T=await import('../demo/vendor/three.module.js');
const {makeMission}=await import('./m02-fixture.mjs');
const {prepareM02Diagnostic}=await import('../campaign/mission02-diagnostic.js');
const {createBuildingPrefab}=await import('../campaign/prefabs.js');
const {createM02Factory}=await import('../campaign/mission02-factory.js');
const {styleM02Workshop}=await import('../campaign/mission02-workshop-style.js');
const {prepareDamageGeometry,createDamageCollider}=await import('../campaign/damage-geometry.js');
const {createDamageState,applyDamageHit,partMissing,MAX_PARTS}=await import('../campaign/damage-state.js');
const {updateWrecks}=await import('../campaign/wreck-lifecycle.js');
const m=prepareM02Diagnostic(makeMission()),before=JSON.stringify(m.nav.solids),models=new Map();
models.set('scav-factory',createM02Factory(T));
for(const kind of ['scav-sensor','scav-generator','generator','bunker','scav-flame-tower','scav-cannon-tower']){
 const render=kind==='scav-generator'?'generator':kind.endsWith('-tower')?'mg-tower':kind;
 models.set(kind,styleM02Workshop(T,createBuildingPrefab(T,render,m.config.buildings[kind]),kind,m.config.buildings[kind]));
}
for(const [kind,root] of models){
 const parts=root.userData.damageParts;assert(Object.keys(parts).every(id=>Number(id)<MAX_PARTS),kind+' stays within the damage texture capacity');
 const details=root.getObjectByName(kind==='scav-factory'?'workshop_reinforcement':'scav_workshop_details');assert(details);
 let meshes=0;details.traverse(node=>{
  if(!node.isMesh)return;meshes++;const attribute=node.geometry.attributes.damagePart;assert(attribute);
  for(const id of attribute.array){assert(id>0&&id<MAX_PARTS&&parts[id]);assert(parts[id].detachable);}
  assert.equal(node.userData.damageParts,parts);
 });assert(meshes>0);
}
const sensor=models.get('scav-sensor');sensor.updateMatrixWorld(true);
const canopy=sensor.getObjectByName('salvaged_canopy'),bindings=[];
canopy.traverse(node=>{if(node.isMesh)bindings.push(prepareDamageGeometry(T,node,'building',0));});
const collider=createDamageCollider(T,bindings),state=createDamageState();
const hit=collider.trace([-2.35,.15,8],[0,0,-1],state);assert(hit,'An actual projectile ray reaches the attached canopy');
assert.equal(sensor.userData.damageParts[hit.partId].name,'salvaged_canopy');
applyDamageHit(state,{...hit,type:'bullet',power:1000,direction:[0,0,-1]},sensor.userData.damageParts[hit.partId]);
assert(partMissing(state,hit.partId),'The canopy breaks after damage');
assert.equal(collider.trace([-2.35,.15,8],[0,0,-1],state),null,'The detached canopy no longer intercepts shots');
assert.equal(JSON.stringify(m.nav.solids),before,'Visual attachments never register navigation colliders');
const targets=m.state.buildings.filter(b=>b.m02Base),ids=new Set(targets.map(b=>b.id));
assert(targets.every(b=>b.hp>0&&Number.isFinite(b.hp)));
for(const b of targets)m.damage(b,b.hp);
m.load(m.save());assert(m.state.buildings.filter(b=>ids.has(b.id)).every(b=>b.hp===0),'Loading never revives decorated buildings');
m.state.time+=8;updateWrecks(m);m.rebuildNavigation();assert(!m.nav.solids.some(b=>ids.has(b.id)),'Destroyed bases leave no permanent collision boxes');
console.log('PASS seven styled prefabs, damage-part capacity, actual canopy hit/detachment, unchanged decor collisions, all four bases destroyed, save/reload and wreck cleanup');
