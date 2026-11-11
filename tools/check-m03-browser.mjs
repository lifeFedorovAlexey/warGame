import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const folder='campaign/previews/m03',read=name=>JSON.parse(fs.readFileSync(folder+'/'+name+'.json','utf8'));
const base=read('travel').state.m03.baseSnapshot;Object.assign(base.state.transport,{phase:'ready',elapsed:0,door:1});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],steps=[];page.on('pageerror',e=>{errors.push(e.message);console.log('pageerror',e.message);});page.on('requestfailed',r=>console.log('requestfailed',r.url(),r.failure()?.errorText));
async function paused(){if(!await page.evaluate(()=>campaign.state.paused))await page.locator('#pause').click();}
async function ready(location){await page.waitForFunction(loc=>window.campaign?.ready&&campaign.state.active&&campaign.mission.state.m03?.location===loc,location,{timeout:90000});await paused();console.log('Ready:',location);}
try{
 await page.addInitScript(data=>{if(sessionStorage.getItem('m03-browser-seeded'))return;sessionStorage.setItem('m03-browser-seeded','yes');localStorage.setItem('warGame.alpha.autosave.v1',JSON.stringify(data));localStorage.setItem('warGame.alpha.latest-save.v1','warGame.alpha.autosave.v1');sessionStorage.setItem('warGame.alpha.map-transition.v1','resume');for(const k of ['fieldSound','fieldStoryVoice','fieldRadio'])localStorage.setItem('warGame.'+k,'off');},base);
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8772')+'/campaign/',{waitUntil:'domcontentloaded'});await ready('home');
 await page.setViewportSize({width:667,height:375});
 await page.locator('.settings > summary').click();await page.locator('[aria-controls="operation-actions"]').click();
 await page.waitForFunction(()=>document.querySelector('.korovnik-controls').hidden);
 await page.screenshot({path:folder+'/14-menu-landscape.png'});
 await page.locator('.settings > summary').click();await page.setViewportSize({width:1440,height:900});
 steps.push('transport controls leave the operation menu accessible on a landscape phone');
 await page.locator('.korovnik-controls button[aria-label="Состав транспорта и доступная техника"]').click();
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(400);await page.screenshot({path:folder+'/05-cargo-narrow.png'});
 assert(await page.locator('.korovnik-roster button[data-boarded=true]').count()===10);
 await page.locator('.korovnik-controls button[aria-label="Состав транспорта и доступная техника"]').click();await page.setViewportSize({width:1440,height:900});
 await page.getByRole('button',{name:'Закрыть грузовой отсек и вылететь',exact:true}).click();await page.evaluate(()=>campaign.advance(24));await ready('expedition');steps.push('home → expedition through departure button and automatic map reload');
 const navigation=await page.evaluate(()=>({bounds:campaign.mission.state.bounds,mesh:campaign.mission.nav.routeAdvisor.mesh?.job.playBounds,stats:campaign.mission.nav.routeAdvisor.stats}));assert.deepEqual(navigation.mesh,navigation.bounds,'Recast bakes the expedition bounds');assert.equal(navigation.stats.errors,0);steps.push('Recast navigation uses the expedition terrain and bounds');
 await page.evaluate(()=>campaign.advance(185));assert.equal(await page.evaluate(()=>campaign.mission.state.units.filter(u=>u.owner==='rai').length),10);
 // A real evacuation checkpoint from the complete mechanical test. Loading
 // it isolates the return UI from separately tested combat and road driving.
 await page.evaluate(data=>{campaign.mission.load(data);campaign.advance(0);campaign.transportControls.update();},read('evacuation'));
 await page.getByRole('button',{name:'Закрыть грузовой отсек и вылететь',exact:true}).click();await page.evaluate(()=>campaign.advance(24));await ready('home');steps.push('expedition → original home through departure button and automatic map reload');
 await page.evaluate(()=>{campaign.advance(190);campaign.world.centre(campaign.mission.transportSite(),680);});await page.waitForTimeout(400);await page.screenshot({path:folder+'/06-return.png'});
 assert.equal(await page.evaluate(()=>campaign.mission.state.m03.phase),'complete');assert.equal(await page.evaluate(()=>campaign.mission.state.m03.evacuated.length),10);
 await page.evaluate(()=>{const m=campaign.mission,lab=m.state.buildings.find(b=>b.owner==='rai'&&b.kind==='lab');const r=m.research(lab.id,'heavy-machinegun');if(!r.ok)throw Error(r.reason);campaign.advance(65);});
 await page.locator('#design-toggle').click();await page.locator('[data-design-slot=upper]').click();assert.equal(await page.locator('[data-design-component=mission-heavy-mg]').getAttribute('data-icon'),'heavy-gun');await page.locator('[data-design-component=mission-heavy-mg]').click();await page.waitForTimeout(600);await page.screenshot({path:folder+'/07-heavy-module.png'});assert(!await page.locator('[data-design-stage-status]').innerText().catch(()=>''));steps.push('researched heavy machine gun selected and rendered in the real designer');
 await page.locator('[data-close-designer]').click();
 const rms=await page.evaluate(async()=>{const {createKorovnikAudio}=await import('./korovnik-audio.js'),context=new OfflineAudioContext(1,48000,48000),output=context.createGain();output.connect(context.destination);createKorovnikAudio({context,output}).update({active:true,speed:22,distance:100});const buffer=await context.startRendering();return Math.sqrt(buffer.getChannelData(0).reduce((s,v)=>s+v*v,0)/48000);});assert(rms>.01);steps.push('local helicopter audio produces a non-silent signal');
 const catalogue=await (await page.request.get((process.env.WARGAME_URL??'http://127.0.0.1:8772')+'/api/dialogues')).json();assert(catalogue.missions.some(m=>m.id==='alpha-m03'));
 const dialogue=await page.request.get((process.env.WARGAME_URL??'http://127.0.0.1:8772')+'/api/dialogues/alpha-m03');assert(dialogue.ok());steps.push('dialogue editor lists mission 03 and serves its editable data');
 // Exercise the current main finale: M02 must expose the next operation,
 // and its checkpoint must stay distinct from the earlier M01 checkpoint.
 await page.evaluate(data=>{delete data.state.m03;data.state.status='victory';campaign.mission.load(data);},structuredClone(base));
 await page.locator('#result-continue').click({timeout:15000});
 await page.waitForFunction(()=>campaign.mission.state.m03?.phase==='preparation'&&document.querySelector('#result').hidden&&!document.querySelector('#ending-continue').disabled&&document.querySelector('#mission-ending').hidden);
 const restart=await page.evaluate(()=>JSON.parse(localStorage.getItem('warGame.alpha.mission-start.m03.v1')));
 assert.equal(restart.state.m03.phase,'preparation');assert.equal(restart.state.m03.location,'home');
 steps.push('M02 finale continues into M03 and preserves a separate restart snapshot');
 assert.deepEqual(errors,[]);fs.writeFileSync(folder+'/browser-flow.json',JSON.stringify({steps,errors},null,2));console.log('PASS',JSON.stringify({steps,errors}));
}catch(error){await page.screenshot({path:folder+'/browser-flow-error.png'});console.log(await page.locator('body').innerText());throw error;}finally{await browser.close();}
