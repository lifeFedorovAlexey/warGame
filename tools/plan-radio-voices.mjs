// Build a bounded set of whole exchanges in all six stable crew voices.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {realize} from '../campaign/radio/conditions.js';
const work='tools/.runtime-media/elevenlabs-radio-10k',planFile=work+'/plan.json';
if(fs.existsSync(planFile))throw Error('A plan already exists; reuse it to avoid duplicate charges');
const library=JSON.parse(fs.readFileSync('assets/radio/situations_catalog.json','utf8'));
const profiles=[
 ['voice-1','m','JKtNvDNrWu33P1xzttP2','Ivan - Energetic and Sassy'],
 ['voice-2','m','6YjFofyVXU1ASguf2hTJ','Maxim - Conversational & Natural'],
 ['voice-3','f','GN4wbsbejSnGSa1AzjH5','Ekaterina - Soft, Silky and Tender'],
 ['voice-4','m','txnCCHHGKmYIwrn7HfHQ','Alexandr Vlasov - Vibrant and Energetic'],
 ['voice-6','m','RLRdvNFwJJct2XZOgfzy','Mishka Yaponcik - Odessa Rogue Charm'],
].map(([profile,gender,voiceId,voiceName])=>({profile,gender,voiceId,voiceName}));
const hash=x=>createHash('sha256').update(x).digest('hex');
const candidates=[],seen=new Set();
for(const rule of library.rules.filter(r=>r.enabled&&r.support==='wired'))for(const tier of rule.tiers)for(const graph of tier.graphs){
 const phrases=graph.nodes.map(n=>library.phrases[n.phraseId]);
 const fields=phrases.flatMap(p=>[...p.text.matchAll(/\{([^}:]+)(?::[^}]+)?\}/g)].map(m=>m[1]));
 if(fields.some(k=>!['killedCrewCount','destroyedVehicleCount'].includes(k)))continue;
 for(const count of fields.length?[1,2,3,5]:[null]){
  const premium=!!(graph.bawdy||graph.remembrance||rule.priority>=78),modelId=premium?'eleven_v4':'eleven_flash_v2_5';
  const rows=[];
  for(const phrase of phrases)for(const voice of profiles){
   if(phrase.speakerGender&&phrase.speakerGender!==voice.gender)continue;
   if(phrase.voiceId&&phrase.voiceId!==voice.profile)continue;
   const template=voice.gender==='f'&&(!phrase.femaleTextBase||phrase.femaleTextBase===phrase.text)?phrase.femaleText??phrase.text:phrase.text;
   const text=realize(template,{killedCrewCount:count,destroyedVehicleCount:count},library.dictionaries);
   if(!text||/[{}]/.test(text))throw Error('Unresolved text: '+phrase.id);
   const id='radio-'+hash(voice.profile+'\0'+text).slice(0,20);
   const spokenText=(graph.remembrance?'[somber] ':graph.bawdy?'[dry] ':'')+text;
   rows.push({id,...voice,text,spokenText,modelId,phraseId:phrase.id,
    estimatedCredits:Math.ceil([...spokenText].length*(premium?1:.5))});
  }
  const signature=rows.map(r=>r.id+':'+r.modelId).join('|');if(seen.has(signature))continue;seen.add(signature);
  candidates.push({id:graph.id,count,rule:rule.id,tier:tier.id,priority:rule.priority,bawdy:!!graph.bawdy,remembrance:!!graph.remembrance,rows});
 }
}
const selected=[],lines=new Map();let cost=0;
const limit=9500;
function add(candidate){
 const next=new Map(lines);
 for(const row of candidate.rows){const old=next.get(row.id);if(!old||row.estimatedCredits>old.estimatedCredits)next.set(row.id,row);}
 const total=[...next.values()].reduce((n,r)=>n+r.estimatedCredits,0);
 if(total>limit)return false;
 lines.clear();for(const [k,v] of next)lines.set(k,v);cost=total;selected.push(candidate);return true;
}
// Rare grief and a varied selection of bawdy back-and-forth get expressive v4.
for(const c of candidates.filter(c=>c.remembrance))add(c);
for(const suffix of ['bawdy-v1','bawdy-v2','bawdy-v5','bawdy-v6','bawdy-v9','bawdy-v13']){
 const c=candidates.find(c=>c.rule==='idle.quiet'&&c.id.endsWith(suffix));if(c)add(c);
}
for(const rule of ['repair.start_factory','command.move']){
 const c=candidates.find(c=>c.rule===rule&&c.bawdy);if(c)add(c);
}
// Cover connected events first; use short complete graphs, never cut a reply.
const rules=[...new Set(candidates.map(c=>c.rule))].sort((a,b)=>Math.max(...candidates.filter(c=>c.rule===b).map(c=>c.priority))-Math.max(...candidates.filter(c=>c.rule===a).map(c=>c.priority)));
for(const rule of rules){
 const pool=candidates.filter(c=>c.rule===rule&&!c.bawdy&&!c.remembrance);
 pool.sort((a,b)=>a.rows.reduce((s,r)=>s+r.estimatedCredits,0)-b.rows.reduce((s,r)=>s+r.estimatedCredits,0));
 if(pool.length)add(pool[0]);
}
// Fill remaining budget across tiers and report variants, favouring important events.
const covered=new Set(selected.map(c=>c.rule+'|'+c.tier));
for(const c of candidates.filter(c=>!selected.includes(c)&&!c.bawdy&&!c.remembrance)
 .sort((a,b)=>(covered.has(a.rule+'|'+a.tier)?1:0)-(covered.has(b.rule+'|'+b.tier)?1:0)||b.priority-a.priority||a.rows.reduce((s,r)=>s+r.estimatedCredits,0)-b.rows.reduce((s,r)=>s+r.estimatedCredits,0))){
 if(add(c))covered.add(c.rule+'|'+c.tier);
}
const plan={schemaVersion:1,budgetCredits:10000,estimatedCredits:cost,voiceSettings:{stability:.5,similarityBoost:.75},
 profiles,sourceSha256:hash(fs.readFileSync('assets/radio/situations_catalog.json')),lines:[...lines.values()],
 exchanges:selected.map(({rows,...c})=>({...c,recordingIds:[...new Set(rows.map(r=>r.id))]}))};
fs.mkdirSync(work,{recursive:true});fs.writeFileSync(planFile,JSON.stringify(plan,null,2)+'\n');
console.log(JSON.stringify({recordings:plan.lines.length,credits:cost,texts:new Set(plan.lines.map(l=>l.text)).size,
 exchanges:plan.exchanges.length,rules:new Set(plan.exchanges.map(e=>e.rule)).size,
 models:Object.fromEntries(['eleven_v4','eleven_flash_v2_5'].map(m=>[m,plan.lines.filter(l=>l.modelId===m).length])),
 missingRules:library.rules.filter(r=>r.enabled&&r.support==='wired'&&!selected.some(c=>c.rule===r.id)).map(r=>r.id)}));
