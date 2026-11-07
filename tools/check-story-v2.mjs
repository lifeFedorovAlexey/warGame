import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {StoryDirector} from '../campaign/story-director.js';
import {storyObjectives} from '../campaign/story-objectives.js';
import {constructionUnlocked} from '../campaign/story-construction.js';
const base='assets/campaign/alpha/mission01/';
const read=file=>JSON.parse(fs.readFileSync(base+file,'utf8'));
const source=read('story-v2.json'),audio=read('audio-v2.json');
const script={...source,dialogue:source.dialogue.map(c=>({...c,clip:audio.clips[c.id]}))};
const hash=data=>createHash('sha256').update(data).digest('hex');
assert.equal(hash(fs.readFileSync(source.source.path)),source.source.sha256);
assert.equal(source.scenes.length,40);
assert.equal(source.dialogue.length+source.barks.length,127);
for(const cue of [...source.dialogue,...source.barks]){
 const clip=audio.clips[cue.id];assert(clip, cue.id);assert.equal(clip.speaker,cue.speaker);
 assert.equal(hash(fs.readFileSync(base+clip.file)),clip.sha256);assert(clip.duration>0);
}
const portraits=read('portraits/manifest.json');
for(const speaker of new Set([...source.dialogue,...source.barks].map(c=>c.speaker))){
 if(speaker==='past')continue;
 const p=portraits.characters[speaker];assert(p,speaker);
 assert.equal(hash(fs.readFileSync(base+'portraits/'+p.file)),p.sha256);
}
function fixture(){
 const mission={state:{status:'running',buildings:[],units:[],projectiles:[],flags:{},research:{},artifactKeys:[],artifacts:[],camps:[0,1,2,3].map(id=>({id:'camp'+id,cleared:false}))},
   effects:[],config:{startGrid:[0,0]},field:{worldToGrid:(x,y)=>[x,y]},visibleAt:()=>true,exploredAt:()=>true};
 mission.state.statistics={produced:0};
 const director=new StoryDirector(script);let now=0;
 const tick=(seconds=0)=>{let cue;do {const step=Math.min(1,seconds);now+=step*1000;seconds-=step;cue=director.update(mission,now);}while(seconds>0);return cue;};
 tick();
 const heard=(...ids)=>{for(const id of ids)director.data.scenes[id]={status:'done',cursor:0,endedAt:director.data.clock};};
 const finish=()=>{const id=director.data.active;assert(id);while(director.data.active===id)director.completeLine();return id;};
 const building=(kind,completed=true,owner='rai',campId)=>{const e={id:kind+'-'+mission.state.buildings.length,kind,completed,owner,campId,hp:100,x:0,y:0};mission.state.buildings.push(e);return e;};
 return {mission,director,tick,heard,finish,building};
}
// Fast starts select one applicable version; a state change never leaves an obsolete order.
for(const [completed,id] of [[null,'01'],[false,'01a'],[true,'01b']]){
 const f=fixture();if(completed!==null)f.building('generator',completed);
 assert.equal(f.tick().storyScene,id);f.finish();f.tick(30);
 assert(!['01','01a','01b'].includes(f.director.data.active));
}
{
 const f=fixture();f.director.completeLine();f.building('generator');
 assert.equal(f.tick().storyScene,'01b');assert.equal(f.director.record('01').status,'cancelled');
}
// A fast research completion uses the self-contained result, not a reply to an unheard question.
{
 const f=fixture();f.finish();f.mission.state.artifacts.push({key:'flamethrower',x:0,y:0});
 assert.equal(f.tick().storyScene,'14');f.director.completeLine();
 f.mission.state.research.flamethrower=true;
 assert.equal(f.tick().storyScene,'16-alt');assert.equal(f.director.record('14').status,'cancelled');
}
// Both discovery orders remain independent of camp numbers.
for(const keys of [['mg-ammo-1','flamethrower'],['flamethrower','mg-ammo-1']]){
 const f=fixture();f.finish();
 for(const key of keys){
  f.mission.state.artifactKeys.push(key);assert.equal(f.tick().storyScene,key==='flamethrower'?'14':'17');f.finish();
  f.mission.state.research[key]=true;assert.equal(f.tick().storyScene,key==='flamethrower'?'16-alt':'18');f.finish();
 }
}
// P0 interrupts immediately; a still relevant joke restarts from its question.
{
 const f=fixture();f.finish();f.heard('04');f.tick(16);
 assert.equal(f.director.data.active,'02');f.director.completeLine();
 f.mission.state.units.push({id:'enemy',owner:'scavs',hp:100,x:50,y:-50});
 assert.equal(f.tick().storyScene,'10');assert.equal(f.director.record('02').cursor,0);f.finish();
 f.mission.effects=[{type:'shot',from:'enemy'}];assert.equal(f.tick(),null);f.mission.effects=[];
 const restarted=f.tick(16);assert.equal(restarted.storyScene,'02');assert.equal(restarted.id,'m01v2-02-l001');
 assert(!f.director.heard('11'),'No enemy banter after shots');
}
// Petrovich cannot speak from a destroyed headquarters. Battle alone suspends instead of losing it.
{
 const f=fixture();f.finish();const hq=f.building('camp-core',true,'scavs','camp3');f.mission.state.flags.lastRevealed=true;
 assert.equal(f.tick(20).storyScene,'22');f.director.completeLine();
 f.mission.effects=[{type:'shot',from:'x'}];assert.equal(f.tick(),null);f.mission.effects=[];
 assert.equal(f.tick(10).id,'m01v2-22-l001');hq.hp=0;assert.equal(f.tick(),null);
 assert.equal(f.director.record('22').status,'cancelled');assert(!f.director.heard('23'));
}
// Save/load retains progress; combat restart semantics are tested separately above.
{
 const f=fixture();f.finish();f.heard('04');assert.equal(f.tick(16).storyScene,'02');f.director.completeLine();
 f.mission.state=JSON.parse(JSON.stringify(f.mission.state));const cue=f.tick();
 assert.equal(cue.id,'m01v2-02-l002');assert(f.director.heard('01'));
 f.finish();const saved=JSON.stringify(f.mission.state);f.mission.state=JSON.parse(saved);f.tick();assert(f.director.heard('02'));
}
// Slow discovery receives the original complete payoff after both introductory exchanges.
{
 const f=fixture();f.finish();f.mission.state.artifactKeys.push('flamethrower');f.tick();f.finish();
 assert.equal(f.tick(2).storyScene,'15');f.finish();f.mission.state.research.flamethrower=true;
 assert.equal(f.tick().storyScene,'16');f.finish();assert.equal(f.tick(),null);
}
// Optional events never invent a lab accident, garden, or food. Victory is independent of speech.
{
 const f=fixture();f.finish();f.tick(90);assert.equal(f.director.data.active,null);
 f.mission.state.status='victory';assert.equal(f.tick().storyScene,'25');assert.equal(f.mission.state.status,'victory');f.finish();
 assert.equal(f.tick(9).storyScene,'26');f.finish();assert.equal(f.tick(6).storyScene,'27');f.finish();
 assert.equal(f.tick().storyScene,'28');f.finish();assert.equal(f.tick(21).storyScene,'29');f.finish();
 assert.equal(f.tick(26).storyScene,'d04');f.finish();assert.equal(f.tick(60),null);
 assert(!f.director.data.scenes.d01);assert(!f.director.data.scenes.d02);assert(!f.director.data.scenes['24']);
}
// Separate prologue does not mark the mission opening as heard or advance gameplay.
{
 const f=fixture();f.director.startPrologue();
 for(const id of ['p01','p02','p03']){assert.equal(f.tick().storyScene,id);f.finish();}
 assert(f.director.prologueDone);f.director.stopPrologue();assert.equal(f.tick().storyScene,'01');
}
// The left task list appears after the spoken assignment, and removes completed work.
{
 const f=fixture();assert.deepEqual(storyObjectives(f.mission),[]);
 f.director.completeLine();f.director.completeLine();assert.deepEqual(storyObjectives(f.mission),[]);
 f.finish();assert.deepEqual(storyObjectives(f.mission).map(t=>t.id),['generator']);
 f.building('generator');assert.deepEqual(storyObjectives(f.mission).map(t=>t.id),['power']);
 f.mission.state.powered=true;assert.deepEqual(storyObjectives(f.mission).map(t=>t.id),['factory']);
 f.building('factory');assert.deepEqual(storyObjectives(f.mission).map(t=>t.id),['lab']);
 const saved=JSON.parse(JSON.stringify(f.mission.state));f.mission.state=saved;assert.deepEqual(storyObjectives(f.mission).map(t=>t.id),['lab']);
 f.mission.state.status='victory';assert.deepEqual(storyObjectives(f.mission),[]);
 const muted=fixture();assert.equal(storyObjectives(muted.mission,{radioEnabled:false})[0].id,'generator');
}
{
 const f=fixture();f.mission.state.storyConstruction={enabled:true,unlocked:['generator']};
 assert(constructionUnlocked(f.mission.state,'generator'));assert(!constructionUnlocked(f.mission.state,'factory'));assert(!constructionUnlocked(f.mission.state,'derrick'));
 f.finish();assert.deepEqual(storyObjectives(f.mission).map(t=>t.id),['generator']);
 f.building('generator');assert.equal(f.tick().id,'m01v2-03-l001');
 for(let line=0;line<3;line++){f.director.completeLine();f.tick();assert(!constructionUnlocked(f.mission.state,'factory'));}
 assert.deepEqual(storyObjectives(f.mission),[]);
 f.director.completeLine();f.tick();assert(constructionUnlocked(f.mission.state,'factory'));
 assert.deepEqual(storyObjectives(f.mission).map(t=>t.id),['factory']);
 assert(!constructionUnlocked(f.mission.state,'derrick'));
 f.mission.state=JSON.parse(JSON.stringify(f.mission.state));f.tick();assert(constructionUnlocked(f.mission.state,'factory'));
}
console.log('PASS: 127 audio clips, portraits, branches, interruption, save/load, rewards, assignments and construction gates');
