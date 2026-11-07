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
assert.equal(source.revision,4);assert.equal(source.scenes.length,36);
assert.equal(hash(fs.readFileSync(source.source.path)),source.source.sha256);
assert.equal(source.dialogue.filter(c=>c.id.startsWith('m01v2-o')).length,35);
if(!process.argv.includes('--logic-only'))for(const cue of [...source.dialogue,...source.barks]){
 const clip=audio.clips[cue.id];assert(clip,cue.id);assert.equal(clip.speaker,cue.speaker);
 assert.equal(hash(fs.readFileSync(base+clip.file)),clip.sha256);assert(clip.duration>0);
}
const portraits=read('portraits/manifest.json');
for(const speaker of new Set([...source.dialogue,...source.barks].map(c=>c.speaker))){
 if(speaker==='past')continue;const p=portraits.characters[speaker];assert(p,speaker);
 assert.equal(hash(fs.readFileSync(base+'portraits/'+p.file)),p.sha256);
}
function fixture(){
 const mission={state:{status:'running',buildings:[],units:[],projectiles:[],flags:{},research:{},artifactKeys:[],artifacts:[],statistics:{produced:0},camps:[0,1,2,3].map(id=>({id:'camp'+id,cleared:false})),storyConstruction:{enabled:true,unlocked:['generator'],requiredBunkers:2,research:false}},effects:[],config:{startGrid:[0,0]},field:{worldToGrid:(x,y)=>[x,y]},visibleAt:()=>true,exploredAt:()=>true};
 const director=new StoryDirector(script);let now=0;
 const tick=(seconds=0,enabled=true)=>{let cue;do{const step=Math.min(1,seconds);now+=step*1000;seconds-=step;cue=director.update(mission,now,{enabled});}while(seconds>0);return cue;};
 tick();
 const heard=(...ids)=>{for(const id of ids)director.data.scenes[id]={status:'done',cursor:0,endedAt:director.data.clock};};
 const finish=()=>{const id=director.data.active;assert(id);while(director.data.active===id)director.completeLine();return id;};
 const building=(kind,completed=true,owner='rai',campId)=>{const e={id:kind+'-'+mission.state.buildings.length,kind,completed,owner,campId,hp:100,x:0,y:0};mission.state.buildings.push(e);return e;};
 const unlocked=kind=>constructionUnlocked(mission.state,kind);
 return {mission,director,tick,heard,finish,building,unlocked};
}
// Entire authored opening: stage assignment and availability are atomic at the end of each order.
{
 const f=fixture(),s=f.mission.state;
 assert.deepEqual(storyObjectives(f.mission),[]);assert(f.unlocked('generator'));assert(!f.unlocked('factory'));
 f.finish();f.tick();assert.equal(storyObjectives(f.mission)[0].id,'generator');
 f.building('generator');assert.equal(f.tick().storyScene,'o02');assert(!f.unlocked('derrick'));f.finish();
 assert.equal(f.tick().storyScene,'o03');f.director.completeLine();f.tick();assert(!f.unlocked('derrick'));f.finish();f.tick();
 assert(f.unlocked('derrick'));assert(!f.unlocked('factory'));assert.equal(storyObjectives(f.mission)[0].id,'power');
 f.building('derrick');s.powered=true;assert.equal(f.tick().storyScene,'o04');f.finish();assert.equal(f.tick().storyScene,'o05');f.finish();f.tick();
 assert(f.unlocked('factory'));assert.equal(storyObjectives(f.mission)[0].id,'factory');
 f.building('factory');assert.equal(f.tick().storyScene,'o06');assert(!f.unlocked('lab'));f.finish();f.tick();assert(f.unlocked('lab'));
 f.building('lab');assert.equal(f.tick().storyScene,'o07');assert(!researchUnlocked(s));f.finish();f.tick();assert(researchUnlocked(s));
 s.units.push({id:'raid',owner:'scavs',hp:100,x:25,y:-50});s.flags.raidIds=['raid'];
 assert.equal(f.tick(),null,'No false claim of being fired on');
 f.mission.effects=[{type:'shot',from:'raid'}];assert.equal(f.tick().storyScene,'o08');f.finish();f.mission.effects=[];
 s.units[0].hp=0;s.flags.raidWon=true;assert.equal(f.tick(8).storyScene,'o09');f.finish();assert.equal(f.tick().storyScene,'o10');f.finish();f.tick();assert(f.unlocked('bunker'));
 f.building('bunker');assert.equal(f.tick().storyScene,'o11');f.finish();assert.equal(f.tick(),null);assert(!defenseReady(s));
 f.building('bunker');assert(defenseReady(s));assert.equal(f.tick().storyScene,'o12');f.finish();f.tick();
 assert(storyObjectives(f.mission).some(t=>t.id==='security'&&t.progress==='0/4'));
 assert(!storyObjectives(f.mission).some(t=>t.id==='defense'));
}
// No stale question about an absent factory when one already exists.
{
 const f=fixture();f.building('generator');f.building('factory');
 assert.notEqual(f.tick()?.storyScene,'o02');assert(!f.director.heard('o02'));
}
// Independent artifact order and fast research never produce an orphaned punchline.
for(const keys of [['mg-ammo-1','flamethrower'],['flamethrower','mg-ammo-1']]){
 const f=fixture();f.finish();
 for(const key of keys){f.mission.state.artifactKeys.push(key);assert.equal(f.tick().storyScene,key==='flamethrower'?'14':'17');
  f.mission.state.research[key]=true;assert.equal(f.tick().storyScene,key==='flamethrower'?'16-alt':'18');f.finish();}
}
// A critical attack interrupts and restarts the question, preserving the construction lock.
{
 const f=fixture();f.finish();f.building('generator');f.tick();f.director.completeLine();
 f.mission.state.units.push({id:'raid',owner:'scavs',hp:100,x:50,y:-50});f.mission.state.flags.raidIds=['raid'];
 f.mission.effects=[{type:'shot',from:'raid'}];assert.equal(f.tick().storyScene,'o08');assert.equal(f.director.record('o02').cursor,0);f.finish();f.mission.effects=[];
 assert.equal(f.tick().id,'m01v2-o02-l001');assert(!f.unlocked('derrick'));
}
// A dead Petrovich cannot continue. A battle suspends his exchange, then restarts it whole.
{
 const f=fixture();f.finish();const hq=f.building('camp-core',true,'scavs','camp3');f.mission.state.flags.lastRevealed=true;
 assert.equal(f.tick(20).storyScene,'22');f.director.completeLine();f.mission.effects=[{type:'shot',from:'x'}];assert.equal(f.tick(),null);f.mission.effects=[];
 assert.equal(f.tick(10).id,'m01v2-22-l001');hq.hp=0;assert.equal(f.tick(),null);assert.equal(f.director.record('22').status,'cancelled');
}
// Saves and explicit mute preserve progress; completed scenes do not replay.
{
 const f=fixture();f.finish();f.building('generator');f.tick();f.director.completeLine();
 f.mission.state=JSON.parse(JSON.stringify(f.mission.state));assert.equal(f.tick().id,'m01v2-o02-l002');assert(f.director.heard('o01'));
 f.finish();f.tick();f.finish();f.tick();f.mission.state=JSON.parse(JSON.stringify(f.mission.state));f.tick();assert(f.unlocked('derrick'));
 const silent=fixture();silent.building('generator');silent.tick(0,false);assert(silent.unlocked('derrick'));
 silent.mission.state.powered=true;silent.tick(0,false);assert(silent.unlocked('factory'));
 silent.building('factory');silent.tick(0,false);assert(silent.unlocked('lab'));
 silent.building('lab');silent.tick(0,false);assert(researchUnlocked(silent.mission.state));
 silent.mission.state.flags.raidWon=true;silent.tick(0,false);assert(silent.unlocked('bunker'));
 silent.building('bunker');assert(!storyObjectives(silent.mission,{radioEnabled:false}).some(t=>t.id==='security'));
 silent.building('bunker');assert(storyObjectives(silent.mission,{radioEnabled:false}).some(t=>t.id==='security'));
}
// Slow discovery receives the full original payoff.
{
 const f=fixture();f.finish();f.mission.state.artifactKeys.push('flamethrower');f.tick();f.finish();assert.equal(f.tick(2).storyScene,'15');f.finish();
 f.mission.state.research.flamethrower=true;assert.equal(f.tick().storyScene,'16');f.finish();assert.equal(f.tick(),null);
}
// Optional fictional facts are never fabricated; victory does not wait for its speech.
{
 const f=fixture();f.finish();assert.equal(f.tick(90),null);f.mission.state.status='victory';assert.equal(f.tick().storyScene,'25');f.finish();
 assert.equal(f.tick(9).storyScene,'26');f.finish();assert.equal(f.tick(6).storyScene,'27');f.finish();assert.equal(f.tick().storyScene,'28');f.finish();
 assert.equal(f.tick(21).storyScene,'29');f.finish();assert.equal(f.tick(26).storyScene,'d04');f.finish();assert.equal(f.tick(60),null);
 assert(!f.director.data.scenes.d01);assert(!f.director.data.scenes.d02);assert(!f.director.data.scenes['24']);
}
{
 const f=fixture();f.director.startPrologue();for(const id of ['p01','p02','p03']){assert.equal(f.tick().storyScene,id);f.finish();}
 assert(f.director.prologueDone);f.director.stopPrologue();assert.equal(f.tick().storyScene,'o01');
}
console.log('PASS: full 12-scene opening, exact audio and portraits, all stage locks, quests, critical interruption, research branches, saves and finale');
