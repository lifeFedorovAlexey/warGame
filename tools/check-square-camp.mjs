import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import * as T from '../demo/vendor/three.module.js';
import {makeMission} from './m02-fixture.mjs';
import {campBaseLayout} from '../campaign/scav-base-layout.js';
import {updateWrecks} from '../campaign/wreck-lifecycle.js';
import {prepareM02Diagnostic} from '../campaign/mission02-diagnostic.js';
registerHooks({resolve(s,c,next){return next(s==='three'?new URL('../demo/vendor/three.module.js',import.meta.url).href:s,c);}});
const {createScavPrefab}=await import('../campaign/scav-prefabs.js');
const {createScavEmplacement}=await import('../campaign/scav-emplacement.js');
const {createScavBasePrefab}=await import('../campaign/scav-base-prefabs.js');

const m=makeMission(),camp=m.state.camps.find(c=>c.id==='west-south'),layout=campBaseLayout(camp);
const structures=m.state.buildings.filter(b=>b.campId===camp.id);
const towers=structures.filter(b=>b.kind==='mg-tower'),bunkers=structures.filter(b=>b.kind==='bunker');
assert.equal(towers.length,4);assert.equal(bunkers.length,2);
assert(structures.every(b=>Number.isFinite(b.hp)&&b.hp>0&&b.maxHp===b.hp));
assert(Math.abs((layout.bounds[2]-layout.bounds[0])-(layout.bounds[3]-layout.bounds[1]))<10);
const gate=structures.find(b=>b.scavVariant==='service-gate');assert(gate);
const centre={x:camp.x-80,y:camp.y-35},approach={x:camp.gate.x,y:camp.gate.y+45};
assert(m.nav.lineClear(approach,centre,false,true,.52,true),'The main vehicle corridor is open');
const guns=[...towers,...bunkers],coverage=[];
for(const [name,offset] of [['entry',[-80,180]],['left',[-215,-20]],['right',[90,-20]],['rear',[-80,-180]]]){
 const target={x:camp.x+offset[0],y:camp.y+offset[1],kind:'bukhanka',owner:'rai',hp:320};
 const covering=guns.filter(b=>Math.hypot(b.x-target.x,b.y-target.y)<=m.buildingSpec(b).range&&m.lineOfSight(b,target));
 coverage.push({name,count:covering.length});assert(covering.length>=2,name+' has overlapping real fields of fire');
}
// Each emplacement must really damage a vehicle, not just look like a gun.
for(const gun of guns){
 const outward=gun.y<camp.y? -1:1;
 const target=m.addUnit('bukhanka','rai',{x:gun.x,y:gun.y+outward*60});
 const hp=target.hp;gun.cooldown=0;
 assert(m.attack(gun,target,m.buildingSpec(gun)),gun.id+' can fire');assert(target.hp<hp);
 m.state.units=m.state.units.filter(u=>u!==target);
}
const beforeSolids=m.nav.solids.length;
for(const root of [createScavPrefab(T,'camp-core','west-south:square-workshop'),createScavEmplacement(T),createScavBasePrefab(T,'scav-fence','west-south',gate.fenceSpan,'service-gate')]){
 root.traverse(o=>{if(!o.isMesh)return;const attribute=o.geometry.getAttribute('damagePart');assert(attribute&&attribute.count>0,'Every visible prop belongs to the damage system');});
}
assert.equal(m.nav.solids.length,beforeSolids,'Decorative prefab parts add no navigation solids');
// Ordinary combat damage, a save/reload, wreck expiry, then a real hull sweep.
m.damage(gate,20);assert(gate.hp===300,'Closed service gate takes normal damage');
const gateId=gate.id,gatePoint={x:gate.x,y:gate.y};m.damage(gate,gate.hp);
m.load(m.save());assert.equal(m.state.buildings.find(b=>b.id===gateId).hp,0);
for(const b of m.state.buildings.filter(b=>b.campId===camp.id&&b.hp>0)){m.damage(b,1);assert(b.hp<b.maxHp,b.id+' takes damage');m.damage(b,b.hp);}
m.state.time+=7;updateWrecks(m);m.rebuildNavigation();
assert(!m.nav.solids.some(s=>structures.some(b=>b.id===s.id)),'Destroyed camp leaves no invisible solids');
const pose={kind:'bukhanka',owner:'rai',heading:0,...gatePoint};
assert(m.vehicleMotionClear(pose,{...pose,y:pose.y-30},{...pose,y:pose.y+30},.52,undefined,[]),'The destroyed rear gate is physically traversable');
m.load(m.save());assert(!m.state.buildings.some(b=>b.campId===camp.id&&b.hp>0),'Reload never resurrects the camp');
const second=prepareM02Diagnostic(makeMission());
assert(!second.nav.solids.some(s=>s.environment),'No indestructible decor colliders in mission 2');
assert(second.state.buildings.some(b=>b.m02Fortification&&b.hp>0),'Real mission 2 defenses remain');
console.log('PASS square camp: four firing towers, two firing emplacements, overlapping defense',coverage,'damageable gate/props, no decor colliders, wreck cleanup, saves and mission 2');

const driving=makeMission(),dc=driving.state.camps.find(c=>c.id==='west-south');
driving.state.units=driving.state.units.filter(u=>u.owner==='rai');
driving.state.flags.raidWon=true;driving.state.flags.raidStarted=true;driving.state.flags.raidIds=[];
for(const spec of [...Object.values(driving.config.units),...Object.values(driving.config.buildings)])spec.damage=0;
for(const b of driving.state.buildings)delete b.scavProduction;
const group=[-20,0,20].map((side,i)=>driving.addUnit('bukhanka','rai',{x:dc.gate.x+side,y:dc.gate.y+80+i*22},{heading:Math.PI}));
function drive(target,label){
 assert(driving.order(group.map(u=>u.id),'move',target).ok);
 let seconds=0;
 while(seconds++<120&&group.some(u=>Math.hypot(u.x-target.x,u.y-target.y)>45)){
  driving.advance(1);driving.drainEffects();driving.drainEvents();
 }
 assert(group.every(u=>Math.hypot(u.x-target.x,u.y-target.y)<=45),label+' group physically arrives');
 console.log('PASS',label,{seconds});
}
drive({x:dc.x-80,y:dc.y-45},'main gate into yard');
const rear=driving.state.buildings.find(b=>b.campId===dc.id&&b.scavVariant==='service-gate');
driving.damage(rear,rear.hp);driving.advance(7);driving.rebuildNavigation();
drive({x:dc.x-80,y:dc.y-194},'through destroyed service gate');

// The staging column must remain outside the stronger camp firing ranges.
{
 const m=makeMission(),f=m.field,c=m.config.camps[3],rally=f.gridToWorld(c.approachGrid),road=f.localRoads.find(r=>r.id==='m01-original-hq-approach');
 const guns=m.state.buildings.filter(b=>b.campId===c.id&&m.buildingSpec(b).damage);
 for(const from of [road.points[0],m.state.camps[3].gate]){
  const formation=m.nav.roads.formation(rally,from,12,m.config.worldScale);assert(formation.slots.length>=12);
  for(const slot of formation.slots.slice(0,12))assert(guns.every(g=>Math.hypot(slot.x-g.x,slot.y-g.y)>m.buildingSpec(g).range+12));
 }
 const saved=JSON.parse(m.save());saved.state.camps[3].approachGrid=[17.6,15.6];m.load(saved);assert.deepEqual(m.state.camps[3].approachGrid,c.approachGrid);
 console.log('PASS twelve-vehicle staging column outside all defense ranges, including restored saves');
}
