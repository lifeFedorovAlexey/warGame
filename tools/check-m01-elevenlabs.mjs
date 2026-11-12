import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {applyStoryEdits} from '../campaign/story-edits.js';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.env.WARGAME_URL||'http://127.0.0.1:8767';
const folder='campaign/previews/elevenlabs-m01';fs.mkdirSync(folder,{recursive:true});
const read=name=>JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/'+name,'utf8'));
const completed=JSON.parse(fs.readFileSync('docs/campaign/alpha/voice/elevenlabs-m01-completion.json','utf8'));
const {story,audio}=applyStoryEdits(read('story-v2.json'),read('audio-v2.json'),read('reviewed-dialogue.json'));
const report={errors:[],checks:[],generated:Object.keys(completed.clips).length};let browser;
try {
  assert.equal(report.generated,69);assert.deepEqual(completed.remainingTemporaryOrMissing,[]);
  for(const [id,clip] of Object.entries(completed.clips)) {
    const actual=id.startsWith('factory-')?read('factory-service-voice.json').barks.find(line=>line.id===id).clip:audio.clips[id];
    assert.equal(actual.sha256,clip.sha256,id);
    assert.equal(createHash('sha256').update(fs.readFileSync('assets/campaign/alpha/mission01/'+clip.file)).digest('hex'),clip.sha256,id);
  }
  assert.equal(audio.clips['m01-s07-l014'].voiceName,'Mishka Yaponcik - Odessa Rogue Charm');
  report.checks.push('69 generated performances are wired into playable content with matching checksums');
  browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',e=>report.errors.push(e.stack||e.message));
  await page.addInitScript(()=>{
    for(const key of ['fieldSound','fieldStoryVoice','fieldRadio'])localStorage.setItem('warGame.'+key,'on');
    window.voiceChecks=[];const start=AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start=function(){const entry=window.campaign?.radio?.entry;
      if(entry?.dialogue&&this.buffer&&entry.clip&&Math.abs(this.buffer.duration-entry.clip.duration)<.05){
        let peak=0;for(const n of this.buffer.getChannelData(0))peak=Math.max(peak,Math.abs(n));
        voiceChecks.push({id:entry.id,file:entry.clip.file,voice:entry.clip.voiceName,duration:this.buffer.duration,peak,context:this.context.state});
      }return start.apply(this,arguments);
    };
  });
  await page.goto(base+'/campaign/');await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:120000});
  report.decoded=await page.evaluate(async clips=>{
    const ctx=new AudioContext(),decoded=[];
    for(const [id,clip] of Object.entries(clips)){
      const response=await fetch('/assets/campaign/alpha/mission01/'+clip.file);
      if(!response.ok)throw Error(id+': '+response.status);
      const buffer=await ctx.decodeAudioData(await response.arrayBuffer());let peak=0,sum=0;
      for(const n of buffer.getChannelData(0)){peak=Math.max(peak,Math.abs(n));sum+=n*n;}
      decoded.push({id,duration:buffer.duration,expected:clip.duration,peak,rms:Math.sqrt(sum/buffer.length)});
    }await ctx.close();return decoded;
  },completed.clips);
  assert(report.decoded.every(v=>v.peak>.01&&v.rms>.005&&v.duration>.25&&Math.abs(v.duration-v.expected)<.05));
  report.checks.push('all new files decode in the browser with non-silent audio and correct durations');
  await page.evaluate(()=>{
    const {mission:m,radio:r}=campaign,d=r.director.bind(m);d.includeOpening=false;
    for(const id of r.director.scenes.keys())d.scenes[id]={status:'done',cursor:0,endedAt:0};
    m.state.openingScene={...m.state.openingScene,handedOver:true};
    localStorage.setItem('warGame.alpha.mission01.v1',m.save());document.getElementById('resume-save').disabled=false;
  });
  await page.locator('#resume-save').click();await page.waitForFunction(()=>campaign.state.active,null,{timeout:60000});
  if(!await page.evaluate(()=>campaign.state.paused))await page.locator('#pause').click();
  await page.evaluate(()=>{campaign.radio.consume=()=>{};campaign.radio.hide();});
  for(const [id,scene] of [['m01-s07-l014','r19'],['m01-s11-l001','r42'],['m01-s14-l001','r50']]) {
    await page.evaluate(({id,scene})=>{
      const r=campaign.radio,line=r.director.lines.get(id);
      r.present({...line,story:true,dialogue:true,storyScene:scene,chapter:'story-'+scene,token:'verify-'+id,priority:2,
        portrait:'radio',station:r.director.script.speakers[line.speaker].name},campaign.mission,performance.now());
    },{id,scene});
    await page.waitForFunction(id=>voiceChecks.some(v=>v.id===id&&v.peak>.01&&v.context==='running'),id,{timeout:20000});
    assert.equal(await page.locator('#radio p').textContent(),story.dialogue.find(line=>line.id===id).text);
    for(const [label,width,height] of [['desktop',1440,900],['narrow',390,844]]){
      await page.setViewportSize({width,height});await page.screenshot({path:folder+'/'+id+'-'+label+'.png'});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    }
    await page.waitForFunction(()=>!campaign.storyAudio.playing,null,{timeout:20000});
  }
  report.gamePlayed=await page.evaluate(()=>voiceChecks);
  report.checks.push('corrected radio operator, Petrovich and finale play through the game audio and subtitle system');
  await page.setViewportSize({width:1440,height:900});await page.goto(base+'/dialogues/');
  await page.locator('#missions a[href="#alpha-m01"]').click();await page.locator('#scenes a[data-scene="r19"]').click();
  await page.evaluate(()=>{window.editorPlayed=[];const play=HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play=function(){this.addEventListener('playing',()=>editorPlayed.push({src:this.currentSrc,duration:this.duration}),{once:true});return play.apply(this,arguments);};});
  await page.locator('[data-play="m01-s07-l014"]').click();await page.waitForFunction(()=>editorPlayed.length>0);
  report.editor=await page.evaluate(()=>editorPlayed);
  assert(report.editor[0].src.endsWith(completed.clips['m01-s07-l014'].file));
  for(const [label,width,height] of [['desktop',1440,900],['narrow',390,844]]){
    await page.setViewportSize({width,height});await page.screenshot({path:folder+'/editor-'+label+'.png',fullPage:true});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  report.checks.push('workshop plays the corrected recording; desktop and narrow layouts inspected');
  assert.deepEqual(report.errors,[]);console.log(JSON.stringify({checks:report.checks,decoded:report.decoded.length,gamePlayed:report.gamePlayed.length,errors:report.errors}));
} finally {fs.writeFileSync(folder+'/verification.json',JSON.stringify(report,null,2));await browser?.close();}
