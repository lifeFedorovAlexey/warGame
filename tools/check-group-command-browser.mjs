import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH??'C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({executablePath:process.env.EDGE_PATH??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8893')+'/campaign/');await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});
 await page.locator('#begin').click();await page.locator('#pause').click();
 const ids=await page.evaluate(()=>{
  const c=campaign,units=c.mission.state.units.filter(u=>u.owner==='rai'&&u.kind==='bukhanka');c.radio.setEnabled(false);
  c.select(units.map(u=>u.id));c.world.centre(units[0],550);return units.map(u=>u.id);
 });
 await page.keyboard.press('Control+g');
 const group=await page.evaluate(()=>campaign.mission.state.commandGroups[0]);assert.deepEqual(group.members,ids,'Group hotkey uses the selection, not all friendly units');
 await page.evaluate(id=>campaign.select([id]),group.leaderId);
 await page.keyboard.press('g');assert.equal(await page.evaluate(()=>campaign.selected.length),ids.length);
 await page.keyboard.press('Alt+2');assert.equal(await page.evaluate(()=>campaign.mission.state.commandGroups[0].formation),'line');
 await page.evaluate(id=>campaign.select([id]),group.leaderId);
 const goal=await page.evaluate(id=>{const u=campaign.mission.entity(id);return {x:u.x,y:u.y+180};},group.leaderId);
 const point=await page.evaluate(goal=>campaign.world.screen(goal,0),goal);await page.mouse.click(point.x,point.y,{button:'right'});
 assert(await page.evaluate(ids=>ids.every(id=>campaign.mission.entity(id).pendingOrder),ids),'A click on the selected leader orders every subordinate');
 await page.locator('#pause').click();await page.waitForFunction(ids=>ids.every(id=>!campaign.mission.entity(id).pendingOrder),ids,{timeout:12000});
 await page.locator('#pause').click();
 assert(await page.evaluate(ids=>ids.every(id=>campaign.mission.entity(id).routeOrder.formation==='line'),ids));
 await page.keyboard.press('Alt+r');assert(await page.evaluate(ids=>ids.every(id=>campaign.mission.entity(id).combatRetreat?.forced),ids));
 await page.locator('#stop').click();assert(await page.evaluate(ids=>ids.every(id=>!campaign.mission.entity(id).task&&!campaign.mission.entity(id).combatRetreat),ids));
 fs.mkdirSync('campaign/previews/group-command',{recursive:true});await page.screenshot({path:'campaign/previews/group-command/wide.png'});
 await page.setViewportSize({width:800,height:900});await page.waitForTimeout(250);await page.screenshot({path:'campaign/previews/group-command/narrow.png'});
 assert.deepEqual(errors,[]);fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/group-command-browser.json',JSON.stringify({passed:true,ids,group,errors},null,2));
 console.log(JSON.stringify({passed:true,ids,errors}));
}finally{await browser.close();}
