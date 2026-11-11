import assert from 'node:assert/strict';
import {makeField,makeMission} from './m02-fixture.mjs';
import {earnedRank,personnelRankProgress,rankInsignia} from '../campaign/personnel-ranks.js';
import {missionResults,recordPersonnelDeath,campaignMemorial,setPersonnelRank} from '../campaign/personnel.js';
import {personnelAwards} from '../campaign/personnel-awards.js';

for(const [kills,rank] of [[0,'private'],[3,'private'],[4,'lance-corporal'],[8,'junior-sergeant'],[16,'sergeant'],[32,'starshina'],[64,'senior-warrant-officer'],[128,'lieutenant'],[256,'major'],[512,'colonel'],[3072,'marshal'],[10000,'marshal']]){
 assert.equal(earnedRank({rank:'private',kills}).id,rank);
}
assert.equal(earnedRank({rank:'navy-private',kills:128}).id,'navy-lieutenant');
assert.equal(personnelRankProgress({rank:'private',kills:3}).remaining,1);
assert.equal(personnelRankProgress({rank:'marshal',kills:4000}).next,undefined);
assert.equal((rankInsignia('lieutenant').match(/<polygon/g)??[]).length,2);
assert.equal((rankInsignia('captain').match(/<polygon/g)??[]).length,4);

const field=makeField(),m=makeMission(field),p=m.state.campaign.personnel;
const add=()=>m.addUnit('bukhanka','rai',{x:100,y:100});
const crew=u=>p.soldiers[p.crews[u.id].memberIds[0]];
const a=add(),b=add(),c=add(),idle=add(),dead=add();
const kill=(source,structure=false)=>{
 const target=structure?m.addStructure('mg-tower','scavs',{x:800,y:800}):m.addUnit('raider','scavs',{x:800,y:800});
 m.damage(target,1e6,source);return target;
};
for(let i=0;i<3;i++)kill(a);
assert.equal(crew(a).rank,'private');const fourth=kill(a);assert.equal(crew(a).rank,'lance-corporal');
const promoted=m.drainEvents().filter(e=>e.type==='personnel-promoted');assert.equal(promoted.length,1);assert.equal(promoted[0].unitId,a.id);assert.equal(promoted[0].previousRank,'private');assert.equal(promoted[0].rank,'lance-corporal');
m.damage(fourth,1e6,a);recordPersonnelDeath(m,fourth,a);assert.equal(crew(a).kills,4);
assert(!m.drainEvents().some(e=>e.type==='personnel-promoted'),'Repeated lethal damage cannot announce promotion twice');
kill(a);for(let i=0;i<5;i++)kill(b);
for(let i=0;i<4;i++)kill(c,true);
assert.equal(crew(c).rank,'lance-corporal','Structures count toward promotion without changing personal unit kills');
assert.equal(crew(c).kills,0);
for(let i=0;i<5;i++)kill(dead);
m.damage(dead,1e6,{id:'hostile',owner:'scavs',kind:'raider',x:100,y:100});
const rankAtDeath=crew(dead).rank;
m.state.units=m.state.units.filter(u=>u.id!==dead.id);
const burn=m.addUnit('raider','scavs',{x:900,y:900});burn.burning={sourceId:dead.id};m.damage(burn,1e6,null);
assert.equal(crew(dead).kills,6);assert.equal(crew(dead).rank,rankAtDeath);
// Equal leaders must both receive the honour, including a posthumous leader.
kill(a);kill(b);
const friendly=add();m.damage(friendly,1e6,a);assert.equal(crew(a).kills,6);
const before=m.save(),loaded=makeMission(field);loaded.load(before);
assert.equal(loaded.state.campaign.personnel.soldiers[crew(a).id].rank,'lance-corporal');
assert.equal(personnelAwards(crew(a)).length,0,'No provisional medals before mission victory');
m.state.status='victory';m.state.time=1800;const first=missionResults(m);
const awardEvents=m.drainEvents().filter(e=>e.type==='personnel-awarded');assert.equal(awardEvents.length,1);assert(awardEvents[0].awards.some(a=>a.soldierId===crew(dead).id&&a.id==='hero'));
for(const u of [a,b,dead])assert.deepEqual(personnelAwards(crew(u)).map(a=>a.id),['participant','hero']);
assert.deepEqual(personnelAwards(crew(c)).map(a=>a.id),['participant','breacher']);
assert.deepEqual(personnelAwards(crew(idle)).map(a=>a.id),['participant']);
assert(personnelAwards(crew(dead)).every(a=>a.label.includes('посмертно')));
assert.equal(campaignMemorial(m).find(s=>s.id===crew(dead).id).rank,rankAtDeath);
const frozen=JSON.stringify(first);assert.equal(JSON.stringify(missionResults(m)),frozen);
assert(!m.drainEvents().some(e=>e.type==='personnel-awarded'),'Reopening results cannot award twice');
loaded.load(m.save());assert.deepEqual(missionResults(loaded),first);loaded.load(m.save());assert.deepEqual(missionResults(loaded),first);
assert(!loaded.drainEvents().some(e=>['personnel-promoted','personnel-awarded'].includes(e.type)),'Loading completed reports does not replay honours');
assert(m.enterM02().ok);assert.equal(JSON.stringify(missionResults(m,'m01')),frozen);
assert.equal(crew(a).rank,'lance-corporal');
kill(a);kill(a);assert.equal(crew(a).rank,'junior-sergeant');
m.state.status='victory';missionResults(m);
assert.equal(personnelAwards(crew(a)).filter(a=>a.id==='participant').length,2);
assert(!personnelAwards(crew(a)).some(a=>a.id==='hero'&&a.missionId==='m02'),'Career kills do not win a new mission');
assert(!personnelAwards(crew(dead)).some(a=>a.missionId==='m02'),'Previous losses cannot participate again');
assert.equal(JSON.stringify(missionResults(m,'m01')),frozen);

// Legacy known kills grant earned ranks; existing higher awards of rank and
// immutable completed reports survive. Unknown history cannot win a leaderboard.
const old=JSON.parse(before),oldSoldier=old.state.campaign.personnel.soldiers[crew(a).id];
oldSoldier.rank='private';oldSoldier.kills=191;oldSoldier.structuresDestroyed=1;
loaded.load(old);assert.equal(loaded.state.campaign.personnel.soldiers[oldSoldier.id].rank,'captain');
assert(setPersonnelRank(loaded,oldSoldier.id,'colonel'));loaded.load(loaded.save());
assert.equal(loaded.state.campaign.personnel.soldiers[oldSoldier.id].rank,'colonel');
loaded.state.campaign.personnel.missions.m01.historyComplete=false;loaded.state.status='victory';missionResults(loaded);
assert(Object.values(loaded.state.campaign.personnel.soldiers).every(s=>personnelAwards(s).every(a=>a.id==='participant')));
loaded.load(before);loaded.state.status='defeat';missionResults(loaded);
assert(Object.values(loaded.state.campaign.personnel.soldiers).every(s=>personnelAwards(s).length===0));
loaded.load(before);assert.equal(personnelAwards(loaded.state.campaign.personnel.soldiers[crew(a).id]).length,0,'Rollback does not leak future awards');
console.log('PASS rank thresholds, real kills/buildings, duplicate and friendly damage, ties, posthumous awards, mission thresholds, save/load, migration, frozen reports, defeat, rollback and m01→m02');
