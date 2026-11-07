import fs from 'node:fs';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){return next(specifier==='three'?new URL('../demo/vendor/three.module.js',import.meta.url).href:specifier,context);}});
const T=await import('../demo/vendor/three.module.js'),{GLTFLoader}=await import('../demo/vendor/loaders/GLTFLoader.js');
for(const lod of [0,1,2]){
 const b=fs.readFileSync(`assets/vehicles/C01/C01-lod${lod}.glb`),asset=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
 asset.scene.rotation.x=Math.PI/2;asset.scene.updateMatrixWorld(true);
 const wheels=[],suspension=[];asset.scene.traverse(n=>{
  if(n.name.endsWith('_wheel')){const box=new T.Box3().setFromObject(n);wheels.push({name:n.name,min:box.min.toArray(),max:box.max.toArray(),position:n.position.toArray()});}
  if(n.name.endsWith('_suspension'))suspension.push({name:n.name,local:n.position.toArray(),world:n.getWorldPosition(new T.Vector3()).toArray()});
 });console.log(JSON.stringify({lod,wheels,suspension}));
}
