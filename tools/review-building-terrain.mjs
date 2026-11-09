import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dir='campaign/previews/building-terrain';fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>{for(const k of ['fieldSound','fieldRadio','fieldStoryVoice'])localStorage.setItem('warGame.'+k,'off');});
 await page.goto('http://127.0.0.1:8766/review/building-terrain/campaign/');await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});
 await page.locator('#begin').click();const skip=page.locator('[data-dream=skip]');if(await skip.isVisible())await skip.click();
 await page.evaluate(()=>{const m=campaign.mission;campaign.radio.setEnabled(false);const sign=m.entity(m.state.openingScene.signId);sign.completed=true;sign.progress=1;});
 await page.waitForFunction(()=>campaign.state.active,null,{timeout:25000});await page.locator('#pause').click();
 await page.evaluate(()=>{
  const c=campaign,m=c.mission,w=c.world;c.renderSuspended=true;m.state.units=[];m.state.buildings=[];m.state.salvage.items=[];m.state.storyConstruction={enabled:false};m.state.energy=2400;m.updateMission=()=>{};
  m.explored.fill(255);m.visible.fill(255);m.visionSources.push({x:63.5,y:63.5,radius:200});m.fogRevision++;
  const p={x:-752,y:1024},well=w.field.gridToWorld([38,30]);m.addStructure('derrick','rai',well,{completed:true,progress:1});
  const u=m.addUnit('builder','rai',{x:p.x,y:p.y-110});u.heading=0;c.terrainTest={site:p,builder:u.id};m.rebuildNavigation();c.select([u.id],false,false);
  w.fixedRenderScale=1;w.controls.enableDamping=false;w.controls.target.set(p.x-18,p.y+15,3);w.camera.position.copy(w.controls.target).add({x:25,y:-220,z:300});w.controls.update();w.update(m,new Set([u.id]),0);c.advance(0);
 });
 const draw=()=>page.evaluate(()=>{const c=campaign;c.world.update(c.mission,new Set(c.selected),0);});
 const move=async()=>{const p=await page.evaluate(()=>campaign.world.screen(campaign.terrainTest.site,0));await page.mouse.move(p.x,p.y);await draw();return p;};
 const preview=()=>page.evaluate(()=>campaign.world.scene.getObjectByName('building_placement_grid').userData);
 await page.locator('#build-toggle').click();await page.locator('#build-cards [data-icon=generator]').click();await move();
 const initial=await preview();assert(initial.valid,JSON.stringify(initial));assert.equal(initial.x,-752);assert.equal(initial.y,1024);
 await page.keyboard.press('q');await draw();assert.equal((await preview()).rotation,Math.PI*1.5);
 await page.keyboard.press('e');await draw();assert.equal((await preview()).rotation,0);
 await page.evaluate(()=>document.body.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyE',key:'у',bubbles:true})));await draw();assert.equal((await preview()).rotation,Math.PI/2,'Physical E works with Russian layout');
 await page.evaluate(()=>document.body.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyE',key:'у',repeat:true,bubbles:true})));assert.equal((await preview()).rotation,Math.PI/2,'Holding a key does not spin repeatedly');
 await page.keyboard.press('q');await draw();assert.equal((await preview()).rotation,0);
 await page.screenshot({path:dir+'/placement.png'});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);
 await page.evaluate(()=>{const w=campaign.world,offset=w.camera.position.clone().sub(w.controls.target).multiplyScalar(1.7);w.camera.position.copy(w.controls.target).add(offset);w.controls.update();});await move();
 assert((await preview()).valid);await page.screenshot({path:dir+'/placement-narrow.png'});
 await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(300);
 await page.evaluate(()=>{const w=campaign.world,offset=w.camera.position.clone().sub(w.controls.target).divideScalar(1.7);w.camera.position.copy(w.controls.target).add(offset);w.controls.update();});const at=await move();
 await page.mouse.click(at.x,at.y);await draw();
 const built=await page.evaluate(()=>{
  const c=campaign,m=c.mission,u=m.entity(c.terrainTest.builder),b=m.state.buildings.find(b=>b.kind==='generator');if(!b)return null;
  for(let i=0;i<900&&!b.completed;i++){m.advance(.1);m.finishPendingStep();}c.advance(0);c.world.update(m,new Set([u.id]),0);
  const root=c.world.buildingObjects.get(b.id),foot=root.getObjectByName('building_foundation').children.find(n=>n.material.name==='foundation_concrete');
  return {completed:b.completed,height:b.groundHeight,footScale:foot.scale.z,footOffset:foot.position.z,builderMoved:u.y>c.terrainTest.site.y-95};
 });assert(built?.completed&&built.builderMoved&&built.footScale>1,JSON.stringify(built));
 await page.screenshot({path:dir+'/completed.png'});
 await page.keyboard.press('q');await page.keyboard.press('e');assert.equal(await page.evaluate(()=>campaign.state.buildKind),null,'Q/E outside placement do not activate construction');
 assert.deepEqual(errors,[]);fs.writeFileSync(dir+'/report.json',JSON.stringify({initial,built},null,2));
 console.log('PASS: real formerly blocked site, Q/E and Russian layout, no key-repeat spin, click-to-build, builder approach and completion, adapted footing, wide/narrow views, no browser errors');
}finally{await browser.close();}
