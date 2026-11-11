import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {applyStoryEdits} from '../campaign/story-edits.js';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.env.WARGAME_URL??'http://127.0.0.1:8766',folder='campaign/previews/elevenlabs-m02';
fs.mkdirSync(folder,{recursive:true});
const read=name=>JSON.parse(fs.readFileSync('assets/campaign/alpha/mission02/'+name,'utf8'));
const {story,audio}=applyStoryEdits(read('story.json'),read('audio.json'),read('reviewed-dialogue.json'));
const completed=JSON.parse(fs.readFileSync('docs/campaign/alpha/voice/elevenlabs-m02-completion.json','utf8'));
assert.equal(completed.generatedLines,24);assert.deepEqual(completed.remainingTemporaryOrMissing,[]);
const m01=JSON.parse(fs.readFileSync('docs/campaign/alpha/voice/elevenlabs-m01-completion.json','utf8'));
for(const line of story.dialogue){
 const clip=audio.clips[line.id];assert(clip,line.id);assert.equal(clip.text,line.text);
 assert.equal(clip.origin,'elevenlabs-synthesis');assert.equal(clip.voiceId,m01.voices[line.speaker].id);
 assert.equal(createHash('sha256').update(fs.readFileSync('assets/campaign/alpha/mission02/'+clip.file)).digest('hex'),clip.sha256);
}

