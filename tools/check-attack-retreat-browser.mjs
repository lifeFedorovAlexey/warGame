import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH??'C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dir='campaign/reports/attack-retreat';fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.connectOverCDP(process.env.CDP_URL??'http://127.0.0.1:9337');
const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[],results=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.addInitScript(()=>{for(const key of ['fieldSound','fieldRadio','fieldStoryVoice'])localStorage.setItem('warGame.'+key,'off');});
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8899')+'/campaign/?mission=m02');
 await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:120000});await page.locator('#begin').click();
 await page.waitForFunction(()=>campaign.state.active&&!campaign.state.openingPlaying,null,{timeout:120000});await page.locator('#pause').click();
 const fixture=await page.evaluate(()=>{
  const c=campaign,m=c.mission,w=c.world;c.radio.setEnabled(false);c.radio.dismiss();
  const units=m.state.units.filter(u=>u.owner==='rai'&&m.unitSpec(u).damage).slice(0,3);
  if(units.length!==3)throw Error('Three combat vehicles required');
  m.stop(units.map(u=>u.id));m.setArmyCombatPolicy({retreat:'light'});
  units.forEach((u,i)=>{u.maxHp=100;u.hp=[40,80,81][i];u.retreatSuppressed=true;});
  c.select(units.map(u=>u.id));w.centre(units[1],420);
  const original=m.submitOrder.bind(m);window.mouseOrders=[];
  m.submitOrder=(...args)=>{const result=original(...args);window.mouseOrders.push({action:args[1],result});return result;};
  return {ids:units.map(u=>u.id)};
 });
 await page.waitForTimeout(400);
 const empty=await page.evaluate(()=>{
  const w=campaign.world,m=campaign.mission;
  for(let y=200;y<600;y+=30)for(let x=400;x<1000;x+=30){
   if(document.elementFromPoint(x,y)!==w.renderer.domElement||w.pickEntity(m,x,y))continue;
   const p=w.ground(x,y);if(!p||!m.inBounds(p.x,p.y)||!m.nav.terrainAllowed(p.x,p.y))continue;
   if(m.state.units.some(u=>{const s=w.screen(u);return s.visible&&Math.hypot(s.x-x,s.y-y)<35;}))continue;
   return {x,y};
  }throw Error('No unobstructed ground pixel');
 });
 const click=async button=>{const before=await page.evaluate(()=>window.mouseOrders.length);await page.mouse.click(empty.x,empty.y,{button});await page.waitForFunction(n=>window.mouseOrders.length>n,before);return page.evaluate(()=>window.mouseOrders.at(-1));};
 let order=await click('right');assert.equal(order.action,'attack-move');assert.deepEqual(order.result.assignedIds,[fixture.ids[2]]);results.push('right ground: HP > 80% only');
 order=await click('left');assert.equal(order.action,'move');assert.deepEqual(new Set(order.result.assignedIds),new Set(fixture.ids));results.push('left ground: all selected vehicles');
 order=await click('right');assert.equal(order.action,'attack-move');assert.deepEqual(order.result.assignedIds,[fixture.ids[2]]);results.push('right after manual move still respects HP');
 await page.evaluate(ids=>campaign.select(ids.slice(0,2)),fixture.ids);
 order=await click('right');assert(!order.result.ok);results.push('injured-only selection cannot override retreat');
 await page.keyboard.press('Escape');
 await page.locator('#attack-order').click({button:'right'});assert(await page.locator('#combat-menu').isVisible());
 results.push('right button opens settings for an injured-only selection');
 await page.locator('[data-policy=retreat][data-value=heavy]').click();await page.keyboard.press('Escape');
 await page.evaluate(ids=>campaign.select(ids),fixture.ids);
 await page.evaluate(ids=>{ids.forEach((id,i)=>{const u=campaign.mission.entity(id);u.hp=[35,36,100][i];});},fixture.ids);
 order=await click('right');assert.deepEqual(new Set(order.result.assignedIds),new Set(fixture.ids.slice(1)));results.push('right ground: HP > 35% only');
 await page.keyboard.press('Escape');await page.keyboard.press('F2');
 assert(!(await page.evaluate(()=>campaign.selected)).includes(fixture.ids[0]));
 await page.locator('#attack-order').click({button:'right'});await page.locator('[data-policy=retreat][data-value=never]').click();await page.keyboard.press('Escape');
 await page.evaluate(ids=>campaign.select(ids),fixture.ids);order=await click('right');assert.deepEqual(new Set(order.result.assignedIds),new Set(fixture.ids));results.push('retreat disabled: all living combat vehicles');
 const enemyId=await page.evaluate(point=>{
  const m=campaign.mission,p=campaign.world.ground(point.x,point.y),enemy=m.addUnit('raider','scavs',p);
  m.setArmyCombatPolicy({retreat:'heavy'});m.visible.fill(255);m.explored.fill(255);m.fogRevision++;return enemy.id;
 },empty);
 await page.waitForTimeout(200);
 const enemyPixel=await page.evaluate(id=>campaign.world.screen(campaign.mission.entity(id)),enemyId);
 await page.mouse.click(enemyPixel.x,enemyPixel.y,{button:'right'});
 order=await page.evaluate(()=>window.mouseOrders.at(-1));assert.equal(order.action,'attack');
 assert.deepEqual(new Set(order.result.assignedIds),new Set(fixture.ids.slice(1)));results.push('right enemy: explicit attack also respects HP');
 for(const [width,height] of process.argv.includes('--layout')?[[1440,900],[844,390],[667,375]]:[]){
  await page.setViewportSize({width,height});await page.locator('#attack-order').click({button:'right'});await page.waitForTimeout(200);
  const layout=await page.evaluate(()=>{
   const menu=document.getElementById('combat-menu'),r=menu.getBoundingClientRect(),canvas=document.getElementById('world').getBoundingClientRect();
   return {menu:{x:r.x,y:r.y,right:r.right,bottom:r.bottom},width:innerWidth,height:innerHeight,worldHeight:canvas.height,scroll:document.documentElement.scrollWidth,
    controls:[...menu.querySelectorAll('button')].map(b=>{const r=b.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};})};
  });
  assert.equal(layout.scroll,width);assert.equal(layout.worldHeight,height);
  for(const r of [layout.menu,...layout.controls])assert(r.x>=0&&r.y>=0&&r.right<=width+1&&r.bottom<=height+1,JSON.stringify(layout));
  await page.screenshot({path:dir+'/controls-'+width+'.png'});await page.keyboard.press('Escape');
  await page.locator('.settings summary').click();await page.locator('#controls-help').click();
  await page.screenshot({path:dir+'/help-'+width+'.png'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
  await page.locator('.settings summary').click();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(dir+'/browser.json',JSON.stringify({passed:true,results,errors},null,2));console.log(JSON.stringify({passed:true,results,errors}));
}finally{await context.close();await browser.close();}
