import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeField,makeMission} from './m02-fixture.mjs';
import {allocatePersonnelName,nameCatalog} from '../campaign/personnel-names.js';
import {allocateCallsign,callsignVocabulary} from '../campaign/personnel-callsigns.js';
import {personnelRanks,rankInsignia} from '../campaign/personnel-ranks.js';
import {missionResults,campaignMemorial,setPersonnelRank,beginPersonnelMission,recordPersonnelDeath} from '../campaign/personnel.js';
import {gravePosition,resultsPresentationReady} from '../campaign/mission-results.js';

const names={},seen=new Set();for(let i=0;i<nameCatalog.entries.length+25;i++){const n=allocatePersonnelName(names);assert(!seen.has(n.name));seen.add(n.name);}
const restored=structuredClone(names);assert.deepEqual(allocatePersonnelName(names),allocatePersonnelName(restored));
const callState={},calls=new Set();for(let i=0;i<callsignVocabulary.length*3;i++){const c=allocateCallsign(callState);assert(!calls.has(c));calls.add(c);}
assert.equal(personnelRanks.filter(r=>r.service==='army').length,20);assert.equal(personnelRanks.filter(r=>r.service==='navy').length,19);
assert.equal((rankInsignia('captain').match(/polygon/g)??[]).length,4);assert.equal((rankInsignia('colonel').match(/polygon/g)??[]).length,3);
for(const r of personnelRanks.filter(r=>r.order<6))assert(!rankInsignia(r.id).includes('polygon'),'Enlisted insignia have no officer stars');
const poses=new Set();for(let i=0;i<2000;i++){const p=gravePosition(i);const key=p.x+':'+p.y;assert(!poses.has(key));poses.add(key);}
const radio={enabled:true,director:{scenes:new Map([['r54',{}],['m02-radio-victory',{}]]),finished:()=>false}};
assert(!resultsPresentationReady({state:{status:'victory'}},radio));assert(!resultsPresentationReady({state:{status:'victory',m02:{}}},radio));
assert(resultsPresentationReady({state:{status:'defeat'}},radio));assert(resultsPresentationReady({state:{status:'victory'}},{...radio,enabled:false}));radio.director.finished=()=>true;assert(resultsPresentationReady({state:{status:'victory'}},radio));
console.log('PASS unique names, deterministic restore, unique callsigns over 3 vocabulary cycles, 39 ranks, 2000 stable grave positions');

