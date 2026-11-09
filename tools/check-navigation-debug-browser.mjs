import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH??'C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({executablePath:process.env.EDGE_PATH??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8893')+'/campaign/');await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});
 await page.evaluate(()=>campaign.radio.setEnabled(false));
 await page.locator('#begin').click();await page.locator('#pause').click();
 const selectedId=await page.evaluate(()=>{
  const c=campaign,u=c.mission.state.units.find(u=>u.owner==='rai'&&u.kind==='bukhanka');
  c.radio.setEnabled(false);c.select([u.id]);c.world.centre(u,500);
  c.mission.order([u.id],'move',{x:u.x+90,y:u.y+90});c.advance(.1);return u.id;
 });
 await page.keyboard.press('F8');await page.waitForFunction(()=>campaign.navigationDebug?.enabled);
 assert.equal(await page.locator('#navigation-debug').evaluate(e=>getComputedStyle(e).pointerEvents),'none');
 fs.mkdirSync('campaign/previews/navigation-debug',{recursive:true});
 await page.screenshot({path:'campaign/previews/navigation-debug/wide.png'});
 const snapshot=await page.evaluate(id=>campaign.navigationDebug.snapshot(id),selectedId);
 assert(snapshot.destination&&snapshot.path.length,'Debug exposes the actual assigned route');
 await page.setViewportSize({width:800,height:900});await page.waitForTimeout(250);
 await page.screenshot({path:'campaign/previews/navigation-debug/narrow.png'});
 await page.keyboard.press('F8');await page.waitForFunction(()=>!campaign.navigationDebug.enabled);
 assert(await page.locator('#navigation-debug').isHidden(),'Disabled overlay is absent from the normal HUD');
 assert.deepEqual(errors,[]);
 fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/navigation-debug-browser.json',JSON.stringify({passed:true,snapshot,errors},null,2));
 console.log(JSON.stringify({passed:true,wide:[1920,1080],narrow:[800,900],state:snapshot.state,errors}));
}finally{await browser.close();}
