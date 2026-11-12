import fs from 'node:fs';
import assert from 'node:assert/strict';
import {makeMission} from './m02-fixture.mjs';
import {setFactoryModernization,modernizeAfterRepair} from '../campaign/factory-modernization.js';
import {applyStoryEdits} from '../campaign/story-edits.js';
import {StoryDirector} from '../campaign/story-director.js';
import {fixture as flatFixture} from './check-start-latency-coordinator.mjs';
globalThis.document={querySelectorAll:()=>[]};
const {FieldRadio}=await import('../campaign/field-radio.js');
delete globalThis.document;
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),id='unit-twin-modernized';
const scripts=['01','02','03'].map(m=>{const base=`assets/campaign/alpha/mission${m}/`;const {story,audio}=applyStoryEdits(read(base+(m==='01'?'story-v2.json':'story.json')),read(base+(m==='01'?'audio-v2.json':'audio.json')),read(base+'reviewed-dialogue.json'));return {...story,dialogue:story.dialogue.map(l=>({...l,clip:audio.clips[l.id]}))};});
const script={...scripts[0],scenes:scripts.flatMap(s=>s.scenes),dialogue:scripts.flatMap(s=>s.dialogue),speakers:Object.assign({},...scripts.map(s=>s.speakers))};
const legacyMission={state:{status:'running',research:{'mg-ammo-1':true},pendingCinematics:['research-mg-ammo-1']},finishCinematic(){this.state.pendingCinematics=[];}};
const legacy=Object.assign(Object.create(FieldRadio.prototype),{enabled:true,dialogue:{},queue:[],present(entry){this.entry=entry;}});
legacy.consume(legacyMission,100);assert.equal(legacy.entry.chapter,'research-mg-ammo-1');assert.deepEqual(legacy.queue,[]);
function driver(m){
 const d=new StoryDirector(script);d.bind(m);let now=0;
 for(const scene of script.scenes)if(scene.id!==id&&scene.id!=='r10')d.data.scenes[scene.id]={status:'done',cursor:0};
 const tick=(seconds=2)=>{now+=seconds*1000;return d.update(m,now);};
 const finish=()=>{const active=d.data.active;assert(active);while(d.data.active===active)d.completeLine();};
 return {d,tick,finish};
}
const m=makeMission();m.state.status='victory';assert(m.enterM02().ok);
const f=m.addStructure('factory','rai',m.field.gridToWorld([13.5,50.75]),{completed:true,progress:1,queue:[]});
const u=m.state.units.find(u=>u.owner==='rai'&&u.kind==='bukhanka');
u.hp=u.maxHp;u.factoryVisit={phase:'inside'};
assert(!setFactoryModernization(m,f.id,true).ok);assert(!modernizeAfterRepair(m,f,u));
m.state.research['twin-machinegun']=true;
m.addUnit('twin-machinegun','rai',{x:u.x+80,y:u.y});
assert(!m.state.campaign.firstTwinModernization,'Research and production are not retrofits');
assert(setFactoryModernization(m,f.id,true).ok);
assert(!m.state.campaign.firstTwinModernization,'Pressing the upgrade button alone does not qualify');
m.state.energy=0;assert(!modernizeAfterRepair(m,f,u));assert(!m.state.campaign.firstTwinModernization);
m.state.energy=1000;u.hp=u.maxHp-1;assert(!modernizeAfterRepair(m,f,u));
u.hp=u.maxHp;u.factoryVisit.phase='approach';assert(!modernizeAfterRepair(m,f,u));
u.factoryVisit.phase='inside';const unitId=u.id;assert(modernizeAfterRepair(m,f,u));
assert.equal(u.id,unitId);assert.equal(u.kind,'twin-machinegun');
assert.equal(m.state.campaign.firstTwinModernization.unitId,unitId);
const {d,tick,finish}=driver(m);
d.data.scenes['m02-radio-twin-ready']={status:'pending',cursor:0};
assert.equal(tick().storyScene,'m02-radio-twin-ready','Keep the technology announcement ahead of the comment');
assert.equal(tick().storyScene,'m02-radio-twin-ready','A pending retrofit cannot interrupt the briefing');finish();
const pending=m.save();
for(const oldStatus of ['done','skipped','cancelled']){
 m.load(pending);m.state.radioStory.scenes.r10={status:oldStatus,cursor:0};m.state.radioStory.scenes[id]={status:'cancelled',cursor:0};
 const run=driver(m);run.tick(0);const cue=run.d.data.active?run.d.cue():run.tick();
 assert.equal(cue?.storyScene,id,'Old r10 or transition status must not suppress the new event');
 assert.equal(cue.id,'warrant:upgrade');assert.equal(cue.clip.file,'warrant-radio/upgrade.mp3');
 run.finish();assert(m.state.campaign.firstTwinModernization.radioPlayed);
 assert.equal(run.tick(30),null);
}
m.load(pending);m.state.status='victory';assert(m.enterM03().ok);
let run=driver(m);run.tick(0);assert.equal((run.d.cue()??run.tick()).storyScene,id,'Pending event survives the next mission');run.finish();
const completed=m.save();m.load(completed);run=driver(m);assert.equal(run.tick(30),null,'Completed comment never repeats after load');
const f2=m.entity(f.id),next=m.state.units.find(v=>v.owner==='rai'&&v.kind==='bukhanka');
next.hp=next.maxHp;next.factoryVisit={phase:'inside'};m.state.energy=1000;assert(modernizeAfterRepair(m,f2,next));
assert.equal(m.state.campaign.firstTwinModernization.unitId,unitId);assert.equal(run.tick(30),null,'Another upgraded car cannot repeat the comment');
// Old saves can prove a completed retrofit through its persisted U01 -> U02 record.
m.load(pending);delete m.state.campaign.firstTwinModernization;run=driver(m);
assert.equal(m.state.campaign.firstTwinModernization.unitId,unitId);
// The current selected-unit button uses modernizationRequested, not the
// factory-wide switch, and may skip the twin tier when a heavy gun is unlocked.
for(const heavy of [false,true]){
 const selected=flatFixture(),plant=selected.addStructure('factory','rai',{x:0,y:250},{completed:true,progress:1});
 const car=selected.addUnit('bukhanka','rai',{x:0,y:100});selected.rebuildNavigation();
 selected.state.research['twin-machinegun']=true;selected.state.research['heavy-machinegun']=heavy;selected.state.energy=1000;
 assert(selected.modernize([car.id]).ok);assert(!plant.autoModernize);assert(!selected.state.campaign?.firstTwinModernization);
 car.hp=car.maxHp;car.factoryVisit={factoryId:plant.id,phase:'inside'};
 assert(modernizeAfterRepair(selected,plant,car));assert(!car.modernizationRequested);
 assert.equal(car.kind,heavy?'heavy-machinegun':'twin-machinegun');
 assert.equal(!!selected.state.campaign?.firstTwinModernization,!heavy,'Only an actual twin retrofit qualifies');
}
console.log('PASS: completed twin retrofit via both update controls; other upgrades excluded; old r10 ignored; waits for briefing; campaign/load persistence; no repeat; legacy recovery');
