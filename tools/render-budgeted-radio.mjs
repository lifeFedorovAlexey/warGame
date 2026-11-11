import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createSpeechClient} from './elevenlabs-speech.mjs';
const folder=path.resolve('tools/.runtime-media/elevenlabs-radio-10k');
const plan=JSON.parse(fs.readFileSync(path.join(folder,'plan.json'),'utf8'));
const ledgerFile=path.join(folder,'ledger.json'),renders=path.join(folder,'renders');
fs.mkdirSync(renders,{recursive:true});
const ledger=fs.existsSync(ledgerFile)?JSON.parse(fs.readFileSync(ledgerFile,'utf8')):{budgetCredits:plan.budgetCredits,requests:{}};
const hash=data=>createHash('sha256').update(data).digest('hex');
const save=()=>{fs.writeFileSync(ledgerFile+'.tmp',JSON.stringify(ledger,null,2)+'\n');fs.renameSync(ledgerFile+'.tmp',ledgerFile);};
const reserved=()=>Object.values(ledger.requests).reduce((n,r)=>n+r.reservedCredits,0);
const client=createSpeechClient();let stop=false,index=0;
try {
 const response=await fetch('https://api.elevenlabs.io/v2/voices?page_size=100&include_custom_rates=true',{headers:{'xi-api-key':process.env.ELEVENLABS_API_KEY}});
 if(!response.ok)throw Error('Voice rate lookup failed: '+response.status);
 const voices=(await response.json()).voices,models=await client.models.list();
 for(const profile of plan.profiles){const voice=voices.find(v=>v.voice_id===profile.voiceId);
  if(!voice||voice.name!==profile.voiceName||(voice.sharing?.rate??1)>1)throw Error('Voice/rate changed: '+profile.profile);
 }
 for(const id of new Set(plan.lines.map(l=>l.modelId))){const m=models.find(m=>m.modelId===id);
  if(!m||m.modelRates?.characterCostMultiplier!==(id==='eleven_v4'?1:.5)||(m.modelRates?.costDiscountMultiplier??1)>1)throw Error('Model rate changed: '+id);
 }
 if(plan.lines.reduce((n,l)=>n+l.estimatedCredits,0)>plan.budgetCredits)throw Error('Plan exceeds budget');
 async function worker(){while(!stop&&index<plan.lines.length){
  const line=plan.lines[index++],file=path.join(renders,line.id+'.mp3'),meta=path.join(renders,line.id+'.json');
  const request={text:line.spokenText,modelId:line.modelId,languageCode:'ru',outputFormat:'mp3_44100_128',voiceSettings:plan.voiceSettings};
  const requestHash=hash(JSON.stringify({voiceId:line.voiceId,...request}));
  const old=ledger.requests[line.id];
  if(old){
   if(old.requestHash!==requestHash)throw Error('Request changed: '+line.id);
   if(old.status==='complete'&&fs.existsSync(file)&&hash(fs.readFileSync(file))===old.sha256)continue;
   throw Error('Uncertain prior paid request; do not retry automatically: '+line.id);
  }
  if(reserved()+line.estimatedCredits>plan.budgetCredits)throw Error('Credit budget reached');
  // Reserve before sending. Even a connection failure keeps its reservation.
  ledger.requests[line.id]={requestHash,reservedCredits:line.estimatedCredits,status:'started'};save();
  try {
   const {data,rawResponse}=await client.textToSpeech.convert(line.voiceId,request,{maxRetries:0,timeoutInSeconds:120}).withRawResponse();
   const bytes=Buffer.from(await new Response(data).arrayBuffer());if(bytes.length<500)throw Error('Empty audio');
   const billed=rawResponse.headers.get('x-character-count');
   const result={...line,requestHash,sha256:hash(bytes),bytes:bytes.length,file,createdAt:new Date().toISOString(),
    apiCharacterCount:billed===null?null:Number(billed),requestId:rawResponse.headers.get('request-id')};
   fs.writeFileSync(file,bytes,{flag:'wx'});fs.writeFileSync(meta,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
   Object.assign(ledger.requests[line.id],{status:'complete',sha256:result.sha256,apiCharacterCount:result.apiCharacterCount});save();
   const complete=Object.values(ledger.requests).filter(r=>r.status==='complete').length;
   if(complete%10===0||complete===plan.lines.length)console.log(JSON.stringify({complete,total:plan.lines.length,reservedCredits:reserved(),budget:plan.budgetCredits}));
  }catch(error){stop=true;ledger.requests[line.id].status='uncertain';save();throw error;}
 }}
 const results=await Promise.allSettled([worker(),worker()]);
 const failure=results.find(r=>r.status==='rejected');if(failure)throw failure.reason;
 console.log(JSON.stringify({complete:Object.keys(ledger.requests).length,reservedCredits:reserved(),budget:plan.budgetCredits}));
} catch(error){
 const message=String(error.body?.detail?.message||error.message||error).replaceAll(process.env.ELEVENLABS_API_KEY||'__NO_KEY__','[redacted]');
 console.error(JSON.stringify({status:error.statusCode||null,error:message}));process.exitCode=1;
}
