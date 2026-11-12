// Review text first, then build one immutable paid batch under the owner's 10k limit.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {realize} from '../campaign/radio/conditions.js';
const folder='tools/.runtime-media/elevenlabs-radio-language',planFile=folder+'/plan.json';
if(fs.existsSync(planFile))throw Error('Plan exists. Reuse it; do not regenerate paid requests.');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const hash=s=>createHash('sha256').update(s).digest('hex');
const library=read('assets/radio/situations_catalog.json'),bank=read('assets/radio/recorded-speech.json');
const oldReport=read('docs/campaign/radio-voice-bank-10k.json'),proposal=read('docs/campaign/alpha/voice/finale-language-pass.json');
const cast=read('docs/campaign/alpha/voice/elevenlabs-m01-completion.json').voices;
cast.general={id:'rQOBu7YxCDxGiFdTm28w',name:'Artem Lebedev - Captivating and Engaging'};
const draft=read('docs/campaign/dialogue-drafts/alpha-m01/draft.json');
const lines=new Map(),selected=[],profiles=bank.profiles;
for(const scene of proposal.scenes)for(const [i,[speaker,text]] of scene.lines.entries()){
 const voice=cast[speaker];if(!voice)throw Error('Unassigned role '+speaker);
 const id='m01-v4-'+scene.id+'-l'+String(i+1).padStart(3,'0');
 lines.set(id,{id,kind:'story',scene:scene.id,speaker,profile:'story-'+speaker,text,spokenText:text,
  voiceId:voice.id,voiceName:voice.name,modelId:'eleven_v4',estimatedCredits:[...text].length});
}
const candidates=[],seen=new Set(),activeKeys=new Set();
for(const rule of library.rules.filter(r=>r.enabled&&r.support==='wired'))for(const tier of rule.tiers)for(const graph of tier.graphs){
 const phrases=graph.nodes.map(n=>library.phrases[n.phraseId]);
 const fields=phrases.flatMap(p=>[...p.text.matchAll(/\{([^}:]+)(?::[^}]+)?\}/g)].map(m=>m[1]));
 if(fields.some(k=>!['killedCrewCount','destroyedVehicleCount'].includes(k)))continue;
 for(const count of fields.length?[1,2,3,5]:[null]){
  const premium=!!(graph.humor||graph.remembrance||rule.priority>=78||rule.id==='damage.panic_failed'||phrases.some(p=>p.emotion==='urgent'));
  const rows=[];
  for(const phrase of phrases)for(const voice of profiles){
   if(phrase.speakerGender&&phrase.speakerGender!==voice.gender||phrase.voiceId&&phrase.voiceId!==voice.profile)continue;
   const template=voice.gender==='f'&&(!phrase.femaleTextBase||phrase.femaleTextBase===phrase.text)?phrase.femaleText??phrase.text:phrase.text;
   const text=realize(template,{killedCrewCount:count,destroyedVehicleCount:count},library.dictionaries);
   if(!text||/[{}]/.test(text))throw Error('Unresolved '+phrase.id);
   activeKeys.add(voice.profile+'\0'+text);
   const old=bank.clips[voice.profile]?.[text];
   if(old&&old.voiceId!==voice.voiceId)throw Error('Crew voice changed');
   if(old)continue;
   const id='review-'+hash(voice.profile+'\0'+text).slice(0,20);
   const direction=phrase.emotion==='urgent'?'[urgent, strained voice] ':graph.remembrance||rule.id==='damage.panic_failed'?'[somber] ':graph.humor?'[dry] ':phrase.emotion==='relieved'&&premium?'[relieved, excited voice] ':'';
   const spokenText=direction+text;
   rows.push({id,kind:'radio',...voice,text,spokenText,modelId:premium?'eleven_v4':'eleven_flash_v2_5',
    phraseId:phrase.id,estimatedCredits:Math.ceil([...spokenText].length*(premium?1:.5))});
  }
  const signature=rows.map(r=>r.id).sort().join('|');
  const previous=oldReport.exchanges.some(e=>e.id===graph.id&&e.count===count);
  if(!rows.length)continue;
  if(seen.has(signature)&&!previous)continue;seen.add(signature);
  candidates.push({id:graph.id,count,rule:rule.id,tier:tier.id,priority:rule.priority,
   humor:!!graph.humor,remembrance:!!graph.remembrance,previous,rows});
 }
}
const total=()=>[...lines.values()].reduce((n,l)=>n+l.estimatedCredits,0);
function add(c){
 const next=new Map(lines);
 for(const row of c.rows)if(!next.has(row.id)||next.get(row.id).estimatedCredits<row.estimatedCredits)next.set(row.id,row);
 if([...next.values()].reduce((n,l)=>n+l.estimatedCredits,0)>9900)return false;
 lines.clear();for(const [k,v] of next)lines.set(k,v);selected.push(c);return true;
}
// Restore changed recordings before increasing variety; never pay again for identical voice+text.
for(const c of candidates.filter(c=>c.previous))if(!add(c))throw Error('Restoring existing coverage exceeds budget');
const mandatory=total();
// One complete exchange for each newly connected incident; then more back-and-forth in priority order.
const tiers=new Set(selected.map(c=>c.rule+'|'+c.tier));
const pool=candidates.filter(c=>!c.previous).sort((a,b)=>
 Number(!a.rule.includes('panic')&&!a.rule.includes('retreat_contact'))-Number(!b.rule.includes('panic')&&!b.rule.includes('retreat_contact'))||
 Number(!a.remembrance)-Number(!b.remembrance)||b.priority-a.priority||a.rows.reduce((n,r)=>n+r.estimatedCredits,0)-b.rows.reduce((n,r)=>n+r.estimatedCredits,0));
