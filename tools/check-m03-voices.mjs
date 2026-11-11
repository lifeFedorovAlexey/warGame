import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {applyStoryEdits} from '../campaign/story-edits.js';
import {makeMission} from './m02-fixture.mjs';
import {prepareM02Diagnostic} from '../campaign/mission02-diagnostic.js';
import {m03RadioRules} from '../campaign/mission03-radio.js';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),asset='assets/campaign/alpha/mission03/';
const completed=read('docs/campaign/alpha/voice/elevenlabs-m03-completion.json');
const {story,audio}=applyStoryEdits(read(asset+'story.json'),read(asset+'audio.json'),read(asset+'reviewed-dialogue.json'));
assert.equal(story.dialogue.length,36);assert.equal(story.scenes.length,16);assert.equal(completed.generatedRecordings,35);
assert(completed.reservedCredits<=completed.budgetCredits&&completed.budgetCredits===2000);
for(const line of story.dialogue){const clip=audio.clips[line.id];assert.equal(clip.text,line.text);assert.equal(clip.origin,'elevenlabs-synthesis');assert.equal(createHash('sha256').update(fs.readFileSync(asset+clip.file)).digest('hex'),clip.sha256);}
const fixture={mission:{state:{status:'running',m03:{events:{researchComplete:true},location:'home',losses:[],leftBehind:[]}},entity:()=>null},finished:()=>false};
assert(m03RadioRules(fixture)['m03-s12'].valid);assert(!m03RadioRules(fixture)['m03-s12-losses'].valid);
fixture.mission.state.m03.losses=['lost'];assert(!m03RadioRules(fixture)['m03-s12'].valid);assert(m03RadioRules(fixture)['m03-s12-losses'].valid);
const m=prepareM02Diagnostic(makeMission());m.state.status='victory';m.load(m.save());assert(m.enterM03().ok);
const base=process.env.WARGAME_URL||'http://127.0.0.1:8769',folder='campaign/previews/elevenlabs-m03';fs.mkdirSync(folder,{recursive:true});
const {chromium}=createRequire(import.meta.url)('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
const report={errors:[],paidRequests:[],budget:completed.budgetCredits,reserved:completed.reservedCredits};
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 page.on('pageerror',e=>report.errors.push(e.message));page.on('request',r=>{if(r.url().includes('api.elevenlabs.io'))report.paidRequests.push(r.url());});
 await page.addInitScript(save=>{
  localStorage.setItem('warGame.alpha.autosave.v1',save);localStorage.setItem('warGame.alpha.latest-save.v1','warGame.alpha.autosave.v1');sessionStorage.setItem('warGame.alpha.map-transition.v1','resume');
  for(const key of ['fieldSound','fieldStoryVoice','fieldRadio'])localStorage.setItem('warGame.'+key,'on');
  window.voiceChecks=[];const start=AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start=function(){const e=window.campaign?.radio?.entry;if(e?.id?.startsWith('m03-v2-')&&this.buffer&&Math.abs(this.buffer.duration-e.clip?.duration)<.05)voiceChecks.push({id:e.id,file:e.clip.file,state:this.context.state});return start.apply(this,arguments);};
 },m.save());
 await page.goto(base+'/campaign/');await page.waitForFunction(()=>window.campaign?.ready&&campaign.state.active&&campaign.mission.state.m03,null,{timeout:90000});
 await page.locator('#pause').click();
 // Browser automation explicitly unlocks audio just as an actual user interaction does.
 await page.locator('canvas').first().click({position:{x:500,y:260}});
 report.decoded=await page.evaluate(async clips=>{const ctx=new AudioContext(),rows=[];for(const clip of clips){const r=await fetch('/assets/campaign/alpha/mission03/'+clip.file);if(!r.ok)throw Error(clip.file);const b=await ctx.decodeAudioData(await r.arrayBuffer());let peak=0;for(const n of b.getChannelData(0))peak=Math.max(peak,Math.abs(n));rows.push({file:clip.file,duration:b.duration,expected:clip.duration,peak});}await ctx.close();return rows;},[...new Map(Object.values(completed.clips).map(c=>[c.file,c])).values()]);
 assert.equal(report.decoded.length,35);assert(report.decoded.every(c=>c.peak>.01&&Math.abs(c.duration-c.expected)<.05));
 await page.evaluate(()=>{campaign.radio.consume=()=>{};campaign.radio.hide();const r=campaign.radio,line=r.director.lines.get('m03-v2-s01-3');r.present({...line,story:true,dialogue:true,storyScene:'m03-s01',chapter:'story-m03-s01',token:'m03-voice-check',priority:2,portrait:'radio',station:r.director.script.speakers[line.speaker].name},campaign.mission,performance.now());});
 await page.waitForFunction(()=>voiceChecks.some(v=>v.id==='m03-v2-s01-3'&&v.state==='running'),null,{timeout:15000});
 assert.equal(await page.locator('#radio p').textContent(),story.dialogue.find(l=>l.id==='m03-v2-s01-3').text);
 for(const [label,width,height] of [['desktop',1440,900],['landscape',844,390],['small-landscape',667,375]]){await page.setViewportSize({width,height});await page.screenshot({path:folder+'/game-'+label+'.png'});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 report.game=await page.evaluate(()=>voiceChecks);
 await page.setViewportSize({width:1440,height:900});await page.goto(base+'/dialogues/');await page.locator('#missions a[href="#alpha-m03"]').click();await page.locator('#scenes a[data-scene="m03-s12"]').click();
 await page.evaluate(()=>{window.played=[];const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){this.addEventListener('playing',()=>played.push(this.currentSrc),{once:true});return play.apply(this,arguments);};});
 await page.locator('#play-scene').click();await page.waitForFunction(()=>played.length===4,null,{timeout:35000});report.editor=await page.evaluate(()=>played);
 assert.deepEqual(report.editor.map(url=>decodeURI(new URL(url).pathname)),story.scenes.find(s=>s.id==='m03-s12').cues.map(id=>'/'+asset+audio.clips[id].file));
 await page.screenshot({path:folder+'/editor.png',fullPage:true});assert.deepEqual(report.errors,[]);assert.deepEqual(report.paidRequests,[]);
 console.log(JSON.stringify({lines:36,decoded:report.decoded.length,game:report.game.length,editor:report.editor.length,reserved:report.reserved,errors:report.errors}));
}finally{fs.writeFileSync(folder+'/verification.json',JSON.stringify(report,null,2));await browser.close();}
