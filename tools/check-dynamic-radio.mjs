import assert from 'node:assert/strict';
import fs from 'node:fs';
import {RadioEngine,aggregateContext} from '../campaign/radio/engine.js';
import {simulateRadio} from '../campaign/radio/simulator.js';
import {russianCount,russianNumber,realize,compileCondition,validateLibrary} from '../campaign/radio/conditions.js';
import {TrafficIncidents,MissionRadio} from '../campaign/radio/adapter.js';
import {Mission} from '../campaign/mission.js';
import {radioClip} from '../campaign/radio/audio.js';
import {renderRadioLine} from '../campaign/radio/wording.js';
import {composition} from '../campaign/radio/tactical-intel.js';
import {forceCombatRetreat,startAutomaticRetreat} from '../campaign/combat-policy.js';

const library=JSON.parse(fs.readFileSync('assets/radio/situations_catalog.json','utf8'));
const tests=[];const test=(name,fn)=>{fn();tests.push(name);console.log('PASS '+name);};
const live=Array.from({length:25},(_,i)=>({crewId:'c'+i,unitId:'u'+i,callSign:'Кедр-'+i,role:'driver',alive:true,radioChannel:'rai'}));
// Core tests use a fixed three-second window; shipped timings are tested separately below.
const engine=(saved)=>{const fixture=structuredClone(library);for(const rule of fixture.rules)rule.windowSimSeconds=3;return new RadioEngine(fixture,{snapshot:()=>({speakers:live}),saved});};
const event=(extra={})=>({id:'one',tickId:1,simTime:0,type:'command.move',orderId:'o1',actorIds:['u0'],affectedIds:['u0'],facts:{accepted:true},...extra});
test('231 situations, exact category counts and 25 legacy IDs',()=>{
 assert.equal(library.rules.length,231);assert.equal(Object.keys(JSON.parse(fs.readFileSync('assets/radio/legacy_25_mapping.json'))).length,25);validateLibrary(library);
 assert.deepEqual(Object.values(Object.groupBy(library.rules,r=>r.category)).map(v=>v.length),[26,20,27,30,19,10,15,5,12,7,15,18,5,15,7]);
});
test('1 / 5 / 20 vehicles, one accepted order = one different graph',()=>{
 for(const [count,tier] of [[1,'single'],[5,'group'],[20,'mass']]){const r=simulateRadio(library,{count});assert.equal(r.candidates.length,1);assert.equal(r.candidates[0].tier,tier);assert.equal(r.contexts[0].distinctOrderCount,1);assert.equal(r.contexts[0].affectedUnitCount,count);assert(r.lines.length>=1);if(r.lines.length>1)assert.notEqual(r.lines[0].crewId,r.lines[1].crewId);}
});

test('temporary speech uses exact realized numbers and crew voice; recordings win',()=>{
 const p={text:'Потеряли {destroyedVehicleCount:machineAcc}.',source:'tts'};
 const one=radioClip(p,'Потеряли одну машину.',library.settings,'voice-1');
 const five=radioClip(p,'Потеряли пять машин.',library.settings,'voice-1');
 const second=radioClip(p,'Потеряли пять машин.',library.settings,'voice-2');
 assert.notEqual(one.file,five.file);assert.notEqual(five.file,second.file);
 assert.equal(new URL(one.file,'http://localhost').searchParams.get('text'),'Потеряли одну машину.');
 assert.equal(radioClip(p,p.text,library.settings),null);
 assert.equal(radioClip({...p,source:'text'},'Только текст.',library.settings),null);
 const recorded={text:'Принято.',source:'recording',audio:{file:'owner.ogg',text:'Принято.'}};
 assert.equal(radioClip(recorded,recorded.text,library.settings).file,'owner.ogg');
 assert.equal(radioClip(recorded,'Текст изменён.',library.settings).origin,'temporary-synthesis');
 for(const count of [1,5,20])assert(simulateRadio(library,{count}).lines.every(l=>l.clip?.origin==='temporary-synthesis'));
});

test('five orders waiting behind story reserve distinct wording, even with different callsigns',()=>{
 const e=engine();e.settings.maxRoutineQueue=6;e.settings.squadCooldown=2;e.library.rules.find(r=>r.id==='command.move').cooldown=2;e.library.rules.find(r=>r.id==='command.move').expiresAfter=30;for(let i=0;i<5;i++)e.event(event({id:'queued-'+i,orderId:'order-'+i,affectedIds:['u'+i],actorIds:['u'+i]}));
 e.tick(30,3);assert.equal(e.state.queue.length,5);
 const first=e.state.queue.map(q=>q.lines[0].repeatText);assert.equal(new Set(first).size,5);
 const lines=[];for(let t=3;t<40;t+=4){const line=e.next(t);if(line){lines.push(line);e.completeLine();}}
 assert(lines.length>=3);assert.equal(new Set(lines.map(l=>l.repeatText)).size,lines.length);
 assert(e.state.journal.filter(j=>j.opening).every(j=>j.text.includes(live.find(s=>s.crewId===j.crewId).callSign)));assert(lines.every(l=>new URL(l.clip.file,'http://localhost').searchParams.get('text')===l.text));
 // Old saves may contain duplicates already queued by the previous version.
 const old=engine();old.event(event());old.tick(30,3);const queued=structuredClone(old.state.queue[0]);
 old.state.queue.push({...queued,id:'old-duplicate',scopeKey:'old-scope'});
 assert(old.next(3));old.completeLine();assert.equal(old.next(8),null);
 const saved=engine(structuredClone(e.save()));
 assert(saved.state.recent.some(r=>r.signatures?.length));
});

