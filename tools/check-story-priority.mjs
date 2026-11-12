import assert from 'node:assert/strict';
import fs from 'node:fs';
import {StoryDirector} from '../campaign/story-director.js';
import {applyStoryEdits} from '../campaign/story-edits.js';
import {makeMission} from './m02-fixture.mjs';
import {prepareM02Diagnostic} from '../campaign/mission02-diagnostic.js';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
function script(mission){
 const base='assets/campaign/alpha/mission0'+mission+'/';
 const {story,audio}=applyStoryEdits(read(base+'story.json'),read(base+'audio.json'),read(base+'reviewed-dialogue.json'));
 return {...story,dialogue:story.dialogue.map(l=>({...l,clip:audio.clips[l.id]}))};
}
const m=prepareM02Diagnostic(makeMission());m.state.research['flamer-upgrade']=true;
const m02State=structuredClone(m.state);m.state.status='victory';assert(m.enterM03().ok);const m03State=structuredClone(m.state);
for(const [mission,state,id] of [[2,m02State,'m02-radio-flamer-ready'],[3,m03State,'m03-s01']]){
 const s=script(mission),world={state:structuredClone(state)};
 world.entity=id=>[...world.state.units,...world.state.buildings].find(e=>e.id===id&&e.hp>0);
 const director=new StoryDirector(s);director.bind(world);
 for(const scene of s.scenes)if(scene.id!==id)director.record(scene.id).status='done';
 const cues=director.scenes.get(id).cues,before=structuredClone(world.state.units);let now=0;
 for(const [cursor,cue] of cues.entries()){
  director.note({type:'unit-damaged'},world);
  const line=director.update(world,now);
  assert.equal(line?.id,cue,`M0${mission}: ready story must get the channel during combat`);
  for(let hit=0;hit<10;hit++){
   now+=200;world.state.time+=.2;director.note({type:'unit-damaged'},world);
   assert.equal(director.update(world,now)?.token,line.token,'Repeated attacks cannot stop or restart the current recording');
   assert.equal(director.record(id).cursor,cursor);
  }
  director.completeLine();
 }
 assert(director.heard(id));assert.equal(director.update(world,now+2000),null);
 assert.deepEqual(world.state.units,before,'Story priority must not stop units or issue gameplay orders');
 console.log(`PASS M0${mission}: ${cues.length} story cues complete once during continuous incoming damage`);
}
