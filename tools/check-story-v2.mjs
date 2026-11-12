import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {StoryDirector} from '../campaign/story-director.js';
import {storyObjectives} from '../campaign/story-objectives.js';
import {constructionUnlocked,researchUnlocked,defenseReady} from '../campaign/story-construction.js';
import {applyStoryEdits} from '../campaign/story-edits.js';
import {storyMilestoneNotice} from '../campaign/story-milestones.js';
const base='assets/campaign/alpha/mission01/';
const read=file=>JSON.parse(fs.readFileSync(base+file,'utf8'));
const originalStory=read('story-v2.json'),originalAudio=read('audio-v2.json'),applied=read('reviewed-dialogue.json');
const {story:source,audio}=applyStoryEdits(originalStory,originalAudio,applied);
const script={...source,dialogue:source.dialogue.map(c=>({...c,clip:audio.clips[c.id]}))};
const hash=data=>createHash('sha256').update(data).digest('hex');
assert.equal(source.revision,5);assert.equal(source.scenes.length,55);
assert.equal(hash(fs.readFileSync(source.source.path)),source.source.sha256);
const original=read('audio.json'),portraits=read('portraits/manifest.json');
const finalRecording=clip=>['user-recording','elevenlabs-synthesis'].includes(clip?.origin);
let userCount=0,elevenlabsCount=0;
for(const cue of [...source.dialogue,...source.barks]){
 const clip=audio.clips[cue.id];assert(clip,cue.id);assert.equal(clip.speaker,cue.speaker);
 if(clip.origin==='user-recording')userCount++;
 if(clip.origin==='elevenlabs-synthesis'){
  elevenlabsCount++;assert(clip.voiceId&&clip.voiceName,cue.id);assert.equal(clip.modelId,'eleven_v4',cue.id);
 }
 if(cue.recordingStatus==='Т')assert(finalRecording(clip),cue.id);
 if(!process.argv.includes('--logic-only'))assert.equal(hash(fs.readFileSync(base+clip.file)),clip.sha256,clip.file);
 assert(clip.duration>0);
 if(cue.speaker!=='past')assert(portraits.characters[cue.speaker],cue.speaker);
}
assert.equal(userCount,101);assert.equal(elevenlabsCount,75);
assert.equal(audio.clips['m01-s07-l014'].voiceName,'Mishka Yaponcik - Odessa Rogue Charm');
assert.equal(hash(fs.readFileSync(base+'recordings/reviewed/m01-s07-l014-4e14be06b9b1.mp3')),'4e14be06b9b1155f9d172d2ad351ef622770b629d1241313303b233a4ca38308');
for(const id of ['m01-v3-r24-l001','m01-v3-r24-l002','m01-v3-r24-l003'])assert.equal(audio.clips[id].origin,'user-recording',id);
assert.equal(source.dialogue.find(c=>c.id==='m01-s02-l008').text,'Значит, воспоминания. Спи дальше.');
assert.equal(source.dialogue.find(c=>c.id==='m01-s05-l004').text,'Учёные будут изучать находки. Получат новые чертежи — смогут другую технику собирать.');
assert.deepEqual(source.scenes.find(s=>s.id==='p04').cues,['m01-s03-l001','m01-v3-builder-crooked-plinth']);
assert(!source.dialogue.some(c=>c.id==='m01-s03-l003'),'The disabled sign reply must not play');
for(const sceneId of ['r21','r22','r23','r24','r24a','r25','r26','r27','r29','r30-alt','r31','r32','r33','r35','r36']){
 for(const id of source.scenes.find(s=>s.id===sceneId).cues)assert.equal(audio.clips[id].origin,id==='m01-v3-r25-l001'?'elevenlabs-synthesis':'user-recording',id);
}
assert.equal(source.dialogue.find(c=>c.id==='m01-s07-l016').text,'Нам и прикрученное надо. Дай отвёртку.');
assert.equal(source.dialogue.find(c=>c.id==='m01-s07-l016').speaker,'builder');
assert.equal(audio.clips['m01-s07-l016'].origin,'user-recording');
// Mislabeled takes use the owner's confirmed spoken words, not their filenames.
assert.equal(originalAudio.clips['m01-s06-l008'].file,'recordings/commander/m01-s07-l002.mp3');
assert.equal(audio.clips['m01-s06-l008'].text,'У нас электричества ещё нет.');
assert.equal(audio.clips['m01-s07-l002'].file,'recordings/commander/m01-s07-l004.mp3');
assert.equal(audio.clips['m01-s07-l004'].file,'recordings/commander/pending/m01-s07-l007.mp3');
for(const clip of Object.values(original.clips).filter(c=>c.origin==='user-recording'))assert.equal(hash(fs.readFileSync(base+clip.file)),clip.sha256);
assert.equal(source.scenes.find(s=>s.id==='r50').cues.length,4);
assert.equal(source.scenes.find(s=>s.id==='r06').cues.length,3);
assert.equal(source.dialogue.find(l=>l.id==='m01-s05-l012').text,'Из букв «У», «А», «З» слово «танк» не собирается.');
assert(audio.clips['m01-s05-l012'].spokenText.includes('«У», «А», «Зэ»'));
const petrovich=source.scenes.find(s=>s.id==='r42').cues.map(id=>source.dialogue.find(l=>l.id===id));
assert.equal(petrovich.length,14);
assert.deepEqual(petrovich.slice(3,7).map(l=>l.text),['Кто у вас главный?','Петрович.','Должность?','Ну… Петрович.']);
assert.deepEqual(petrovich.slice(7).map(l=>l.text),[
 'Конституция имеется?','А у тебя?','У меня приказ.','Вот и у меня. Только я сам отдаю.',
 'Прикажи себе сдаться. Заодно дисциплину проверим.','Да ты сначала зайди сюда!',
 'Слышали, ребята? Нас пригласили. Заходим.',
]);
assert(!source.dialogue.some(l=>l.id.startsWith('m01-v4-r42-')||['m01-s11-l009','m01-s11-l010'].includes(l.id)));
assert.deepEqual(applyStoryEdits(source,audio,applied),{story:source,audio},'Applied snapshots are idempotent');
assert.deepEqual(originalStory,read('story-v2.json'),'Applying a snapshot does not mutate the base');
assert.deepEqual(originalAudio,read('audio-v2.json'));
for(const scene of originalStory.scenes.filter(s=>!applied.scenes.some(a=>a.id===s.id))){
 assert.deepEqual(source.scenes.find(s=>s.id===scene.id),scene);
 for(const id of scene.cues){
  // Alternate approaches share the same recorded question and reply.
  if(applied.dialogue.some(line=>line.id===id))continue;
  assert.deepEqual(source.dialogue.find(l=>l.id===id),originalStory.dialogue.find(l=>l.id===id));assert.deepEqual(audio.clips[id],originalAudio.clips[id]);
 }
}
for(const id of ['m01-s01-l003','m01-s01-l004','m01-s05-l014','m01-s05-l015','m01-s05-l016']){
 assert(!source.dialogue.some(line=>line.id===id));assert(!audio.clips[id]);
}
for(const line of applied.dialogue)assert(finalRecording(audio.clips[line.id]),line.id);

