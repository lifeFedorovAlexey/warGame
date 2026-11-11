import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import * as T from '../demo/vendor/three.module.js';
import {applyDamageHit,applyStructuralImpact,createDamageState,destroyDamage,partMissing,restoreDeferredParts} from '../campaign/damage-state.js';
registerHooks({resolve(specifier,context,next){return next(specifier==='three'?new URL('../demo/vendor/three.module.js',import.meta.url).href:specifier,context);}});
const {createScavPrefab}=await import('../campaign/scav-prefabs.js');
for(const site of ['nw-pocket','nw-west','nw-east','west-south','nw-pocket:watch']){
 const parts=createScavPrefab(T,'mg-tower',site).userData.damageParts;
 const id=name=>Number(Object.keys(parts).find(key=>parts[key].name===name));
 assert(Object.values(parts).filter(p=>p.detachable).every(p=>p.detachOnWreck),`${site}: tower pieces remain attached while alive`);
 const state=createDamageState(),weapon=id('weapon');
 const hit={partId:weapon,point:[0,0,0],normal:[0,0,1],direction:[0,0,-1],power:500,type:'shell'};
 applyDamageHit(state,hit,parts[weapon],{deform:false});
 assert(!partMissing(state,weapon),`${site}: damaged weapon remains functional`);
 assert(state.parts[weapon].damage>0,`${site}: hit still records damage`);
 const leg=id('leg_lower_-2.2_-2.2');
 applyStructuralImpact(state,{...hit,partId:0},[{id:leg,min:[-.1,-.1,-.1],max:[.1,.1,.1]}],parts);
 assert(!partMissing(state,leg),`${site}: indirect damage does not detach a live support`);
 const saved=JSON.parse(JSON.stringify(state));saved.parts[weapon].detached=true;saved.parts[leg].detached=true;
 const restored=restoreDeferredParts(saved,parts);assert(restored.includes(weapon)&&restored.includes(leg),`${site}: old save is repaired`);
 assert(!partMissing(saved,weapon)&&!partMissing(saved,leg),`${site}: restored tower is intact`);
 destroyDamage(saved);saved.parts[weapon].detached=true;assert.deepEqual(restoreDeferredParts(saved,parts),[],`${site}: destroyed tower stays destroyed`);
}
// Other objects retain the existing behaviour: local damage can detach parts.
const regular=createDamageState(),ordinary={material:'metal',detachable:true,strength:20};
applyDamageHit(regular,{partId:5,point:[0,0,0],normal:[0,0,1],direction:[0,0,-1],power:30},ordinary,{deform:false});
assert(partMissing(regular,5),'ordinary detachable parts still break on impact');
console.log('PASS live tower damage and weapon, legacy restoration, wreck protection, ordinary parts');
