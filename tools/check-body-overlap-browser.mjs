import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dir='campaign/previews/overlap-recovery';fs.mkdirSync(dir+'/frames',{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1000,height:700}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>{for(const k of ['fieldSound','fieldRadio','fieldStoryVoice'])localStorage.setItem('warGame.'+k,'off');});
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8766/review/body-overlap')+'/campaign/');
 await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});
 await page.locator('#begin').click();const skip=page.locator('[data-dream=skip]');if(await skip.isVisible())await skip.click();
 await page.waitForFunction(()=>campaign.mission.state.openingScene?.signId||campaign.state.active,null,{timeout:60000});
 await page.evaluate(()=>{const c=campaign,m=c.mission;c.radio.setEnabled(false);const s=m.entity(m.state.openingScene?.signId);if(s){s.completed=true;s.progress=1;}});
 await page.waitForFunction(()=>campaign.state.active,null,{timeout:25000});await page.locator('#pause').click();
 const before=await page.evaluate(async()=>{
  const {bodyEnvelope,bodyContact}=await import('./vehicle-overlap.js'),c=campaign,m=c.mission,w=c.world;
  c.renderSuspended=true;m.updateMission=()=>{};delete m.overlapStatistics;
  Object.assign(m.state,{units:[],buildings:[],camps:[],raidReserve:[],artifacts:[],pendingCinematics:[],bounds:[0,0,127,127],time:30,status:'running'});
  m.state.storyConstruction={enabled:false};m.explored.fill(255);m.visible.fill(255);m.visionSources=[{x:63.5,y:63.5,radius:200}];m.fogRevision++;
  const a=m.addUnit('bukhanka','rai',{x:-1115.482,y:294.352},{heading:2.324}),b=m.addUnit('bukhanka','rai',{x:-1103.367,y:289.709},{heading:1.752});
  for(const u of [a,b]){u.trafficOnScreen=true;u.previousX=u.x;u.previousY=u.y;u.previousHeading=u.heading;}
  m.rebuildNavigation();c.select([],false,false);c.radio.setEnabled(false);document.querySelector('#toast').hidden=true;
  w.fixedRenderScale=1;w.renderer.setPixelRatio(1);w.controls.enableDamping=false;
  w.controls.target.set(-1109,292,w.field.heightAt(-1109,292));w.camera.position.copy(w.controls.target).add({x:0,y:-85,z:110});w.controls.update();w.update(m,new Set(),0);
  return {gap:bodyContact(bodyEnvelope(a,m.config.worldScale,w.field),bodyEnvelope(b,m.config.worldScale,w.field)).gap,hp:m.state.units.map(u=>u.hp)};
 });
 assert(before.gap<0);await page.screenshot({path:dir+'/before.png'});
 for(let i=0;i<50;i++){
  if(i>=10)await page.evaluate(()=>{const c=campaign;c.mission.advance(.05);c.mission.finishPendingStep();c.world.update(c.mission,new Set(),0);});
  await page.screenshot({path:dir+'/frames/'+String(i).padStart(3,'0')+'.png',clip:{x:200,y:130,width:600,height:440}});
 }
 const after=await page.evaluate(async()=>{const {bodyEnvelope,bodyContact}=await import('./vehicle-overlap.js'),m=campaign.mission,[a,b]=m.state.units;return {gap:bodyContact(bodyEnvelope(a,m.config.worldScale,m.field),bodyEnvelope(b,m.config.worldScale,m.field)).gap,hp:m.state.units.map(u=>u.hp),stats:m.overlapStatistics};});
 assert(after.gap>=0,JSON.stringify(after));assert.deepEqual(after.hp,before.hp);assert(after.stats.maxCorrection<=campaignScale()*.12+1e-6);
 await page.screenshot({path:dir+'/after.png'});await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);await page.evaluate(()=>campaign.world.update(campaign.mission,new Set(),0));await page.screenshot({path:dir+'/narrow.png'});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,before,after}));
}finally{await browser.close();}
function campaignScale(){return JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/gameplay.json','utf8')).worldScale;}
