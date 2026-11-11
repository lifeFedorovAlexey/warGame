import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import * as T from '../demo/vendor/three.module.js';
registerHooks({resolve(s,c,next){return next(s==='three'?new URL('../demo/vendor/three.module.js',import.meta.url).href:s,c);}});
const {createConcreteFence,concreteFenceVariant}=await import('../campaign/concrete-fence.js');
import {prepareDamageGeometry,createDamageCollider} from '../campaign/damage-geometry.js';
import {createDamageState,applyDamageHit,partMissing,MAX_PARTS} from '../campaign/damage-state.js';
const shapes=new Set();let hits=0;
for(let v=0;v<8;v++)for(const span of [4,6.2,7]){
 const root=createConcreteFence(T,'m02.base.east_factory:concrete-'+v,span,'reinforced'),parts=root.userData.damageParts,bindings=[];
 root.updateMatrixWorld(true);const bounds=new T.Box3().setFromObject(root);
 assert(bounds.max.x-bounds.min.x<span+.09,'Keep the existing gate width');
 assert(bounds.max.y-bounds.min.y<=.7,'All leaning panels stay inside the original fence depth');
 let meshCount=0;const positions=[];
 root.traverse(n=>{if(!n.isMesh)return;meshCount++;positions.push(...n.geometry.attributes.position.array);assert(n.geometry.attributes.position.array.every(Number.isFinite));
  for(const id of n.geometry.attributes.damagePart.array)assert(id<MAX_PARTS&&parts[id]?.detachable,'Posts, slabs, relief and repair sheets are destructible');
  bindings.push(prepareDamageGeometry(T,n,'building',0));
 });
 assert(meshCount<=4,'Fence geometry stays batched by material');shapes.add(positions.join(','));
 const collider=createDamageCollider(T,bindings),state=createDamageState(),x=-span/2+span/Math.ceil(span/3.2)/2;
 const hit=collider.trace([x,-2,1.4],[0,1,0],state);assert(hit&&parts[hit.partId].material==='concrete','Bullet hits the actual concrete face');
 applyDamageHit(state,{...hit,type:'bullet',power:3000,direction:[0,1,0]},parts[hit.partId]);
 assert(partMissing(state,hit.partId));assert(!collider.trace([x,-2,1.4],[0,1,0],state),'Destroyed slab no longer intercepts fire');hits++;
}
assert(shapes.size>8,'Weathering and leaning vary across the perimeter');
assert.equal(concreteFenceVariant({id:'saved-fence'}),concreteFenceVariant({id:'saved-fence'}),'Saved fence appearance is deterministic');
console.log('PASS concrete fence variants, existing dimensions, bounded leaning, batched geometry and actual projectile destruction',hits);
