import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){return next(s==='three'?new URL('../demo/vendor/three.module.js',import.meta.url).href:s,c);}});
const T=await import('../demo/vendor/three.module.js');
const {createScavPrefab}=await import('../campaign/scav-prefabs.js');
const {createScavBasePrefab}=await import('../campaign/scav-base-prefabs.js');
const {createM02Factory}=await import('../campaign/mission02-factory.js');
const {prepareDamageGeometry,createDamageCollider}=await import('../campaign/damage-geometry.js');
const {createDamageState,applyDamageHit,partMissing,MAX_PARTS}=await import('../campaign/damage-state.js');
const models=['nw-pocket','nw-west','nw-east','west-south:square-workshop'].map(site=>createScavPrefab(T,'camp-core',site));
for(const kind of ['scav-store','scav-barracks'])models.push(createScavBasePrefab(T,kind,'review'));
models.push(createM02Factory(T));
for(const root of models){
 root.updateMatrixWorld(true);const shell=root.getObjectByName('inhabited_masonry_shell');assert(shell);
 const parts=root.userData.damageParts,bounds=new T.Box3().setFromObject(shell);
 assert(bounds.max.x-bounds.min.x<11.5&&bounds.max.y-bounds.min.y<6.5,'Occupied ruin stays in the existing workshop footprint');
 shell.traverse(n=>{if(!n.isMesh)return;assert(n.geometry.attributes.damagePart);for(const id of n.geometry.attributes.damagePart.array){assert(id>0&&id<MAX_PARTS&&parts[id]?.detachable);assert.equal(n.userData.damageParts,parts);}});
 const wall=shell.getObjectByName('old_rear_masonry'),bindings=[];
 wall.traverse(n=>{if(n.isMesh)bindings.push(prepareDamageGeometry(T,n,'building',0));});
 const collider=createDamageCollider(T,bindings),state=createDamageState(),box=new T.Box3().setFromObject(wall),center=box.getCenter(new T.Vector3()),ray=[center.x,center.y,box.max.z+5];
 const hit=collider.trace(ray,[0,0,-1],state);assert(hit,'Projectile hits actual old masonry');
 assert.equal(parts[hit.partId].name,'old_rear_masonry');
 applyDamageHit(state,{...hit,type:'bullet',power:2000,direction:[0,0,-1]},parts[hit.partId]);
 assert(partMissing(state,hit.partId));assert.equal(collider.trace(ray,[0,0,-1],state),null,'Destroyed masonry no longer intercepts shots');
}
console.log('PASS seven occupied ruin prefabs: bounded footprint, every attachment damageable, actual masonry hit and removal');
