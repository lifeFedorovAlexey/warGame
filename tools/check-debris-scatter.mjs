import assert from 'node:assert/strict';
import * as T from '../demo/vendor/three.module.js';
import {debrisLaunch,blastShards} from '../campaign/debris-motion.js';
import {createDamageDebris} from '../campaign/damage-debris.js';
import {prepareDamageGeometry} from '../campaign/damage-geometry.js';
import {createDamageState} from '../campaign/damage-state.js';

const sample={seed:174,size:[4,4,.24],offset:[5,2,3],direction:[0,1,0],power:350,wreck:true};
const roof=debrisLaunch({...sample,material:'metal'}),wall=debrisLaunch({...sample,material:'concrete'});
assert.deepEqual(roof,debrisLaunch({...sample,material:'metal'}),'A sampled launch is repeatable');
assert(roof.mass<wall.mass&&roof.velocity[2]>wall.velocity[2],'Thin roofing lifts more easily than concrete');
const small=debrisLaunch({...sample,size:[.2,.3,.4],material:'equipment'}),large=debrisLaunch({...sample,size:[2,3,4],material:'equipment'});
assert(Math.hypot(...small.velocity)>Math.hypot(...large.velocity),'Large fittings resist the same impulse');
const launches=Array.from({length:32},(_,seed)=>debrisLaunch({...sample,seed,material:'metal'}));
for(let axis=0;axis<3;axis++)assert(launches.some(l=>l.spin[axis]>0)&&launches.some(l=>l.spin[axis]<0),'Spin is not locked to a repeated axis/sign');
const lifts=launches.map(l=>l.velocity[2]);assert(Math.max(...lifts)-Math.min(...lifts)>2,'Pieces have visibly different arcs');
const forward=debrisLaunch({...sample,wreck:false,direction:[1,0,0]}),backward=debrisLaunch({...sample,wreck:false,direction:[-1,0,0]});
assert(forward.velocity[0]>0&&backward.velocity[0]<0,'Nonfatal parts follow the incoming impact');
const shards=blastShards(71,12,4.5);assert.deepEqual(shards,blastShards(71,12,4.5));assert.notDeepEqual(shards,blastShards(72,12,4.5));
assert(shards.length<=16);assert(new Set(shards.map(s=>Math.round(s.vz))).size>5,'Small debris has a range of heights');

// Exercise actual extracted meshes, including identical part IDs from the
// same prefab. Varying only helper outputs would miss a forgotten integration.
const field={heightAt:(x,y)=>x*.08+y*.025,gradientAt:()=>({x:.08,y:.025})},camera=new T.PerspectiveCamera();
const mesh=new T.Mesh(new T.BoxGeometry(4,3,.2),new T.MeshStandardMaterial());mesh.updateMatrixWorld(true);
const binding=prepareDamageGeometry(T,mesh,'weapon'),state=createDamageState();state.wreck=true;state.lastImpact={point:[0,-2,2]};
const matrix=new T.Matrix4().makeTranslation(0,0,6);
const run=dt=>{
 const pool=createDamageDebris(T,new T.Scene(),field,1);
 for(let i=0;i<8;i++)assert(pool.spawn([binding],9,state,matrix,[0,1,0],350,null,null,{material:'metal'}));
 for(let i=0;i<Math.round(.2/dt);i++)pool.update(dt,camera);
 const poses=pool.root.children.map(n=>[...n.position.toArray(),...n.quaternion.toArray()]);
 assert.equal(new Set(poses.map(p=>p.map(n=>n.toFixed(3)).join(','))).size,8,'Repeated prefab parts no longer fly in formation');
 for(let i=0;i<Math.round(6/dt);i++)pool.update(dt,camera);
 assert.equal(pool.active,0,'Every piece eventually sleeps');
 for(const n of pool.root.children){
  n.updateMatrixWorld(true);let clearance=Infinity;
  n.traverse(child=>{if(!child.isMesh)return;const p=child.geometry.attributes.position,v=new T.Vector3();for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(child.matrixWorld);clearance=Math.min(clearance,v.z-field.heightAt(v.x,v.y));}});
  assert(clearance>=-.001&&clearance<.05,'Settled debris touches sloping terrain without sinking or hovering');
 }
 pool.reset();return poses;
};
const at30=run(1/30),at60=run(1/60);assert.deepEqual(at30,at60,'Launch and fixed-step physics are frame-rate independent');
console.log('PASS: nonrepeating prefab trajectories, impact direction, material/size response, varied shards, fixed-step determinism and grounded sleep');