const field=makeField(),m=makeMission(field),p=m.state.campaign.personnel;
const own=m.state.units.find(u=>u.owner==='rai'&&u.kind==='bukhanka')??m.addUnit('bukhanka','rai',{x:0,y:0});
const sid=p.crews[own.id].memberIds[0],soldier=p.soldiers[sid],name=soldier.name,call=soldier.callsign;
const random=m.randomState,serial=m.serial;m.addUnit('bukhanka','rai',{x:150,y:150});assert.equal(m.randomState,random);assert.equal(m.serial,serial+1);
const kill=(kind='raider',owner='scavs',source=own)=>{const u=m.addUnit(kind,owner,{x:700,y:700});m.damage(u,u.maxHp*100,source);assert.equal(u.hp,0);return u;};
const victim=kill();m.damage(victim,1e6,own);recordPersonnelDeath(m,victim,own);assert.equal(soldier.kills,1);
const structure=m.addStructure('mg-tower','scavs',{x:800,y:800});m.damage(structure,1e6,own);assert.equal(soldier.structuresDestroyed,1);assert.equal(soldier.kills,1);
kill('bukhanka','rai');assert.equal(soldier.kills,1,'Friendly fire is not an enemy kill');
assert(setPersonnelRank(m,sid,'captain'));assert(!setPersonnelRank(m,sid,'invented-rank'));
m.damage(own,1e6,victim);assert(!setPersonnelRank(m,sid,'major'));
m.state.units=m.state.units.filter(u=>u.id!==own.id); // Wreck cleanup must not erase the crew.
const burn=m.addUnit('raider','scavs',{x:700,y:700});burn.burning={sourceId:own.id};m.damage(burn,1e6,null);assert.equal(soldier.kills,2);
assert.equal(campaignMemorial(m).find(s=>s.id===sid).rank,'captain');
const saved=m.save(),loaded=makeMission(field);loaded.load(saved);assert.equal(loaded.state.campaign.personnel.soldiers[sid].name,name);assert.equal(loaded.state.campaign.personnel.soldiers[sid].callsign,call);
assert.equal(campaignMemorial(loaded).length,2);assert.equal(campaignMemorial(loaded).find(s=>s.id===sid).kills,2);
m.state.time=100;m.state.status='victory';const first=missionResults(m);assert.equal(first.statistics.enemyUnitsDestroyed,2);assert.equal(first.statistics.personnelLost,2);
assert.equal(first.statistics.enemyStructuresDestroyed,1);assert.equal(first.durationSeconds,100);
first.memorial[0].name='MUTATION';assert.notEqual(missionResults(m).memorial[0].name,'MUTATION');
const frozen=JSON.stringify(missionResults(m));assert(m.enterM02().ok);assert.equal(JSON.stringify(missionResults(m,'m01')),frozen);
assert.equal(m.state.campaign.personnel.missions.m02.enemyUnitsDestroyed,0);
const secondOwn=m.state.units.find(u=>u.owner==='rai'&&u.hp>0);kill('raider','scavs',secondOwn);m.damage(secondOwn,1e6,victim);
m.state.time=150;m.state.status='defeat';const second=missionResults(m);assert.equal(second.statistics.enemyUnitsDestroyed,1);assert.equal(second.statistics.personnelLost,1);assert.equal(second.memorial.length,3);assert.equal(second.durationSeconds,50);
assert.equal(JSON.stringify(missionResults(m,'m01')),frozen,'Earlier results cannot change with later rank/death/kill changes');
const after=m.save();loaded.load(after);assert.deepEqual(missionResults(loaded),second);loaded.load(after);assert.deepEqual(missionResults(loaded),second);
loaded.load(saved);assert.equal(campaignMemorial(loaded).length,2,'Loading an earlier checkpoint forks the campaign without future graves');
console.log('PASS lethal damage attribution, deduplication, friendly fire, separate building counts, posthumous burn kill, rank at death, removed wrecks, m01→m02, victory/defeat, immutable reports, repeat load and rollback');

const old=JSON.parse(saved);delete old.state.campaign;old.state.time=321;loaded.load(old);loaded.state.status='defeat';const legacy=missionResults(loaded);
assert.equal(legacy.historyComplete,false);assert.equal(legacy.campaignHistoryComplete,false);assert.equal(legacy.statistics.enemyUnitsDestroyed,0);
assert(legacy.memorial.every(s=>s.kills===null));
loaded.state.m02={startedAt:400};loaded.state.time=400;loaded.state.status='running';beginPersonnelMission(loaded);assert(loaded.state.campaign.personnel.missions.m02.historyComplete);
const multi=makeMission(field);multi.config.units.bukhanka.crewSize=3;const vehicle=multi.addUnit('bukhanka','rai',{x:0,y:0});multi.damage(vehicle,1e6,null);
assert.equal(campaignMemorial(multi).filter(s=>s.unitId===vehicle.id).length,3,'Each crew member gets a separate cross');
console.log('PASS legacy saves honestly mark unknown historical kills, new phases resume exact tracking, multi-person crews produce individual crosses');
fs.mkdirSync('docs/campaign/personnel',{recursive:true});fs.writeFileSync('docs/campaign/personnel/backend-verification.json',JSON.stringify({passed:true,catalogNames:nameCatalog.entries.length,callsigns:callsignVocabulary.length,ranks:personnelRanks.length,checks:21},null,2));
