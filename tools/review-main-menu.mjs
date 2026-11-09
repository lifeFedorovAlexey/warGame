import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const folder='campaign/previews/main-menu';fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
 const url=(process.env.WARGAME_URL??'http://127.0.0.1:8766/review/main-menu')+'/campaign/';
 await page.goto(url);
 const ready=()=>page.waitForFunction(()=>window.campaign?.ready||document.querySelector('#loading-status').textContent.startsWith('Ошибка'),null,{timeout:90000});
 await ready();assert(await page.evaluate(()=>window.campaign?.ready),JSON.stringify(errors));
 assert(await page.locator('#resume-save').isDisabled(),'Continue is unavailable without a save');
 await page.screenshot({path:folder+'/menu-desktop.png'});
 await page.locator('#menu-settings').hover();await page.screenshot({path:folder+'/menu-hover.png'});
 await page.locator('#menu-settings').click();assert(await page.locator('#main-menu-settings').isVisible());
 for(const [id,key] of [['menu-sound','fieldSound'],['menu-voice','fieldStoryVoice'],['menu-radio','fieldRadio']]){
  await page.locator('#'+id).click();
  assert.equal(await page.evaluate(k=>localStorage.getItem('warGame.'+k),key),'off');
  assert.equal(await page.locator('#'+id).getAttribute('aria-pressed'),'false');
 }
 await page.screenshot({path:folder+'/settings-desktop.png'});
 await page.keyboard.press('Escape');assert(await page.locator('#main-menu-settings').isHidden());
 assert.equal(await page.evaluate(()=>document.activeElement.id),'menu-settings');
 for(const viewport of [{width:800,height:600},{width:390,height:844},{width:320,height:740}]){
  await page.setViewportSize(viewport);
  await page.locator('#menu-settings').click();assert(await page.locator('#main-menu-settings').isVisible());
  await page.locator('#menu-settings-close').click();
  await page.screenshot({path:folder+`/menu-${viewport.width}.png`});
 }
 await page.setViewportSize({width:1440,height:900});
 await page.locator('#begin').click();assert(await page.locator('#welcome').isHidden());
 await page.evaluate(()=>campaign.advance(45));await page.waitForFunction(()=>campaign.state.active);
 const sign=await page.evaluate(()=>campaign.mission.entity(campaign.mission.state.openingScene.signId));assert(sign.completed);
 await page.locator('summary[aria-label="Меню операции"]').click();
 await page.locator('[aria-controls="operation-actions"]').click();
 await page.locator('#main-menu-return').click();await ready();
 assert(await page.locator('#welcome').isVisible());assert(await page.locator('#resume-save').isEnabled());
 await page.screenshot({path:folder+'/menu-continue.png'});
 await page.locator('#resume-save').click();await page.waitForFunction(()=>campaign.state.active);
 assert(await page.locator('#welcome').isHidden());
 assert.equal(await page.evaluate(()=>campaign.mission.state.buildings.filter(b=>b.kind==='base-sign').length),1,'Continue keeps the constructed sign without replaying the opening');
 await page.reload();await ready();
 await page.locator('#menu-exit').click();await page.waitForURL('about:blank');
 assert.deepEqual(errors,[]);
 console.log('PASS: supplied-art menu, narrow click targets, settings persist, new game, save/return, continue and exit');
}finally{await browser.close();}
