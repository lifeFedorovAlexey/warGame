import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {Mission} from '../campaign/mission.js';
import {createHeightfield} from '../demo/map-route.js';
import {shapeMesaRims} from '../demo/mesa-shaping.js';
import {refineRoadHeightfield} from '../demo/road-heightfield.js';
import {applyRoadGrades} from '../demo/road-grading.js';
import {campBaseLayout} from '../campaign/scav-base-layout.js';
import {scavBaseRoads} from '../campaign/scav-base-roads.js';
import {automaticCombatTarget} from '../campaign/combat-policy.js';
const json=p=>JSON.parse(fs.readFileSync(p)),config=json('assets/campaign/alpha/mission01/gameplay.json'),roads=json('assets/maps/alpha/roads.json');
const raw=createHeightfield(json('assets/maps/alpha/heightfield.json'));shapeMesaRims(raw);const field=refineRoadHeightfield(raw);applyRoadGrades(field,roads);
field.localRoads=scavBaseRoads(field,config);
const fresh=()=>new Mission(config,field),m=fresh(),wells=m.state.buildings.filter(b=>b.campResource);
assert.equal(wells.length,3);
const conflicts=[];
for(const well of wells){
 assert.equal(well.owner,'scavs');assert(well.completed);
 const camp=m.state.camps.find(c=>c.id===well.campId),[left,bottom,right,top]=campBaseLayout(camp).bounds;
 assert(well.x-well.halfWidth>left&&well.x+well.halfWidth<right&&well.y-well.halfDepth>bottom&&well.y+well.halfDepth<top,'Rig footprint is inside its defended yard');
 for(const b of m.state.buildings)if(b!==well&&b.hp>0&&Math.abs(well.x-b.x)<well.halfWidth+b.halfWidth&&Math.abs(well.y-b.y)<well.halfDepth+b.halfDepth)conflicts.push({well:well.campId,kind:b.kind,id:b.id});
}
const roadConflicts=[];
for(const r of [...roads.paths,...field.localRoads])for(const b of m.state.buildings.filter(b=>b.owner==='scavs')){
 if(r.points.some(p=>Math.hypot(Math.max(0,Math.abs(p.x-b.x)-b.halfWidth),Math.max(0,Math.abs(p.y-b.y)-b.halfDepth))<(p.width??r.width)/2-.6))roadConflicts.push({road:r.id,kind:b.kind,camp:b.campId,x:b.x,y:b.y});
}
console.log(JSON.stringify({oilConflicts:conflicts,roadConflicts}));
assert.deepEqual(conflicts,[]);
assert.deepEqual(roadConflicts,[],'Pavement must not run through buildings or fence posts');
assert(field.localRoads.some(r=>r.id==='nw-east-approach'),'The fort has a continuous straight connection to the main road');
// Use the actual movement planner with the complete live building footprint.
// Clear only test troops so they cannot obscure a structural gate regression.
const drive=fresh();drive.state.units=[];drive.state.flags.lastRevealed=true;drive.state.bounds=config.finalMapBounds.slice();drive.rebuildNavigation();
for(const camp of drive.state.camps){
 const layout=campBaseLayout(camp),{gate,normal:n}=layout,core=drive.state.buildings.find(b=>b.campId===camp.id&&b.kind==='camp-core'),a=core.rotation;
 const outside={x:gate.x+n.x*50,y:gate.y+n.y*50},inside={x:core.x+Math.sin(a)*45,y:core.y-Math.cos(a)*45};
 for(const [from,to] of [[outside,inside],[inside,outside]]){
  const unit={kind:'bukhanka',owner:'rai',x:from.x,y:from.y,heading:Math.atan2(to.x-from.x,to.y-from.y)};
  const route=drive.vehiclePath(unit,to,{maxGoalDistance:12});assert(route?.length,camp.id+' has a vehicle route in both directions');
  assert(Math.hypot(route.at(-1).x-to.x,route.at(-1).y-to.y)<=12.1);
 }
}
const well=wells[0],camp=m.state.camps.find(c=>c.id===well.campId),id=well.id;
well.hp=321;const player=m.addUnit('bukhanka','rai',{x:well.x+60,y:well.y});m.visible.fill(255);m.explored.fill(255);
assert.notEqual(automaticCombatTarget(m,player,m.unitSpec(player))?.id,id,'Automatic fire preserves the capturable rig');
const guard=m.state.units.find(u=>u.campId===camp.id);
for(const e of [...m.state.units,...m.state.buildings])if(e.campId===camp.id&&e!==well&&e!==guard)e.hp=0;
m.updateMission();assert.equal(well.owner,'scavs','A surviving defender prevents capture');
guard.hp=0;m.updateMission();assert(camp.cleared);assert.equal(well.owner,'rai');assert.equal(well.hp,321);
assert.equal(well.id,id);assert.equal(m.drainEvents().filter(e=>e.type==='building-captured').length,1);
m.load(m.save());assert.equal(m.entity(id).owner,'rai');assert.equal(m.entity(id).hp,321);assert.equal(m.state.buildings.filter(b=>b.campResource).length,3);
const destroyed=m.state.buildings.find(b=>b.campResource&&b.owner==='scavs');m.damage(destroyed,destroyed.hp);const destroyedId=destroyed.id;
const deadSave=m.save();m.load(deadSave);assert(!m.state.buildings.some(b=>b.id===destroyedId&&b.hp>0));
m.state.buildings=m.state.buildings.filter(b=>b.id!==destroyedId);m.load(m.save());assert(!m.entity(destroyedId));assert(!m.state.buildings.some(b=>b.campId===destroyed.campId&&b.campResource));
// Older completed encounters remain completed; player rigs move to the new
// resource position without becoming enemy buildings or losing their damage.
const oldConfig=JSON.parse(execFileSync('git',['show','de0b08c:assets/campaign/alpha/mission01/gameplay.json'])),old=new Mission(oldConfig,field);
for(const c of old.state.camps){c.baseVersion=1;c.cleared=true;}
old.state.buildings=[];old.state.units=[];
const original=old.addStructure('derrick','rai',field.gridToWorld(oldConfig.oilFields[2]),{completed:true,progress:1});original.hp=287;
const migrated=fresh();migrated.load(old.save());const kept=migrated.entity(original.id),expected=field.gridToWorld(config.oilFields[2]);
assert.equal(kept.owner,'rai');assert.equal(kept.hp,287);assert.equal(kept.x,expected.x);assert.equal(kept.y,expected.y);
assert.equal(migrated.state.buildings.length,1,'Cleared old camps are not resurrected');
const oldLayout=await import('data:text/javascript;base64,'+Buffer.from(execFileSync('git',['show','de0b08c:campaign/scav-base-layout.js'])).toString('base64'));
const liveOld=new Mission(oldConfig,field);
liveOld.state.buildings=liveOld.state.buildings.filter(b=>!b.kind.startsWith('scav-')&&!b.scavVariant);
for(const c of liveOld.state.camps)delete c.baseVersion;
oldLayout.installScavBases(liveOld);
const oldWell=liveOld.addStructure('derrick','rai',field.gridToWorld(oldConfig.oilFields[3]),{completed:true});oldWell.hp=0;
const poses=liveOld.state.units.map(u=>[u.id,u.x,u.y,u.path,u.task]),oldIds=liveOld.state.buildings.filter(b=>!b.kind.startsWith('scav-')).map(b=>b.id);
const converted=fresh();converted.load(liveOld.save());
assert.deepEqual(converted.state.units.map(u=>[u.id,u.x,u.y,u.path,u.task]),poses,'Map migration preserves player/guard poses and orders');
assert(oldIds.every(id=>converted.state.buildings.some(b=>b.id===id)));
assert(!converted.state.buildings.some(b=>b.kind==='derrick'&&b.campId==='nw-east'&&b.hp>0),'A dead legacy rig does not respawn');
const count=converted.state.buildings.length;converted.load(converted.save());assert.equal(converted.state.buildings.length,count,'Camp layout migration runs once');
for(const p of roads.paths)assert(p.points.every(v=>v.width<=32.001));
const legacy=JSON.parse(execFileSync('git',['show','de0b08c:assets/maps/alpha/roads.json']));
assert.deepEqual(roads.paths.map(p=>p.points.map(({x,y,z})=>[x,y,z])),legacy.paths.map(p=>p.points.map(({x,y,z})=>[x,y,z])),'Main-road routes and elevations are unchanged');
fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/camp-roads.json',JSON.stringify({passed:true,defendedRigs:3,camps:4,vehicleRoutes:8,oilConflicts:conflicts,roadConflicts,capturePreservedHp:321,legacyPlayerRigPreservedHp:287,checks:['ownership after the last defender','automatic fire preserves rigs','save/load','destroyed rigs stay destroyed','old cleared and live save migration','unchanged unit poses and orders','straight fort approach','unchanged main-road centre lines and heights']},null,2));
console.log('PASS: 3 defended rigs, 8 vehicle routes, road/building clearance, capture, partial HP, save/load, no resurrection, unchanged main-road routes');