function fixture(startImmediately=true){
 const camps=['flamethrower','mg-ammo-1','mg-tower',null].map((artifact,i)=>({id:'camp'+i,artifact,cleared:false}));
 const mission={state:{status:'running',buildings:[],units:[],projectiles:[],flags:{},research:{},artifactKeys:[],artifacts:[],statistics:{produced:0},camps,storyConstruction:{enabled:true,unlocked:['generator'],requiredBunkers:2,research:false}},effects:[],config:{startGrid:[0,0],oilFields:[],camps},field:{worldToGrid:(x,y)=>[x,y],gridToWorld:([x,y])=>({x,y})},visibleAt:()=>true,exploredAt:()=>true};
 mission.entity=id=>[...mission.state.units,...mission.state.buildings].find(e=>e.id===id&&e.hp>0);
 const director=new StoryDirector(script);let now=0;
 const tick=(seconds=2,enabled=true)=>{let cue;do{const step=Math.min(1,seconds);now+=step*1000;seconds-=step;cue=director.update(mission,now,{enabled});}while(seconds>0);return cue;};
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
 f.building('factory');assert.equal(f.tick().storyScene,'r11','The NII order takes the first free slot after factory completion');assert(f.unlocked('lab'));
 assert(!s.buildings.some(b=>b.kind==='lab'));assert(!researchUnlocked(s));f.finish();
 assert.equal(f.tick().storyScene,'r06');f.finish();
 assert.equal(f.tick().storyScene,'r08');f.finish();
 f.director.note({type:'unit-produced',kind:'bukhanka'},f.mission);assert.equal(f.tick().storyScene,'r09');f.finish();
 assert.equal(f.tick(3),null,'The second science exchange waits for the completed NII');
 f.building('lab');assert.equal(f.tick().storyScene,'r13');assert(researchUnlocked(s));f.finish();
 s.units.push({id:'raid',owner:'scavs',hp:100,x:20,y:0});s.flags.raidIds=['raid'];s.flags.contact=true;
 assert.equal(f.tick().storyScene,'r14');f.finish();assert.equal(f.tick().storyScene,'r16');
 f.mission.effects=[{type:'shot',from:'raid'}];assert.equal(f.tick().storyScene,'r16','Combat does not cut off a started exchange');f.finish();
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
 const question=f.tick();assert.equal(question.storyScene,completed?'r01b':'r01a');
 assert.equal(question.text,'К моему приезду кофе будет?');
 f.director.completeLine();
 assert.equal(f.tick().text,completed?'Электростанция уже работает.':'Электростанция уже строится.');
 f.director.completeLine();
 assert.equal(f.tick().id,completed?'m01-v3-r01b-l001':'m01-v3-r01a-l001');f.finish();
 assert.notEqual(f.tick()?.storyScene,'r01');
}
// The new factory order is announced on the general's actual instruction.
{
 const f=fixture();f.finish();f.mission.state.oilLinked=1;f.heard('r04');
 assert.equal(f.tick().id,'m01-v3-r05-l002');assert(!f.director.data.announced?.r05);
 f.director.completeLine();assert.equal(f.tick().id,'m01-v3-oil-supply-ready');assert(!f.director.data.announced?.r05);
 f.director.completeLine();assert.equal(f.tick().id,source.scenes.find(s=>s.id==='r05').cues.at(-1));assert(f.director.data.announced.r05);
}
// Fast building/production keeps the napilnik setup before its payoff, without locking play.
{
 const f=fixture();f.finish();f.building('factory');f.building('lab');
 f.director.note({type:'unit-produced',kind:'bukhanka'},f.mission);
 for(const id of ['r06','r08','r09']){
  assert.equal(f.tick().storyScene,id);assert(f.unlocked('lab'));assert(researchUnlocked(f.mission.state));f.finish();
 }
}
// Every technology can be first. A fast study never leaves an orphaned punchline.
for(const keys of [['mg-tower','flamethrower','mg-ammo-1'],['mg-ammo-1','mg-tower','flamethrower'],['flamethrower','mg-ammo-1','mg-tower']]){
 const f=fixture();f.finish();
 for(const key of keys){
  f.mission.state.artifactKeys.push(key);f.mission.state.research[key]=true;
  for(const id of {'flamethrower':['r26','r27','r29'],'mg-ammo-1':['r33'],'mg-tower':['r39']}[key]){assert.equal(f.tick().storyScene,id);f.finish();}
 }
}
{
 const f=fixture();f.finish();f.mission.state.artifactKeys.push('flamethrower');
 assert.equal(f.tick().storyScene,'r26');f.finish();assert.equal(f.tick().storyScene,'r27');f.finish();
 f.mission.state.research.flamethrower=true;assert.equal(f.tick().storyScene,'r29');f.finish();assert.equal(f.tick(),null);
 const fast=fixture();fast.finish();fast.mission.state.artifactKeys.push('flamethrower');fast.tick();fast.director.completeLine();
 fast.mission.state.research.flamethrower=true;assert.equal(fast.tick().storyScene,'r26');fast.finish();
 assert.equal(fast.tick().storyScene,'r27');fast.finish();assert.equal(fast.tick().storyScene,'r29');assert.equal(fast.director.record('r26').status,'done');
 const skipped=fixture();skipped.finish();skipped.mission.state.artifactKeys.push('flamethrower');skipped.tick();skipped.director.skip();
 skipped.mission.state.research.flamethrower=true;assert.equal(skipped.tick().storyScene,'r30-alt','A deliberately skipped setup uses the self-contained report');
}
// Each artifact has its own exchange, regardless of collection order. The
// original upgrade recording follows ammunition research, not van production.
for(const keys of [['flamethrower','mg-ammo-1'],['mg-ammo-1','flamethrower']]){
 const f=fixture();f.finish();
 f.heard('r06','r08');
 f.director.note({type:'unit-produced',kind:'bukhanka'},f.mission);
 assert.equal(f.tick().storyScene,'r09');f.finish();assert.equal(f.tick(60),null);
 const transmissions=[];
 const play=id=>{
  const cue=f.tick();assert.equal(cue?.storyScene,id);
  while(f.director.data.active===id){
   transmissions.push(f.director.cue());f.director.completeLine();
  }
 };
 for(const key of keys){
  const s=f.mission.state;
  s.camps.find(c=>c.artifact===key).cleared=true;s.artifactKeys.push(key);
  const start=transmissions.length;
  for(const id of key==='flamethrower'?['r25','r26','r27']:['r32'])play(id);
  assert(!transmissions.slice(start).some(c=>c.id==='warrant:upgrade'),'Picking up an artifact is not an upgrade');
  s.research[key]=true;play(key==='flamethrower'?'r29':'r33');
  if(key==='mg-ammo-1'){
   // A save between the report and the comment must keep the pending comment.
   f.mission.state=JSON.parse(JSON.stringify(f.mission.state));
   assert.equal(f.tick(0),null);assert.equal(f.tick(1),null);f.tick(1);play('r10');
   assert.equal(transmissions.at(-1).clip.origin,'user-recording');
   assert(!transmissions.slice(start).some(c=>/изолент/i.test(c.text)),'Ammunition does not repeat the flamethrower joke');
  }
 }
 assert.equal(transmissions.filter(c=>c.id==='warrant:upgrade').length,1);
 assert.equal(transmissions.filter(c=>c.id==='m01-s08-l005').length,1);
 f.mission.state=JSON.parse(JSON.stringify(f.mission.state));
 assert.equal(f.tick(60),null,'Completed artifact exchanges and the upgrade comment do not replay after loading');
}
{
 const f=fixture();f.finish();
 // A pre-fix save may have parked the comment before any upgrade existed.
 f.director.data.scenes.r10={status:'playing',cursor:0};
 f.mission.state=JSON.parse(JSON.stringify(f.mission.state));
 assert.equal(f.tick(),null);assert.equal(f.tick(60),null);
 f.mission.state.research['mg-ammo-1']=true;
 assert.equal(f.tick().storyScene,'r33');f.finish();
 assert.equal(f.tick(2).storyScene,'r10','Upgrading the starting vans does not require producing another van');f.finish();
}
// Discoveries identify the actual camp, without false ordinals on another route.
{
 const f=fixture();f.finish();f.mission.state.camps[1].cleared=true;f.heard('r32');
 const core=f.building('camp-core',true,'scavs','camp0');assert.equal(f.tick().storyScene,'r24a');f.finish();
 core.hp=0;f.mission.state.camps[0].cleared=true;assert.equal(f.tick().storyScene,'r25');f.finish();
 const tower=f.building('mg-tower',true,'scavs','camp2');assert.equal(f.tick().storyScene,'r36');f.finish();
 tower.hp=0;assert.notEqual(f.tick()?.storyScene,'r38','A destroyed tower alone does not mean its whole camp is clear');
 f.mission.state.camps[2].cleared=true;f.mission.state.artifactKeys.push('mg-tower');assert.equal(f.tick().storyScene,'r38');f.finish();
 const hq=f.building('camp-core',true,'scavs','camp3');assert.equal(f.tick().storyScene,'r41');f.finish();
 f.mission.state.units.push({id:'player',owner:'rai',hp:100,x:-10,y:-10,order:{type:'hold'},path:[]});
 const ordersBefore=JSON.parse(JSON.stringify(f.mission.state.units));
 assert.equal(f.tick().storyScene,'r42');f.director.completeLine();
 f.mission.effects=[{type:'shot',from:'player',targetId:hq.id}];assert.equal(f.tick().storyScene,'r42');assert.equal(f.director.record('r42').cursor,1);f.finish();
 assert.deepEqual(f.mission.state.units,ordersBefore,'The invitation is dialogue, never a movement or attack command');
 assert.equal(f.tick().storyScene,'r46');f.finish();hq.hp=0;f.mission.effects=[];f.tick(20);
 assert.equal(f.director.record('r42').status,'done');assert(!f.director.data.scenes.r45);
}
// The third cleared camp opens radio contact while the army is still on the
// road. No visibility, research or quiet period is required, in either order.
for(const last of [2,1,0]){
 const f=fixture();f.finish();const s=f.mission.state;
 const hq=f.building('camp-core',true,'scavs','camp3');f.mission.visibleAt=()=>false;
 for(let i=0;i<3;i++)if(i!==last)s.camps[i].cleared=true;
 f.heard('r25','r32','r38');
 assert.equal(f.tick(),null,'Two cleared camps must not start remote negotiations');
 const report=['r25','r32','r38'][last];delete f.director.data.scenes[report];
 s.camps[last].cleared=true;s.research['mg-tower']=true;
 f.mission.effects=[{type:'shot',from:'player',targetId:hq.id}];
 assert.equal(f.tick().storyScene,report,'Acknowledge the camp that was actually cleared third');f.finish();
 assert.equal(f.tick(1.999),null);assert.equal(f.tick(.001).storyScene,'r41','Introduce Petrovich in the first radio slot, before research');f.finish();
 f.mission.state=JSON.parse(JSON.stringify(s));
 f.tick(0);
 assert.equal(f.tick().storyScene,'r42','Save/load, an unseen HQ and active combat cannot delay the conversation');
 const reply=f.director.cue().id;f.director.completeLine();const next=f.tick(0).id;assert.notEqual(next,reply);
 f.mission.state.buildings.find(b=>b.id===hq.id).hp=0;f.mission.state.camps[3].cleared=true;f.mission.state.status='victory';
 assert.equal(f.tick().id,next,'A started exchange finishes even if the player quickly destroys the HQ');f.finish();
 assert.equal(f.director.record('r42').status,'done');
}
{
 const f=fixture();f.finish();f.mission.visibleAt=()=>false;
 f.building('camp-core',true,'scavs','camp3').hp=0;f.mission.state.camps.forEach(c=>c.cleared=true);
 f.heard('r25','r32','r38');assert.equal(f.tick().storyScene,'r47','Do not start a new negotiation with an already defeated chief');
}
// Saves resume an answer; repeated hits and urgent reports never rewind it.
{
 const f=fixture();f.finish();f.building('factory',false);f.tick();f.director.completeLine();
 const reply=f.tick().id;
 f.mission.state=JSON.parse(JSON.stringify(f.mission.state));assert.equal(f.tick().id,reply);
 f.mission.state.units.push({id:'raid',owner:'scavs',hp:100,x:0,y:0});f.mission.state.flags.raidIds=['raid'];
 f.mission.effects=[{type:'shot',from:'raid'}];
 for(let i=0;i<4;i++){assert.equal(f.tick().id,reply);assert.equal(f.director.record('r06').cursor,1);}
 f.director.completeLine();assert.equal(f.tick(0).id,source.scenes.find(s=>s.id==='r06').cues[2]);f.finish();
 assert.equal(f.tick(0),null);assert.equal(f.tick(1.999),null,'Even urgent reports leave two seconds between scenes');
 assert.equal(f.tick(.001).storyScene,'r14');f.finish();f.mission.effects=[];
 f.tick(9);assert.equal(f.director.record('r06').status,'done');assert.equal(f.director.record('r06').cursor,3);
}
// The gap applies to ordinary scenes and survives a save; replies have no scene gap.
{
 const f=fixture();f.director.completeLine();assert.equal(f.tick(0).id,'m01-s06-l008');f.finish();
 f.building('generator');assert.equal(f.tick(1),null);f.mission.state=JSON.parse(JSON.stringify(f.mission.state));
 assert.equal(f.tick(0),null);assert.equal(f.tick(.999),null);assert.equal(f.tick(.001).storyScene,'r02');
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
{
 const f=fixture(false);f.mission.state.statistics.produced=1;
 f.mission.state.radioStory={version:2,scriptRevision:4,clock:10,scenes:{'05':{status:'done'}},facts:{},journal:[],lastEnd:0,lastCombat:-30000};
 f.tick();assert.equal(f.director.record('r09').status,'skipped');
 assert.equal(f.director.data.scenes.r10,undefined,'Legacy van production must not retire an unheard upgrade comment');
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
 assert.equal(f.tick(16),null);assert.equal(f.tick(90),null);
 assert.equal(source.scenes.find(s=>s.id==='r54').enabled,false);
 assert(!f.director.data.scenes.u01);assert(!f.director.data.scenes.u02);assert(!f.director.data.scenes.u04);
}
{
 const f=fixture(false);f.director.beginStory(f.mission);
 assert.equal(f.tick(),null,'The television has no legacy voice placeholders');assert.equal(f.director.data.active,'p01');f.director.end();
 for(const id of ['p02','p03']){assert.equal(f.tick().storyScene,id);f.finish();}
 assert.equal(f.tick(),null,'The sign dialogue waits for actual construction');
 const sign=f.building('base-sign',false);assert.equal(f.tick(),null);
 sign.completed=true;assert.equal(f.tick().storyScene,'p04');
 assert.equal(f.tick().text,'Неужели проверка скоро?');assert(!f.director.openingFinished);
 f.director.completeLine();assert.equal(f.tick().text,'Да. Через пару дней прилетят.');
 assert(!f.director.openingFinished);f.finish();
 assert(f.director.openingFinished);
 assert.equal(f.tick().storyScene,'r01');assert.equal(f.tick().text,'К моему приезду кофе будет?');
}
// Saving the opening keeps it in the same mission, including the current reply.
{
 const f=fixture(false);f.director.beginStory(f.mission);f.tick();f.director.end();f.tick();f.director.completeLine();
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
// Approach warning and election exchange do not require waiting until the
// attackers enter direct vision, and a shot cannot invalidate the conversation.
{
 const f=fixture();f.finish();const s=f.mission.state;
 f.mission.visibleAt=()=>false;s.flags.contact=true;s.flags.raidIds=['raid'];
 s.units.push({id:'raid',owner:'scavs',hp:100,x:200,y:0});
 assert.equal(f.tick().storyScene,'r14');f.mission.effects=[{type:'shot',from:'raid'}];f.finish();
 assert.equal(f.tick().storyScene,'r16','The election setup remains eligible after shooting starts');
 const texts=[];while(f.director.data.active==='r16'){texts.push(f.director.cue().text);f.director.completeLine();}
 assert(texts.some(t=>t.includes('выборы')));
}
// All camp outcomes are reports, not ambient chatter. Collecting/researching
// immediately or fighting at another camp must not silently retire them.
{
 const f=fixture();f.finish();const s=f.mission.state;
 f.mission.effects=[{type:'shot',from:'other-camp'}];s.camps[1].cleared=true;
 assert.equal(f.tick().storyScene,'r32','A cleared warehouse is acknowledged before its sample is collected');
 assert(f.director.cue().text.includes('Склад наш!'));f.finish();
 s.artifactKeys.push('mg-ammo-1');s.research['mg-ammo-1']=true;
 assert.equal(f.tick().storyScene,'r33');assert(f.director.cue().text.includes('трофейные патронные ленты'));f.finish();
 s.camps[2].cleared=true;s.research['mg-tower']=true;
 assert.equal(f.tick().storyScene,'r38','Unseen tower destruction still acknowledges its camp');f.finish();
 assert.equal(f.tick().storyScene,'r39');f.finish();
 s.camps[3].cleared=true;s.status='victory';
 assert.equal(f.tick().storyScene,'r47','The last camp report survives simultaneous victory');f.finish();
}
{
 const f=fixture();f.finish();const s=f.mission.state;
 f.building('factory',false);assert.equal(f.tick().storyScene,'r06');
 s.camps[0].cleared=true;s.camps[1].cleared=true;s.artifactKeys.push('flamethrower');s.research.flamethrower=true;
 f.mission.effects=[{type:'shot',from:'other-camp'}];f.finish();
 const spoken=[];
 for(const scene of ['r25','r26','r27','r29','r32']){
  assert.equal(f.tick().storyScene,scene,'Keep the artifact exchange together before unrelated reports');
  if(scene==='r27'){f.director.completeLine();f.mission.state=JSON.parse(JSON.stringify(s));assert.equal(f.tick(0).id,'m01-s08-l006');}
  while(f.director.data.active===scene){spoken.push(f.director.cue().text);f.director.completeLine();}
 }
 const tapeSetup=spoken.findIndex(t=>t.includes('Всё собрано на синей изоленте'));
 const tapeQuestion=spoken.findIndex(t=>t==='А зачем синяя?');
 const tapeReply=spoken.findIndex(t=>t.includes('чтобы жёлтая не разматывалась'));
 assert(tapeSetup>=0&&tapeQuestion>tapeSetup&&tapeReply>tapeQuestion,'The revised tape joke keeps its setup, question and reply in order');
}
{
 const f=fixture();f.finish();f.building('factory');f.mission.effects=[{type:'shot',from:'raid'}];
 assert.equal(f.tick().storyScene,'r11','A firefight cannot defer the NII order behind factory chatter');
 const started=fixture();started.finish();started.building('factory');started.building('lab',false);
 assert.notEqual(started.tick()?.storyScene,'r11','Do not order construction that the player already started');
 const s=f.mission.state;s.camps[1].name='Склад';
 const notice=storyMilestoneNotice([{type:'camp-cleared',camp:'camp1'},{type:'artifact-collected',key:'mg-ammo-1'}],f.mission);
 assert(notice.includes('зачищен')&&notice.includes('патронов')&&notice.includes('западного склада'));
 assert(!notice.includes('доставлен в НИИ'),'Collection does not assert delivery to an unbuilt lab');
 assert(storyMilestoneNotice([{type:'research-complete',key:'flamethrower'}],f.mission).includes('из лагеря у ущелья'));
}
console.log(`PASS: integrated opening, prompt NII order, election during combat, camp acknowledgements, coherent artifact chains, ${userCount} original recordings, two-second scene gaps, native and old saves, finale`);
