import assert from 'node:assert/strict';
import fs from 'node:fs';
import {RadioEngine} from '../campaign/radio/engine.js';
import {CombatReports} from '../campaign/radio/combat-reports.js';
import {upgradeDispatch} from '../campaign/radio/dispatch-policy.js';

const seed=JSON.parse(fs.readFileSync('assets/radio/situations_catalog.json','utf8'));
const speakers=Array.from({length:5},(_,i)=>({crewId:'c'+i,unitId:'u'+i,role:'driver',callSign:'Кедр-'+i,alive:true,radioChannel:'rai'}));
const make=saved=>new RadioEngine(structuredClone(seed),{saved,snapshot:()=>({speakers})});
let serial=0;
const event=(type,at,extra={})=>({type,id:'e'+(++serial),incidentId:'incident'+serial,tickId:Math.round(at*10),simTime:at,actorIds:['u0'],affectedIds:['u0'],objectIds:['building'+serial],facts:{resolution:'resolved'},...extra});
function test(name,fn){fn();console.log('PASS '+name);}

test('building report follows the current audio; story remains above it',()=>{
 const e=make();e.event(event('construction.complete',20));e.tick(205,20.5);
 assert.equal(e.state.queue.length,1);assert.equal(e.state.queue[0].lines.length,1);
 assert.equal(e.next(21,{storyLock:true}),null);assert.equal(e.next(21,{audioBusy:true}),null);
 const line=e.next(21);assert(line);assert.equal(e.active.type,'construction.complete');
});
test('second readiness bypasses the old 35-second type and crew cooldowns',()=>{
 const e=make();e.event(event('construction.complete',20));e.tick(205,20.5);assert(e.next(21));e.completeLine();
 e.cooldowns.set('event:construction.complete:global',56);e.cooldowns.set('squad:global',56);e.cooldowns.set('unit:c0',56);
 e.event(event('construction.complete',23));e.tick(235,23.5);assert(e.next(24));assert.equal(e.active.type,'construction.complete');
});
test('a cooling high-priority summary does not block an eligible lower report',()=>{
 const e=make();e.event(event('command.move',0,{orderId:'move',facts:{accepted:true}}));
 e.event(event('traffic.jam_resolved',0,{facts:{jamResolved:true,resolution:'resolved'}}));e.tick(180,18);
 e.cooldowns.set('event:traffic.jam_resolved:global',60);
 assert(e.next(18));assert.equal(e.active.type,'command.move');
});
test('readiness is not evicted by summary duration and cannot starve behind ordinary hit reports',()=>{
 const e=make();
 e.event(event('construction.complete',20));e.tick(205,20.5);
 e.event(event('damage.hit',19,{flags:{urgent:true},facts:{hitCount:1,enemyFire:true,severity:.8}}));
 assert(e.next(21));assert.equal(e.active.type,'damage.hit');e.completeLine();
 e.event(event('damage.hit',26,{incidentId:'new-hit',flags:{urgent:true},facts:{hitCount:1,enemyFire:true,severity:.9}}));
 assert(e.next(27));assert.equal(e.active.type,'construction.complete');
});
test('urgent losses retain priority over an aged readiness report',()=>{
 const e=make();e.event(event('construction.complete',0));e.tick(5,.5);
 e.event(event('damage.vehicle_destroyed',10,{affectedIds:['dead'],facts:{destroyedIds:['dead'],crewKnown:false},flags:{urgent:true}}));
 assert(e.next(10));assert.equal(e.active.type,'damage.vehicle_destroyed');
});
function combatFixture(saved){
 const e=make(saved?.engine),reports=new CombatReports(saved?.reports);let at=0;
 const emit=(type,data)=>e.event(event(type,at,data));
 return {e,reports,kill(id,kind='raider',time=at,source='u0'){at=time;reports.destroyed({id,kind},{id:source},'operation',at,18,emit);},
  next(time,options){at=time;e.tick(time*10,time);const line=e.next(time,options);if(line){reports.spoken(e.active,time);e.completeLine();}return line;},
  save(){return structuredClone({engine:e.save(),reports:reports.save()});}};
}
test('first kill, follow-up, then full typed summary are separate messages',()=>{
 const f=combatFixture();f.kill('pickup-1');const first=f.next(0);assert.match(first.text,/Есть! Готов!|У меня минус один!/);
 f.kill('pickup-2','raider',4);assert.match(f.next(4).text,/Ещё один!|И этот готов!/);
 f.kill('pickup-3','raider',8);assert.match(f.next(8).text,/Ещё один!|И этот готов!/);
 f.kill('tower','mg-tower',12);assert.equal([...f.e.pending.values()].filter(b=>b.type==='combat.target_destroyed').length,1);
 f.next(12);assert.equal(f.next(17.9),null);
 const total=f.next(20);assert(total);assert.match(total.text,/Всего:/);assert.match(total.text,/три пикапа с пулемётами/);assert.match(total.text,/одна пулемётная вышка/);
 assert.equal(f.e.active.context.uniqueTargetCount,4);
});
test('simultaneous kills coalesce into the actual unspoken count; queued words do not count as heard',()=>{
 const f=combatFixture();f.kill('a');assert.equal(f.next(0,{storyLock:true}),null);f.kill('b','raider',.1);
 assert.equal(f.e.state.queue.filter(q=>q.type==='combat.kill_confirmed').length,1);
 assert.match(f.next(.2).text,/У меня минус два!/);
 f.kill('c','raider',4);assert.match(f.next(4).text,/Ещё один!|И этот готов!/);
});
test('one crew never claims another crew’s kills',()=>{
 const f=combatFixture();f.kill('a','raider',0,'u0');f.kill('b','raider',.1,'u1');
 assert.equal(f.e.state.queue.filter(q=>q.type==='combat.kill_confirmed').length,2);
 for(const q of f.e.state.queue.filter(q=>q.type==='combat.kill_confirmed')){
  assert.equal(q.context.uniqueTargetCount,1);assert.equal(q.lines[0].unitId,q.context.affectedIds[0]);
 }
});
test('save/load retains confirmed kinds, heard receipts and deduplicates wrecks',()=>{
 const f=combatFixture();f.kill('a');assert(f.next(0));const g=combatFixture(f.save());
 g.kill('a','raider',3);g.kill('b','mg-tower',4);assert.match(g.next(4).text,/Ещё один!|И этот готов!/);
 const total=g.next(18);assert.match(total.text,/один пикап с пулемётом/);assert.match(total.text,/одна пулемётная вышка/);assert.equal(g.e.active.context.uniqueTargetCount,2);
});
test('long story drops stale reactions but leaves the accumulated report',()=>{
 const f=combatFixture();f.kill('a');f.kill('b','mg-tower',4);assert.equal(f.next(18,{storyLock:true}),null);
 const total=f.next(20);assert.match(total.text,/Всего:/);assert.equal(f.e.state.queue.filter(q=>q.delivery==='reaction').length,0);
});
test('a single kill never adds a redundant final total',()=>{
 const f=combatFixture();f.kill('a');assert(f.next(0));assert.equal(f.next(18),null);
});
test('medal joke waits for a genuinely free channel and is suppressed by fresh losses',()=>{
 const f=combatFixture();f.kill('a');f.kill('b');f.kill('c');const r=[...f.reports.records.values()][0];r.jokeUntil=40;
 const emitted=[];const emit=(...args)=>emitted.push(args);
 f.reports.tick(20,f.e,emit);assert.equal(emitted.length,0,'reports still waiting');
 f.e.state.queue=[];f.e.state.batch=[];f.e.pending.clear();f.e.state.lastLoss=15;
 f.reports.tick(21,f.e,emit);assert.equal(emitted.length,0);
 f.e.state.lastLoss=-100;f.e.state.lastCombat=20;f.reports.tick(22,f.e,emit);assert.equal(emitted.length,0);
 f.reports.tick(29,f.e,emit);assert.equal(emitted[0][0],'combat.kill_banter');
 f.reports.tick(30,f.e,emit);assert.equal(emitted.length,1);
});
test('an already queued medal yields to readiness even while waiting in a packet',()=>{
 const e=make();e.event(event('combat.kill_banter',0,{targetIds:['a','b','c']}));e.tick(0,0);
 e.event(event('construction.complete',0));e.tick(5,.5);assert(e.next(.5));assert.equal(e.active.type,'construction.complete');
});
test('old pending readiness timing upgrades on load and draft migration is idempotent',()=>{
 const e=make();e.event(event('construction.complete',10));const saved=structuredClone(e.save());saved.pending[0].end=28;
 const upgraded=make(saved);upgraded.tick(110,11);assert(upgraded.next(11));
 const old=structuredClone(seed);old.settings.dispatchRevision=0;old.rules=old.rules.filter(r=>!['combat.kill_confirmed','combat.kill_banter'].includes(r.id));
 const build=old.rules.find(r=>r.id==='construction.complete');build.enabled=false;build.windowSimSeconds=18;
 upgradeDispatch(old,seed);assert.equal(build.enabled,false);assert.equal(build.windowSimSeconds,.5);
 const once=JSON.stringify(old);upgradeDispatch(old,seed);assert.equal(JSON.stringify(old),once);
});
console.log('Radio dispatch checks complete.');
