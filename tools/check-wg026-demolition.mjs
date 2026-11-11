import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeMission} from './m02-fixture.mjs';
import {prepareM02Diagnostic} from '../campaign/mission02-diagnostic.js';
import {isCampPerimeter,hasPendingCampDemolition} from '../campaign/camp-demolition.js';
const m=prepareM02Diagnostic(makeMission()),results=[],pulse=()=>{m.state.time+=.1;m.updateMission();},kill=b=>m.damage(b,b.hp);
const ids=Object.keys(m.state.m02.bases);
for(const id of ids){
 const base=m.state.m02.bases[id],members=m.state.buildings.filter(b=>b.m02Base===id&&b.owner==='scavs'&&b.hp>0);
 const walls=members.filter(isCampPerimeter),buildings=members.filter(b=>!isCampPerimeter(b)),last=buildings.find(b=>b.kind==='scav-store'||b.kind==='scav-barracks')??buildings.at(-1);
 assert(walls.length&&buildings.length,id);
 const neighbours=m.state.buildings.filter(b=>b.m02Base&&b.m02Base!==id&&b.hp>0).map(b=>[b.id,b.hp]);
 for(const b of buildings)if(b!==last)kill(b);
 for(let i=0;i<6;i++)pulse();
 assert(walls.every(w=>w.hp>0&&w.campDemolitionAt===undefined),'Last warehouse must hold the perimeter: '+id);
 assert.notEqual(base.state,'neutralized','Auxiliary buildings still prevent completion');
 const guards=base.garrisonIds.filter(id=>m.entity(id));assert(guards.length);
 kill(last);m.drainEffects();pulse();
 const deadlines=walls.map(w=>[w.id,w.campDemolitionAt]);assert(deadlines.every(([,at])=>Number.isFinite(at)));
 let effects=m.drainEffects().filter(e=>e.type==='explosion').map(e=>e.targetId);
 m.load(m.save());assert.deepEqual(m.state.buildings.filter(b=>walls.some(w=>w.id===b.id)).map(b=>[b.id,b.campDemolitionAt]),deadlines);
 for(let i=0;i<42;i++){pulse();effects.push(...m.drainEffects().filter(e=>e.type==='explosion').map(e=>e.targetId));}
 assert.deepEqual(new Set(effects),new Set(walls.map(w=>w.id)));assert.equal(effects.length,walls.length,'Exactly one blast per segment, including load');
 assert(guards.every(id=>m.entity(id)),'Surviving garrison is not destroyed by perimeter cleanup');
 assert(neighbours.every(([id,hp])=>m.entity(id)?.hp===hp),'Other bases must stay intact');
 for(const w of walls){const dead=m.state.buildings.find(b=>b.id===w.id);assert.equal(dead.hp,0);assert(dead.damage.wreck);}
 results.push({base:id,segments:walls.length,lastBuilding:last.kind,load:true,guardsPreserved:guards.length});
}
// A newly created hostile resource is a building until destroyed or captured.
const sample=ids[0],base=m.state.m02.bases[sample];
const resource=m.addStructure('derrick','scavs',{x:-1900,y:-1900},{m02Base:sample,campId:base.id,campResource:true});
const wall=m.addStructure('scav-fence','scavs',{x:-1850,y:-1900},{m02Base:sample,campId:base.id});pulse();assert(wall.hp>0&&!wall.campDemolitionAt);
resource.owner='rai';pulse();assert.equal(wall.hp,0);assert(resource.hp>0);
// Complete an earned chain after victory without resuming combat/production.
const finalWalls=Array.from({length:8},(_,i)=>m.addStructure('scav-fence','scavs',{x:-1800+i*30,y:-1900},{m02Base:sample,campId:base.id}));
m.state.status='victory';const units=JSON.stringify(m.state.units),energy=m.state.energy;m.load(m.save());
assert(hasPendingCampDemolition(m));m.drainEffects();m.advance(8);const blasts=m.drainEffects().filter(e=>e.type==='explosion');
assert.equal(blasts.length,finalWalls.length);assert(!hasPendingCampDemolition(m));assert.equal(JSON.stringify(m.state.units),units);assert.equal(m.state.energy,energy);assert.equal(m.state.status,'victory');
m.advance(1);assert.equal(m.drainEffects().length,0);
fs.mkdirSync('campaign/previews/playtest-WG-026',{recursive:true});fs.writeFileSync('campaign/previews/playtest-WG-026/verification.json',JSON.stringify({results,totalSegments:results.reduce((s,r)=>s+r.segments,0),resourceCapturePreserved:true,victoryFinishesChain:true,noRepeatedBlasts:true},null,2));
console.log(JSON.stringify({passed:true,results}));
