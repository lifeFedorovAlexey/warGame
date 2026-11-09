import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const folder='campaign/previews/buildings-only-repair';fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('warGame.fieldRadio','off'));
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8766')+'/campaign/');
 await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});await page.locator('#begin').click();
 await page.evaluate(()=>campaign.advance(40));await page.waitForFunction(()=>campaign.state.active,null,{timeout:60000});await page.locator('#pause').click();
 await page.evaluate(()=>{
  const c=campaign,m=c.mission;m.updateMission=()=>{};
  Object.assign(m.state,{units:[],buildings:[],camps:[],artifacts:[],raidReserve:[],energy:2400,storyConstruction:{enabled:false}});
  const building=m.addStructure('generator','rai',{x:-1600,y:400},{completed:true,progress:1,groundHeight:m.field.heightAt(-1600,400)});
  const worker=m.addUnit('builder','rai',{x:-1600,y:340}),van=m.addUnit('bukhanka','rai',{x:-1540,y:340});building.hp=building.maxHp*.3;van.hp=100;
  window.repairFixture={building:building.id,worker:worker.id,van:van.id,hp:building.hp};
  m.rebuildNavigation();m.updateFog();c.select([worker.id]);c.world.centre({x:-1600,y:380},240);c.advance(0);
 });
 await page.locator('#combat-modes').click();const toggle=page.locator('[data-auto-repair]');
 assert.equal(await toggle.getAttribute('aria-label'),'Авторемонт построек');await toggle.click();
 assert.equal(await toggle.getAttribute('aria-pressed'),'true');
 const result=await page.evaluate(()=>{
  const c=campaign,m=c.mission;for(let i=0;i<40;i++)m.advance(.1);c.advance(0);
  const worker=m.entity(repairFixture.worker),building=m.entity(repairFixture.building),van=m.entity(repairFixture.van);
  return {buildingHp:building.hp,before:repairFixture.hp,vanHp:van.hp,target:worker.task?.targetId,building:building.id,beam:!!worker.builderWorking};
 });
 assert(result.buildingHp>result.before);assert.equal(result.vanHp,100);assert.equal(result.target,result.building);assert(result.beam);
 await toggle.hover();assert.match(await page.locator('#combat-hint').innerText(),/постройки рядом/);
 await page.screenshot({path:folder+'/desktop.png'});
 await page.setViewportSize({width:390,height:844});
 await page.waitForFunction(()=>{const r=document.querySelector('#combat-menu').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;});
 await toggle.hover();await page.screenshot({path:folder+'/narrow.png'});await toggle.click();
 const manual=await page.evaluate(()=>{
  const m=campaign.mission,worker=m.entity(repairFixture.worker);
  return {enabled:m.state.builderAutoRepair,auto:!!worker.task?.autoRepair,car:m.submitOrder([worker.id],'repair',m.entity(repairFixture.van)).ok,
   building:m.submitOrder([worker.id],'repair',m.entity(repairFixture.building)).ok};
 });
 assert.deepEqual(manual,{enabled:false,auto:false,car:false,building:true});assert.deepEqual(errors,[]);
 fs.writeFileSync(folder+'/verification.json',JSON.stringify({result,manual,errors},null,2));
 console.log('PASS: real auto-repair toggle, building HP and beam, vehicle exclusion, manual building repair, desktop and narrow tooltip');
}finally{await browser.close();}
