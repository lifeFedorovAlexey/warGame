import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {StoryDirector} from '../campaign/story-director.js';
import {storyObjectives} from '../campaign/story-objectives.js';
import {constructionUnlocked,researchUnlocked,defenseReady} from '../campaign/story-construction.js';
const base='assets/campaign/alpha/mission01/';
const read=file=>JSON.parse(fs.readFileSync(base+file,'utf8'));
const source=read('story-v2.json'),audio=read('audio-v2.json');
const script={...source,dialogue:source.dialogue.map(c=>({...c,clip:audio.clips[c.id]}))};
const hash=data=>createHash('sha256').update(data).digest('hex');
assert.equal(source.revision,5);assert.equal(source.scenes.length,55);
assert.equal(hash(fs.readFileSync(source.source.path)),source.source.sha256);
const original=read('audio.json'),portraits=read('portraits/manifest.json');
let userCount=0;
for(const cue of [...source.dialogue,...source.barks]){
 const clip=audio.clips[cue.id];assert(clip,cue.id);assert.equal(clip.speaker,cue.speaker);
 if(clip.origin==='user-recording')userCount++;
 if(cue.recordingStatus==='Т')assert.equal(clip.origin,'user-recording',cue.id);
 if(!process.argv.includes('--logic-only'))assert.equal(hash(fs.readFileSync(base+clip.file)),clip.sha256,clip.file);
 assert(clip.duration>0);
 if(cue.speaker!=='past')assert(portraits.characters[cue.speaker],cue.speaker);
}
assert.equal(userCount,39);
// Mislabeled takes use the owner's confirmed spoken words, not their filenames.
assert.equal(audio.clips['m01-s06-l008'].file,'recordings/commander/m01-s07-l002.mp3');
assert.equal(audio.clips['m01-s07-l002'].file,'recordings/commander/m01-s07-l004.mp3');
assert.equal(audio.clips['m01-s07-l004'].file,'recordings/commander/pending/m01-s07-l007.mp3');
for(const clip of Object.values(original.clips).filter(c=>c.origin==='user-recording'))assert.equal(hash(fs.readFileSync(base+clip.file)),clip.sha256);
assert.equal(source.scenes.find(s=>s.id==='r50').cues.length,10);
assert.equal(source.scenes.find(s=>s.id==='r06').cues.length,6);

