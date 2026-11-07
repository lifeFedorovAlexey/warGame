import assert from 'node:assert/strict';
import * as T from '../demo/vendor/three.module.js';
import {createDamageState,applyDamageHit,applyStructuralImpact,upgradeDamageState,cageSample,damageLOD,partMissing,destroyDamage,MAX_MARKS,damageMobility,VEHICLE_PARTS,CAGE,PROFILES} from '../campaign/damage-state.js';
import {prepareDamageGeometry,createDamageCollider} from '../campaign/damage-geometry.js';
import {createDamageDebris} from '../campaign/damage-debris.js';
import {recordDamage} from '../campaign/damage-contact.js';
import {registerHooks} from 'node:module';
import fs from 'node:fs';
registerHooks({resolve(specifier,context,next){return next(specifier==='three'?new URL('../demo/vendor/three.module.js',import.meta.url).href:specifier,context);}});
const {createBuildingPrefab}=await import('../campaign/prefabs.js');

const tests=[];
function test(name,fn){fn();tests.push(name);}
const base={point:[.97,1,1.7],normal:[1,0,0],direction:[-1,0,0],type:'collision',power:100,partId:0};
test('Local, directional, accumulated deformation and seam continuity',()=>{
  const s=createDamageState();applyDamageHit(s,base);
  const first=cageSample(s,base.point);assert(first[0]<0);assert.equal(first[1],0);assert.deepEqual(cageSample(s,[-1.3,-2.5,.1]),[0,0,0]);
  applyDamageHit(s,base);assert(cageSample(s,base.point)[0]<first[0]);
  const opposite=createDamageState();applyDamageHit(opposite,{...base,point:[-.97,1,1.7],normal:[-1,0,0],direction:[1,0,0]});assert(cageSample(opposite,[-.97,1,1.7])[0]>0);
  const p=[.3,.5,2],a=cageSample(s,p),b=cageSample(s,p.map((v,i)=>v+(i===1?1e-8:0)));assert(Math.hypot(...a.map((v,i)=>v-b[i]))<1e-7);
});
test('Ordinary MG bursts leave local sheet-metal deformation at half hull HP',()=>{
  const s=createDamageState(),hit={...base,type:'bullet',power:6};
  applyDamageHit(s,hit);const first=cageSample(s,hit.point)[0];assert(first<0);
  for(let i=1;i<27;i++)applyDamageHit(s,hit);
  assert.equal(s.total,162);assert(cageSample(s,hit.point)[0]<first*5);
  assert.deepEqual(cageSample(s,[-.97,-2,1.7]),[0,0,0],'Unstruck opposite panel is not a half-HP preset');
  assert(s.marks[0].radius>.12&&s.marks[0].radius<.3,'Paint spall has a bounded readable radius');
  const concrete=createDamageState();applyDamageHit(concrete,hit,{material:'concrete'});assert.equal(concrete.cage,null);
  const other=createDamageState();applyDamageHit(other,{...hit,point:[-.97,1,1.7],normal:[-1,0,0],direction:[1,0,0]});
  assert(cageSample(other,[-.97,1,1.7])[0]>0);assert.deepEqual(cageSample(JSON.parse(JSON.stringify(s)),hit.point),cageSample(s,hit.point));
});
test('Bounded mark history does not erase structural damage',()=>{
  const s=createDamageState();applyDamageHit(s,base);const cage=s.cage.slice();
  for(let i=0;i<100;i++)applyDamageHit(s,{...base,point:[.97,i*.13-2,1.7],type:'bullet',power:1});
  assert.equal(s.marks.length,MAX_MARKS);assert.deepEqual(s.cage,cage);assert.equal(s.hits,101);
  for(let i=0;i<200;i++)applyDamageHit(s,base);for(let i=0;i<s.cage.length;i+=3)assert(Math.hypot(...s.cage.slice(i,i+3))<=PROFILES.metal.limit+1e-8);
});
test('Material profiles and independent detachable parts',()=>{
  const concrete=createDamageState();applyDamageHit(concrete,base,{material:'concrete'});assert.equal(concrete.cage,null);
  const s=createDamageState();applyDamageHit(s,{...base,power:10,partId:10},VEHICLE_PARTS[10]);assert(!partMissing(s,10));
  const result=applyDamageHit(s,{...base,power:10,partId:10},VEHICLE_PARTS[10]);assert(result.detached);assert(partMissing(s,10));assert(!partMissing(s,11));
  applyDamageHit(s,{...base,power:100,partId:1},VEHICLE_PARTS[1]);assert(damageMobility(s)<1);assert.equal(s.cage,null);
});
test('LOD hysteresis, offscreen and restoration preserve authoritative state',()=>{
  const s=createDamageState();applyDamageHit(s,base);const before=JSON.stringify(s);let lod=0;
  for(const d of [230,240,270]){lod=damageLOD(d,lod);assert.equal(lod,0);}assert.equal(damageLOD(290,lod),1);
  assert.equal(damageLOD(900,1),2);assert.equal(damageLOD(10,0,false),3);assert.equal(damageLOD(100,3),0);
  assert.equal(JSON.stringify(s),before);assert.deepEqual(JSON.parse(before),s);
});
test('Destroyed state keeps dents, marks and missing parts',()=>{
  const s=createDamageState();applyDamageHit(s,base);const cage=s.cage.slice();destroyDamage(s);assert(s.wreck);assert.deepEqual(s.cage,cage);assert.equal(s.marks.length,1);const revision=s.revision;destroyDamage(s);assert.equal(s.revision,revision);
});
test('Invalid hits never mutate state',()=>{
  const s=createDamageState(),before=JSON.stringify(s);for(const power of [0,-1,NaN,Infinity])assert.equal(applyDamageHit(s,{...base,power}).changed,false);assert.equal(JSON.stringify(s),before);
  assert.throws(()=>applyDamageHit(s,{...base,point:[NaN,1,1]}));assert.equal(JSON.stringify(s),before);
});
test('Old small marks migrate without replaying unknown impacts or splitting panes twice',()=>{
  const s=createDamageState();s.version=2;s.hits=10;s.total=60;s.parts[13]={damage:.5,detached:false};
  s.marks=[{point:[.97,0,1.7],normal:[1,0,0],radius:.048,kind:0,material:0,part:0}];
  upgradeDamageState(s,true);assert(Math.abs(s.marks[0].radius-.144)<1e-10);assert.equal(s.cage,null);assert.equal(s.total,60);
  assert(!s.parts[19]&&!s.parts[21]);const before=JSON.stringify(s);upgradeDamageState(s,true);assert.equal(JSON.stringify(s),before);
});
test('BVH hits actual deformed surface and skips detached geometry',()=>{
  const mesh=new T.Mesh(new T.BoxGeometry(2,4,2,6,8,6),new T.MeshStandardMaterial({name:'paint_olive'}));mesh.position.z=1.5;mesh.updateMatrixWorld(true);
  const binding=prepareDamageGeometry(T,mesh,'body',1),collider=createDamageCollider(T,[binding]),s=createDamageState();
  const before=collider.trace([5,1,1.7],[-1,0,0],s);assert(before);assert(Math.abs(before.point[0]-1)<1e-6);assert(before.normal[0]>.9);
  applyDamageHit(s,{...base,point:before.point});const after=collider.trace([5,1,1.7],[-1,0,0],s);assert(after.point[0]<before.point[0]-.005);
  assert(Math.abs(after.restPoint[0]-1)<1e-6);assert(Number.isFinite(after.normal[0]));
  s.parts[0]={detached:true,damage:2};assert.equal(collider.trace([5,1,1.7],[-1,0,0],s),null);
});
test('Original building prefabs have tagged windows and equipment within budget',()=>{
  const config=JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/gameplay.json'));
  for(const kind of ['factory','lab','generator','mg-tower']){
    const model=createBuildingPrefab(T,kind,config.buildings[kind]),parts=model.userData.damageParts;
    assert(Object.keys(parts).length<128,kind);assert(Object.values(parts).some(p=>p.detachable),kind);
    if(kind!=='mg-tower')assert(Object.values(parts).some(p=>p.material==='glass'),kind);
    model.traverse(n=>{if(n.isMesh)assert(n.geometry.attributes.damagePart,kind);});
  }
});
test('Rigid animated parts raycast in their current pose and retain rest coordinates',()=>{
  const mesh=new T.Mesh(new T.BoxGeometry(1,2,1),new T.MeshStandardMaterial());mesh.updateMatrixWorld(true);
  const binding=prepareDamageGeometry(T,mesh,'weapon'),collider=createDamageCollider(T,[binding]);
  const motion=new T.Matrix4().makeRotationZ(Math.PI/2);motion.setPosition(4,0,2);
  const transforms=new Map([[binding,motion]]),s=createDamageState();
  const hit=collider.trace([8,0,2],[-1,0,0],s,transforms);
  assert(hit);assert.equal(hit.partId,9);assert(Math.abs(hit.point[0]-5)<1e-6);assert(hit.normal[0]>.99);
  const restored=new T.Vector3(...hit.restPoint).applyMatrix4(motion);assert(restored.distanceTo(new T.Vector3(...hit.point))<1e-6);
  assert.equal(collider.trace([0,0,5],[0,0,-1],s,transforms),null);
  applyDamageHit(s,{...base,partId:9,power:300},VEHICLE_PARTS[9]);assert.equal(collider.trace([8,0,2],[-1,0,0],s,transforms),null);
});
test('Custom model cage survives serialization and rigid equipment does not dent the body',()=>{
  const s=createDamageState({min:[10,20,0],max:[12.7,25.4,3.6]}),point=[12,22.7,1.8];
  applyDamageHit(s,{...base,point});assert(cageSample(s,point)[0]<0);assert.deepEqual(cageSample(JSON.parse(JSON.stringify(s)),point),cageSample(s,point));
  assert.throws(()=>createDamageState({min:[0,0,0],max:[0,1,1]}));
  const target={kind:'bukhanka'},mission={config:{units:{bukhanka:{}}}};
  recordDamage(mission,target,100,null,{...base,partId:9,partSpec:VEHICLE_PARTS[9],binding:{deform:false}});
  assert.equal(target.damage.cage,null);assert(target.damage.parts[9].damage>0);
});
test('Debris has bounded active physics, retained capacity, sleep and resource removal',()=>{
  const scene=new T.Scene(),pool=createDamageDebris(T,scene,{heightAt:()=>0},1),camera=new T.PerspectiveCamera();
  const mesh=new T.Mesh(new T.BoxGeometry(1,1,1),new T.MeshStandardMaterial());mesh.updateMatrixWorld(true);
  const binding=prepareDamageGeometry(T,mesh,'weapon'),matrix=new T.Matrix4().makeTranslation(0,0,2);
  for(let batch=0;batch<4;batch++){
    for(let i=0;i<50;i++)pool.spawn([binding],9,createDamageState(),matrix,[1,0,0],20);
    assert.equal(pool.active,24);assert(pool.count<=64);
    for(let i=0;i<160;i++)pool.update(1/30,camera);
    assert.equal(pool.active,0);
  }
  assert.equal(pool.count,64);pool.reset();assert.equal(pool.count,0);assert.equal(pool.root.children.length,0);
});
test('Shell preparation preserves authored part IDs, UVs and the original flat surface',()=>{
  const g=new T.PlaneGeometry(2,4),p=g.attributes.position;
  g.setAttribute('damagePart',new T.Float32BufferAttribute(new Float32Array(p.count).fill(21),1));
  const mesh=new T.Mesh(g,new T.MeshStandardMaterial({name:'paint_olive'}));mesh.updateMatrixWorld(true);
  const prepared=prepareDamageGeometry(T,mesh,'body',0).geometry;
  assert(prepared.attributes.position.count>p.count);assert(prepared.index.count/3<2000,'No explosive centroid subdivision');
  for(let i=0;i<prepared.attributes.position.count;i++){assert.equal(prepared.attributes.damagePart.getX(i),21);assert.equal(prepared.attributes.position.getZ(i),0);assert(prepared.attributes.uv.getX(i)>=0&&prepared.attributes.uv.getX(i)<=1);}
  let area=0;const a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3();
  for(let i=0;i<prepared.index.count;i+=3){a.fromBufferAttribute(prepared.attributes.position,prepared.index.getX(i));b.fromBufferAttribute(prepared.attributes.position,prepared.index.getX(i+1));c.fromBufferAttribute(prepared.attributes.position,prepared.index.getX(i+2));const cross=b.sub(a).cross(c.sub(a));assert(cross.z>0);area+=cross.length()/2;}
  assert(Math.abs(area-8)<1e-5);
});
test('Local BVH bounds match a brute-force deformed mesh after multidirectional impacts',()=>{
  const mesh=new T.Mesh(new T.BoxGeometry(2,4,2,6,10,6),new T.MeshStandardMaterial({name:'paint_olive',side:T.DoubleSide}));mesh.position.z=1.5;mesh.updateMatrixWorld(true);
  const binding=prepareDamageGeometry(T,mesh,'body',1),collider=createDamageCollider(T,[binding]),s=createDamageState();
  for(let i=0;i<16;i++)applyDamageHit(s,{...base,point:i%2?[1,.2,1.8]:[.3,2,1.6],direction:i%2?[-1,0,0]:[0,-1,0],power:70});
  const geometry=binding.geometry.clone(),position=binding.geometry.attributes.damagePosition,values=new Float32Array(position.count*3);
  for(let i=0;i<position.count;i++){const rest=[position.getX(i),position.getY(i),position.getZ(i)],delta=cageSample(s,rest);values.set(rest.map((v,k)=>v+delta[k]),i*3);}
  geometry.setAttribute('position',new T.BufferAttribute(values,3));geometry.computeBoundingSphere();geometry.computeBoundingBox();
  const oracle=new T.Mesh(geometry,new T.MeshBasicMaterial({side:T.DoubleSide}));oracle.updateMatrixWorld(true);
  const ray=new T.Raycaster();
  for(let i=0;i<80;i++){
    const angle=i*.93,origin=[Math.cos(angle)*5,Math.sin(angle)*5,.6+(i%11)*.17],direction=new T.Vector3(-origin[0],-origin[1],1.6-origin[2]).normalize();
    ray.set(new T.Vector3(...origin),direction);const brute=ray.intersectObject(oracle)[0],hit=collider.trace(origin,direction.toArray(),s);
    assert.equal(!!hit,!!brute);if(hit)assert(new T.Vector3(...hit.point).distanceTo(brute.point)<1e-5);
  }
});
test('Construction clips future structure but keeps the existing foundation targetable',()=>{
  const root=new T.Group(),structure=new T.Group(),foundation=new T.Group();structure.name='building_structure';root.add(structure,foundation);
  const wall=new T.Mesh(new T.BoxGeometry(2,2,3),new T.MeshBasicMaterial());wall.position.z=1.5;structure.add(wall);
  const rail=new T.Mesh(new T.BoxGeometry(.2,.2,.2),new T.MeshBasicMaterial());rail.position.set(3,0,1.8);foundation.add(rail);root.updateMatrixWorld(true);
  const collider=createDamageCollider(T,[prepareDamageGeometry(T,wall,'building'),prepareDamageGeometry(T,rail,'building')]);
  assert.equal(collider.trace([0,5,2],[0,-1,0],null,null,1),null);
  assert(collider.trace([0,5,.8],[0,-1,0],null,null,1));
  assert(collider.trace([3,5,1.8],[0,-1,0],null,null,1));
});
test('Wrecks depend on impact history, not object ID, HP transition or a preset',()=>{
  const run=(id,point,direction)=>{const s=createDamageState();s.entityId=id;
    for(let i=0;i<4;i++)applyDamageHit(s,{...base,point,direction,power:150});
    const before=structuredClone(s);destroyDamage(s);
    assert.deepEqual(s.cage,before.cage);assert.deepEqual(s.parts,before.parts);assert.equal(s.burn,0);assert(!partMissing(s,9));
    delete s.entityId;return s;};
  const a=run('unit-1',[1,.6,1.8],[-1,0,0]),b=run('unit-2',[1,.6,1.8],[-1,0,0]),c=run('unit-1',[0,-2,1.8],[0,1,0]);
  assert.deepEqual(a,b);assert.notDeepEqual(a.cage,c.cage);
  const fire=createDamageState();applyDamageHit(fire,{...base,type:'fire',power:150});assert.equal(fire.cage,null);assert(fire.burn>0);destroyDamage(fire);assert.equal(fire.burn,.6);
});
test('Load transfer breaks nearby attachments and accumulates without damaging remote parts',()=>{
  const regions=[{id:5,min:[.7,1.8,1.4],max:[1,2,1.6]},{id:6,min:[-.9,1.8,1.4],max:[-.7,2,1.6]},{id:9,min:[-.4,-.2,2.8],max:[.4,.2,3.5]}];
  const s=createDamageState(),hit={...base,point:[.9,2.1,1.5],direction:[0,-1,0],power:25};
  assert.deepEqual(applyStructuralImpact(s,{...hit,type:'bullet',power:1000},regions,VEHICLE_PARTS),[]);
  assert.deepEqual(applyStructuralImpact(s,hit,regions,VEHICLE_PARTS),[]);assert(s.parts[5].damage>0);assert(!s.parts[6]);assert(!s.parts[9]);
  assert.deepEqual(applyStructuralImpact(s,hit,regions,VEHICLE_PARTS),[5]);assert.equal(s.hits,0);assert.equal(s.total,0);
  const remoteBefore=structuredClone(s.parts);destroyDamage(s);assert.deepEqual(s.parts,remoteBefore);
});
test('Accumulated deformation retains positive Jacobians after extreme opposing impacts',()=>{
  const s=createDamageState();
  for(let i=0;i<48;i++){
    const a=i*.73,point=[Math.cos(a),Math.sin(a)*2,.65+(i%9)*.23],direction=[-Math.cos(a),-Math.sin(a),i%2?.2:-.2];
    applyDamageHit(s,{...base,point,direction,power:350});
  }
  for(let i=0;i<400;i++){
    const p=CAGE.min.map((v,k)=>v+(.01+((i*[.618033,.414214,.732051][k])%1)*.98)*(CAGE.max[k]-v)),columns=[];
    for(let k=0;k<3;k++){
      const a=p.slice(),b=p.slice();a[k]-=1e-5;b[k]+=1e-5;const da=cageSample(s,a),db=cageSample(s,b);
      columns.push(db.map((v,j)=>(v-da[j])/2e-5+(j===k?1:0)));
    }
    const matrix=new T.Matrix3().set(...[0,1,2].flatMap(row=>columns.map(column=>column[row])));
    assert(matrix.determinant()>.02,'No inverted local volume');
  }
});
test('Each connected side pane keeps one ID, and old grouped saves retain failures',()=>{
  const values=[],normals=[];
  for(const y of [1.1,-.42,-1.46]){
    const geometry=new T.BoxGeometry(.02,.6,.3).toNonIndexed();geometry.translate(.984,y,2.1);
    values.push(...geometry.attributes.position.array);normals.push(...geometry.attributes.normal.array);
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(values,3));g.setAttribute('normal',new T.Float32BufferAttribute(normals,3));
  const mesh=new T.Mesh(g,new T.MeshStandardMaterial({name:'window_glass'}));mesh.updateMatrixWorld();
  const prepared=prepareDamageGeometry(T,mesh,'body').geometry,parts=prepared.attributes.damagePart;
  assert.deepEqual([...new Set(parts.array)],[21,13,19]);
  for(let i=0;i<prepared.index.count;i+=3){const ids=[0,1,2].map(k=>prepared.index.getX(i+k));assert(parts.getX(ids[0])===parts.getX(ids[1])&&parts.getX(ids[0])===parts.getX(ids[2]));}
  const s=createDamageState();s.version=1;s.parts[13]={damage:2,detached:true};s.marks=[{part:13,point:[.984,1.1,2.1]}];
  upgradeDamageState(s,true);assert(partMissing(s,19)&&partMissing(s,21));assert.equal(s.marks[0].part,21);
});
console.log(JSON.stringify({passed:tests.length,tests},null,2));
