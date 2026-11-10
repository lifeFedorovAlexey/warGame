import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import * as T from '../demo/vendor/three.module.js';
import {createDamageSystem} from '../campaign/damage-system.js';
import {createDamageState,destroyDamage,MAX_PARTS} from '../campaign/damage-state.js';
import {towerDamagePose} from '../campaign/tower-weapon.js';
registerHooks({resolve(specifier,context,next){return next(specifier==='three'?new URL('../demo/vendor/three.module.js',import.meta.url).href:specifier,context);}});
const {createScavPrefab}=await import('../campaign/scav-prefabs.js');

const results=[];
for(const site of ['nw-pocket','nw-west','nw-east','west-south','nw-pocket:watch']){
 const scene=new T.Scene(),field={heightAt:()=>0},config={units:{},buildings:{'mg-tower':{}},worldScale:1};
 const system=createDamageSystem(T,scene,field,config),model=createScavPrefab(T,'mg-tower',site);
 model.updateMatrixWorld(true);
 const bindings=model.getObjectsByProperty('isMesh',true).map(n=>system.prepare(n,'building',0));
 const parts=model.userData.damageParts,detachable=Object.entries(parts).filter(([,p])=>p.detachable);
 assert(detachable.length>=19&&detachable.length<=24,site+' fits the existing physics pool');
 assert(Object.keys(parts).every(id=>Number(id)<MAX_PARTS));
 for(const binding of bindings){
  const p=binding.geometry.attributes.damagePosition,ids=binding.geometry.attributes.damagePart;
  for(let i=0;i<p.count;i++)if(p.getZ(i)>.35)assert(parts[ids.getX(i)]?.detachable,site+' leaves no shrinking upper frame');
 }
 const pose=towerDamagePose(T,model,bindings,field,1);
 system.setTemplateProvider(()=>({bindings,parts,pose}));
 const mission={state:{time:0},config};system.bindMission(mission);
 const entity={id:site,kind:'mg-tower',owner:'scavs',campId:site,x:0,y:0,rotation:.2,damage:createDamageState(),halfWidth:3,halfDepth:3};
 const template=system.getTemplate(entity);
 assert(template.collider.triangles>0);
 entity.aimTarget={x:30,y:20,z:0};const motion=pose(entity);
 assert(motion.size>0&&[...motion.values()].some(m=>!m.equals(new T.Matrix4())),'Turret still aims');
 const hit={point:[0,0,10],restPoint:[0,0,10],direction:[1,0,0],power:600};
 entity.damage.lastImpact=hit;destroyDamage(entity.damage);mission.onDamageDestroyed(entity,hit);
 for(const [id] of detachable)assert(entity.damage.parts[id]?.detached,site+' detaches '+id);
 const saved=JSON.stringify(entity.damage);entity.damage=JSON.parse(saved);assert.equal(JSON.stringify(entity.damage),saved);
 // Render records must exist before the impact to produce transient debris.
 const camera=new T.PerspectiveCamera(50,1,.1,500);camera.up.set(0,0,1);camera.position.set(30,30,30);camera.lookAt(0,0,5);
 const intact={...entity,id:site+'-live',damage:createDamageState()};system.begin(camera,0);system.representation(intact,new T.Matrix4(),16);
 intact.damage.lastImpact=hit;destroyDamage(intact.damage);mission.onDamageDestroyed(intact,hit);
 system.representation(intact,new T.Matrix4(),16);
 assert.equal(system.statistics.debris,detachable.length,site+' produces every fragment');
 assert(system.statistics.activePhysics<=24);
 const fragments=system.debris.root.children.map(n=>n.position.clone());system.begin(camera,.1);
 assert(system.debris.root.children.some((n,i)=>n.position.distanceTo(fragments[i])>.01),'Fragments move in physics');
 results.push({site,fragments:detachable.length,triangles:template.collider.triangles});
 system.reset();
}
console.log(JSON.stringify({passed:true,results},null,2));
