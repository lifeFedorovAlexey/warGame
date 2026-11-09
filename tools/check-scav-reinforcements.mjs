import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Mission} from '../campaign/mission.js';
import {SCAV_PRODUCTION,updateScavProduction} from '../campaign/scav-production.js';
import {isCampPerimeter} from '../campaign/camp-demolition.js';
import {createHeightfield} from '../demo/map-route.js';
import {shapeMesaRims} from '../demo/mesa-shaping.js';
import {refineRoadHeightfield} from '../demo/road-heightfield.js';
import {applyRoadGrades} from '../demo/road-grading.js';
const json=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const config=json('assets/campaign/alpha/mission01/gameplay.json'),base=createHeightfield(json('assets/maps/alpha/heightfield.json'));
shapeMesaRims(base);const field=refineRoadHeightfield(base);applyRoadGrades(field,json('assets/maps/alpha/roads.json'));
// Keep the target base alive long enough to observe every real sortie.
config.units.bukhanka.hp=config.units.builder.hp=1000000;
const mission=new Mission(config,field),producers=m=>m.state.buildings.filter(b=>b.scavProduction);
const rows=producers(mission),locked=rows.filter(b=>b.campId==='west-south');
assert.equal(rows.length,8);
for(const camp of mission.state.camps){
 const buildings=mission.state.buildings.filter(b=>b.campId===camp.id);
 assert(buildings.filter(b=>b.kind==='mg-tower').length>=2,camp.id+' towers');
 assert(buildings.some(b=>b.kind==='scav-gate'));assert(buildings.some(b=>b.kind==='scav-fence'));
}
assert(!mission.constructionUnlocked('scav-barracks'));
mission.state.openingScene={handedOver:false};updateScavProduction(mission);
assert(rows.every(b=>b.scavProduction.nextAt===null),'No production while opening controls are locked');
mission.state.openingScene.handedOver=true;updateScavProduction(mission);
assert(locked.every(b=>b.scavProduction.nextAt===null),'Locked fourth sector stays dormant');
assert(rows.filter(b=>b.campId!=='west-south').every(b=>b.scavProduction.nextAt===30));
mission.advance(10);mission.state.flags.lastRevealed=true;mission.state.bounds=config.finalMapBounds.slice();mission.rebuildNavigation();updateScavProduction(mission);
assert(locked.every(b=>Math.abs(b.scavProduction.nextAt-40)<.01));
mission.advance(19.8);assert(rows.every(b=>b.scavProduction.count===0),'No early spawn');
const before=mission.save(),events=[],baseNav=mission.nav;let heapPeak=0;
while(mission.state.time<205){
 mission.advance(.1);events.push(...mission.drainEvents().filter(e=>e.type.startsWith('scav-')));mission.drainEffects();
 assert.equal(mission.nav,baseNav,'A sliced producer search restores the movement navigator');
 heapPeak=Math.max(heapPeak,process.memoryUsage().heapUsed);
 assert(heapPeak<512*1048576,'Production searches must stay bounded in memory');
}
const report=[];
for(const b of rows){
 const p=b.scavProduction,created=events.filter(e=>e.type==='scav-produced'&&e.building===b.id),waves=events.filter(e=>e.type==='scav-sortie'&&e.building===b.id);
 if(created.length<SCAV_PRODUCTION[p.type].size)console.error(JSON.stringify({blockedProducer:{id:b.id,camp:b.campId,x:b.x,y:b.y,rotation:b.rotation,production:p,created,waiting:mission.state.units.filter(u=>u.producerId===b.id).map(u=>({id:u.id,x:u.x,y:u.y,hp:u.hp,path:u.path,task:u.task}))}}));
 assert(created.length>=SCAV_PRODUCTION[p.type].size,b.campId+' '+p.type+' produces a full group');
 assert(waves.length>=1,b.campId+' '+p.type+' sends its group into an attack');
 assert(waves.every(e=>e.count===SCAV_PRODUCTION[p.type].size));
 for(let i=1;i<created.length;i++)assert(created[i].time-created[i-1].time>=29.999,'One spawn per 30 seconds; no catch-up burst');
 assert(created[0].time>=(b.campId==='west-south'?40:30));
 assert(mission.state.units.filter(u=>u.hp>0&&u.producerId===b.id).length<=SCAV_PRODUCTION[p.type].cap);
 report.push({camp:b.campId,producer:p.type,produced:created.length,firstSpawn:created[0].time,firstSortie:waves[0].time,groupSize:waves[0].count});
}
assert(mission.state.units.some(u=>u.owner==='rai'&&u.hp<u.maxHp),'The dispatched troops actually reach and damage the player');
const snapshot=mission.save(),restored=new Mission(config,field);restored.load(snapshot);
assert.deepEqual(producers(restored).map(b=>b.scavProduction),rows.map(b=>b.scavProduction),'Save preserves timers, queues and squad membership');
assert.equal(restored.state.buildings.length,mission.state.buildings.length,'Loading never duplicates the perimeter');
// Destroying one producer must leave the other operational.
const stopped=new Mission(config,field);stopped.load(before);
const garage=producers(stopped).find(b=>b.campId==='nw-pocket'&&b.kind==='camp-core'),barracks=producers(stopped).find(b=>b.campId===garage.campId&&b.kind==='scav-barracks');
stopped.damage(garage,1e8);const count=garage.scavProduction.count;
while(stopped.state.time<95){stopped.advance(.1);stopped.drainEvents();stopped.drainEffects();}
assert.equal(garage.scavProduction.count,count);assert(barracks.scavProduction.count>=2,'Barracks do not depend on the destroyed garage');
stopped.damage(barracks,1e8);const infantryCount=barracks.scavProduction.count;
stopped.advance(31);assert.equal(barracks.scavProduction.count,infantryCount);
const camp=stopped.state.camps.find(c=>c.id===garage.campId);
for(const entity of [...stopped.state.units,...stopped.state.buildings])if(entity.campId===camp.id&&!isCampPerimeter(entity))entity.hp=0;
stopped.updateMission();assert(camp.cleared,'A surviving fence is not a combat objective');
const legacy=JSON.parse(before);delete legacy.state.camps[0].baseVersion;legacy.state.camps[0].cleared=true;
legacy.state.buildings=legacy.state.buildings.filter(b=>b.campId!==camp.id);
restored.load(legacy);assert(!restored.state.buildings.some(b=>b.campId===camp.id),'Old cleared camps never respawn');
const oldLive=JSON.parse(before);
for(const c of oldLive.state.camps)delete c.baseVersion;
oldLive.state.buildings=oldLive.state.buildings.filter(b=>!b.kind.startsWith('scav-')&&!b.scavVariant);
for(const b of oldLive.state.buildings){delete b.scavProduction;if(b.kind==='camp-core')b.rotation=0;}
restored.load(oldLive);
assert.equal(producers(restored).length,8,'Living old camps gain independent garages and barracks');
assert.equal(producers(restored).find(b=>b.campId==='nw-pocket'&&b.kind==='camp-core').rotation,Math.PI,'Migrated garage faces its open yard, not the new back fence');
const migratedCount=restored.state.buildings.length;restored.load(restored.save());
assert.equal(restored.state.buildings.length,migratedCount,'Migration runs only once');
fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/scav-production.json',JSON.stringify({report,simulationSeconds:mission.state.time,heapPeakMB:heapPeak/1048576,saveLoad:true,independentDestruction:true},null,2));
console.log(JSON.stringify({passed:report,saveLoad:true,independentDestruction:true,heapPeakMB:Math.round(heapPeak/1048576)},null,2));