function fixture(startImmediately=true){
 const camps=['flamethrower','mg-ammo-1','mg-tower',null].map((artifact,i)=>({id:'camp'+i,artifact,cleared:false}));
 const mission={state:{status:'running',buildings:[],units:[],projectiles:[],flags:{},research:{},artifactKeys:[],artifacts:[],statistics:{produced:0},camps,storyConstruction:{enabled:true,unlocked:['generator'],requiredBunkers:2,research:false}},effects:[],config:{startGrid:[0,0],oilFields:[],camps},field:{worldToGrid:(x,y)=>[x,y],gridToWorld:([x,y])=>({x,y})},visibleAt:()=>true,exploredAt:()=>true};
 mission.entity=id=>[...mission.state.units,...mission.state.buildings].find(e=>e.id===id&&e.hp>0);
 const director=new StoryDirector(script);let now=0;
 const tick=(seconds=0,enabled=true)=>{let cue;do{const step=Math.min(1,seconds);now+=step*1000;seconds-=step;cue=director.update(mission,now,{enabled});}while(seconds>0);return cue;};
 if(startImmediately)tick();
 const heard=(...ids)=>{for(const id of ids)director.data.scenes[id]={status:'done',cursor:0,endedAt:director.data.clock};};
 const finish=()=>{const id=director.data.active;assert(id);while(director.data.active===id)director.completeLine();return id;};
 const building=(kind,completed=true,owner='rai',campId)=>{const e={id:kind+'-'+mission.state.buildings.length,kind,completed,owner,campId,hp:100,x:0,y:0};mission.state.buildings.push(e);return e;};
 const unlocked=kind=>constructionUnlocked(mission.state,kind);
 return {mission,director,tick,heard,finish,building,unlocked};
}
// Orders follow the spoken instruction, availability follows the actual world.
{
 const f=fixture(),s=f.mission.state;
 assert.deepEqual(storyObjectives(f.mission),[]);assert(f.unlocked('generator'));assert(!f.unlocked('factory'));
 f.director.completeLine();assert.equal(f.tick().id,'m01-s06-l008');
 f.director.completeLine();f.tick();assert.equal(storyObjectives(f.mission)[0].id,'generator');f.finish();
 f.building('generator');s.powered=true;assert.equal(f.tick().storyScene,'r02');assert(f.unlocked('derrick'));assert(!f.unlocked('factory'));
 f.finish();f.tick();assert.equal(storyObjectives(f.mission)[0].id,'power');
 f.building('derrick');s.oilLinked=1;assert.equal(f.tick().storyScene,'r04');assert(f.unlocked('factory'));
 f.finish();assert.equal(f.tick().storyScene,'r05');f.finish();f.tick();assert.equal(storyObjectives(f.mission)[0].id,'factory');
 f.building('factory');assert.equal(f.tick().storyScene,'r08');assert(f.unlocked('lab'));f.finish();
 assert.equal(f.tick().storyScene,'r06');f.finish();
 f.director.note({type:'unit-produced',kind:'bukhanka'},f.mission);assert.equal(f.tick().storyScene,'r09');f.finish();
 assert.equal(f.tick(13).storyScene,'r10');assert.equal(f.director.cue().clip.origin,'user-recording');f.finish();
 f.building('lab');assert.equal(f.tick().storyScene,'r11');assert(researchUnlocked(s));f.finish();
 assert.equal(f.tick().storyScene,'r13');f.finish();
 s.units.push({id:'raid',owner:'scavs',hp:100,x:20,y:0});s.flags.raidIds=['raid'];s.flags.contact=true;
 assert.equal(f.tick().storyScene,'r14');f.finish();assert.equal(f.tick().storyScene,'r16');
 f.mission.effects=[{type:'shot',from:'raid'}];assert.equal(f.tick(),null,'Combat cancels diplomacy without delaying a shot');
 f.mission.effects=[];s.units[0].hp=0;s.flags.raidWon=true;
 assert.equal(f.tick(8).storyScene,'r18');assert(f.unlocked('bunker'));f.finish();
 assert.equal(f.tick(11).storyScene,'r19');f.finish();assert.equal(f.tick().storyScene,'r21');f.finish();f.tick();
 assert(storyObjectives(f.mission).some(t=>t.id==='defense'));
 f.building('bunker');assert.equal(f.tick().storyScene,'r22');f.finish();assert(!defenseReady(s));
 f.building('bunker');assert.equal(f.tick().storyScene,'r23');f.finish();f.tick();
 assert(storyObjectives(f.mission).some(t=>t.id==='security'&&t.progress==='0/4'));
}
for(const completed of [false,true]){
 const f=fixture(false);f.building('generator',completed);
 assert.equal(f.tick().storyScene,completed?'r01b':'r01a');f.finish();
 assert.notEqual(f.tick()?.storyScene,'r01');
}
// Every technology can be first. A fast study never leaves an orphaned punchline.
for(const keys of [['mg-tower','flamethrower','mg-ammo-1'],['mg-ammo-1','mg-tower','flamethrower'],['flamethrower','mg-ammo-1','mg-tower']]){
 const f=fixture();f.finish();
 for(const key of keys){
  f.mission.state.artifactKeys.push(key);f.mission.state.research[key]=true;
  assert.equal(f.tick().storyScene,{'flamethrower':'r30-alt','mg-ammo-1':'r33','mg-tower':'r39'}[key]);f.finish();
 }
}
{
 const f=fixture();f.finish();f.mission.state.artifactKeys.push('flamethrower');
 assert.equal(f.tick().storyScene,'r26');f.finish();assert.equal(f.tick().storyScene,'r27');f.finish();
 f.mission.state.research.flamethrower=true;assert.equal(f.tick().storyScene,'r29');f.finish();assert.equal(f.tick(),null);
 const fast=fixture();fast.finish();fast.mission.state.artifactKeys.push('flamethrower');fast.tick();fast.director.completeLine();
 fast.mission.state.research.flamethrower=true;assert.equal(fast.tick().storyScene,'r26');fast.finish();
 assert.equal(fast.tick().storyScene,'r30-alt');assert.equal(fast.director.record('r26').status,'done');
}
// Discoveries identify the actual camp, without false ordinals on another route.
{
 const f=fixture();f.finish();f.mission.state.camps[1].cleared=true;
 const core=f.building('camp-core',true,'scavs','camp0');assert.equal(f.tick().storyScene,'r24a');f.finish();
 core.hp=0;f.mission.state.camps[0].cleared=true;assert.equal(f.tick().storyScene,'r25');f.finish();
 const tower=f.building('mg-tower',true,'scavs','camp2');assert.equal(f.tick().storyScene,'r36');f.finish();
 tower.hp=0;f.mission.state.artifactKeys.push('mg-tower');assert.equal(f.tick().storyScene,'r38');f.finish();
 const hq=f.building('camp-core',true,'scavs','camp3');assert.equal(f.tick().storyScene,'r41');f.finish();
 assert.equal(f.tick().storyScene,'r42');f.director.completeLine();
 f.mission.effects=[{type:'shot',from:'player',targetId:hq.id}];assert.equal(f.tick().storyScene,'r46');f.finish();
 assert.equal(f.director.record('r42').cursor,0);hq.hp=0;f.mission.effects=[];f.tick(20);
 assert.equal(f.director.record('r42').status,'cancelled');assert(!f.director.data.scenes.r45);
}
// Saves resume an answer; combat restarts the whole exchange with its question.
{
 const f=fixture();f.finish();f.building('factory',false);f.tick();f.director.completeLine();
 const reply=f.tick().id;
 f.mission.state=JSON.parse(JSON.stringify(f.mission.state));assert.equal(f.tick().id,reply);
 f.mission.state.units.push({id:'raid',owner:'scavs',hp:100,x:0,y:0});f.mission.state.flags.raidIds=['raid'];
 assert.equal(f.tick().storyScene,'r14');assert.equal(f.director.record('r06').cursor,0);f.finish();
 f.mission.effects=[{type:'shot',from:'raid'}];assert.equal(f.tick(),null);f.mission.effects=[];
 assert.equal(f.tick(9).id,source.scenes.find(s=>s.id==='r06').cues[0]);
}
for(const enabled of [false,true]){
 const f=fixture();f.building('generator');f.tick(0,enabled);assert(f.unlocked('derrick'));
 f.mission.state.powered=true;f.tick(0,enabled);assert(!f.unlocked('factory'));
 f.mission.state.oilLinked=1;f.tick(0,enabled);assert(f.unlocked('factory'));
 f.building('factory');f.tick(0,enabled);assert(f.unlocked('lab'));
 f.building('lab');f.tick(0,enabled);assert(researchUnlocked(f.mission.state));
 f.mission.state.flags.raidWon=true;f.tick(0,enabled);assert(f.unlocked('bunker'));
}
{
 const f=fixture();f.building('generator');f.building('factory');f.building('lab');f.mission.state.flags.raidWon=true;
 f.mission.state.radioStory={version:2,scriptRevision:4,clock:10,scenes:{o01:{status:'done'},'16-alt':{status:'done'}},facts:{},journal:[],lastEnd:0,lastCombat:-30000};
 f.tick();assert.equal(f.director.record('r01').status,'skipped');assert.equal(f.director.record('r30-alt').status,'skipped');
 assert.equal(f.director.data.scriptRevision,5);assert(!f.director.heard('r01'));
}
// Chatter requires real movement or queues, with at least 45 seconds between exchanges.
{
 const f=fixture();f.finish();f.mission.state.flags.raidWon=true;f.heard('r18','r19','r21');
 f.mission.state.units=[0,1].map(i=>({id:'own'+i,kind:'bukhanka',owner:'rai',hp:100,x:i*20,y:0,path:[{x:200,y:0}],speed:5}));
 assert.equal(f.tick(46).storyScene,'a01');f.finish();assert.equal(f.tick(),null);
 f.mission.trafficCoordinator={queueing:()=>true};f.tick(10);assert.equal(f.tick(36).storyScene,'a03');f.finish();
 f.mission.trafficCoordinator.queueing=()=>false;f.tick();assert.notEqual(f.tick()?.storyScene,'a04');
}
{
 const f=fixture();f.finish();f.mission.state.status='victory';assert.equal(f.tick().storyScene,'r48');f.finish();
 assert.equal(f.tick(6).storyScene,'r49');f.finish();assert.equal(f.tick(6).storyScene,'r50');f.finish();
 assert.equal(f.tick(16).storyScene,'r54');f.finish();assert.equal(f.tick(90),null);
 assert(!f.director.data.scenes.u01);assert(!f.director.data.scenes.u02);assert(!f.director.data.scenes.u04);
}
{
 const f=fixture(false);f.director.beginStory(f.mission);
 for(const id of ['p01','p02','p03']){assert.equal(f.tick().storyScene,id);f.finish();}
 assert.equal(f.tick(),null,'The sign dialogue waits for actual construction');
 const sign=f.building('base-sign',false);assert.equal(f.tick(),null);
 sign.completed=true;assert.equal(f.tick().storyScene,'p04');f.finish();
 assert(f.director.openingFinished);
 assert.equal(f.tick().storyScene,'r01');
}
// Saving the opening keeps it in the same mission, including the current reply.
{
 const f=fixture(false);f.director.beginStory(f.mission);f.tick();f.finish();f.tick();f.director.completeLine();
 assert.equal(f.tick().id,'m01-s02-l004');f.mission.state=JSON.parse(JSON.stringify(f.mission.state));
 assert.equal(f.tick().id,'m01-s02-l004');assert(f.director.heard('p01'));
 f.finish();assert.equal(f.tick().storyScene,'p03');
 const muted=fixture(false);muted.director.beginStory(muted.mission,{enabled:false});assert.equal(muted.tick().storyScene,'r01');
}
// Progress in the world cannot cut off a question, its reply or an unfinished voice.
{
 const f=fixture();f.director.completeLine();const cue=f.tick();f.building('generator',false);
 assert.equal(f.tick().id,cue.id);f.finish();assert.equal(f.tick(),null);
 f.mission.state.buildings[0].completed=true;assert.equal(f.tick().storyScene,'r02');
 f.mission.state.powered=true;f.mission.state.oilLinked=1;assert.equal(f.tick().id,'m01-v3-nuclear-power-ready');f.finish();
 assert.equal(f.tick().storyScene,'r04');
}
{
 const f=fixture();f.finish();f.building('generator');f.tick();f.director.record('r02').cursor=2;
 f.mission.state=JSON.parse(JSON.stringify(f.mission.state));
 assert.equal(f.tick().id,'m01-v3-nuclear-power-ready','Old saves resume the revised report safely');
 assert(!source.dialogue.some(c=>c.text==='Почему электричества нет?'));
}
console.log('PASS: integrated opening, complete exchanges through construction/research, 39 original recordings, alternate routes, interruptions, native and old saves, finale');