for(const c of pool)if(!tiers.has(c.rule+'|'+c.tier)&&add(c))tiers.add(c.rule+'|'+c.tier);
// Diversify events round-robin, so a single noisy event cannot consume the entire voice budget.
const groups=new Map();for(const c of pool.filter(c=>!selected.includes(c))){if(!groups.has(c.rule))groups.set(c.rule,[]);groups.get(c.rule).push(c);}
let pending=true;while(pending){pending=false;for(const list of groups.values())if(list.length){pending=true;add(list.shift());}}
const retainedClips={};let retained=0,retired=0;
for(const [voice,clips] of Object.entries(bank.clips)){
 retainedClips[voice]={};for(const [text,clip] of Object.entries(clips)){
  if(activeKeys.has(voice+'\0'+text)){retainedClips[voice][text]=clip;retained++;}else retired++;
 }
}
const sourceFiles=['assets/radio/situations_catalog.json','assets/radio/recorded-speech.json',
 'assets/campaign/alpha/mission01/story-v2.json','assets/campaign/alpha/mission01/audio-v2.json',
 'assets/campaign/alpha/mission01/reviewed-dialogue.json','docs/campaign/dialogue-drafts/alpha-m01/draft.json',
 'docs/campaign/alpha/voice/finale-language-pass.json'];
const plan={schemaVersion:1,budgetCredits:10000,estimatedCredits:total(),voiceSettings:{stability:.5,similarityBoost:.75},
 draftRevision:draft.revision,sourceHashes:Object.fromEntries(sourceFiles.map(p=>[p,hash(fs.readFileSync(p))])),
 profiles:[...profiles,...[...new Set([...lines.values()].filter(l=>l.kind==='story').map(l=>l.speaker))].map(role=>({profile:'story-'+role,voiceId:cast[role].id,voiceName:cast[role].name}))],
 radioProfiles:profiles,retainedClips,retiredRecordings:retired,lines:[...lines.values()],
 scenes:proposal.scenes.map(s=>({id:s.id,title:s.title,cues:[...lines.values()].filter(l=>l.scene===s.id).map(l=>l.id)})),
 exchanges:selected.map(({rows,...c})=>({...c,recordingIds:[...new Set(rows.map(r=>r.id))]}))};
fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(planFile,JSON.stringify(plan,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({credits:plan.estimatedCredits,budget:plan.budgetCredits,mandatoryCredits:mandatory,
 storyLines:plan.lines.filter(l=>l.kind==='story').length,radioRecordings:plan.lines.filter(l=>l.kind==='radio').length,
 newRadioTexts:new Set(plan.lines.filter(l=>l.kind==='radio').map(l=>l.text)).size,retained,retired,exchanges:selected.length}));