test('callsigns and names are rendered from participants; a renamed speaker is not a new phrase',()=>{
 const p={text:'{addresseeName}, приказ понял. Выдвигаюсь.',source:'tts'};
 const context={facts:{}},a={crewId:'a',callSign:'Кедр',name:'Алексей'},b={crewId:'b',callSign:'Буран',name:'Сергей'};
 const first=renderRadioLine(p,context,library.dictionaries,a,b,{opening:true});assert(first.text.includes('Кедр'));assert(first.text.includes('Сергей'));
 const changed=renderRadioLine(p,context,library.dictionaries,{...a,callSign:'Волга'}, {...b,name:'Виктор'},{opening:true});assert.equal(first.repeatText,changed.repeatText);
 assert.equal(renderRadioLine(p,context,library.dictionaries,a,null,{opening:true}),null);
 const recorded={text:'Приказ принят.',source:'recording',audio:{text:'Приказ принят.',file:'owner.ogg'}};
 assert.equal(renderRadioLine(recorded,context,library.dictionaries,a,b,{opening:true}).text,'Приказ принят.');
});
test('short replies and joke replies share repeat protection across different openings and saves',()=>{
 const e=engine(),context={primaryEventType:'command.move',scopeKey:'new'};
 e.state.recent=[{at:0,signatures:['старый доклад','стоп']}];
 const other=[{bodyText:'Новый доклад.'},{kind:'ack',bodyText:'Стоп.'}];
 assert(e.repeatBlocked(other,context,100));assert(e.repeatBlocked(other,context,299));
 assert(!e.repeatBlocked(other,context,301));
 const restored=engine(structuredClone(e.save()));assert(restored.repeatBlocked(other,context,100));
 assert(restored.repeatBlocked(other.map(l=>({...l,kind:'dry_joke'})),context,599));
});
test('unused wording precedes repeats even after the time ban expires; usage survives loading',()=>{
 let e=engine();const texts=[];
 for(let i=0;i<8;i++){
  const time=i*601;e.event(event({id:'variety-'+i,orderId:'variety-'+i,tickId:time*10,simTime:time}));e.tick(time*10+30,time+3);
  const line=e.next(time+3);assert(line);texts.push(line.bodyText);e.completeLine();
  if(i===3)e=engine(structuredClone(e.save()));
 }
 assert.equal(new Set(texts).size,8,texts.join(' | '));
});
test('three-turn exchanges keep the same A/B/A operators and interrupt before a stale reply',()=>{
 const fixture=structuredClone(library),rule=fixture.rules.find(r=>r.id==='command.move');rule.windowSimSeconds=3;
 const group=rule.tiers.find(t=>t.id==='group');group.graphs=group.graphs.filter(g=>g.id.endsWith('.exchange-v1'));
 const make=()=>new RadioEngine(structuredClone(fixture),{snapshot:()=>({speakers:live})});
 const e=make();e.event(event({affectedIds:['u0','u1','u2','u3','u4'],actorIds:['u0','u1','u2','u3','u4']}));e.tick(30,3);
 const lines=[];for(const time of [3,4,5]){const line=e.next(time);assert(line);lines.push(line);e.completeLine();}
 assert.equal(lines[0].crewId,lines[2].crewId);assert.notEqual(lines[0].crewId,lines[1].crewId);
 assert(lines[0].text.includes(lines[1].station),'The opening addresses its actual conversation partner');
 const interrupted=make();interrupted.event(event({affectedIds:['u0','u1'],actorIds:['u0','u1']}));interrupted.tick(30,3);
 assert(interrupted.next(3));interrupted.completeLine();
 interrupted.event(event({id:'loss',type:'damage.vehicle_destroyed',orderId:undefined,simTime:6,tickId:60,affectedIds:['dead'],facts:{destroyedIds:['dead']},flags:{urgent:true}}));
 assert(interrupted.next(6)?.id.startsWith('damage.vehicle_destroyed.'));
 const vanished=make();vanished.event(event({affectedIds:['u0','u1'],actorIds:['u0','u1']}));vanished.tick(30,3);
 const opening=vanished.next(3);vanished.completeLine();const missing=live.find(s=>s.crewId!==opening.crewId&&['u0','u1'].includes(s.unitId));
 try{missing.alive=false;assert.equal(vanished.next(4),null);}finally{missing.alive=true;}
});
test('group representatives rotate independently of replies and keep their history across saves',()=>{
 const run=()=>{
  let e=engine();const leads=[];
  for(let i=0;i<6;i++){
   const time=i*70;e.event(event({id:'rotation-'+i,orderId:'rotation-'+i,tickId:time*10,simTime:time,affectedIds:['u0','u1','u2','u3','u4']}));e.tick(time*10+30,time+3);
   const first=e.next(time+3);assert(first);leads.push(first.crewId);e.completeLine();
   const reply=e.next(time+4);if(reply){assert.notEqual(reply.crewId,first.crewId);e.completeLine();}
   if(i===1)e=engine(structuredClone(e.save()));
  }
  assert.equal(new Set(leads.slice(0,5)).size,5);assert.notEqual(leads[4],leads[5]);return leads;
 };
 assert.deepEqual(run(),run(),'Rotation uses radio history and a stable seed, not gameplay RNG');
 const solo=engine();solo.event(event({affectedIds:['u4'],actorIds:['u4']}));solo.tick(30,3);assert.equal(solo.next(3).crewId,'c4','An uninvolved crew does not answer a single-unit order');
});

