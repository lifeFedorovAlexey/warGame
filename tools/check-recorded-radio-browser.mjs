import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.env.WARGAME_URL||'http://127.0.0.1:8767',folder='campaign/previews/radio-language-review';
fs.mkdirSync(folder,{recursive:true});const report={errors:[],paidRequests:[],checks:[]};let browser;
try{
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>report.errors.push(e.stack));
 page.on('request',r=>{if(r.url().includes('api.elevenlabs.io'))report.paidRequests.push(r.url());});
 await page.addInitScript(()=>{
  for(const key of ['fieldSound','fieldStoryVoice','fieldRadio'])localStorage.setItem('warGame.'+key,'on');
  window.voiceChecks=[];window.editorPlayed=[];const start=AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start=function(){const entry=window.campaign?.radio?.entry;
   if(entry?.dynamic&&this.buffer&&Math.abs(this.buffer.duration-entry.clip?.duration)<.05){let peak=0;for(const n of this.buffer.getChannelData(0))peak=Math.max(peak,Math.abs(n));voiceChecks.push({id:entry.id,crewId:entry.crewId,text:entry.text,voice:entry.clip.voice,voiceName:entry.clip.voiceName,origin:entry.clip.origin,duration:this.buffer.duration,peak,context:this.context.state});}
   return start.apply(this,arguments);};
  const play=HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play=function(){this.addEventListener('playing',()=>editorPlayed.push({src:this.currentSrc,duration:this.duration}),{once:true});return play.apply(this,arguments);};
 });
 await page.goto(base+'/dialogues/#dynamic');await page.locator('[data-radio-rule="idle.quiet"]').waitFor({timeout:30000});
 report.decoded=await page.evaluate(async()=>{
  const bank=await(await fetch('/assets/radio/recorded-speech.json')).json(),ctx=new AudioContext(),rows=[];
  for(const [voice,clips] of Object.entries(bank.clips))for(const clip of Object.values(clips)){
   const r=await fetch('/'+clip.file);if(!r.ok)throw Error(clip.file+': '+r.status);
   const buffer=await ctx.decodeAudioData(await r.arrayBuffer());let peak=0;for(const n of buffer.getChannelData(0))peak=Math.max(peak,Math.abs(n));
   rows.push({voice,file:clip.file,duration:buffer.duration,expected:clip.duration,peak});
  }await ctx.close();return rows;
 });
 assert.equal(report.decoded.length,941);assert(report.decoded.every(r=>r.peak>.01&&Math.abs(r.duration-r.expected)<.05));
 report.checks.push('all 941 files decode in browser; all five profiles have audible recordings');
 await page.locator('[data-radio-rule="idle.quiet"]').click();await page.getByLabel('Масштаб',{exact:true}).selectOption('single');
 await page.getByLabel('Вариант разговора',{exact:true}).selectOption('0');
 assert.equal(await page.getByText('Готовая озвучка',{exact:true}).count(),2);
 await page.getByRole('button',{name:'Прослушать разговор',exact:true}).click();await page.waitForFunction(()=>editorPlayed.length>=2,null,{timeout:30000});
 report.editor=await page.evaluate(()=>editorPlayed);
 assert(report.editor.every(r=>r.src.includes('/assets/radio/recordings/elevenlabs-10k/')));
 assert(new Set(report.editor.map(r=>/voice-\d/.exec(r.src)?.[0])).size===2);
 for(const [label,width,height] of [['desktop',1440,1000],['landscape',844,390],['small-landscape',667,375],['narrow',390,844]]){
  await page.setViewportSize({width,height});await page.screenshot({path:folder+'/editor-'+label+'.png',fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }
 report.checks.push('workshop plays both voices from local recordings and labels them correctly');
 await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/campaign/?mission=m02');await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:120000});
 await page.locator('#begin').click();await page.waitForFunction(()=>campaign.state.active&&campaign.mission.state.m02,null,{timeout:90000});
 if(!await page.evaluate(()=>campaign.state.paused))await page.locator('#pause').click();
 await page.evaluate(()=>{
  const m=campaign.mission,r=campaign.radio,d=r.director;d.bind(m);
  for(const id of d.scenes.keys())d.data.scenes[id]={status:'done',cursor:0,endedAt:d.data.clock-20000};d.data.active=null;r.hide();
  const e=m.radioObserver.engine;e.state.queue=[];e.state.batch=[];e.pending.clear();e.active=null;
  for(const u of m.state.units.filter(u=>u.owner==='rai'&&u.hp>0)){u.task=null;u.path=[];u.pendingOrder=null;u.combatRetreat=null;u.factoryVisit=null;}
  m.state.time=m.state.m02.startedAt+120;m.radioObserver.tick();m.state.time+=1.1;m.radioObserver.tick();r.consume(m,performance.now());
 });
 await page.waitForFunction(()=>voiceChecks.length>=2,null,{timeout:30000});report.game=await page.evaluate(()=>voiceChecks);
 assert(report.game.every(v=>v.origin==='elevenlabs-synthesis'&&v.peak>.01&&v.context==='running'));
 assert(new Set(report.game.map(v=>v.crewId)).size>=2,'A complete exchange uses different actual crew members');
 assert(report.game.every(v=>v.voiceName!=='Sarah - Mature, Reassuring, Confident'));
 for(const [label,width,height] of [['desktop',1440,1000],['landscape',844,390],['small-landscape',667,375],['narrow',390,844]]){
  await page.setViewportSize({width,height});await page.screenshot({path:folder+'/game-'+label+'.png'});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }
 report.checks.push('real mission radio scheduler plays a complete recorded exchange');
 assert.deepEqual(report.paidRequests,[]);assert.deepEqual(report.errors,[]);
 console.log(JSON.stringify({checks:report.checks,decoded:report.decoded.length,game:report.game,paidRequests:report.paidRequests,errors:report.errors}));
}finally{fs.writeFileSync(folder+'/verification.json',JSON.stringify(report,null,2));await browser?.close();}
