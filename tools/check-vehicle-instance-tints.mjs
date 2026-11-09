import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import * as T from '../demo/vendor/three.module.js';
registerHooks({resolve(specifier,context,next){return specifier==='three'?{url:new URL('../demo/vendor/three.module.js',import.meta.url).href,shortCircuit:true}:next(specifier,context);}});
const {PoseBatch}=await import('../campaign/vehicle-layer.js');
const parent=new T.Group(),prototype=new T.Group();
for(let i=0;i<3;i++){const mesh=new T.Mesh(new T.BoxGeometry(),new T.MeshBasicMaterial({color:0xffffff}));mesh.position.x=i;prototype.add(mesh);}
const damage={prepare:node=>({geometry:node.geometry,dynamic:false,bind:node.matrixWorld.clone(),linear:new T.Matrix3(),inverseLinear:new T.Matrix3()}),trackGeometry:()=>{},attach:()=>{}};
const a=new PoseBatch(T,parent,prototype,2,damage),b=new PoseBatch(T,parent,prototype,2,damage),matrix=new T.Matrix4(),color=new T.Color();
const paint=(batch,colors)=>{batch.begin();for(const rgb of colors)batch.add(matrix,color.setRGB(...rgb));batch.end();};
const check=(batch,expected)=>{for(const {mesh} of batch.parts){assert.equal(mesh.count,expected.length);for(const [i,rgb] of expected.entries()){mesh.getColorAt(i,color);assert.deepEqual(color.toArray(),rgb.map(Math.fround));}}};
const original=[[1,.4,.2],[.3,1,.2],[.1,.2,1],[.8,.7,.5],[1,1,1]];
paint(a,original);check(a,original);paint(b,[[.2,.3,.4]]);check(a,original);check(b,[[.2,.3,.4]]);
// Visibility and LOD repack instance indices. A reused slot must never retain
// another vehicle's tint, and shrinking/regrowing a batch must keep all parts.
paint(a,[original[3],original[0]]);check(a,[original[3],original[0]]);
paint(a,original.toReversed());check(a,original.toReversed());check(b,[[.2,.3,.4]]);
const version=a.colorAttribute.version;paint(a,original.toReversed());check(a,original.toReversed());assert.equal(a.colorAttribute.version,version,'An unchanged tint stream must not upload again');
console.log(JSON.stringify({passed:true,cases:['capacity growth','all primitives tinted','separate batches','visibility repacking','unchanged stream upload']}));
