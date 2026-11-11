// Offline asset generation only. The browser/game never receives the API key.
import {ElevenLabsClient} from '@elevenlabs/elevenlabs-js';
import {loadEnvFile} from 'node:process';
import {homedir} from 'node:os';
import path from 'node:path';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

export function createSpeechClient() {
  if(!process.env.ELEVENLABS_API_KEY)loadEnvFile(process.env.ELEVENLABS_ENV_FILE||path.join(homedir(),'AppData','Local','warGame','elevenlabs.env'));
  if(!process.env.ELEVENLABS_API_KEY)throw new Error('ELEVENLABS_API_KEY is not configured');
  return new ElevenLabsClient();
}

const digest=data=>createHash('sha256').update(data).digest('hex');
export async function renderPlan(planPath,{only}={}) {
  const plan=JSON.parse(await readFile(planPath,'utf8'));
  const folder=path.join(path.dirname(planPath),'renders');await mkdir(folder,{recursive:true});
  const client=createSpeechClient();
  const voices=(await client.voices.getAll()).voices;
  const models=await client.models.list();
  if(!models.some(model=>model.modelId===plan.modelId&&model.canDoTextToSpeech))throw new Error('Model unavailable: '+plan.modelId);
  for(const line of plan.lines) {
    const voice=voices.find(voice=>voice.voiceId===line.voiceId);
    if(!voice||voice.name!==line.voiceName)throw new Error('Voice identity changed for '+line.id);
  }
  let generated=0,cached=0;
  for(const line of plan.lines.filter(line=>!only||line.id===only)) {
    const request={text:line.spokenText||line.text,modelId:plan.modelId,languageCode:'ru',outputFormat:'mp3_44100_128',voiceSettings:plan.voiceSettings};
    const requestHash=digest(JSON.stringify({voiceId:line.voiceId,...request}));
    const stem=path.join(folder,`${line.id.replace(/[^a-zA-Z0-9_-]/g,'-')}-${requestHash.slice(0,16)}`);
    const resultPath=stem+'.json',audioPath=stem+'.mp3';
    let existing;
    try {existing=JSON.parse(await readFile(resultPath,'utf8'));} catch(error) {if(error.code!=='ENOENT')throw error;}
    if(existing) {
      if(existing.requestHash!==requestHash||digest(await readFile(audioPath))!==existing.sha256)throw new Error('Cached audio changed: '+line.id);
      cached++;console.log('Cached '+line.id);continue;
    }
    // No automatic retries: a timed-out paid request must not silently charge twice.
    const stream=await client.textToSpeech.convert(line.voiceId,request,{maxRetries:0,timeoutInSeconds:120});
    const bytes=Buffer.from(await new Response(stream).arrayBuffer());
    if(bytes.length<500)throw new Error('Empty audio: '+line.id);
    await writeFile(audioPath,bytes,{flag:'wx'});
    await writeFile(resultPath,JSON.stringify({...line,modelId:plan.modelId,voiceSettings:plan.voiceSettings,requestHash,sha256:digest(bytes),bytes:bytes.length,file:audioPath,createdAt:new Date().toISOString()},null,2)+'\n',{flag:'wx'});
    generated++;console.log(`Generated ${line.id} (${bytes.length} bytes)`);
  }
  console.log(JSON.stringify({generated,cached}));
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [planPath,only]=process.argv.slice(2);
  if(!planPath)throw new Error('Usage: node tools/elevenlabs-speech.mjs PLAN.json [cue-id]');
  try {await renderPlan(path.resolve(planPath),{only});}
  catch(error) {
    const message=String(error.body?.detail?.message||error.message||error).replaceAll(process.env.ELEVENLABS_API_KEY||'__NO_KEY__','[redacted]');
    console.error(JSON.stringify({status:error.statusCode||null,error:message}));process.exitCode=1;
  }
}