test('200/300 remain confirmed personnel facts; dry retreat and explosion exchanges have real guards',()=>{
 for(let seed=0;seed<25;seed++){
  const unknown=simulateRadio(library,{type:'damage.vehicle_destroyed',count:3,losses:3,killed:3,crewKnown:false,seed:String(seed)});
  assert(!unknown.lines.some(l=>/двухсот|трёхсот|Погибло/.test(l.text)));
 }
 assert.deepEqual([1,2,5,21].map(n=>russianCount(n,library.dictionaries.morphology.twoHundred)),['1 двухсотый','2 двухсотых','5 двухсотых','21 двухсотый']);
 assert.equal(russianCount(3,library.dictionaries.morphology.threeHundred),'3 трёхсотых');
 const retreat=simulateRadio(library,{type:'command.retreat',count:5,tone:'dry',combat:true});assert(retreat.lines.some(l=>/перегруппир|ман[её]вр/i.test(l.text)));
 assert.equal(simulateRadio(library,{type:'combat.target_destroyed',count:1,tone:'dry',combat:true,explosionConfirmed:false}).lines.length,0);
 const medal=simulateRadio(library,{type:'combat.kill_banter',count:3,tone:'dry'});assert(medal.lines.some(l=>l.text.includes('медаль')));
 assert.equal(simulateRadio(library,{type:'combat.kill_banter',count:3,tone:'dry',combat:true}).lines.length,0);
 assert.equal(simulateRadio(library,{type:'combat.target_destroyed',count:1,tone:'dry',combat:true,explosionConfirmed:true,losses:1,killed:1}).lines.length,0);
});
test('20 per-unit callbacks deduplicate order identity but retain exact actors',()=>{
 const e=engine();for(let i=0;i<20;i++)e.event(event({id:'e'+i,actorIds:['u'+i],affectedIds:['u'+i]}));
 const c=aggregateContext([...e.pending.values()][0],3);assert.equal(c.rawEventCount,20);assert.equal(c.distinctOrderCount,1);assert.equal(c.uniqueActorCount,20);
 e.tick(30,3);assert.equal(e.state.queue.length,1);assert.equal(e.state.queue[0].tier,'mass');
 const separate=engine();for(let i=0;i<20;i++)separate.event(event({id:'e'+i,orderId:'o'+i}));assert.equal([...separate.pending.values()].filter(b=>b.type==='command.move').length,20);
 assert.equal([...separate.pending.values()].filter(b=>b.type==='command.move').reduce((n,b)=>n+aggregateContext(b,3).distinctOrderCount,0),20);
 separate.tick(30,3);assert.equal(separate.state.queue[0].type,'traffic.network_overload');
});
test('20 hits are one affected vehicle; no invented wounded or dead',()=>{
 const r=simulateRadio(library,{type:'damage.hit',count:1,hits:20});assert.equal(r.contexts[0].rawEventCount,20);assert.equal(r.contexts[0].uniqueAffectedUnitCount,1);assert.equal(r.contexts[0].facts.hitCount,20);
 const unknown=engine();unknown.event(event({type:'damage.hit',facts:{hitCount:1}}));assert.equal(aggregateContext([...unknown.pending.values()][0],3).killedCrewCount,null);
});
test('critical damage wording requires measured severity; one light hit is not a wreck',()=>{
 for(const count of [1,5,20])for(const severity of [.01,.64,.65,.9]){
  const e=engine(),ids=live.slice(0,count).map(s=>s.unitId);
  e.event(event({type:'damage.hit',affectedIds:ids,actorIds:ids,facts:{hitCount:1,severity}}));e.tick(30,3);
  const q=e.state.queue[0];assert(q);assert.equal(q.graphId.includes('.critical-'),severity>=.65);
 }
});
test('loading a rewritten library drops rendered conversations but retains facts and radio history',()=>{
 const e=engine();e.event(event());e.tick(30,3);
 e.state.batch.push(structuredClone(e.state.queue[0]));
 e.event(event({id:'pending',type:'damage.hit',tickId:31,simTime:3.1,facts:{hitCount:1}}));
 e.state.journal.push({at:0,crewId:'c0',text:'Историческая запись.'});
 const saved=structuredClone(e.save()),updated=structuredClone(e.library);
 updated.phrases[saved.queue[0].lines[0].id].text='На новый маршрут.';
 const restored=new RadioEngine(updated,{saved:structuredClone(saved),snapshot:()=>({speakers:live})});
 assert.equal(restored.state.queue.length,0);assert.equal(restored.state.batch.length,0);
 assert.equal(restored.pending.size,e.pending.size);assert.deepEqual(restored.state.journal,e.state.journal);
 const same=new RadioEngine(e.library,{saved:structuredClone(saved)});assert.equal(same.state.queue.length,1);
 delete saved.librarySignature;
 const legacy=new RadioEngine(e.library,{saved});assert.equal(legacy.state.queue.length,0);assert.equal(legacy.state.batch.length,0);
});
test('simultaneous affected units differ from units observed over a rolling window',()=>{
 const e=engine();for(let i=0;i<20;i++)e.event(event({id:'rolling-'+i,tickId:i,simTime:i*.05,affectedIds:['u'+i]}));
 const c=aggregateContext([...e.pending.values()][0],3);assert.equal(c.concurrentCount,1);assert.equal(c.rollingCount,20);assert.equal(c.rawEventCount,20);
});
test('duplicate IDs and root facts do not double-count',()=>{const e=engine();e.event(event());e.event(event());e.event(event({id:'two',rootCauseId:'same'}));e.event(event({id:'three',rootCauseId:'same'}));assert.equal(e.state.stats.ingested,2);});
test('urgent first loss is immediate; final window replaces unplayed partial summary',()=>{
 const e=engine();for(let i=0;i<3;i++){
  e.event(event({id:'loss'+i,type:'damage.vehicle_destroyed',orderId:undefined,incidentId:'battle',affectedIds:['dead-unit'+i],facts:{destroyedIds:['dead-unit'+i],crewKnown:true,killedIds:['dead-crew'+i]},flags:{urgent:true,confirmed:true}}));
  assert.equal(e.state.queue.length,1);
 }
 assert.equal(e.state.queue[0].context.destroyedVehicleCount,1);e.tick(30,3);
 assert.equal(e.state.queue.length,1);assert.equal(e.state.queue[0].context.destroyedVehicleCount,3);assert.equal(e.state.queue[0].context.killedCrewCount,3);
});
test('3 vehicles with confirmed zero killed never become three casualties',()=>{
 const r=simulateRadio(library,{type:'damage.vehicle_destroyed',count:3,losses:3,killed:0});assert(r.lines.some(l=>/три машины/i.test(l.text)));assert(!r.lines.some(l=>/двухсот|Погибло/.test(l.text)));
});
test('Russian morphology 1,2,5,11,21,22,25',()=>{assert.deepEqual([1,2,5,11,21,22,25].map(n=>russianCount(n,['машина','машины','машин'])),['1 машина','2 машины','5 машин','11 машин','21 машина','22 машины','25 машин']);});
test('spoken numbers agree with gender and case, including compound numbers',()=>{
 const cases=[
  [1,'одна машина','одну машину','один двухсотый'],[2,'две машины','две машины','два двухсотых'],
  [3,'три машины','три машины','три двухсотых'],[5,'пять машин','пять машин','пять двухсотых'],
  [11,'одиннадцать машин','одиннадцать машин','одиннадцать двухсотых'],
  [21,'двадцать одна машина','двадцать одну машину','двадцать один двухсотый'],
  [22,'двадцать две машины','двадцать две машины','двадцать два двухсотых'],
  [25,'двадцать пять машин','двадцать пять машин','двадцать пять двухсотых'],
  [101,'сто одна машина','сто одну машину','сто один двухсотый'],
  [1000,'одна тысяча машин','одну тысячу машин','одна тысяча двухсотых']];
 for(const [n,machine,acc,dead] of cases){
  assert.equal(realize('Техника: {n:machine}.',{n},library.dictionaries),'Техника: '+machine+'.');
  assert.equal(realize('Потеряли {n:machineAcc}.',{n},library.dictionaries),'Потеряли '+acc+'.');
  assert.equal(realize('По людям — {n:twoHundred}.',{n},library.dictionaries),'По людям — '+dead+'.');
  assert.equal(realize('По раненым — {n:threeHundred}.',{n},library.dictionaries),'По раненым — '+dead.replaceAll('двухсот','трёхсот')+'.');
 }
 assert.equal(russianNumber(21001,'feminineAccusative'),'двадцать одну тысячу одну');
 assert.equal(russianNumber(0),'ноль');assert.equal(russianNumber(-1),null);assert.equal(russianNumber(1.5),null);
 assert.equal(realize('{n:machineAcc}.',{n:null},library.dictionaries),null,'Unknown is not zero');
 const bad=structuredClone(library);bad.dictionaries.spokenCounts.machine='random';assert.throws(()=>validateLibrary(bad));
});
test('a lost unit gets one concise report, never a vehicle count followed by the same casualties',()=>{
 const phrase={text:'Потеряли {destroyedVehicleCount:machineAcc}.',source:'tts'};
 const rendered=renderRadioLine(phrase,{destroyedVehicleCount:1,killedCrewCount:2,facts:{}},library.dictionaries,{crewId:'alive',callSign:'Кедр'},null,{opening:true});
 assert.equal(rendered.text,'Кедр. Потеряли одну машину.');
 const clip=radioClip(phrase,rendered.text,library.settings,'voice-1');assert.equal(new URL(clip.file,'http://localhost').searchParams.get('text'),rendered.text);
 for(const [vehicles,machine,slang] of [[1,'одну машину','один двухсотый'],[2,'две машины','два двухсотых'],[5,'пять машин','пять двухсотых'],[21,'двадцать одну машину','двадцать один двухсотый']]){
  const kinds=new Set();
  for(let seed=0;seed<32;seed++){
  const result=simulateRadio(library,{type:'damage.vehicle_destroyed',count:Math.max(vehicles,5),losses:vehicles,killed:vehicles,seed:'wording-'+seed});
  assert(result.lines.length);const text=result.lines.map(l=>l.bodyText).join(' ').toLocaleLowerCase('ru');
  assert.notEqual(text.includes(machine),text.includes(slang),text);kinds.add(text.includes(machine)?'vehicle':'slang');
  assert(!/\d|груз|минус|трёхсот|по людям|экипаж|погибших/.test(text),text);
  assert.equal(result.lines.length,1);assert.equal(text.split(/[.!?]/).filter(s=>s.trim()).length,1,text);
  assert.equal(result.contexts[0].destroyedVehicleCount,vehicles);
  for(const line of result.lines)assert(new URL(line.clip.file,'http://localhost').searchParams.get('text').includes(line.bodyText));
  }
  assert.equal(kinds.size,2,'Both registers remain available, as alternatives');
 }
});
test('commander loss is one report; damage alone never reports a 300',()=>{
 for(const crewKnown of [true,false]){
  const result=simulateRadio(library,{type:'damage.commander_down',count:1,losses:1,killed:1,crewKnown});
  assert.equal(result.lines.length,1);assert(!result.lines.some(l=>/двухсот|погибших|экипаж|уточняем|людям/i.test(l.text)));
  assert.equal(result.lines[0].bodyText.split(/[.!?]/).filter(s=>s.trim()).length,1);
 }
 for(const type of ['damage.hit','damage.mobility_lost'])for(let seed=0;seed<10;seed++){
  const result=simulateRadio(library,{type,count:5,hits:20,seed:String(seed)});assert(result.lines.length);assert(!result.lines.some(l=>/двухсот|трёхсот|груз/i.test(l.text)));
 }
 assert.equal(library.rules.find(r=>r.id==='damage.crew_wounded').enabled,false,'Wounds remain unavailable without an actual source');
});
test('typed AND / OR / NOT, unknown facts, unsafe expressions rejected',()=>{
 const check=compileCondition({all:[{field:'affectedUnitCount',op:'gte',value:20},{not:{field:'facts.crewKnown',op:'eq',value:false}}]});assert(check({affectedUnitCount:20,facts:{crewKnown:true}}));assert(!check({affectedUnitCount:1}));assert.throws(()=>compileCondition({field:'globalThis.process',op:'eval',value:'x'}));
});
test('same stationary connected incident does not spam; moving queue is not a jam',()=>{
 const traffic=new TrafficIncidents(),events=[];const unit=(i,x=0)=>({id:'t'+i,hp:10,path:[{}],x:x+i,y:0,driveSpeed:0});
 for(let t=0;t<=30;t++){
  for(let i=0;i<20;i++)traffic.observe(unit(i),t,'t'+((i+1)%20));traffic.update(t,(type,data)=>events.push({type,...data}));
 }
 assert.equal(events.length,1);assert.equal(events[0].affectedIds.length,20);
 for(let i=0;i<20;i++)traffic.observe({...unit(i,10),driveSpeed:2},31,null);traffic.update(31,(type,data)=>events.push({type,...data}));
 assert.equal(events.at(-1).type,'traffic.jam_resolved');assert.equal(events[0].incidentId,events[1].incidentId);
 const moving=new TrafficIncidents(),normal=[];
 for(let t=0;t<20;t++){moving.observe({...unit(0,t),driveSpeed:1},t,'t1');moving.update(t,(...e)=>normal.push(e));}assert.equal(normal.length,0);
});
test('cancelled wait does not claim a resolved passage',()=>{
 const t=new TrafficIncidents(),types=[];for(let n=0;n<=11;n++){t.observe({id:'a',hp:1,path:[{}],x:0,y:0},n,'b');t.update(n,type=>types.push(type));}
 t.observe({id:'a',hp:1,path:[],x:0,y:0},12,null);t.update(12,type=>types.push(type));assert.deepEqual(types,['traffic.queue_blocked']);
});
test('persistent incident tier, dedup and memory survive save/load',()=>{
 let e=engine();e.event(event());e.tick(30,3);const saved=structuredClone(e.save());e=engine(saved);assert.equal(e.event(event()),false);assert.equal(e.state.queue.length,1);
 e.event(event({id:'next',tickId:40,simTime:4}));e.tick(70,7);assert.equal(e.state.queue.length,1);
});
test('story locks channel; expired clips discarded; dead speakers cannot publish',()=>{
 const e=engine();e.event(event());e.tick(30,3);assert.equal(e.next(3,{storyLock:true}),null);assert.equal(e.state.stats.published,0);assert.equal(e.next(100),null);
 e.event(event({id:'new',orderId:'o2',tickId:101,simTime:101}));e.tick(1050,105);for(const s of live)s.alive=false;assert.equal(e.next(105),null);for(const s of live)s.alive=true;
});
test('weather has no invented source; unavailable entries stay silent',()=>{for(const r of library.rules.filter(r=>r.support!=='wired')){const result=simulateRadio(library,{type:r.eventType});assert.equal(result.candidates.length,0,r.id);}});
test('every wired type produces a valid branch in the shared simulator',()=>{
 for(const rule of library.rules.filter(r=>r.support==='wired')){
  const l=structuredClone(library);l.rules.find(r=>r.id===rule.id).enabled=true;
  for(const tier of l.rules.find(r=>r.id===rule.id).tiers)for(const graph of tier.graphs)if(graph.personal)graph.chance=1;
  const result=simulateRadio(l,{type:rule.eventType,count:20,losses:rule.id==='idle.quiet'||rule.delivery==='idle'?0:3,orders:rule.eventType==='traffic.network_overload'?20:1});
  assert(result.candidates.length>0,rule.id);assert(result.lines.length>0,rule.id);
 }
});
test('10000-event burst stays bounded and deterministic',()=>{
 const replay=()=>{const e=engine();for(let i=0;i<10000;i++)e.event(event({id:'b'+i,orderId:'o'+(i%1000),affectedIds:['u'+(i%20)]}));e.tick(30,3);assert(e.pending.size<=library.settings.maxPending);assert(e.state.queue.length<=library.settings.maxQueue);return e.state.queue.map(q=>q.id+q.graphId);};assert.deepEqual(replay(),replay());
});
test('two-second dispatch picks losses first, story locks everything, routine backlog stays small',()=>{
 const e=engine();
 for(let i=0;i<5;i++)e.event(event({id:'routine-'+i,orderId:'routine-'+i,affectedIds:['u'+i],actorIds:['u'+i]}));
 e.event(event({id:'lost',type:'damage.vehicle_destroyed',orderId:undefined,incidentId:'lost-one',affectedIds:['dead'],facts:{destroyedIds:['dead'],crewKnown:true,killedIds:['soldier-dead']},flags:{urgent:true,confirmed:true}}));
 e.tick(30,3);assert(e.state.queue.filter(q=>q.priority<40).length<=2);
 assert.equal(e.next(3,{storyLock:true}),null);assert.equal(e.state.stats.published,0);
 const loss=e.next(3);assert(loss);assert.equal(e.state.lastPacket.events[0],'damage.vehicle_destroyed');assert(/двухсотый|машину/.test(loss.text));
 const decisions=e.state.stats.decisions;e.completeLine();assert.equal(e.next(4),null);assert.equal(e.state.stats.decisions,decisions);
 e.next(5);assert.equal(e.state.stats.decisions,decisions+1);
 const next=engine();next.event(event());next.tick(30,3);assert.equal(next.state.queue.length,1);
 next.event(event({id:'replacement',orderId:'replacement',tickId:40,simTime:4,type:'command.attack'}));
 assert.equal(next.state.queue.length,0,'A newer command supersedes the old acknowledgement');
 for(const r of library.rules.filter(r=>r.enabled&&r.priority<80)){
  const result=simulateRadio(library,{type:r.eventType,count:20,orders:r.eventType==='traffic.network_overload'?20:1});
  assert(result.candidates.every(q=>q.lines.length<=3),r.id);
 }
});
test('related short reports form one packet; expired dialogue does not resume after story',()=>{
 const e=engine();
 for(const type of ['repair.complete','construction.complete'])e.event(event({id:type,type,orderId:undefined,incidentId:type,objectIds:['building'],facts:{resolution:'resolved'}}));
 e.tick(30,3);assert(e.next(3));assert.equal(e.state.lastPacket.events.length,2);assert(e.state.lastPacket.events.includes('repair.complete'));
 e.completeLine();assert(e.next(3.5));e.completeLine();
 const interrupted=engine();interrupted.event(event({affectedIds:['u0','u1','u2','u3','u4']}));interrupted.tick(30,3);assert(interrupted.next(3));interrupted.completeLine();
 assert.equal(interrupted.next(100),null);
});

