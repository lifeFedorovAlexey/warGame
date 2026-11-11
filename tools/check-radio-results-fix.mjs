import fs from 'node:fs';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {makeMission} from './m02-fixture.mjs';import {StoryDirector} from '../campaign/story-director.js';import {applyStoryEdits} from '../campaign/story-edits.js';
import {MissionRadio} from '../campaign/radio/adapter.js';import {installRecordedSpeech,radioClip} from '../campaign/radio/audio.js';import {resultsPresentationReady} from '../campaign/mission-results.js';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),root='assets/campaign/alpha/mission01/';
const {story}=applyStoryEdits(read(root+'story-v2.json'),read(root+'audio-v2.json'),read(root+'reviewed-dialogue.json'));
const library=read('assets/radio/situations_catalog.json'),bank=read('assets/radio/recorded-speech.json');installRecordedSpeech(bank);
assert.equal(bank.profiles.length,5);assert.equal(bank.recordings,941);
const replacement=radioClip({source:'tts',text:'Технику побило.'},'Технику побило.',library.settings,'voice-5');assert.equal(replacement.voiceId,'GN4wbsbejSnGSa1AzjH5');
const m=makeMission(),u=m.state.units.find(u=>u.owner==='rai'),person=m.state.campaign.personnel,soldier=person.soldiers[person.crews[u.id].memberIds[0]];soldier.gender='f';
m.state.time=100;let adapter=new MissionRadio(m,structuredClone(library));adapter.crews.set(soldier.id,{crewId:soldier.id,voiceId:'voice-5',lastSpoken:90});adapter.save();m.load(m.save());adapter=new MissionRadio(m,structuredClone(library));
const speaker=adapter.snapshot({primaryEventType:'damage.hit',affectedIds:[u.id],targetIds:[],actorIds:[u.id],facts:{},knownEnemyIds:[],eventTypes:['damage.hit']}).speakers.find(s=>s.crewId===soldier.id);assert.equal(speaker.voiceId,'voice-3');assert.equal(speaker.gender,'f');assert.equal(adapter.crews.get(soldier.id).lastSpoken,90);
const director=new StoryDirector(story),d=director.bind(m);d.includeOpening=false;
for(const scene of story.scenes)d.scenes[scene.id]={status:'done',cursor:scene.cues.length,endedAt:-30000};
d.scenes.r50={status:'playing',cursor:story.scenes.find(s=>s.id==='r50').cues.length-1};d.active='r50';
m.state.openingScene={...m.state.openingScene,handedOver:true};m.state.storyConstruction={enabled:false};m.state.status='victory';m.state.projectiles=[];m.state.buildings=m.state.buildings.filter(b=>b.owner==='rai');for(const c of m.state.camps)c.cleared=true;m.state.flags.raidWon=true;m.effects=[];
assert(!resultsPresentationReady(m,{enabled:true,director}));d.scenes.r50.status='done';assert(resultsPresentationReady(m,{enabled:true,director}));d.scenes.r50.status='playing';
const folder='campaign/previews/radio-results-fix';fs.mkdirSync(folder,{recursive:true});
const {chromium}=createRequire(import.meta.url)('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
const report={errors:[],paidRequests:[],replacement:{voiceId:replacement.voiceId,file:replacement.file},oldSaveVoice:speaker.voiceId};
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>report.errors.push(e.message));page.on('request',r=>{if(r.url().includes('api.elevenlabs.io'))report.paidRequests.push(r.url());});
 await page.addInitScript(save=>{localStorage.setItem('warGame.alpha.autosave.v1',save);localStorage.setItem('warGame.alpha.latest-save.v1','warGame.alpha.autosave.v1');sessionStorage.setItem('warGame.alpha.map-transition.v1','resume');for(const key of ['fieldRadio','fieldStoryVoice','fieldSound'])localStorage.setItem('warGame.'+key,'on');window.started=[];const start=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(){const e=window.campaign?.radio?.entry;if(e?.dialogue&&this.buffer&&Math.abs(this.buffer.duration-e.clip?.duration)<.05)started.push({id:e.id,resultVisible:!document.querySelector('#result').hidden});return start.apply(this,arguments);};},m.save());
 await page.goto((process.env.WARGAME_URL||'http://127.0.0.1:8769')+'/campaign/');await page.waitForFunction(()=>window.campaign?.ready&&campaign.state.active,null,{timeout:90000});
 await page.waitForFunction(()=>!document.querySelector('#result').hidden,null,{timeout:30000});
 report.played=await page.evaluate(()=>started);assert(report.played.some(e=>e.id==='m01-v4-r50-l004'&&!e.resultVisible));assert(!report.played.some(e=>['m01-s14-l015','m01-s14-l016','m01-s14-l017'].includes(e.id)));
 assert.equal(await page.evaluate(()=>!!campaign.mission.state.m02),false);assert(await page.locator('#mission-ending').isHidden());assert.equal(await page.evaluate(()=>document.activeElement.id),'result-close');
 report.viewports=[];
 for(const [width,height] of [[1440,900],[844,390],[667,375]]){await page.setViewportSize({width,height});await page.screenshot({path:folder+'/results-'+width+'.png'});const fits=await page.evaluate(()=>{const b=document.querySelector('#result-continue').getBoundingClientRect();return document.documentElement.scrollWidth<=innerWidth&&b.left>=0&&b.top>=0&&b.right<=innerWidth&&b.bottom<=innerHeight;});assert(fits);report.viewports.push([width,height]);}
 // No automatic advance while the player reviews the report.
 await page.waitForTimeout(1500);assert.equal(await page.evaluate(()=>!!campaign.mission.state.m02),false);
 await page.locator('#result-continue').click();await page.waitForFunction(()=>!!campaign.mission.state.m02&&document.querySelector('#result').hidden,null,{timeout:30000});report.explicitContinue=true;
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.paidRequests,[]);console.log(JSON.stringify(report));
}finally{fs.writeFileSync(folder+'/verification.json',JSON.stringify(report,null,2));await browser.close();}
