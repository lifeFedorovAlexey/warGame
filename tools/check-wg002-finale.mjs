import assert from 'node:assert/strict';
import fs from 'node:fs';
import {StoryDirector} from '../campaign/story-director.js';
import {applyStoryEdits} from '../campaign/story-edits.js';
import {appendM02Story} from '../campaign/mission02-radio.js';
import {prepareM02Diagnostic} from '../campaign/mission02-diagnostic.js';
import {makeMission} from './m02-fixture.mjs';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const base='assets/campaign/alpha/';
const story=appendM02Story(applyStoryEdits(read(base+'mission01/story-v2.json'),read(base+'mission01/audio-v2.json'),read(base+'mission01/reviewed-dialogue.json')).story,
 applyStoryEdits(read(base+'mission02/story.json'),read(base+'mission02/audio.json'),read(base+'mission02/reviewed-dialogue.json')).story);
const report=[];
for(const name of ['m01','m02']){
 const m=name==='m02'?prepareM02Diagnostic(makeMission()):makeMission();
 const director=new StoryDirector(story),data=director.bind(m);
 const final=name==='m01'?['r48','r49','r50']:['m02-radio-victory'];
 for(const scene of story.scenes)if(!final.includes(scene.id))data.scenes[scene.id]={status:'done',cursor:scene.cues.length,endedAt:-30000};
 m.state.storyConstruction={enabled:false};
 m.state.status='victory';m.state.projectiles=[{id:'shell-in-flight-when-last-target-died'}];
 m.state.buildings=m.state.buildings.filter(b=>b.owner==='rai');
 for(const c of m.state.camps)c.cleared=true;
 m.state.flags.raidWon=true;m.effects=[];
 const seen=[];
 for(let now=0;now<=90000;now+=1000){
  director.update(m,now);
  if(data.active){seen.push(data.active);while(data.active)director.completeLine();}
 }
 const row={mission:name,expected:final,seen,quiet:data.clock-data.lastCombat,remainingProjectiles:m.state.projectiles.length};report.push(row);
 console.log(JSON.stringify(row));
 if(!process.argv.includes('--baseline'))assert.deepEqual(seen,final,'Frozen projectiles must not block the victory dialogue');
 // Running combat must still keep lower-priority conversations out of combat.
 m.state.status='running';director.update(m,91000);if(name==='m01')assert.equal(data.clock-data.lastCombat,0);
}
fs.mkdirSync('campaign/previews/wg002-wg030',{recursive:true});
fs.writeFileSync('campaign/previews/wg002-wg030/'+(process.argv.includes('--baseline')?'before-story':'after-story')+'.json',JSON.stringify(report,null,2));