const config=JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/gameplay.json'));
const field={extent:4096,half:2048,cellMetres:32,heightAt:()=>0,gradientAt:()=>({x:0,y:0}),gridToWorld:([x,y])=>({x:x*32-2048,y:2048-y*32}),worldToGrid:(x,y)=>[(x+2048)/32,(2048-y)/32]};
function fixture(time=15){const m=new Mission(structuredClone(config),field);m.state.time=time;m.state.units=[];m.state.buildings=[];m.state.camps=[];m.state.artifacts=[];m.state.bounds=[0,0,127,127];m.updateMission=()=>{};m.rebuildNavigation();m.visible.fill(1);m.explored.fill(1);return m;}

test('bawdy exchanges are actually heard over both mission clocks with male crews and moving vehicles',()=>{
 for(const missionStart of [0,1000]){
  const m=fixture(missionStart);if(missionStart)m.state.m02={startedAt:missionStart};
  for(let i=0;i<3;i++){const u=m.addUnit('bukhanka','rai',{x:i*50,y:0});u.task={type:'move',x:500,y:0};u.path=[{x:500,y:0}];const p=m.state.campaign.personnel;p.soldiers[p.crews[u.id].memberIds[0]].gender='m';}
  let radio=m.radioObserver=new MissionRadio(m,structuredClone(library)),busyUntil=0;const jokes=[];
  for(let elapsed=15;elapsed<=600;elapsed++){
   m.state.time=missionStart+elapsed;radio.tick();const line=radio.next({storyLock:elapsed<120,audioBusy:m.state.time<busyUntil});
   if(line){if(radio.engine.active.cursor===0&&radio.engine.active.bawdy)jokes.push({at:elapsed,graph:radio.engine.active.graphId,body:line.bodyText,crew:line.crewId});busyUntil=m.state.time+Math.max(3,line.text.length*.06);radio.engine.completeLine();}
   if(elapsed===300){radio.save();radio=m.radioObserver=new MissionRadio(m,structuredClone(library));}
  }
  assert(jokes.length>=3&&jokes.length<=4,JSON.stringify(jokes));assert(jokes[0].at>=120&&jokes[0].at<=130,JSON.stringify(jokes));
  assert.equal(new Set(jokes.map(j=>j.body)).size,jokes.length);assert(new Set(jokes.map(j=>j.crew)).size>=2);
  for(let i=1;i<jokes.length;i++)assert(jokes[i].at-jokes[i-1].at>=150);
 }
});

