import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dir='campaign/previews/factory-access';fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{for(const k of ['fieldSound','fieldRadio','fieldStoryVoice'])localStorage.setItem('warGame.'+k,'off');});
 const url=process.argv.find(arg=>arg.startsWith('--url='))?.slice(6)??'http://127.0.0.1:8766/review/factory-access/campaign/';
 await page.goto(url);await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});
 await page.locator('#begin').click();await page.waitForFunction(()=>document.getElementById('welcome').hidden);if(await page.locator('[data-dream=skip]').isVisible())await page.locator('[data-dream=skip]').click();
 await page.evaluate(()=>{campaign.radio.setEnabled(false);const m=campaign.mission,s=m.entity(m.state.openingScene.signId);s.completed=true;s.progress=1;});
 await page.waitForFunction(()=>campaign.state.active,null,{timeout:25000});await page.locator('#pause').click();
 const fixture=await page.evaluate(()=>{
  const c=campaign,m=c.mission,w=c.world;m.state.units=[];m.state.buildings=[];m.state.camps=[];m.state.energy=2400;m.updateMission=()=>{};m.constructionUnlocked=()=>true;m.state.storyConstruction={enabled:false};m.explored.fill(255);m.visible.fill(255);m.fogRevision++;m.rebuildNavigation();
  const started=performance.now(),p=m.placement('factory',-1600,224,0,{snap:false}),ms=performance.now()-started;
  if(!p.ok)return {error:p.reason,ms};
  const worker=m.addUnit('builder','rai',{x:p.x-110,y:p.y-90});c.select([worker.id],false,false);
  w.fixedRenderScale=1;w.renderer.setPixelRatio(1);w.controls.enableDamping=false;w.controls.target.set(p.x,p.y-50,10);w.camera.position.copy(w.controls.target).add({x:180,y:-330,z:340});w.controls.update();w.setGhost('factory',p,m);
  c.accessFixture={p,worker:worker.id};return {roads:p.accessRoads,ms};
 });
 assert(!fixture.error,JSON.stringify(fixture));assert.equal(fixture.roads.length,2);await page.waitForTimeout(250);await page.screenshot({path:dir+'/placement.png'});
 const repair=await page.evaluate(()=>{
  const c=campaign,m=c.mission,{p,worker}=c.accessFixture,result=m.build([worker],'factory',p.x,p.y,p.rotation,{snap:false});if(!result.ok)return result;
  const f=m.entity(result.id);f.completed=true;f.progress=1;f.funding.paid=f.cost;c.factoryTest=f.id;c.world.setGhost(null);
  const units=Array.from({length:11},(_,i)=>{const u=m.addUnit('bukhanka','rai',{x:f.x,y:f.y-13.5},{heading:f.rotation});u.hp=100;u.factoryVisit={factoryId:f.id,phase:'inside',slot:i,arrived:i};u.combatRetreat={status:'servicing',forced:true,home:{id:f.id,x:f.x,y:f.y}};return u;});
  const hp=units[0].hp,oil=m.state.energy;m.updateEconomy(2);c.select([f.id],false,false);c.advance(0);
  return {ok:true,before:hp,after:units[0].hp,oil:oil-m.state.energy,active:f.activeRepair,roads:f.accessRoads.length};
 });
 assert(repair.ok&&repair.after>repair.before&&repair.oil>0&&repair.active&&repair.roads===2,JSON.stringify(repair));
 await page.waitForTimeout(300);assert(await page.locator('[data-factory-priority] progress').isVisible());await page.screenshot({path:dir+'/front.png'});
 const shutters=await page.evaluate(()=>{const c=campaign,object=c.world.buildingObjects.get(c.factoryTest),a=object.getObjectByName('factory_shutter'),b=object.getObjectByName('factory_exit_shutter');return {front:a.position.y,rear:b.position.y};});assert(shutters.front<0&&shutters.rear>0);
 await page.evaluate(()=>{const c=campaign,m=c.mission,f=m.entity(c.factoryTest),u=m.state.units.find(u=>u.factoryVisit);u.hp=u.maxHp;
  // Advance real garage logic until the first repaired car is crossing out.
  for(let i=0;i<15;i++){m.advance(.1);m.finishPendingStep();}c.advance(0);
  c.world.camera.position.copy(c.world.controls.target).add({x:-180,y:330,z:340});c.world.controls.update();
 });
 await page.waitForTimeout(300);const exiting=await page.evaluate(()=>{const c=campaign,f=c.mission.entity(c.factoryTest);return {id:f.garageExit,phase:c.mission.entity(f.garageExit)?.factoryVisit?.phase,open:c.world.buildingObjects.get(f.id).getObjectByName('factory_exit_shutter').position.z};});assert(exiting.id&&exiting.open>1,JSON.stringify(exiting));
 await page.screenshot({path:dir+'/rear.png'});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(250);await page.screenshot({path:dir+'/narrow.png'});
 assert.deepEqual(errors,[]);fs.writeFileSync('campaign/reports/factory-access-browser.json',JSON.stringify({fixture,repair,exiting,errors},null,2));console.log(JSON.stringify({pass:true,placementMs:fixture.ms,hp:[repair.before,repair.after],oil:repair.oil,shutters,exiting}));
}finally{await browser.close();}
