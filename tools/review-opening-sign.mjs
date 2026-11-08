import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const folder='campaign/previews/opening-sign';fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8766/review/opening-sign')+'/campaign/');
 await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});
 await page.locator('#begin').click();
 await page.locator('[data-dream="skip"]').click();
 for(const scene of ['p02','p03']){
  await page.waitForFunction(id=>campaign.radio.entry?.storyScene===id,scene);
  await page.locator('#radio [data-dismiss]').click();
 }
 // Run real simulation steps, including navigation, builder aim and construction.
 await page.evaluate(()=>campaign.advance(45));
 await page.waitForFunction(()=>campaign.radio.entry?.storyScene==='p04');
 await page.evaluate(()=>{campaign.radio.until=Infinity;campaign.renderSuspended=true;});
 assert.equal(await page.evaluate(()=>campaign.state.active),false);
 await page.keyboard.press('f');assert.equal(await page.evaluate(()=>campaign.state.orderMode),null);
 const sign=await page.evaluate(()=>campaign.mission.entity(campaign.mission.state.openingScene.signId));
 assert(sign.completed);
 await page.evaluate(()=>{campaign.renderSuspended=false;});
 await page.screenshot({path:folder+'/sign-desktop.png'});
 await page.setViewportSize({width:390,height:844});
 await page.waitForFunction(()=>{
  const {world,mission}=campaign,sign=mission.entity(mission.state.openingScene.signId);
  const top=world.screen(sign,mission.config.buildings['base-sign'].realSizeMetres[2]*mission.config.worldScale);
  return top.y>44&&top.y<innerHeight-140;
 });
 await page.screenshot({path:folder+'/sign-narrow.png'});
 await page.locator('#radio [data-dismiss]').click();
 await page.waitForFunction(()=>campaign.state.active);
 await page.keyboard.press('f');assert.equal(await page.evaluate(()=>campaign.state.orderMode),'attack');
 // A close inspection only for the review shot; the game itself keeps its camera.
 await page.setViewportSize({width:1440,height:900});
 await page.evaluate(()=>{
  const {world,mission}=campaign,sign=mission.entity(mission.state.openingScene.signId);
  world.centre(sign,220);
 });
 await page.screenshot({path:folder+'/sign-at-hill.png'});
 assert.deepEqual(errors,[]);
 console.log('PASS: sign at the hill, real construction, input locked until dialogue ends, wide/narrow screenshots');
}finally{await browser.close();}