test('queued bawdy exchange is cancelled by fresh combat, losses or remembrance; own outgoing fire counts',()=>{
 for(const reason of ['lastCombat','lastLoss','lastRemembranceAt']){
  const m=fixture(90);for(let i=0;i<2;i++)m.addUnit('bukhanka','rai',{x:i*50,y:0});
  const radio=m.radioObserver=new MissionRadio(m,structuredClone(library));radio.tick();m.state.time=91;radio.tick();
  assert(radio.engine.state.queue.some(q=>q.bawdy));assert.equal(radio.next({storyLock:true}),null);
  radio.engine.state[reason]=91;assert.equal(radio.next({}),null);assert.equal(radio.engine.active,null);
 }
 const m=fixture(90),own=m.addUnit('bukhanka','rai',{x:0,y:0}),enemy=m.addUnit('raider','scavs',{x:100,y:0});
 m.addUnit('bukhanka','rai',{x:0,y:50});const radio=m.radioObserver=new MissionRadio(m,structuredClone(library));
 m.damage(enemy,1,own);assert.equal(radio.engine.state.lastCombat,90);radio.tick();assert(![...radio.engine.pending.values()].some(b=>b.type==='idle.quiet'));
});

test('female repair banter requires the actual repairing woman, without a second random gate',()=>{
 const l=structuredClone(library),r=l.rules.find(r=>r.id==='repair.start_factory');for(const t of r.tiers)t.graphs=t.graphs.filter(g=>g.id.endsWith('female-repair-v1'));
 const speakers=[{...live[0],gender:'m'},{...live[1],gender:'f'}];
 for(const affected of ['u0','u1']){
  const e=new RadioEngine(l,{snapshot:()=>({speakers})});e.event(event({type:r.id,simTime:100,affectedIds:[affected]}));e.tick(1180,118);
  assert.equal(e.state.queue.length,affected==='u1'?1:0);
  if(affected==='u1'){assert.equal(e.next(118).crewId,'c1');e.completeLine();assert.equal(e.next(122).crewId,'c0');}
 }
});

