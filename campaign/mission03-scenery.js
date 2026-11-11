import {m03Source,m03Point,m03Ruins} from './mission03-terrain.js';
import {m03TypeAt} from './mission03-surface-layout.js';
import {transportSite} from './transport-site.js';
import {batchRigidMeshes} from './field-vehicles.js';
import {createM03Landmark} from './mission03-prefabs.js';
import {createScavUnit} from './scav-units.js';
import {createDesertAssets} from './desert-assets.js';
import {createScavYardSurface} from './scav-yard-surface.js';

export function createM03Scenery(T,field){
 const root=new T.Group();root.name='m03_campaign_landmarks';
 const materials=[],pad=transportSite(field,{worldScale:4.5}),landmarks=new T.Group(),templates=new Map();
 const yards=createScavYardSurface(T,field,material=>materials.push(material));
 const clear=(p,r=0)=>!(Math.abs(p.x-pad.x)<pad.halfWidth+r+12&&Math.abs(p.y-pad.y)<pad.halfDepth+r+12);
 const prefab=(large,ruined)=>{
  const key=large+':'+ruined;
  if(!templates.has(key))templates.set(key,createM03Landmark(T,large,ruined));
  return templates.get(key).clone(true);
 };
 const wrecks=new Map();
 for(const f of m03Source.features){
  const p=m03Point(f.grid);if(!clear(p))continue;
  if(/Warehouse|Ruin|ruin|HUT/.test(f.kind)){
   const large=/Warehouse2|Tech/.test(f.kind),ruined=/Ruin|ruin/.test(f.kind),model=prefab(large,ruined),w=large?44:22,d=large?30:21;
   model.position.set(p.x,p.y,field.heightAt(p.x,p.y));model.name='source_'+f.id;landmarks.add(model);
   yards.patch(p,[-w/2-12,-d/2-15,w/2+12,d/2+12],'gravel',10,null,4);
   yards.patch(p,[-w/2,-d/2,w/2,d/2],'concrete',4,null,4);
  }else if(f.kind.startsWith('Wreck')){
   const kind=f.kind.includes('Tanker')?'scav-firetruck':f.kind.includes('Van')?'scav-bus':'scav-zaporozhets';
   if(!wrecks.has(kind)){
    const model=createScavUnit(T,kind).root,gun=model.getObjectByName('scav_weapon_yaw');gun?.removeFromParent();
    const seen=new Set();model.traverse(o=>{if(!o.isMesh||seen.has(o.material))return;seen.add(o.material);o.material.color.lerp(new T.Color('#4e4437'),.42);o.material.roughness=1;});
    wrecks.set(kind,model);
   }
   const model=wrecks.get(kind).clone(true);model.scale.setScalar(3.3);model.rotation.set(.045,-.07,(f.id%5-2)*.17);model.position.set(p.x,p.y,field.heightAt(p.x,p.y)-.6);landmarks.add(model);
  }
 }
 const depot=m03Point(m03Source.structures.find(f=>f.id===146).grid);
 yards.patch(depot,[-25,-30,25,20],'concrete',5,null,4);
 // Continuous working yards follow the settlements, with eroded shoulders.
 // These are surface decals only; original elevations and passages stay put.
 for(const corners of [
  [[12.8,10.6],[19.2,10.6],[24,12.5],[24,15.5],[22,16],[18,16],[15,15.5],[12.7,13.3]],
  [[35.8,60.4],[38.6,60.6],[39,62.5],[37.8,63.2],[35.4,62.7]],
 ]){
  const outline=corners.map(g=>{const p=m03Point(g);return [p.x,p.y];}),xs=outline.map(p=>p[0]),ys=outline.map(p=>p[1]);
  yards.patch({x:0,y:0},[Math.min(...xs)-12,Math.min(...ys)-12,Math.max(...xs)+12,Math.max(...ys)+12],'gravel',18,outline,4);
 }
 // Bake static placements by shared material, including all wheels and panels.
 landmarks.updateMatrixWorld(true);
 landmarks.traverse(o=>{if(o.isMesh){const g=o.geometry.clone().applyMatrix4(o.matrixWorld);const mesh=new T.Mesh(g,o.material);root.add(mesh);if(!materials.includes(o.material))materials.push(o.material);}});
 batchRigidMeshes(T,root);root.add(yards.root);

 let seed=94731;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const assets=createDesertAssets(T,random,m=>materials.push(m)),{batches,stones,scrub,bush,trunks,pine,birchTrunks,birches}=assets;
 const add=(target,p,size,angle,stretch=[1,1,1])=>target.poses.push({...p,z:field.heightAt(p.x,p.y),s:stretch.map(v=>v*size),rotation:angle});
 const open=(p,r=4)=>{
  const [gx,gy]=field.worldToGrid(p.x,p.y),type=m03TypeAt(gx,gy),g=field.gradientAt(p.x,p.y);
  return clear(p,r)&&Math.hypot(g.x,g.y)<.38&&![6,7,8].includes(type)&&
   !m03Ruins.some(([x,y,w,d])=>Math.abs(p.x-x)<w/2+r+13&&Math.abs(p.y-y)<d/2+r+13)&&
   !m03Source.structures.some(f=>{const q=m03Point(f.grid);return Math.hypot(p.x-q.x,p.y-q.y)<r+30;});
 };
 // The same clustered scrub and mixed groves as M01/M02, leaving sites clear.
 for(let cluster=0;cluster<190;cluster++){
  const centre=m03Point([2+random()*(m03Source.width-4),2+random()*(m03Source.height-4)]);
  if(!open(centre,8))continue;
  for(let i=0;i<7;i++){
   const a=random()*6.28,r=Math.sqrt(random())*28,p={x:centre.x+Math.cos(a)*r,y:centre.y+Math.sin(a)*r};
   if(!open(p))continue;
   add(stones,p,.6+random()*1.5,a,[1.15,.8,.45]);
   if(i%2===0)for(const item of [scrub,bush])add(item,p,2.3+(i%3)*.4,a);
  }
  if(cluster%4)continue;
  for(let i=0;i<4;i++){
   const a=i*2.4+random(),r=i?19+random()*30:0,p={x:centre.x+Math.cos(a)*r,y:centre.y+Math.sin(a)*r};
   if(!open(p,16)||[...pine.poses,...birches.poses].some(q=>Math.hypot(p.x-q.x,p.y-q.y)<22))continue;
   for(const item of i%3===0?[trunks,pine]:[birchTrunks,birches])add(item,p,2.8+i*.13,a);
  }
 }
 for(const f of m03Source.features.filter(f=>f.kind.startsWith('Boulder'))){const p=m03Point(f.grid);if(clear(p))add(stones,p,5+Number(f.kind.at(-1)),f.id*.4,[1,.8,.65]);}
 const dummy=new T.Object3D(),color=new T.Color();
 for(const item of batches){
  const mesh=new T.InstancedMesh(item.geometry,item.material,item.poses.length);mesh.name=item.name;
  item.poses.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,0,p.rotation);dummy.scale.set(...p.s);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);const v=.84+random()*.16;color.setRGB(v,v,v*.97);mesh.setColorAt(i,color);});
  mesh.computeBoundingSphere();root.add(mesh);
 }
 root.traverse(o=>{if(o.isMesh)o.castShadow=o.receiveShadow=true;});
 return {root,materials,trees:pine.poses.length+birches.poses.length,brush:bush.poses.length};
}