const report={errors:[],paidRequests:[],checks:['all active lines match the current text, immutable audio hash and established M01 character voice']};let browser;
try{
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>report.errors.push(e.stack));page.on('request',r=>{if(r.url().includes('api.elevenlabs.io'))report.paidRequests.push(r.url());});
 await page.addInitScript(()=>{
  for(const key of ['fieldSound','fieldStoryVoice','fieldRadio'])localStorage.setItem('warGame.'+key,'on');
  window.voiceChecks=[];const start=AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start=function(){const entry=window.campaign?.radio?.entry;if(entry?.dialogue&&this.buffer&&(!entry.clip?.duration||Math.abs(this.buffer.duration-entry.clip.duration)<.05)){let peak=0;for(const n of this.buffer.getChannelData(0))peak=Math.max(peak,Math.abs(n));voiceChecks.push({id:entry.id,text:entry.text,clip:entry.clip,duration:this.buffer.duration,peak,context:this.context.state});}return start.apply(this,arguments);};
 });
 await page.goto(base+'/campaign/?mission=m02');await page.waitForFunction(()=>window.campaign?.ready||document.querySelector('#loading')?.dataset.phase==='error',null,{timeout:120000});
 assert(await page.evaluate(()=>!!window.campaign?.ready),await page.locator('#loading-status').innerText());
 await page.locator('#begin').click();await page.waitForFunction(()=>campaign.state.active&&campaign.mission.state.m02,null,{timeout:120000});
 if(!await page.evaluate(()=>campaign.state.paused))await page.locator('#pause').click();
 await page.waitForFunction(()=>voiceChecks.some(v=>v.id==='m02-radio-start-2'&&v.peak>.01&&v.context==='running'),null,{timeout:45000});
 report.opening=await page.evaluate(()=>voiceChecks.filter(v=>v.id.startsWith('m02-radio-start')));
 assert(report.opening.some(v=>v.id==='m02-radio-start-1'&&v.peak>.01));assert(new Set(report.opening.map(v=>v.clip.voiceId)).size===2);
 assert(report.opening.every(v=>v.clip.origin==='elevenlabs-synthesis'));
 // Keep the naturally played subtitle visible while capturing multiple viewport sizes.
 await page.evaluate(()=>{window.savedRadioConsume=campaign.radio.consume;campaign.radio.consume=()=>{};});
 for(const [label,width,height] of [['desktop',1440,1000],['landscape',844,390],['small-landscape',667,375]]){
  assert(await page.locator('#radio').isVisible());
  await page.setViewportSize({width,height});await page.screenshot({path:folder+'/m02-voice-'+label+'.png'});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }
 await page.evaluate(()=>{campaign.radio.consume=window.savedRadioConsume;delete window.savedRadioConsume;});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 report.decoded=await page.evaluate(async()=>{
  const manifest=await (await fetch('/assets/campaign/alpha/mission02/audio.json')).json(),ctx=new AudioContext(),results=[];
  for(const [id,clip] of Object.entries(manifest.clips)){
   const response=await fetch('/assets/campaign/alpha/mission02/'+clip.file);if(!response.ok)throw Error(id+' '+response.status);
   const buffer=await ctx.decodeAudioData(await response.arrayBuffer());let peak=0;for(const n of buffer.getChannelData(0))peak=Math.max(peak,Math.abs(n));
   results.push({id,duration:buffer.duration,expected:clip.duration,peak});
  }
  await ctx.close();return results;
 });
 assert.equal(report.decoded.length,24);assert(report.decoded.every(v=>v.peak>.01&&v.duration>.3&&Math.abs(v.duration-v.expected)<.05));
 report.checks.push('all 24 M02 clips decode; actual opening plays two voiced story lines');
 await page.waitForFunction(()=>!campaign.storyAudio.playing,null,{timeout:15000});
 await page.evaluate(()=>{
  const m=campaign.mission,r=campaign.radio,d=r.director;d.bind(m);for(const id of d.scenes.keys())d.data.scenes[id]={status:'done',cursor:0,endedAt:d.data.clock-20000};d.data.active=null;r.hide();
  const e=m.radioObserver.engine;e.state.queue=[];e.state.batch=[];e.pending.clear();e.active=null;
  for(const u of m.state.units.filter(u=>u.owner==='rai'&&u.hp>0)){u.task=null;u.path=[];u.pendingOrder=null;u.combatRetreat=null;u.factoryVisit=null;}
  m.state.time=m.state.m02.startedAt+120;m.radioObserver.tick();m.state.time+=1.1;m.radioObserver.tick();r.consume(m,performance.now());
 });
 await page.waitForFunction(()=>voiceChecks.some(v=>v.id.startsWith('idle.quiet.')&&v.id.endsWith('.2')&&v.peak>.01&&v.context==='running'),null,{timeout:30000});
 report.banter=await page.evaluate(()=>({played:voiceChecks.filter(v=>v.id.startsWith('idle.quiet.')),exchange:campaign.mission.radioObserver.engine.active?.lines.map(l=>l.text)}));
 assert(report.banter.exchange.length>=2);
 await page.screenshot({path:folder+'/banter-game-narrow.png'});await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:folder+'/banter-game-desktop.png'});
 report.checks.push('real M02 radio scheduler supplies an audible bawdy exchange in a quiet channel');
 await page.goto(base+'/dialogues/');await page.locator('#missions a[href="#alpha-m02"]').click();
 await page.waitForFunction(()=>document.querySelector('#missions a[href="#alpha-m02"]')?.getAttribute('aria-current')==='page');
 await page.locator('#play-scene').waitFor();assert(await page.locator('#play-scene').isEnabled());
 await page.evaluate(()=>{window.editorPlayed=[];const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){this.addEventListener('playing',()=>editorPlayed.push({src:this.currentSrc,duration:this.duration}),{once:true});return play.apply(this,arguments);};});
 await page.locator('#play-scene').click();await page.waitForFunction(()=>editorPlayed.length>=2,null,{timeout:30000});
 report.editor=await page.evaluate(()=>editorPlayed);assert(report.editor.every(v=>v.duration>.3));
 assert(report.editor.every(v=>v.src.includes('/mission02/recordings/elevenlabs/')));
 for(const [label,width,height] of [['desktop',1440,1000],['landscape',844,390],['small-landscape',667,375]]){
  await page.setViewportSize({width,height});await page.screenshot({path:folder+'/m02-dialogues-'+label+'.png',fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 report.checks.push('M02 workshop plays both recorded opening voices; no paid API calls during gameplay');assert.deepEqual(report.errors,[]);assert.deepEqual(report.paidRequests,[]);
 console.log(JSON.stringify({checks:report.checks,decoded:report.decoded.length,opening:report.opening.map(v=>({id:v.id,voice:v.clip.voiceName})),editorPlayed:report.editor.length,paidRequests:report.paidRequests,errors:report.errors}));
}finally{fs.writeFileSync(folder+'/banter-m02-verification.json',JSON.stringify(report,null,2));await browser?.close();}