test('visible enemy group reports actual mixed composition; hidden reinforcements stay unknown',()=>{
 const m=fixture();m.addUnit('bukhanka','rai',{x:0,y:0});m.addUnit('bukhanka','rai',{x:-50,y:0});
 for(let i=0;i<3;i++)m.addUnit('raider','scavs',{x:80+i*20,y:80});m.addUnit('scav-firetruck','scavs',{x:100,y:120});
 const hidden=m.addUnit('scav-firetruck','scavs',{x:1000,y:1000}),[col,row]=m.field.worldToGrid(hidden.x,hidden.y);m.visible[Math.round(row)*128+Math.round(col)]=0;
 const radio=m.radioObserver=new MissionRadio(m,structuredClone(library));radio.tick();
 const pending=[...radio.engine.pending.values()].filter(b=>b.type==='recon.enemy_first_seen');assert.equal(pending.length,1);assert.equal(pending[0].targetIds.length,4);
 m.state.time=23;radio.tick();const q=radio.engine.state.queue.find(q=>q.type==='recon.enemy_first_seen');assert(q);
 assert.equal(q.context.knownEnemyCount,4);assert.equal(q.context.facts.enemyComposition,'три пикапа с пулемётами и один грузовик с огнемётом');
 assert(!q.context.facts.observedEnemies.some(e=>e.id===hidden.id));
 radio.save();const restored=new MissionRadio(m,structuredClone(library));m.state.time=24;restored.tick();
 assert(![...restored.engine.pending.values()].some(b=>b.type==='recon.enemy_first_seen'),'Load does not rediscover the same group');
 m.visible.fill(0);assert.equal(restored.snapshot(q.context).relevant,false);assert.equal(q.context.knownEnemyCount,0);
});
test('two firing towers stay two sources across repeated hits and save; collisions are not fire',()=>{
 const m=fixture(),u=m.addUnit('bukhanka','rai',{x:0,y:0});m.addUnit('bukhanka','rai',{x:-50,y:0});
 const towers=[m.addStructure('mg-tower','scavs',{x:90,y:50},{completed:true,progress:1}),m.addStructure('mg-tower','scavs',{x:90,y:-50},{completed:true,progress:1})];
 let radio=m.radioObserver=new MissionRadio(m,structuredClone(library));
 for(const tower of towers)assert(m.attack(tower,u,m.buildingSpec(tower)));
 for(let i=0;i<8;i++)m.damage(u,1,towers[0]);
 const bucket=[...radio.engine.pending.values()].find(b=>b.type==='damage.hit'),context=aggregateContext(bucket,27);radio.snapshot(context);
 assert.equal(context.rawEventCount,10);assert.equal(context.knownAttackerCount,2);assert.equal(context.towerSourceCount,2);
 assert.equal(context.facts.attackerComposition,'две пулемётные вышки');
 radio.save();radio=m.radioObserver=new MissionRadio(m,structuredClone(library));radio.snapshot(context);assert.equal(context.knownAttackerCount,2);
 const hidden=m.addStructure('mg-tower','scavs',{x:1000,y:1000},{completed:true,progress:1}),[col,row]=m.field.worldToGrid(hidden.x,hidden.y);m.visible[Math.round(row)*128+Math.round(col)]=0;
 m.damage(u,1,hidden);radio.snapshot(context);assert.equal(context.knownAttackerCount,2);
 const bump=m.addUnit('raider','scavs',{x:20,y:20});m.damage(u,1,bump,{type:'collision',point:[0,0,1],normal:[1,0,0],direction:[-1,0,0]});radio.snapshot(context);assert.equal(context.knownAttackerCount,2);
 towers[0].hp=0;radio.snapshot(context);assert.equal(context.knownAttackerCount,1,'Destroyed guns do not remain in a current threat report');
 assert.equal(composition([{id:'a',kind:'raider'},{id:'a',kind:'raider'}]),'один пикап с пулемётом');
});
test('women keep a female voice and inflected speech across save and role changes',()=>{
 const m=fixture(),u=m.addUnit('builder','rai',{x:0,y:0}),p=m.state.campaign.personnel,s=p.soldiers[p.crews[u.id].memberIds[0]];s.gender='f';s.name=s.givenName='Валентина';
 let radio=m.radioObserver=new MissionRadio(m,structuredClone(library));const context=aggregateContext({type:'idle.group_no_order',key:'test',start:15,firstTick:150,lastTick:150,rawEventCount:1,countsByType:{'idle.group_no_order':1},facts:{},affectedIds:[u.id],actorIds:[],targetIds:[],objectIds:[],orderIds:[],incidentIds:[],destroyedIds:[],killedIds:[],woundedIds:[],evacuatedIds:[],producedIds:[],researchIds:[],objectiveIds:[]},15);
 const speaker=radio.snapshot(context).speakers[0];assert(['voice-3','voice-5'].includes(speaker.voiceId));assert.equal(speaker.gender,'f');
 const phrase=Object.values(library.phrases).find(p=>p.text==='Загнал на ремонт.');assert.equal(renderRadioLine(phrase,context,library.dictionaries,speaker,null).bodyText,'Загнала на ремонт.');
 assert.equal(renderRadioLine({...phrase,text:'На ремонте.'},context,library.dictionaries,speaker,null).bodyText,'На ремонте.','An edited base line must not keep speaking a stale gender variant');
 radio.save();u.kind='bukhanka';radio=new MissionRadio(m,structuredClone(library));assert.equal(radio.snapshot(context).speakers[0].voiceId,speaker.voiceId);
});
test('loss afterwords require three deaths or a veteran; names come from the actual dead',()=>{
 for(const [count,veteran,expected] of [[1,false,false],[3,false,true],[1,true,true]]){
  const m=fixture();m.addUnit('bukhanka','rai',{x:0,y:0});m.addUnit('bukhanka','rai',{x:-50,y:0});
  const lost=Array.from({length:count},(_,i)=>m.addUnit('bukhanka','rai',{x:50+i*50,y:0})),p=m.state.campaign.personnel;
  const first=p.soldiers[p.crews[lost[0].id].memberIds[0]];if(veteran)first.rank='sergeant';
  const radio=m.radioObserver=new MissionRadio(m,structuredClone(library));for(const u of lost)m.damage(u,u.hp+1);
  m.state.time=30;radio.tick();assert(![...radio.engine.pending.values()].some(b=>b.type==='idle.crew_history'));
  m.state.time=36;radio.tick();const afterword=[...radio.engine.pending.values()].find(b=>b.type==='idle.crew_history');
  assert.equal(!!afterword,expected);if(afterword){assert.equal(afterword.facts.lostCallSign,first.callsign);assert.equal(afterword.facts.personalLossCount,count);assert.equal(afterword.facts.lostVeteran,veteran);}
 }
});
test('newcomer exchange uses real ranks and a remembered reply can become a loss afterword',()=>{
 const m=fixture(75),rookie=m.addUnit('bukhanka','rai',{x:0,y:0}),mentor=m.addUnit('bukhanka','rai',{x:50,y:0}),p=m.state.campaign.personnel;
 const green=p.soldiers[p.crews[rookie.id].memberIds[0]],senior=p.soldiers[p.crews[mentor.id].memberIds[0]];senior.rank='sergeant';
 const radio=m.radioObserver=new MissionRadio(m,structuredClone(library));radio.tick();
 const event=[...radio.engine.pending.values()].find(b=>b.type==='idle.driver_pair');assert(event);assert.equal(event.facts.newcomerId,green.id);assert.equal(event.facts.mentorId,senior.id);
 radio.engine.state.journal.push({crewId:green.id,newcomerId:green.id,ruleId:'idle.driver_pair'});
 m.damage(rookie,rookie.hp+1);for(let i=0;i<2;i++){const u=m.addUnit('bukhanka','rai',{x:100+i*50,y:0});m.damage(u,u.hp+1);}
 m.state.time=96;radio.tick();const remembered=[...radio.engine.pending.values()].find(b=>b.type==='idle.crew_history');assert(remembered.facts.lostNewcomerRemembered);
});

test('every newcomer exchange addresses its real partner and remembers the reply beyond journal retention',()=>{
 for(const variant of ['green-v1','green-v2','green-v3']){
  const l=structuredClone(library),rule=l.rules.find(r=>r.id==='idle.driver_pair');
  for(const tier of rule.tiers)tier.graphs=tier.graphs.filter(g=>g.id.endsWith(variant));
  for(const tier of rule.tiers)for(const graph of tier.graphs)graph.chance=1;
  const e=new RadioEngine(l,{snapshot:()=>({speakers:live.map((s,i)=>({...s,name:'Имя-'+i}))})});
  e.event(event({type:rule.id,incidentId:variant,simTime:75,affectedIds:['u0','u1'],facts:{mentorId:'c0',newcomerId:'c1'}}));e.tick(760,76);
  const turns=[];for(let t=76;t<90;t+=3){const line=e.next(t);if(line){turns.push(line);e.completeLine();}}
  assert(turns.length>=2,variant);assert.equal(turns[0].crewId,'c0');assert.equal(turns[1].crewId,'c1');
  assert(turns.some(l=>l.text.includes('Имя-1')),variant);
  e.state.journal=[];const restored=new RadioEngine(l,{snapshot:()=>({speakers:live}),saved:structuredClone(e.save())});
  assert(restored.state.introducedCrews.includes('c1'));
 }
});

test('newcomer chances renew after silence and introduced people yield to the next rookie',()=>{
 const m=fixture(75),rookie=m.addUnit('bukhanka','rai',{x:0,y:0}),mentor=m.addUnit('bukhanka','rai',{x:50,y:0}),p=m.state.campaign.personnel;
 const green=p.soldiers[p.crews[rookie.id].memberIds[0]];p.soldiers[p.crews[mentor.id].memberIds[0]].rank='sergeant';
 let radio=m.radioObserver=new MissionRadio(m,structuredClone(library));radio.tick();
 const first=[...radio.engine.pending.values()].find(b=>b.type==='idle.driver_pair').incidentIds[0];
 radio.save();radio=m.radioObserver=new MissionRadio(m,structuredClone(library));m.state.time=195;radio.tick();
 const second=[...radio.engine.pending.values()].find(b=>b.type==='idle.driver_pair').incidentIds[0];assert.notEqual(first,second);
 radio.engine.state.introducedCrews=[green.id];const next=m.addUnit('bukhanka','rai',{x:100,y:0});m.state.time=315;radio.tick();
 const candidate=[...radio.engine.pending.values()].find(b=>b.type==='idle.driver_pair');assert.equal(candidate.facts.newcomerId,p.crews[next.id].memberIds[0]);
});

