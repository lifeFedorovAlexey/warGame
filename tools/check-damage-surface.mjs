import fs from 'node:fs';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){return next(specifier==='three'?new URL('../demo/vendor/three.module.js',import.meta.url).href:specifier,context);}});
const T=await import('../demo/vendor/three.module.js'),{GLTFLoader}=await import('../demo/vendor/loaders/GLTFLoader.js');
const {prepareDamageGeometry,createDamageCollider}=await import('../campaign/damage-geometry.js');
const {createDamageState,applyDamageHit,cageSample}=await import('../campaign/damage-state.js');
const results=[];
for(const lod of [0,1]){
  const bytes=fs.readFileSync(`assets/vehicles/B01/B01-lod${lod}.glb`),asset=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  asset.scene.rotation.x=Math.PI/2;asset.scene.position.z=1.05;asset.scene.updateMatrixWorld(true);
  const bindings=[];asset.scene.traverse(n=>{if(n.isMesh)bindings.push(prepareDamageGeometry(T,n,'body',lod));});
  const shell=createDamageCollider(T,bindings.filter(b=>b.material.name==='paint_olive')),state=createDamageState();
  for(const [y,z] of [[-.5,1.65],[-.8,1.8],[-.6,1.7]])applyDamageHit(state,{point:[.9715,y,z],normal:[1,0,0],direction:[-1,0,0],power:150,type:'collision',partId:0});
  let sampled=0,penetrating=0,worst=0;
  for(const binding of bindings.filter(b=>/window_glass/.test(b.material.name))){
    const g=binding.geometry,p=g.attributes.damagePosition,parts=g.attributes.damagePart;
    for(let i=0;i<(g.index?.count??p.count);i+=3){
      const ids=[0,1,2].map(k=>g.index?g.index.getX(i+k):i+k);if(parts.getX(ids[0])!==13)continue;
      const vertices=ids.map(id=>{const rest=[p.getX(id),p.getY(id),p.getZ(id)],offset=cageSample(state,rest);return rest.map((v,k)=>v+offset[k]);});
      const point=[0,1,2].map(k=>vertices.reduce((s,p)=>s+p[k],0)/3),hit=shell.trace([point[0]+.2,point[1],point[2]],[-1,0,0],state);
      if(!hit)continue;sampled++;const depth=hit.point[0]-point[0];worst=Math.max(worst,depth);if(depth>.001)penetrating++;
    }
  }
  results.push({lod,sampled,penetrating,worstPenetrationMetres:worst});
}
console.log(JSON.stringify(results));
assert(results.every(r=>r.sampled>0&&r.penetrating===0),'Damaged shell must stay behind the attached glass');
