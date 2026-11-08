import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const folder='campaign/previews/street-lamps';fs.mkdirSync(folder,{recursive:true});
if(fs.existsSync('tools/.runtime-media/playwright'))process.env.PLAYWRIGHT_BROWSERS_PATH=fs.realpathSync('tools/.runtime-media/playwright');
const {chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
try{
 const context=await browser.newContext({viewport:{width:1920,height:1080},recordVideo:{dir:folder,size:{width:1280,height:720}}});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
 await page.addInitScript(()=>localStorage.setItem('warGame.fieldRadio','off'));
 await page.goto('http://127.0.0.1:8766/review/street-lamps-'+Date.now()+'/campaign/');
 await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});
 await page.locator('#begin').click();await page.evaluate(()=>campaign.advance(45));await page.waitForFunction(()=>campaign.state.active);
 await page.locator('#pause').click();
 // Leave the first fallen pole on the ground to exercise save/load + pickup.
 // Automatic collection is optional and uses the real constructor preference.
 await page.locator('#design-toggle').click();await page.locator('.design-salvage > summary').click();
 await page.locator('[data-salvage-enabled]').uncheck();await page.locator('[data-close-designer]').click();
 const fixture=await page.evaluate(async()=>{
  const {streetLampSites}=await import('./street-furniture.js');
  const {mission:m,world:w}=campaign,lamp=streetLampSites(w.field,m.config)[0],car=m.state.units.find(u=>u.kind==='bukhanka'&&u.owner==='rai'&&!u.damage?.parts?.[26]?.installed);
  // Initial condition only. Every subsequent movement uses ordinary map input.
  car.x=car.previousX=lamp.x;car.y=car.previousY=lamp.y-60;car.heading=car.previousHeading=0;car.path=[];car.task=null;car.driveSpeed=0;
  const site=m.config.baseSites.find(s=>s.kind==='generator'),p=w.field.gridToWorld(site.grid),placement=m.placement('generator',p.x,p.y,Math.PI,{checkMoney:false});
  if(!placement.ok)throw new Error(placement.reason);
  m.addStructure('generator','rai',placement,{completed:true,progress:1,rotation:Math.PI,groundHeight:placement.height});m.rebuildNavigation();m.updateEconomy(0);m.updateFog();
  campaign.select([car.id]);w.controls.target.set(lamp.x,lamp.y,w.field.heightAt(lamp.x,lamp.y)+7);
  w.camera.position.set(lamp.x+90,lamp.y-145,w.controls.target.z+105);w.controls.update();w.update(m,new Set([car.id]),0);
  window.lampReview={lamp,carId:car.id,trace:[],until:performance.now()+35000};
  function sample(){const u=m.entity(car.id);lampReview.trace.push({time:m.state.time,x:u.x,y:u.y,speed:u.driveSpeed??0,broken:!!m.state.streetFurniture?.[lamp.id]});if(performance.now()<lampReview.until)requestAnimationFrame(sample);}sample();
  return {lamp,carId:car.id,goal:{x:lamp.x,y:lamp.y+60},initialLight:w.scene.getObjectByName(lamp.id).intensity};
 });
 assert(fixture.initialLight>0);await page.screenshot({path:folder+'/before.png'});
 await page.locator('#pause').click();
 const goal=await page.evaluate(p=>campaign.world.screen(p,0),fixture.goal);await page.mouse.click(goal.x,goal.y,{button:'right'});
 await page.waitForFunction(id=>campaign.mission.state.streetFurniture?.[id],fixture.lamp.id,{timeout:15000});
 await page.waitForFunction(id=>campaign.mission.state.time-campaign.mission.state.streetFurniture[id].brokenAt>.42,fixture.lamp.id);
 await page.screenshot({path:folder+'/falling.png'});
 await page.waitForFunction(({id,y})=>{const u=campaign.mission.entity(id);return u.y>y-4&&!u.task;},{id:fixture.carId,y:fixture.goal.y},{timeout:20000});
 await page.locator('#pause').click();
 const fallen=await page.evaluate(()=>{
  const m=campaign.mission,b=m.state.streetFurniture[lampReview.lamp.id],u=m.entity(lampReview.carId);
  const item=m.state.salvage.items.find(i=>i.id===b.salvageId);
  return {item,car:{x:u.x,y:u.y,hp:u.hp,maxHp:u.maxHp},light:campaign.world.scene.getObjectByName(lampReview.lamp.id).intensity,
    nearContact:lampReview.trace.filter(s=>Math.abs(s.y-lampReview.lamp.y)<15)};
 });
 assert(fallen.item,'Fallen pole must remain available for collection');assert.equal(fallen.light,0);
 assert(fallen.nearContact.length>0);assert(fallen.nearContact.every(s=>s.speed>5),'The pole must not stop the car');
 await page.screenshot({path:folder+'/fallen.png'});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:folder+'/fallen-narrow.png'});
 await page.setViewportSize({width:1920,height:1080});
 // Loading before collection must preserve the broken pole and its exact stock.
 await page.evaluate(()=>localStorage.setItem('warGame.alpha.mission01.v1',campaign.mission.save()));
 await page.reload();await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});await page.locator('#resume-save').click();
 await page.waitForFunction(()=>campaign.state.active);await page.locator('#pause').click();
 await page.evaluate(({id,lamp})=>{campaign.select([id]);campaign.world.centre(lamp,190);},{id:fixture.carId,lamp:fixture.lamp});
 assert(await page.evaluate(id=>campaign.mission.state.streetFurniture[id].salvageId===campaign.mission.state.salvage.items.find(i=>i.sourceProp===id)?.id,fixture.lamp.id));
 await page.locator('#design-toggle').click();await page.locator('.design-salvage > summary').click();
 await page.locator('[data-salvage-enabled]').check();await page.locator('[data-close-designer]').click();
 const pickup=await page.evaluate(item=>campaign.world.screen(item,0),fallen.item);
 await page.locator('#pause').click();await page.mouse.click(pickup.x,pickup.y,{button:'right'});
 await page.waitForFunction(id=>campaign.mission.entity(id).damage?.parts?.[26]?.installed,fixture.carId,{timeout:30000});
 await page.locator('#pause').click();
 const installed=await page.evaluate(({id,lamp})=>{
  const {mission:m,world:w}=campaign,u=m.entity(id),c=Math.cos(u.heading),s=Math.sin(u.heading),z=w.field.heightAt(u.x,u.y)+7;
  w.controls.target.set(u.x,u.y,z);w.camera.position.set(u.x-s*100+c*50,u.y+c*100+s*50,z+50);w.controls.update();
  return {hp:u.hp,maxHp:u.maxHp,modification:u.fieldModifications['tube-bumper'],remaining:m.state.salvage.items.filter(i=>i.sourceProp===lamp.id).length};
 },{id:fixture.carId,lamp:fixture.lamp});
 assert.equal(installed.hp,fallen.car.hp+80);assert.equal(installed.maxHp,fallen.car.maxHp+80);assert.equal(installed.remaining,0);
 await page.screenshot({path:folder+'/bumper-desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:folder+'/bumper-narrow.png'});
 await page.setViewportSize({width:1920,height:1080});
 await page.locator('#design-toggle').click();await page.locator('[data-design-slot="field"]').click();
 const choice=page.locator('[data-design-modification="tube-bumper"]');await choice.click();
 await page.screenshot({path:folder+'/bumper-constructor.png'});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:folder+'/bumper-constructor-narrow.png'});
 await page.locator('[data-close-designer]').click();
 await page.evaluate(()=>localStorage.setItem('warGame.alpha.mission01.v1',campaign.mission.save()));
 await page.reload();await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});await page.locator('#resume-save').click();
 await page.waitForFunction(()=>campaign.state.active);
 const afterReload=await page.evaluate(({carId,lamp})=>{
  const m=campaign.mission,u=m.entity(carId);
  return {installed:u.damage?.parts?.[26]?.installed,hp:u.hp,maxHp:u.maxHp,broken:!!m.state.streetFurniture[lamp.id],stock:m.state.salvage.items.filter(i=>i.sourceProp===lamp.id).length};
 },fixture);
 assert.deepEqual(afterReload,{installed:true,hp:400,maxHp:400,broken:true,stock:0},'Loading cannot regenerate the pole, duplicate stock or add the HP bonus again');
 assert.deepEqual(errors,[]);
 fs.writeFileSync(folder+'/checks.json',JSON.stringify({fixture,fallen,installed,afterReload,errors},null,2));
 await page.close();await context.close();
 await page.video().saveAs(folder+'/drive-break-collect.webm');
 console.log('PASS: ordinary map clicks drive through a lit lamp without stopping, lamp falls/goes dark, reload preserves stock, pickup installs a real bumper; desktop/narrow/constructor checked');
}finally{await browser.close();}
