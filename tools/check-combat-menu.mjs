import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const folder='campaign/previews/combat-menu';fs.mkdirSync(folder,{recursive:true});
try {
 const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8892')+'/campaign/');
 await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});
 await page.locator('#begin').click();await page.locator('#pause').click();
 const ids=await page.evaluate(()=>{
  const c=window.campaign;c.radio.setEnabled(false);const ids=c.mission.state.units.filter(u=>u.owner==='rai'&&u.kind==='bukhanka').map(u=>u.id);
  c.select(ids);c.advance(0);return ids;
 });
 await page.locator('#attack-order').click();assert(await page.locator('#combat-menu').isVisible());
 assert.equal(await page.locator('#combat-menu button').count(),10);
 await page.locator('[data-policy=retreat][data-value=light]').click();
 await page.locator('[data-policy=response][data-value=return]').click();
 await page.locator('[data-policy=priority][data-value=strongest]').click();
 assert.deepEqual(await page.evaluate(ids=>ids.map(id=>campaign.mission.entity(id).combatPolicy),ids),ids.map(()=>({retreat:'light',response:'return',priority:'strongest'})));
 const audit=async()=>page.evaluate(()=>{
  const menu=document.getElementById('combat-menu'),r=menu.getBoundingClientRect(),attack=document.getElementById('attack-order').getBoundingClientRect();
  const style=getComputedStyle(menu),controls=[...menu.querySelectorAll('button')];
  const empty=document.elementFromPoint(r.left+12,r.top+48);
  const dock=document.querySelector('.tactical-dock').getBoundingClientRect();
  return {above:r.bottom<=attack.top,clearsRoster:r.bottom<=dock.top,inViewport:r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,
   background:style.backgroundColor,border:style.borderTopWidth,emptyPasses:!empty?.closest('#combat-menu'),
   captions:controls.map(b=>b.textContent.trim()).filter(Boolean),labels:controls.every(b=>b.getAttribute('aria-label')&&b.getAttribute('aria-description')),
   icons:controls.every(b=>b.querySelector('.atlas-cell')||b.querySelector('svg.game-icon')?.getBBox().width>0),checked:controls.filter(b=>b.getAttribute('aria-checked')==='true').length};
 });
 const waitLayout=()=>page.waitForFunction(()=>{
  const r=document.getElementById('combat-menu').getBoundingClientRect(),dock=document.querySelector('.tactical-dock').getBoundingClientRect();
  return r.width>0&&r.top>=0&&r.left>=0&&r.right<=innerWidth&&r.bottom<=Math.min(innerHeight,dock.top);
 });
 await page.waitForTimeout(250);
 const wide=await audit();assert(wide.above&&wide.clearsRoster&&wide.inViewport&&wide.emptyPasses&&wide.labels&&wide.icons);assert.deepEqual(wide.captions,[]);assert.equal(wide.background,'rgba(0, 0, 0, 0)');assert.equal(wide.border,'0px');assert.equal(wide.checked,3);
 await page.screenshot({path:folder+'/wide.png'});
 await page.locator('[data-policy=priority][data-value=weakest]').hover();
 assert(await page.locator('#combat-hint').isVisible());assert.match(await page.locator('#combat-hint').innerText(),/Добивание/);
 const region=await page.locator('#combat-menu').boundingBox();
 await page.screenshot({path:folder+'/icons-and-hint.png',clip:{x:Math.max(0,region.x-8),y:Math.max(0,region.y-8),width:Math.min(490,1920-region.x),height:region.height+80}});
 const icon=page.locator('[data-policy=retreat][data-value=light] .game-icon'),before=await icon.boundingBox();
 await icon.locator('..').hover();assert.deepEqual(await icon.boundingBox(),before,'hover cannot shift icon');
 await page.keyboard.press('Escape');assert(await page.locator('#combat-menu').isHidden());
 assert.equal(await page.locator('#attack-order').getAttribute('aria-pressed'),'false');
 await page.locator('#attack-order').focus();await page.keyboard.press('ArrowUp');assert(await page.locator('#combat-menu').isVisible());
 await page.keyboard.press('ArrowRight');assert.equal(await page.locator('[data-policy=retreat][data-value=heavy]').getAttribute('aria-checked'),'true');
 await page.evaluate(ids=>{campaign.mission.setCombatPolicy([ids[0]],{response:'ignore'});campaign.advance(0);},ids);
 assert.equal(await page.locator('[data-policy=response].mixed').count(),2);
 await page.setViewportSize({width:390,height:844});await waitLayout();
 const narrow=await audit();await page.screenshot({path:folder+'/narrow.png'});assert(narrow.above&&narrow.clearsRoster&&narrow.inViewport&&narrow.emptyPasses,JSON.stringify(narrow));
 await page.setViewportSize({width:844,height:390});await waitLayout();
 const landscape=await audit();assert(landscape.above&&landscape.inViewport);await page.screenshot({path:folder+'/landscape.png'});
 await page.setViewportSize({width:1280,height:800});await page.keyboard.press('Escape');await page.keyboard.press('Escape');
 await page.keyboard.press('KeyF');assert.equal(await page.evaluate(()=>campaign.state.orderMode),'attack');assert(await page.locator('#combat-menu').isHidden());
 const point=await page.evaluate(()=>{const c=campaign,u=c.mission.entity(c.selected[0]);return c.world.screen({x:u.x-60,y:u.y-65},0);});
 await page.mouse.click(point.x,point.y);
 assert.equal(await page.evaluate(id=>campaign.mission.entity(id).task?.type,ids[0]),'attack-move');
 assert.equal(await page.locator('#attack-order').getAttribute('aria-pressed'),'true');
 const firstTask=await page.evaluate(id=>campaign.mission.entity(id).task,ids[0]);
 const next=await page.evaluate(()=>{const c=campaign,u=c.mission.entity(c.selected[0]);return c.world.screen({x:u.x-95,y:u.y-110},0);});
 await page.mouse.click(next.x,next.y);
 const nextTask=await page.evaluate(id=>campaign.mission.entity(id).task,ids[0]);
 assert.equal(nextTask.type,'attack-move');assert.notDeepEqual([nextTask.x,nextTask.y],[firstTask.x,firstTask.y],'second click issues another order');
 await page.locator('#stop').click();assert.equal(await page.evaluate(()=>campaign.state.orderMode),'attack','Stop keeps attack cursor');
 assert.equal(await page.evaluate(id=>campaign.mission.entity(id).task,ids[0]),null);
 const own=await page.evaluate(id=>campaign.world.screen(campaign.mission.entity(id)),ids[1]);
 await page.mouse.click(own.x,own.y);
 assert.deepEqual(await page.evaluate(()=>campaign.selected),[ids[1]],'own unit remains selectable in attack mode');
 assert.equal(await page.evaluate(()=>campaign.state.orderMode),'attack');
 const box=await page.evaluate(ids=>{
  const points=ids.map(id=>campaign.world.screen(campaign.mission.entity(id)));
  return {x:Math.min(...points.map(p=>p.x))-12,y:Math.min(...points.map(p=>p.y))-12,right:Math.max(...points.map(p=>p.x))+12,bottom:Math.max(...points.map(p=>p.y))+12};
 },ids);
 await page.mouse.move(box.x,box.y);await page.mouse.down();await page.mouse.move(box.right,box.bottom,{steps:8});await page.mouse.up();
 const selected=await page.evaluate(()=>campaign.selected);assert(ids.every(id=>selected.includes(id)),'drag selection works while attack stays active');
 assert.equal(await page.evaluate(()=>campaign.state.orderMode),'attack');
 await page.locator('#attack-order').click({button:'right'});assert(await page.locator('#combat-menu').isVisible());
 assert.equal(await page.locator('[data-policy=retreat][data-value=heavy]').getAttribute('aria-checked'),'true','settings survive orders and selection');
 await page.locator('#attack-order').click();assert.equal(await page.evaluate(()=>campaign.state.orderMode),null,'button toggles attack off');
 await page.locator('#attack-order').click();assert.equal(await page.evaluate(()=>campaign.state.orderMode),'attack');
 await page.keyboard.press('KeyF');assert.equal(await page.evaluate(()=>campaign.state.orderMode),null,'F toggles attack off');
 await page.keyboard.press('KeyF');assert.equal(await page.evaluate(()=>campaign.state.orderMode),'attack');
 await page.evaluate(()=>{const c=campaign;c.select([c.mission.state.units.find(u=>u.kind==='builder'&&u.owner==='rai').id]);c.advance(0);});
 assert(await page.locator('#attack-order').isEnabled(),'active mode can always be switched off');
 await page.locator('#attack-order').click();
 assert(await page.locator('#attack-order').isDisabled());assert(await page.locator('#combat-menu').isHidden());
 const retreat=await page.evaluate(id=>{
  const c=campaign,m=c.mission,u=m.entity(id);m.stop(m.state.units.filter(u=>u.owner==='rai').map(u=>u.id));
  u.heading=0;u.driveSpeed=0;
  const enemy=m.addUnit('raider','scavs',{x:u.x,y:u.y-85},{raidReserve:true});
  m.setCombatPolicy([u.id],{retreat:'heavy',response:'ignore'});m.damage(u,220,enemy);
  const start={x:u.x,y:u.y},hp=u.hp;
  for(let i=0;i<450&&u.combatRetreat?.status!=='arrived';i++)m.advance(.1);
  c.select([id]);c.world.centre(u,280);c.advance(0);
  return {status:u.combatRetreat?.status,moved:Math.hypot(u.x-start.x,u.y-start.y),hp:u.hp,initialHp:hp,path:u.path.length};
 },ids[0]);
 assert.equal(retreat.status,'arrived',JSON.stringify(retreat));assert(retreat.moved>50);assert.equal(retreat.hp,retreat.initialHp);
 await page.waitForTimeout(150);await page.screenshot({path:folder+'/retreat.png'});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({wide,narrow,landscape,keyboard:true,mixed:true,realOrder:true,retreat,errors},null,2));
}finally{await browser.close();}
