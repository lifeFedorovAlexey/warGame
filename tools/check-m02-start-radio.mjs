import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {applyStoryEdits} from '../campaign/story-edits.js';
import {StoryDirector} from '../campaign/story-director.js';
import {makeMission} from './m02-fixture.mjs';

const base='assets/campaign/alpha/mission02/',read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const original=read(base+'story.json'),originalAudio=read(base+'audio.json'),edits=read(base+'reviewed-dialogue.json');
const {story,audio}=applyStoryEdits(original,originalAudio,edits),id='m02-radio-start';
const cues=story.scenes.find(s=>s.id===id).cues;
assert.deepEqual(cues.map(id=>story.dialogue.find(l=>l.id===id).text),[
 'Альфа, источник сигнала к югу. Координаты передаю.',
 'Товарищ генерал, у вас в отчёте станцию уже взяли.',
 'Не взяли. Я «не взяли» писал. Автозамена эта…',
 'Может, исправление отправить?',
 'Да там уже фотки посмотрели, дальше переслали. Езжайте пока. Потом разберёмся.',
 'Базу прикрыть. Основной группе — на выезд.',
]);
const draft=read('docs/campaign/dialogue-drafts/alpha-m02/draft.json').document;
assert.deepEqual(draft.scenes.find(s=>s.id===id).cues,cues);
assert.equal(story.speakers.general.name,'Генерал');
for(const cue of cues){
 assert.equal(draft.lines[cue].text,story.dialogue.find(l=>l.id===cue).text);
 assert.equal(createHash('sha256').update(fs.readFileSync(base+audio.clips[cue].file)).digest('hex'),audio.clips[cue].sha256);
}
assert.equal(audio.clips[cues[0]].sha256,'84d48f6554e6f96960c97427611631ffcbfb21c75a565ddec8933d1ba8202411');
assert.equal(audio.clips[cues.at(-1)].sha256,'bafddb0be0d69e91f923b0c3f9e28d67e417d5a8b74e24b8e9d278f9206b2124');
const editedScenes=new Set(edits.scenes.map(s=>s.id));
for(const s of original.scenes.filter(s=>!editedScenes.has(s.id))){
 assert.deepEqual(story.scenes.find(scene=>scene.id===s.id),s);
 for(const cue of s.cues){assert.deepEqual(story.dialogue.find(l=>l.id===cue),original.dialogue.find(l=>l.id===cue));assert.deepEqual(audio.clips[cue],originalAudio.clips[cue]);}
}
assert.deepEqual(applyStoryEdits(story,audio,edits),{story,audio});
const script={...story,dialogue:story.dialogue.map(l=>({...l,clip:audio.clips[l.id]}))};
const seed=makeMission();seed.state.status='victory';assert(seed.enterM02().ok);
function fixture(elapsed=0){
 const mission={state:structuredClone(seed.state)};
 mission.entity=id=>[...mission.state.units,...mission.state.buildings].find(e=>e.id===id&&e.hp>0);
 mission.state.time=mission.state.m02.startedAt+elapsed;
 const director=new StoryDirector(script);director.bind(mission);let now=0;
 const tick=(seconds=0,enabled=true)=>{let result;do{const step=Math.min(1,seconds);now+=step*1000;mission.state.time+=step;seconds-=step;result=director.update(mission,now,{enabled});}while(seconds>0);return result;};
 const finish=()=>{const scene=director.data.active;assert(scene);while(director.data.active===scene)director.completeLine();};
 const reload=()=>{mission.state=structuredClone(mission.state);director.bind(mission);};
 return {mission,director,tick,finish,reload};
}
// Normal entry plays each of the six lines once without changing vehicle orders.
{
 const f=fixture(),before=structuredClone(f.mission.state.units),played=[];
 for(const cue of cues){played.push(f.tick()?.id);assert.equal(played.at(-1),cue);f.director.completeLine();}
 assert(f.director.heard(id));assert.equal(f.tick(10),null);assert.deepEqual(f.mission.state.units,before);
}
// A briefing that never began still expires after ninety seconds, including combat.
for(const combat of [false,true]){
 const f=fixture(90);
 if(combat)f.director.note({type:'unit-damaged'},f.mission);
 assert.equal(f.tick(4),null);assert(!f.director.heard(id));assert(!f.director.data.scenes[id]);
}
// Starting late, battle and a save must not interrupt, lose or rewind lines.
{
 const f=fixture(89),played=[];
 for(const cue of cues){
  assert.equal(f.tick()?.id,cue);played.push(cue);
  f.director.note({type:'unit-damaged'},f.mission);
  assert.equal(f.tick(2)?.id,cue,'A hit does not cut a playing line');
  f.director.completeLine();
  if(cue!==cues.at(-1)){
   assert.equal(f.director.data.active,id,'Story keeps the channel at the line boundary');
   const cursor=f.director.record(id).cursor;
   f.reload();assert.equal(f.director.record(id).cursor,cursor);
   assert.equal(f.tick()?.id,cues[cursor],'Resume the next line immediately, even beyond the old deadline');
  }
 }
 assert.deepEqual(played,cues);assert(f.director.heard(id));assert(f.mission.state.time-f.mission.state.m02.startedAt>90);
}
// A newly seen contact waits for the started story exchange to finish.
{
 const f=fixture(89);assert.equal(f.tick()?.id,cues[0]);
 f.director.note({type:'unit-damaged'},f.mission);f.mission.state.m02.entranceSeen=true;
 assert.equal(f.tick()?.id,cues[0]);f.director.completeLine();
 assert.equal(f.tick()?.id,cues[1]);f.finish();
 assert.equal(f.tick(2)?.storyScene,'m02-radio-entrance');
}
// Explicit radio-off/save pauses still preserve the current line.
{
 const f=fixture(89);assert(f.tick());f.director.completeLine();assert.equal(f.tick()?.id,cues[1]);
 f.tick(10,false);f.reload();assert.equal(f.tick()?.id,cues[1],'Radio off/load resumes only the interrupted line');
 f.mission.state.status='victory';assert.notEqual(f.tick()?.storyScene,id);assert.equal(f.director.record(id).status,'cancelled');
}
console.log('PASS: M02 six-line opening, exact approved text, reused recordings, late-start expiry, uninterrupted combat playback, saved cursor, queued contact, mission completion and unchanged orders');