test('recent banter does not suppress grief; grief suppresses further personal chatter and repeated afterwords',()=>{
 const e=new RadioEngine(structuredClone(library),{snapshot:()=>({speakers:live})});
 e.state.lastPersonalAt=90;
 e.event(event({type:'idle.crew_history',incidentId:'loss-a',simTime:100,facts:{personalLossCount:3}}));e.tick(1010,101);
 assert(e.next(101));assert.equal(e.state.lastRemembranceAt,101);assert.equal(e.state.lastPersonalAt,101);
 while(e.active){e.completeLine();e.next(105);}
 e.event(event({id:'loss-b',type:'idle.crew_history',incidentId:'loss-b',simTime:110,facts:{personalLossCount:3}}));e.tick(1110,111);
 assert.equal(e.state.queue.length,0);
 e.event(event({id:'green',type:'idle.driver_pair',incidentId:'green',simTime:120,affectedIds:['u0','u1'],facts:{mentorId:'c0',newcomerId:'c1'}}));e.tick(1210,121);
 assert.equal(e.state.queue.length,0);
});

test('shipped collection keeps long summaries but readiness takes half a second; dispatch remains two',()=>{
 assert.equal(library.settings.dispatchSeconds,2);
 for(const [type,seconds] of [['command.move',18],['repair.complete',.5],['construction.complete',.5],['factory.vehicle_complete',.5],['damage.hit',12]]){
  const e=new RadioEngine(structuredClone(library),{snapshot:()=>({speakers:live})});
  e.event(event({type,simTime:15,tickId:150,objectIds:['factory'],facts:{accepted:true,resolution:'resolved'}}));
  e.tick(200,15+seconds-.01);assert.equal(e.state.queue.length,0,type);assert.equal(e.pending.size,1,type);
  e.tick(250,15+seconds);assert.equal(e.state.queue.length,1,type);assert.equal(e.pending.size,0,type);
 }
});
test('real hits share a full window across old clock boundaries and save/load',()=>{
 const m=fixture(15.9),unit=m.addUnit('bukhanka','rai',{x:0,y:0}),enemy=m.addUnit('raider','scavs',{x:100,y:200});
 let observer=m.radioObserver=new MissionRadio(m,structuredClone(library));m.damage(unit,1,enemy);
 const scope=[...observer.engine.pending.values()].find(b=>b.type==='damage.hit').key;
 observer.save();observer=m.radioObserver=new MissionRadio(m,structuredClone(library));
 m.state.time=18.1;m.damage(unit,1,enemy);
 const hits=[...observer.engine.pending.values()].filter(b=>b.type==='damage.hit');assert.equal(hits.length,1);assert.equal(hits[0].key,scope);assert.equal(hits[0].rawEventCount,2);
 m.state.time=27.89;observer.tick();assert(observer.engine.pending.has(scope));
 m.state.time=27.9;observer.tick();assert(!observer.engine.pending.has(scope));
 m.state.time=28;m.damage(unit,1,enemy);assert.notEqual([...observer.engine.pending.values()].find(b=>b.type==='damage.hit').key,scope);
});
test('simultaneous readiness combines briefly; a later building does not wait for a long report',()=>{
 const m=fixture(),a=m.addUnit('bukhanka','rai',{x:0,y:0}),b=m.addUnit('bukhanka','rai',{x:100,y:0});
 const radio=m.radioObserver=new MissionRadio(m,structuredClone(library));
 radio.note({id:'repair-a',type:'factory-repair-complete',unit:a.id,factory:'factory-a'});
 m.state.time=15.2;radio.note({id:'repair-b',type:'factory-repair-complete',unit:b.id,factory:'factory-b'});
 const repair=[...radio.engine.pending.values()].filter(p=>p.type==='repair.complete');
 assert.equal(repair.length,1);assert.deepEqual(new Set(repair[0].affectedIds),new Set([a.id,b.id]));
 assert.deepEqual(new Set(repair[0].objectIds),new Set(['factory-a','factory-b']));
 m.state.time=15.49;radio.tick();assert.equal(radio.engine.state.queue.length,0);
 m.state.time=15.5;radio.tick();assert.equal(radio.engine.state.queue[0].context.affectedUnitCount,2);assert.equal(radio.engine.state.queue[0].tier,'group');
 radio.note({id:'build-a',type:'construction-complete',building:'building-a'});
 m.state.time=44;radio.note({id:'build-b',type:'construction-complete',building:'building-b'});
 const builds=[...radio.engine.pending.values()].filter(p=>p.type==='construction.complete');assert.equal(builds.length,2);
 assert(builds.every(b=>b.objectIds.length===1));
});
test('real losses warn immediately and combine later losses into a 20-second summary',()=>{
 const m=fixture(),survivor=m.addUnit('bukhanka','rai',{x:0,y:0}),lost=[1,2].map(i=>m.addUnit('bukhanka','rai',{x:i*100,y:0}));
 const observer=m.radioObserver=new MissionRadio(m,structuredClone(library));
 m.damage(lost[0],lost[0].hp+1);assert.equal(observer.engine.state.queue[0]?.context.destroyedVehicleCount,1);
 const urgent=observer.next({});assert(urgent?.dynamic);assert.equal(urgent.unitId,survivor.id);observer.engine.completeLine();
 m.state.time=30;m.damage(lost[1],lost[1].hp+1);
 const pending=[...observer.engine.pending.values()].filter(b=>b.type==='damage.vehicle_destroyed');assert.equal(pending.length,1);assert.equal(pending[0].destroyedIds.length,2);
 m.state.time=34.99;observer.tick();assert.equal(observer.engine.state.stats.candidates,1);
 m.state.time=35;observer.tick();assert.equal(observer.engine.state.queue[0]?.context.destroyedVehicleCount,2);assert.equal(observer.engine.state.queue[0]?.context.killedCrewCount,2);
});

