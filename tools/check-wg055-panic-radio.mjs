import fs from 'node:fs';
import assert from 'node:assert/strict';
import {progressMission} from './check-navigation-public-progress.mjs';
import {MissionRadio} from '../campaign/radio/adapter.js';
import {mergeRetreatLibrary,RETREAT_RULES} from '../campaign/radio/retreat-incidents.js';
import {validateLibrary} from '../campaign/radio/conditions.js';
import {simulateRadio} from '../campaign/radio/simulator.js';
const library=JSON.parse(fs.readFileSync('assets/radio/situations_catalog.json','utf8')),results=[];
const make=()=>{
 const m=progressMission();m.state.time=30;
 const a=m.addUnit('bukhanka','rai',{x:0,y:0}),b=m.addUnit('bukhanka','rai',{x:25,y:0});a.hp=40;a.combatRetreat={status:'moving'};a.path=[{x:0,y:150}];a.commandRevision=1;
 const l=structuredClone(library);for(const r of l.rules)if(!RETREAT_RULES.includes(r.id))r.enabled=false;
 const radio=m.radioObserver=new MissionRadio(m,l);radio.unit(a);return {m,a,b,radio};
};
const pending=(r,type)=>[...r.engine.pending.values()].filter(b=>b.type===type);
const say=(m,r)=>{m.state.time+=2;r.tick();const lines=[];for(let i=0;i<5;i++){const line=r.next();if(line){lines.push(line);r.engine.completeLine();}m.state.time+=3;}return lines;};
{
 const {m,a,b,radio}=make();radio.note({id:'hit',type:'retreat-contact',unit:a.id,target:b.id,closingSpeed:7});
 const bucket=pending(radio,'traffic.retreat_contact')[0];assert(bucket);assert.equal(bucket.facts.panickedId,m.state.campaign.personnel.crews[a.id].memberIds[0]);
 const lines=say(m,radio);assert(lines.length);assert(lines.every(l=>[a.id,b.id].includes(l.unitId)));
 results.push({case:'real contact binds actual participants',lines:lines.map(l=>({unit:l.unitId,text:l.text}))});
}
{
 const {m,a,radio}=make();m.state.time+=4;a.navigation={waitSeconds:4};radio.unit(a);
 assert.equal(pending(radio,'traffic.panic_blocked').length,1);radio.unit(a);assert.equal(pending(radio,'traffic.panic_blocked')[0].rawEventCount,1);
 const lines=say(m,radio);assert(lines.length);assert(!lines.some(l=>/отмуч|погиб|жалко пацана|потеряли/i.test(l.text)));
 results.push({case:'blocked living driver asks for help, never reported dead',lines:lines.map(l=>l.text)});
}
{
 const {m,a,b,radio}=make();radio.note({id:'hit',type:'retreat-contact',unit:a.id,target:b.id,closingSpeed:5});radio.save();
 const restored=m.radioObserver=new MissionRadio(m,structuredClone(radio.library));assert(restored.retreatIncidents.records.has(a.id));
 restored.engine.pending.clear();restored.engine.state.queue=[];a.factoryVisit={phase:'inside'};restored.unit(a);
 const bucket=pending(restored,'traffic.panic_escaped')[0];assert(bucket);assert(bucket.facts.escaped);assert(bucket.facts.hadContact);
 restored.unit(a);assert.equal(bucket.rawEventCount,1,'Safe arrival is reported only once');
 const lines=say(m,restored);assert(lines.length);results.push({case:'successful escape and save/load retain one incident',lines:lines.map(l=>l.text)});
}
{
 const {m,a,radio}=make();delete a.combatRetreat;a.path=[];radio.unit(a);assert(!radio.retreatIncidents.records.has(a.id));assert.equal(pending(radio,'traffic.panic_escaped').length,0);
 results.push({case:'cancelled retreat is neither escape nor death'});
}
{
 const {m,a,radio}=make();m.damage(a,10000);assert.equal(a.hp,0);
 const bucket=pending(radio,'damage.panic_failed')[0];assert(bucket?.facts.confirmedDeath);assert(bucket.facts.killedIds.length>0);assert.equal(pending(radio,'damage.vehicle_destroyed').length,0);
 const lines=say(m,radio);assert(lines.length);assert(lines.every(l=>l.unitId!==a.id));results.push({case:'confirmed death voiced by a living witness',lines:lines.map(l=>l.text)});
}
{
 const {m,a,b,radio}=make();radio.note({id:'hit',type:'retreat-contact',unit:a.id,target:b.id,closingSpeed:7});m.state.time+=2;radio.tick();assert(radio.engine.state.queue.length);
 a.hp=0;assert.equal(radio.next(),null,'A different driver cannot inherit the frightened speaker line');
 results.push({case:'pending fear line expires when its driver dies'});
}
for(const kind of ['traffic.panic_escaped','damage.panic_failed']){
 const variants=library.rules.find(r=>r.id===kind).tiers[0].graphs;
 for(const graph of variants){
  const l=structuredClone(library),r=l.rules.find(r=>r.id===kind);r.tiers[0].graphs=[structuredClone(graph)];
  for(const killed of kind==='damage.panic_failed'?[0,1]:[0]){
   const result=simulateRadio(l,{type:kind,count:2,killed,losses:kind==='damage.panic_failed'?1:0,seed:graph.id});
   const deathVariant=graph.requires?.all.some(x=>x.field==='facts.confirmedDeath');
   if(deathVariant&&!killed)assert.equal(result.lines.length,0);
   else if(!graph.requires?.all.some(x=>x.field==='facts.casualtyGender'&&x.value==='f'))assert(result.lines.length,graph.id);
  }
 }
 results.push({case:kind+' every applicable authored graph publishes; death-only wording rejects unconfirmed losses'});
}
for(const gender of ['m','f']){
 const {m,a,radio}=make(),personnel=m.state.campaign.personnel;
 for(const id of personnel.crews[a.id].memberIds)personnel.soldiers[id].gender=gender;
 const rule=radio.library.rules.find(r=>r.id==='damage.panic_failed');
 for(const tier of rule.tiers)tier.graphs=tier.graphs.filter(g=>g.requires?.all.some(c=>c.field==='facts.casualtyGender'&&c.value===gender));
 m.damage(a,10000);const lines=say(m,radio);assert(lines.length);assert(lines.every(l=>l.unitId!==a.id));
 if(gender==='f')assert(lines.some(l=>/девчонку|Отмучилась/.test(l.text)));
 else assert(lines.some(l=>/пацана|Отмучился/.test(l.text)));
 results.push({case:'actual confirmed '+gender+' casualty gets matching witness wording',lines:lines.map(l=>l.text)});
}
{
 const {m,a,radio}=make();radio.retreatIncidents.records.clear();m.damage(a,10000);
 assert(pending(radio,'damage.panic_failed')[0]?.facts.confirmedDeath,'Death between retreat commit and first sample is still observed');
 const cancelled=make();cancelled.m.stop([cancelled.a.id]);cancelled.m.damage(cancelled.a,10000);
 assert.equal(pending(cancelled.radio,'damage.panic_failed').length,0,'Cancelled retreat cannot create a stale panic death');
 results.push({case:'immediate fatal hit is observed; cancelled retreat uses ordinary loss reporting'});
}
{
 const {m,a,b,radio}=make(),rule=radio.library.rules.find(r=>r.id==='traffic.retreat_contact');
 for(const tier of rule.tiers)tier.graphs=tier.graphs.filter(g=>g.id==='traffic.retreat_contact.v4');
 radio.note({id:'anger',type:'retreat-contact',unit:a.id,target:b.id,closingSpeed:7});const lines=say(m,radio);
 assert.equal(lines.length,2);assert.equal(lines[0].unitId,a.id);assert.equal(lines[1].unitId,b.id);assert(/Ты куда бампером/.test(lines[1].text));
 results.push({case:'indignation is voiced by the bumped driver, panic by the retreating driver',lines:lines.map(l=>({unit:l.unitId,text:l.text}))});
}
{
 const old=structuredClone(library);old.rules=old.rules.filter(r=>!RETREAT_RULES.includes(r.id));for(const id of Object.keys(old.phrases))if(RETREAT_RULES.some(r=>id.startsWith(r+'.')))delete old.phrases[id];
 old.settings.enabled=false;const existing=JSON.stringify(old.rules);mergeRetreatLibrary(old,library);validateLibrary(old);assert.equal(old.settings.enabled,false);assert.equal(JSON.stringify(old.rules.filter(r=>!RETREAT_RULES.includes(r.id))),existing);
 const rule=old.rules.find(r=>r.id===RETREAT_RULES[0]);rule.enabled=false;mergeRetreatLibrary(old,library);assert.equal(rule.enabled,false);assert.equal(old.rules.length,library.rules.length);
 results.push({case:'older published libraries receive new sources without replacing owner edits or disabled rules'});
}
fs.writeFileSync('campaign/previews/playtest-WG-055/panic-radio-checks.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
