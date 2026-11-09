import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import * as T from '../demo/vendor/three.module.js';
import {sightVolumes} from '../campaign/combat-sight.js';
registerHooks({resolve(s,c,next){return next(s==='three'?new URL('../demo/vendor/three.module.js',import.meta.url).href:s,c);}});
const {createScavBasePrefab}=await import('../campaign/scav-base-prefabs.js');
const meshes=root=>{const result=[];root.traverse(o=>{if(o.isMesh)result.push(o);});return result;};
for(const kind of ['scav-barracks','scav-store','scav-fence','scav-gate']){
 const root=createScavBasePrefab(T,kind,'nw-pocket'),parts=meshes(root);
 assert(parts.length<=4,kind+' is batched per material');
 assert(parts.length>0);assert(root.userData.damageParts[16]?.detachable,kind+' has removable sheets');
 for(const mesh of parts){
  const position=mesh.geometry.attributes.position,damage=mesh.geometry.attributes.damagePart;
  assert.equal(position.count,damage.count);
  assert(Array.from(position.array).every(Number.isFinite),kind+' has finite vertices');
 }
}
const flat=meshes(createScavBasePrefab(T,'scav-fence','test',7,'1'));
const profile=[-1,0,2],sloped=meshes(createScavBasePrefab(T,'scav-fence','test',7,'1',profile));
for(let i=0;i<flat.length;i++){
 const a=flat[i].geometry.attributes.position,b=sloped[i].geometry.attributes.position;
 for(let v=0;v<a.count;v++){
  const x=a.getX(v),t=Math.max(0,Math.min(2,x/7*2+1)),k=Math.min(1,Math.floor(t)),height=profile[k]+(profile[k+1]-profile[k])*(t-k);
  assert.equal(a.getX(v),b.getX(v));assert.equal(a.getY(v),b.getY(v));
  assert(Math.abs(b.getZ(v)-a.getZ(v)-height)<1e-5,'Fence sheets, posts and rails follow the same continuous ground profile');
 }
}
const boxes=sightVolumes({kind:'scav-fence',fenceSpan:7,fenceProfile:profile},{},4.5);
assert.equal(Math.min(...boxes.map(b=>b[2])),-1);assert.equal(Math.max(...boxes.map(b=>b[5])),4.5,'Sight blockers follow the raised end of the fence');
console.log('PASS: four batched scrap models, detachable sheets, slope-conforming geometry and sight volumes');
