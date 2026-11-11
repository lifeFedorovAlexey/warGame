import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {installRecordedSpeech,radioClip,recordedRadioClip} from '../campaign/radio/audio.js';
import {renderRadioLine} from '../campaign/radio/wording.js';
import {simulateRadio} from '../campaign/radio/simulator.js';
const bank=JSON.parse(fs.readFileSync('assets/radio/recorded-speech.json','utf8'));
const library=JSON.parse(fs.readFileSync('assets/radio/situations_catalog.json','utf8'));
const report=JSON.parse(fs.readFileSync('docs/campaign/radio-voice-bank-10k.json','utf8'));
installRecordedSpeech(bank);
assert(bank.reservedCredits<=bank.budgetCredits&&bank.budgetCredits<=10000);
assert.equal(bank.profiles.length,6);assert.equal(bank.profiles.filter(p=>p.gender==='f').length,2);
let count=0;
for(const [voice,clips] of Object.entries(bank.clips))for(const [text,clip] of Object.entries(clips)){
 count++;assert.equal(clip.voice,voice);assert.equal(clip.text,text);assert.equal(clip.origin,'elevenlabs-synthesis');
 assert.equal(createHash('sha256').update(fs.readFileSync(clip.file)).digest('hex'),clip.sha256);
 assert(clip.duration>.15&&clip.leadingSilence<clip.duration&&clip.trailingSilence<clip.duration);
 assert.equal(radioClip({source:'tts',text},text,library.settings,voice).file,clip.file);
 assert.equal(radioClip({source:'text',text},text,library.settings,voice),null);
 const owned={source:'recording',text,audio:{file:'owner.mp3',text}};
 assert.equal(radioClip(owned,text,library.settings,voice).file,'owner.mp3');
}
assert.equal(count,548);assert.equal(count,report.recordings);
const text='Помолчать бы сейчас.',files=new Set();
for(const p of bank.profiles){
 const clip=recordedRadioClip(p.profile,text);assert(clip);files.add(clip.file);
 const speaker={crewId:'speaker',callSign:'Кедр',name:'Алексей',gender:p.gender,voiceId:p.profile};
 const rendered=renderRadioLine({text,source:'tts'}, {}, library.dictionaries,speaker,null,{opening:true});
 assert.equal(rendered.text,text);assert.equal(rendered.callSign,'Кедр');assert.equal(rendered.speakerName,'Алексей');
}
assert.equal(files.size,6,'Same line retains six different stable crew voices');
const changed=radioClip({source:'tts',text},text+' Ещё одна фраза.',library.settings,'voice-1');
assert.equal(changed.origin,'temporary-synthesis');
const absentCount='Потеряли девяносто девять машин.';
assert.equal(recordedRadioClip('voice-1',absentCount),null);
assert.equal(new URL(radioClip({source:'tts'},absentCount,library.settings,'voice-1').file,'http://local').searchParams.get('text'),absentCount);
const checks=[];
for(const type of ['command.move','command.retreat','damage.hit','combat.base_attack','repair.complete','idle.quiet','idle.crew_history']){
 const result=simulateRadio(library,{type,count:['command.move','command.retreat','repair.complete'].includes(type)?1:3,losses:type==='idle.crew_history'?3:0,killed:type==='idle.crew_history'?3:0,tone:type==='idle.quiet'?'dry':'plain',seed:'recorded-check'});
 assert(result.lines.length,type);assert(result.lines.every(l=>l.clip?.origin==='elevenlabs-synthesis'),type);
 checks.push({type,lines:result.lines.map(l=>({text:l.text,voice:l.clip.voice,origin:l.clip.origin}))});
}
// More specific actual enemy composition must win over a generic recorded line.
const intel=simulateRadio(library,{type:'recon.enemy_first_seen',count:3,enemyPreset:'mixed'});
assert(intel.lines.some(l=>/пикап|грузовик/.test(l.text)));
installRecordedSpeech(null);
console.log(JSON.stringify({recordings:count,budget:bank.budgetCredits,reserved:bank.reservedCredits,checks},null,2));
