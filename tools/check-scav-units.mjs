import fs from 'node:fs';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import * as T from '../demo/vendor/three.module.js';
import {Mission} from '../campaign/mission.js';
import {createHeightfield} from '../demo/map-route.js';
import {SCAV_PROFILES,SCAV_ROSTERS} from '../campaign/scav-unit-profiles.js';
registerHooks({resolve(s,c,next){return next(s==='three'?new URL('../demo/vendor/three.module.js',import.meta.url).href:s,c);}});
const {createScavUnit,poseScavUnit}=await import('../campaign/scav-units.js');
const {createBuildingPrefab}=await import('../campaign/prefabs.js');
const {placeSelectionRing}=await import('../campaign/selection-rings.js');
const {aimTowerWeapon}=await import('../campaign/tower-weapon.js');
const json=p=>JSON.parse(fs.readFileSync(p,'utf8')),config=json('assets/campaign/alpha/mission01/gameplay.json');
const field=createHeightfield(json('assets/maps/alpha/heightfield.json'));field.heightAt=()=>0;field.gradientAt=()=>({x:0,y:0});
const m=new Mission(config,field),models={};
for(const [kind,profile] of Object.entries(SCAV_PROFILES)){
  const model=createScavUnit(T,kind);model.root.updateMatrixWorld(true);
  const box=new T.Box3().setFromObject(model.root);assert(box.min.z>=-.02,kind+' stands on the ground');
  assert(box.max.z<=profile.bounds.max[2],kind+' fits its damage cage');
  const rest=model.gun.muzzle.getWorldPosition(new T.Vector3());
  poseScavUnit(model,{hp:100},{travel:7,moving:true,steer:.2,aim:[12,16,1.4]});
  assert(rest.distanceTo(model.gun.muzzle.getWorldPosition(new T.Vector3()))>.01,kind+' weapon aims');
  if(profile.infantry){
    assert(model.limbs.some(l=>Math.abs(l.leg.rotation.x)>.1));
    const animated=[model.figure,model.upper,model.supportArm,model.throwArm,model.gun.pitch,...model.limbs.flatMap(l=>[l.leg,l.knee])];
    const live=animated.map(n=>n.matrixWorld.toArray());
    for(const aim of [[0,20,1],[20,0,1],[-20,-20,1]]){
      poseScavUnit(model,{hp:0},{moving:true,travel:33,aim,age:.15});
      const rifleBounds=new T.Box3().setFromObject(model.gun.pitch);
      const barrel=new T.Vector3(0,1,0).transformDirection(model.gun.muzzle.matrixWorld);
      assert(Math.abs(barrel.z)<.001,kind+' fallen rifle lies flat regardless of last aim');
      assert(rifleBounds.min.z>0&&rifleBounds.max.z<.4,kind+' fallen rifle rests beside the body');
      assert(new T.Box3().setFromObject(model.root).max.z<.65,kind+' arms no longer hold a standing firing pose');
    }
    poseScavUnit(model,{hp:100},{travel:7,moving:true,steer:.2,aim:[12,16,1.4]});
    assert.deepEqual(animated.map(n=>n.matrixWorld.toArray()),live,kind+' living instance restores its pose after a corpse');
  }
  else assert(model.wheels.every(w=>Math.abs(w.wheel.rotation.x)>.1));
  models[kind]={size:box.getSize(new T.Vector3()).toArray()};
}
for(const camp of m.state.camps)assert.deepEqual(m.state.units.filter(u=>u.campId===camp.id).map(u=>u.kind),SCAV_ROSTERS[camp.id]);
assert.deepEqual(m.state.raidReserve.map(id=>m.entity(id).kind),config.raidRoster);
const legacy=JSON.parse(m.save());delete legacy.state.scavRosterVersion;delete legacy.state.projectiles;
for(const u of legacy.state.units.filter(u=>u.owner==='scavs')){u.kind='raider';u.hp=u.maxHp=config.units.raider.hp;}
m.load(legacy);assert(m.state.units.some(u=>u.kind==='scav-bus'));assert.deepEqual(m.state.projectiles,[]);
const migrated=m.state.units.map(u=>[u.id,u.kind,u.hp]);m.load(m.save());assert.deepEqual(m.state.units.map(u=>[u.id,u.kind,u.hp]),migrated,'Migration is idempotent');
m.state.units=[];m.state.buildings=[];m.rebuildNavigation();
const p=field.gridToWorld(config.startGrid),grenadier=m.addUnit('scav-grenadier','scavs',p),target=m.addUnit('bukhanka','rai',{x:p.x,y:p.y+45});
const neighbour=m.addUnit('builder','rai',{x:p.x+8,y:p.y+45}),ally=m.addUnit('scav-rifleman','scavs',{x:p.x+6,y:p.y+45});
const before=target.hp;assert(m.attack(grenadier,target,config.units[grenadier.kind]));assert.equal(target.hp,before,'Grenade does not deal hitscan damage');
const flight=m.state.projectiles[0];m.load(m.save());m.state.time=flight.impactAt-.01;m.updateProjectiles();assert.equal(m.entity(target.id).hp,before);
m.state.time=flight.impactAt+.01;m.updateProjectiles();assert(m.entity(target.id).hp<before);assert(m.entity(neighbour.id).hp<neighbour.maxHp);assert.equal(m.entity(ally.id).hp,ally.hp);assert.equal(m.state.projectiles.length,0);
// A walking soldier turns in place and advances without a car's turning arc.
m.state.units=[];m.state.buildings=[];m.rebuildNavigation();
const soldier=m.addUnit('scav-rifleman','scavs',p);soldier.path=[{x:p.x+30,y:p.y}];
for(let i=0;i<10;i++)m.walk(soldier,.1);
assert(soldier.x>p.x+10);assert.equal(soldier.y,p.y);assert.equal(soldier.reversing,false);
m.damage(soldier,10000,target);assert(!m.drainEffects().some(e=>e.type==='explosion'&&e.targetId===soldier.id),'Infantry does not explode like a vehicle');
assert.equal(soldier.damage.cage,null,'Infantry does not deform like a metal vehicle');
const tower=createBuildingPrefab(T,'mg-tower',config.buildings['mg-tower']);tower.updateMatrixWorld(true);
const bounds=new T.Box3().setFromObject(tower);assert(bounds.max.z<=12);assert(bounds.min.z>=0);assert(tower.getObjectByName('tower_yaw'));assert(tower.getObjectByName('muzzle'));
for(const [x,y] of [[30,40],[-30,40],[30,-40],[-30,-40]]){
  aimTowerWeapon(tower,{x:0,y:0,rotation:0,groundHeight:0},field,1,{x,y,z:1});tower.updateMatrixWorld(true);
  const muzzle=tower.getObjectByName('muzzle'),point=muzzle.getWorldPosition(new T.Vector3());
  const direction=new T.Vector3(0,1,0).transformDirection(muzzle.matrixWorld),targetDirection=new T.Vector3(x,y,1).sub(point).normalize();
  assert(direction.dot(targetDirection)>.995,'Tower barrel points at its target');
}
const ring=new T.Mesh(new T.RingGeometry(1,1.08,64));
const slope={heightAt:(x,y)=>x*.31+Math.sin(y*.2)*2};placeSelectionRing(ring,slope,20,30,16);
const vertices=ring.geometry.attributes.position;
for(let i=0;i<vertices.count;i++)assert(Math.abs(vertices.getZ(i)+ring.position.z-slope.heightAt(vertices.getX(i)+20,vertices.getY(i)+30)-1.1)<.00001);
console.log(JSON.stringify({models,campRosters:true,legacySave:true,grenadeDelayAndSplash:true,projectileSave:true,walking:true,noInfantryExplosion:true,tower:true,terrainRings:true}));
