import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {applyStoryEdits} from '../campaign/story-edits.js';
import {StoryDirector} from '../campaign/story-director.js';
import {makeMission} from './m02-fixture.mjs';
import {prepareM02Diagnostic} from '../campaign/mission02-diagnostic.js';
import {updateM02} from '../campaign/mission02.js';
import layout from '../assets/campaign/alpha/mission02/layout.js';

const base='assets/campaign/alpha/mission02/',read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const original=read(base+'story.json'),originalAudio=read(base+'audio.json'),edits=read(base+'reviewed-dialogue.json');
const {story,audio}=applyStoryEdits(original,originalAudio,edits),id='m02-radio-entrance';
const cues=story.scenes.find(s=>s.id===id).cues;
assert.deepEqual(cues.map(id=>story.dialogue.find(l=>l.id===id).text),[
 'Проход перекрыт. Впереди два ДОТа.',
 'Проезд закрыт. Совет согласовал с партнёрами.',
 'А сам ваш совет что-нибудь решает?',
 'Мы всё сами решаем.',
 'А если партнёрам не понравится?',
 'Ну, совет поменяет решение.',
 'А если не поменяет?',
 'Тогда партнёры поменяют совет.',
 'Но только если согласует это решение.',
]);
assert.deepEqual(audio.clips[cues[0]],originalAudio.clips[cues[0]]);
assert(!audio.clips['m02-radio-entrance-2']);
assert(!story.dialogue.some(l=>l.id==='m02-radio-entrance-2'));
const draft=read('docs/campaign/dialogue-drafts/alpha-m02/draft.json').document;
assert.deepEqual(draft.scenes.find(s=>s.id===id).cues,cues);
for(const cue of cues){
 assert.equal(draft.lines[cue].text,story.dialogue.find(l=>l.id===cue).text);
 assert.equal(createHash('sha256').update(fs.readFileSync(base+audio.clips[cue].file)).digest('hex'),audio.clips[cue].sha256);
}
for(const variant of ['m02-radio-entrance-changed','m02-radio-entrance-clear']){
 const s=original.scenes.find(s=>s.id===variant);assert.deepEqual(story.scenes.find(s=>s.id===variant),s);
 for(const cue of s.cues){assert.deepEqual(story.dialogue.find(l=>l.id===cue),original.dialogue.find(l=>l.id===cue));assert.deepEqual(audio.clips[cue],originalAudio.clips[cue]);}
}
const seed=prepareM02Diagnostic(makeMission());seed.visible.fill(0);seed.state.m02.entranceSeen=false;seed.state.m02.nextCheckAt=seed.state.time;
updateM02(seed);assert(!seed.state.m02.entranceSeen,'No guard conversation before approaching or seeing the passage');
const point=seed.field.gridToWorld(layout.entranceGrid),unit=seed.state.units.find(u=>u.owner==='rai');
Object.assign(unit,{x:point.x-250,y:point.y});seed.state.time+=1;updateM02(seed);
assert(seed.state.m02.entranceSeen,'Actual M02 observation detects the approaching unit');
const script={...story,dialogue:story.dialogue.map(l=>({...l,clip:audio.clips[l.id]}))};
function fixture(bunkers=2){
 const mission={state:structuredClone(seed.state)};
 mission.entity=id=>[...mission.state.units,...mission.state.buildings].find(e=>e.id===id&&e.hp>0);
 for(const id of mission.state.m02.entranceIds.slice(bunkers,2))mission.entity(id).hp=0;
 const director=new StoryDirector(script);director.bind(mission);
 for(const s of script.scenes)if(!['m02-radio-entrance','m02-radio-entrance-changed','m02-radio-entrance-clear'].includes(s.id))director.record(s.id).status='done';
 let now=0;const tick=(seconds=0)=>{let result;do{const step=Math.min(1,seconds);now+=step*1000;mission.state.time+=step;seconds-=step;result=director.update(mission,now);}while(seconds>0);return result;};
 return {mission,director,tick};
}
{
 const f=fixture(),before=structuredClone(f.mission.state.units),played=[];
 for(const cue of cues){const line=f.tick();assert.equal(line?.id,cue);played.push(line.id);f.director.completeLine();}
 assert(f.director.heard(id));assert.equal(f.tick(5),null);assert.deepEqual(f.mission.state.units,before,'Dialogue does not issue attack or stop orders');
}
for(const count of [0,1]){
 const f=fixture(count);assert.equal(f.tick()?.storyScene,count?'m02-radio-entrance-changed':'m02-radio-entrance-clear');
 assert(!f.director.data.scenes[id]||f.director.record(id).status==='cancelled');
}
for(const count of [0,1]){
 const f=fixture();assert.equal(f.tick()?.id,cues[0]);f.director.completeLine();assert.equal(f.tick()?.id,cues[1]);
 for(const target of f.mission.state.m02.entranceIds.slice(count,2))f.mission.entity(target).hp=0;
 assert.notEqual(f.tick()?.storyScene,id,'No dead guard continues talking');
 assert.equal(f.director.record(id).status,'cancelled');
 assert.equal(f.tick(2)?.storyScene,count?'m02-radio-entrance-changed':'m02-radio-entrance-clear','Updated report is not held behind remaining conversation');
}
{
 const f=fixture();assert(f.tick());f.director.completeLine();assert.equal(f.tick()?.id,cues[1]);f.director.completeLine();
 f.mission.state=structuredClone(f.mission.state);f.director.bind(f.mission);assert.equal(f.tick()?.id,cues[2],'Saved conversation resumes at the next line');
 f.mission.state.status='victory';assert.notEqual(f.tick()?.storyScene,id);
}
console.log('PASS: nine-line entrance, reused scout, existing enemy cast, actual approach trigger, 2/1/0 live bunkers, guard loss during dialogue, save/load and unchanged vehicle orders');
