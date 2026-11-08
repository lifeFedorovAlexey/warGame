import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const folder='campaign/previews/opening-camera';fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
 await page.addInitScript(()=>{localStorage.setItem('warGame.fieldSound','off');localStorage.setItem('warGame.fieldStoryVoice','off');});
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8766/review/opening-camera')+'/campaign/');
 await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});
 await page.locator('#begin').click();
 const initial=await page.evaluate(()=>({position:campaign.world.camera.position.toArray(),target:campaign.world.controls.target.toArray()}));
 await page.locator('[data-dream="skip"]').click();
 await page.waitForFunction(()=>campaign.mission.state.time>5);
 assert.equal(await page.evaluate(()=>campaign.state.openingCamera),'drive');
 await page.keyboard.press('f');assert.equal(await page.evaluate(()=>campaign.state.orderMode),null);
 await page.screenshot({path:folder+'/drive-desktop.png'});
 await page.setViewportSize({width:390,height:844});
 await page.waitForFunction(()=>{
  const {world,mission}=campaign,worker=mission.entity(mission.state.openingScene.builderId),p=world.screen(worker,8);
  return world.camera.position.distanceTo(world.controls.target)>180&&p.visible&&p.x>50&&p.x<innerWidth-50&&p.y>90&&p.y<innerHeight-230;
 });
 await page.screenshot({path:folder+'/drive-narrow.png'});
 await page.setViewportSize({width:1440,height:900});
 for(const scene of ['p02','p03']){
  await page.waitForFunction(id=>campaign.radio.entry?.storyScene===id,scene);await page.locator('#radio [data-dismiss]').click();
 }
 await page.waitForFunction(()=>campaign.mission.state.time>17);
 await page.screenshot({path:folder+'/drive-second-angle.png'});
 await page.waitForFunction(()=>campaign.state.openingCamera==='build'&&campaign.mission.entity(campaign.mission.state.openingScene.signId).progress>.25,null,{timeout:60000});
 await page.screenshot({path:folder+'/construction.png'});
 await page.setViewportSize({width:390,height:844});
 await page.waitForFunction(()=>{
  const {world,mission}=campaign,scene=mission.state.openingScene;
  return [mission.entity(scene.builderId),mission.entity(scene.signId)].every(entity=>{
   const p=world.screen(entity,8);return p.visible&&p.x>16&&p.x<innerWidth-16&&p.y>100&&p.y<innerHeight-210;
  });
 });
 await page.screenshot({path:folder+'/construction-narrow.png'});
 await page.setViewportSize({width:1440,height:900});
 await page.waitForFunction(()=>campaign.state.openingCamera==='sign',null,{timeout:30000});
 await page.waitForFunction(()=>campaign.radio.entry?.storyScene==='p04');
 await page.waitForFunction(()=>{
  const {world,mission}=campaign,sign=mission.entity(mission.state.openingScene.signId);
  return Math.hypot(world.controls.target.x-sign.x,world.controls.target.y-sign.y)<3;
 });
 await page.screenshot({path:folder+'/finished-sign.png'});
 await page.locator('#radio [data-dismiss]').click();
 await page.waitForFunction(()=>campaign.state.openingCamera==='return');
 assert.equal(await page.evaluate(()=>campaign.state.active),false,'Controls stay locked during the overview return');
 await page.waitForFunction(()=>campaign.state.active);
 const returned=await page.evaluate(()=>({position:campaign.world.camera.position.toArray(),target:campaign.world.controls.target.toArray(),enabled:campaign.world.controls.enabled,opening:campaign.state.openingCamera}));
 assert(returned.enabled);assert.equal(returned.opening,null);
 for(const key of ['position','target'])assert(returned[key].every((value,i)=>Math.abs(value-initial[key][i])<.1),'Camera returns to its original overview');
 assert.equal(await page.locator('#toast').textContent(),'Управление передано вам');assert(await page.locator('#toast').isVisible());
 await page.screenshot({path:folder+'/control-handoff.png'});
 await page.keyboard.press('f');assert.equal(await page.evaluate(()=>campaign.state.orderMode),'attack');
 const playerView=await page.evaluate(()=>{
  const {world}=campaign;world.centre({x:world.controls.target.x+35,y:world.controls.target.y-30},340);campaign.advance(1);
  return world.controls.target.toArray();
 });
 await page.waitForFunction(()=>campaign.mission.state.time>39);
 assert.deepEqual(await page.evaluate(()=>campaign.world.controls.target.toArray()),playerView,'Ordinary dialogue does not take the camera back');
 await page.reload();await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});
 await page.locator('#resume-save').click();await page.waitForFunction(()=>campaign.state.active);
 assert.equal(await page.evaluate(()=>campaign.state.openingCamera),null,'A save after handoff does not replay the sequence');
 assert.deepEqual(errors,[]);fs.writeFileSync(folder+'/checks.json',JSON.stringify({initial,returned,errors},null,2));
 console.log('PASS: actual builder route, wide/narrow framing, construction, camera return, visible handoff, player camera and save restore');
}finally{await browser.close();}