test('opening stays quiet for 15 mission seconds without saving up chatter; saves and mission two keep the same clock',()=>{
 const m=fixture(0),unit=m.addUnit('bukhanka','rai',{x:0,y:0});let radio=m.radioObserver=new MissionRadio(m,structuredClone(library));
 for(const at of [0,8,14.999]){
  m.state.time=at;radio.order('move',[unit.id],'early-'+at);radio.tick();assert(radio.warmingUp);assert.equal(radio.next({}),null);
  assert.equal(radio.engine.pending.size,0);assert.equal(radio.engine.state.queue.length,0);
 }
 radio.save();radio=m.radioObserver=new MissionRadio(m,structuredClone(library));assert(radio.warmingUp);
 m.state.time=15;assert(!radio.warmingUp);assert.equal(radio.next({}),null,'No burst of stored startup reports');
 radio.order('move',[unit.id],'after-opening');m.state.time=33;radio.tick();
 assert.equal(radio.next({storyLock:true}),null,'Story retains priority after the delay');assert(radio.next({})?.dynamic);
 radio.save();radio=m.radioObserver=new MissionRadio(m,structuredClone(library));assert(!radio.warmingUp,'Loading does not restart the timer');
 m.state.m02={startedAt:100};m.state.time=100;assert(radio.warmingUp);assert.equal(radio.next({}),null);
 m.state.time=114.9;assert(radio.warmingUp);m.state.time=115;assert(!radio.warmingUp);
 // Queue created by an older version before this delay was introduced.
 const old=engine();old.event(event());old.tick(30,3);m.state.m02=undefined;m.state.time=10;m.state.dynamicRadio={engine:structuredClone(old.save())};
 radio=new MissionRadio(m,structuredClone(library));assert.equal(radio.engine.state.queue.length,0);assert.equal(radio.engine.pending.size,0);
});
test('real Mission orders and damage attach without changing authoritative state or RNG',()=>{
 const a=fixture(),b=fixture();for(const m of [a,b])for(let i=0;i<5;i++)m.addUnit('bukhanka','rai',{x:i*90-180,y:0});b.radioObserver=new MissionRadio(b,structuredClone(library));
 for(const m of [a,b]){const units=m.state.units;const result=m.order(units.map(u=>u.id),'move',{x:0,y:400});assert(result.ok);m.damage(units[0],1);m.advance(.3);}
 assert.deepEqual(a.state,b.state);assert.equal(a.randomState,b.randomState);assert.equal(a.serial,b.serial);assert(b.radioObserver.engine.state.stats.ingested>0);
 const before=b.radioObserver.engine.state.stats.ingested;b.radioObserver.library.settings.enabled=false;b.advance(.2);assert.equal(b.radioObserver.engine.state.stats.ingested,before);
});
test('rejected, repeated and mixed-role orders do not invent accepted actors',()=>{
 const m=fixture(),driver=m.addUnit('bukhanka','rai',{x:0,y:0}),worker=m.addUnit('builder','rai',{x:50,y:0});
 m.radioObserver=new MissionRadio(m,structuredClone(library));
 assert(!m.order([driver.id],'attack',{id:'missing',owner:'scavs',x:0,y:100}).ok);assert.equal(m.radioObserver.engine.pending.size,0);
 const point={x:0,y:100};assert(m.order([driver.id],'move',point).ok);const count=m.radioObserver.engine.state.stats.ingested;m.order([driver.id],'move',point);assert.equal(m.radioObserver.engine.state.stats.ingested,count);
 const enemy=m.addUnit('raider','scavs',{x:150,y:100});const result=m.order([worker.id,driver.id],'attack',enemy);assert(result.ok,result.reason);
 const attack=[...m.radioObserver.engine.pending.values()].find(b=>b.type==='command.attack');assert(attack);assert.deepEqual(attack.actorIds,[driver.id]);
});
test('real squad hits aggregate into one news item; hostile fire on a building gets high priority',()=>{
 const m=fixture();const units=Array.from({length:5},(_,i)=>m.addUnit('bukhanka','rai',{x:i*80,y:0}));
 const enemy=m.addUnit('raider','scavs',{x:100,y:200}),observer=m.radioObserver=new MissionRadio(m,structuredClone(library));
 assert(m.order(units.map(u=>u.id),'move',{x:100,y:400}).ok);
 for(const unit of units)m.damage(unit,1,enemy);
 const hits=[...observer.engine.pending.values()].filter(b=>b.type==='damage.hit');assert.equal(hits.length,1);
 const context=aggregateContext(hits[0],3);assert.equal(context.rawEventCount,5);assert.equal(context.uniqueAffectedUnitCount,5);assert.equal(context.facts.enemyFire,true);
 const building=m.addStructure('factory','rai',{x:600,y:600},{completed:true,progress:1});m.damage(building,1,enemy);
 observer.engine.tick(180,m.state.time+3);const top=observer.engine.state.queue[0];assert.equal(top.type,'combat.base_attack');assert.equal(top.priority,95);
});
test('real retreat starts only once motion is committed and enemy destruction confirms explosion',()=>{
 const a=fixture(),b=fixture();for(const m of [a,b])for(let i=0;i<2;i++)m.addUnit('bukhanka','rai',{x:i*90,y:0});
 const observer=b.radioObserver=new MissionRadio(b,structuredClone(library));
 for(const m of [a,b])assert(forceCombatRetreat(m,m.state.units.map(u=>u.id)).ok);
 assert.deepEqual(a.state,b.state);assert.equal(a.randomState,b.randomState);assert.equal(a.serial,b.serial);
 assert.equal(observer.engine.pending.size,0,'Planning does not claim actual retreat');
 // Feed the existing observer the same committed transition that the real
 // retreat controller emits, without fabricating any navigation decision.
 for(const u of b.state.units){u.combatRetreat.status='moving';observer.unit(u);observer.unit(u);}
 const retreats=[...observer.engine.pending.values()].filter(x=>x.type==='command.retreat');assert.equal(retreats.length,1);assert.equal(retreats[0].affectedIds.length,2);
 observer.engine.tick(180,b.state.time+3);const spoken=observer.engine.next(b.state.time+3);assert(spoken);
 const personnel=b.state.campaign.personnel,identity=personnel.soldiers[spoken.crewId];assert(spoken.text.includes(identity.callsign));assert.equal(spoken.speakerName,identity.name);
 const target=b.addUnit('raider','scavs',{x:150,y:100});b.damage(target,100000,b.state.units[0]);
 const destroyed=[...observer.engine.pending.values()].filter(x=>x.type==='combat.target_destroyed');assert.equal(destroyed.length,1);assert.equal(destroyed[0].facts.explosionConfirmed,true);assert.deepEqual(destroyed[0].targetIds,[target.id]);
 b.damage(target,100000,b.state.units[0]);assert.equal([...observer.engine.pending.values()].filter(x=>x.type==='combat.target_destroyed').length,1);
 const c=fixture(),u=c.addUnit('bukhanka','rai',{x:0,y:0});const radio=c.radioObserver=new MissionRadio(c,structuredClone(library));
 startAutomaticRetreat(c,u,c.unitSpec(u));assert.equal(radio.engine.pending.size,0);u.combatRetreat.status='moving';radio.unit(u);
 assert([...radio.engine.pending.values()].some(x=>x.type==='command.auto_retreat'));
});
const percent=(a,p)=>a.sort((x,y)=>x-y)[Math.min(a.length-1,Math.floor(a.length*p))];
const timings=[];
for(const count of [20,50,100]){
 const e=engine(),times=[];for(let i=0;i<100;i++){const start=performance.now();e.event(event({id:'perf'+i,orderId:'perf'+i,affectedIds:Array.from({length:count},(_,j)=>'u'+j)}));e.tick(30,3);times.push(performance.now()-start);}
 timings.push({vehicles:count,p95:percent(times,.95),p99:percent(times,.99)});
}
const realAdapterTimings=[];
for(const count of [20,50,100]){
 const m=fixture();for(let i=0;i<count;i++)m.addUnit('bukhanka','rai',{x:(i%10)*80-400,y:Math.floor(i/10)*80-400});
 const observer=m.radioObserver=new MissionRadio(m,structuredClone(library)),times=[];
 for(let i=0;i<100;i++){const start=performance.now();for(const unit of m.state.units)observer.unit(unit);observer.tick();times.push(performance.now()-start);}
 realAdapterTimings.push({realMissionVehicles:count,p95:percent(times,.95),p99:percent(times,.99)});
}
fs.mkdirSync('campaign/reports/dynamic-radio',{recursive:true});fs.writeFileSync('campaign/reports/dynamic-radio/unit.json',JSON.stringify({tests,eventBatchTimings:timings,realAdapterTimings},null,2));
console.log(JSON.stringify({passed:tests.length,eventBatchTimings:timings,realAdapterTimings},null,2));
