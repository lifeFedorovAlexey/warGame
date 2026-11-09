import assert from 'node:assert/strict';
import fs from 'node:fs';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const folder='campaign/previews/camp-demolition';fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
 await page.addInitScript(()=>{for(const key of ['fieldRadio','fieldSound','fieldStoryVoice'])localStorage.setItem('warGame.'+key,'off');});
 await page.goto('http://127.0.0.1:8766/review/camp-demolition/campaign/');
 await page.waitForFunction(()=>window.campaign?.ready||document.querySelector('#loading-status')?.textContent.startsWith('Ошибка'),null,{timeout:90000});
 assert(await page.evaluate(()=>window.campaign?.ready),errors.join('\n'));
 await page.locator('#begin').click();const skip=page.locator('[data-dream=skip]');if(await skip.isVisible())await skip.click();
 await page.evaluate(()=>{const m=campaign.mission;campaign.radio.setEnabled(false);const sign=m.entity(m.state.openingScene.signId);sign.completed=true;sign.progress=1;});
 await page.waitForFunction(()=>campaign.state.active,null,{timeout:20000});await page.locator('#pause').click();
 const fixture=await page.evaluate(async()=>{
  const {isCampPerimeter}=await import('./camp-demolition.js'),{campBaseLayout}=await import('./scav-base-layout.js');
  const {mission:m,world:w}=campaign,camp=m.state.camps[0],layout=campBaseLayout(camp),n=layout.normal,z=w.field.heightAt(layout.centre.x,layout.centre.y);
  campaign.renderSuspended=true;m.state.flags.lastRevealed=true;m.state.bounds=m.config.finalMapBounds.slice();m.rebuildNavigation();
  const updateFog=m.updateFog.bind(m);
  m.updateFog=()=>{updateFog();m.visible.fill(255);m.explored.fill(255);m.visionSources.push({x:63.5,y:63.5,radius:200});m.fogRevision++;};m.updateFog();
  w.fixedRenderScale=1;w.controls.enableDamping=false;w.controls.target.set(layout.centre.x,layout.centre.y,z+8);
  w.camera.position.set(layout.centre.x+n.x*255-n.y*115,layout.centre.y+n.y*255+n.x*115,z+250);w.controls.update();w.update(m,new Set(),0);
  const walls=m.state.buildings.filter(b=>b.campId===camp.id&&isCampPerimeter(b));
  const neighbour=m.state.buildings.filter(b=>b.campId===m.state.camps[1].id).map(b=>[b.id,b.hp]);
  return {campId:camp.id,wallIds:walls.map(b=>b.id),neighbour};
 });
 assert(fixture.wallIds.length>4);await page.screenshot({path:folder+'/base-before.png'});
 const lastId=await page.evaluate(async campId=>{
  const {isCampPerimeter}=await import('./camp-demolition.js'),{updateWrecks}=await import('./wreck-lifecycle.js');
  const m=campaign.mission,buildings=m.state.buildings.filter(b=>b.campId===campId&&!isCampPerimeter(b)),last=buildings.find(b=>b.kind==='scav-store');
  for(const b of buildings)if(b!==last)m.damage(b,b.hp);
  m.drainEffects();m.state.time+=7;updateWrecks(m);m.updateMission();m.rebuildNavigation();campaign.world.update(m,new Set(),0);
  return last.id;
 },fixture.campId);
 assert(await page.evaluate(ids=>ids.every(id=>campaign.mission.entity(id)?.hp>0),fixture.wallIds));
 await page.screenshot({path:folder+'/last-building.png'});
 await page.evaluate(id=>{const m=campaign.mission,b=m.entity(id);m.damage(b,b.hp);m.advance(.1);campaign.world.update(m,new Set(),0);},lastId);
 for(let i=0;i<60;i++){
  await page.waitForTimeout(60);
  await page.evaluate(()=>{const m=campaign.mission;m.advance(.06);campaign.world.update(m,new Set(),.06);});
  if(i===7)await page.screenshot({path:folder+'/perimeter-explosions.png'});
  if(i>=7&&await page.evaluate(ids=>ids.every(id=>!campaign.mission.entity(id)),fixture.wallIds))break;
 }
 assert(await page.evaluate(ids=>ids.every(id=>!campaign.mission.entity(id)),fixture.wallIds));
 assert.deepEqual(await page.evaluate(ids=>ids.map(([id])=>[id,campaign.mission.entity(id)?.hp]),fixture.neighbour),fixture.neighbour);
 assert(await page.evaluate(id=>campaign.mission.state.units.some(u=>u.campId===id&&u.hp>0),fixture.campId),'Surviving enemy units remain');
 await page.evaluate(async()=>{const {updateWrecks}=await import('./wreck-lifecycle.js'),m=campaign.mission;m.state.time+=7;updateWrecks(m);m.rebuildNavigation();});
 await page.waitForTimeout(2000);await page.evaluate(()=>campaign.world.update(campaign.mission,new Set(),0));
 await page.screenshot({path:folder+'/base-after.png'});
 await page.setViewportSize({width:390,height:844});
 await page.waitForTimeout(200);
 const narrowView=await page.evaluate(campId=>{
  const w=campaign.world,offset=w.camera.position.clone().sub(w.controls.target).multiplyScalar(1.8);
  w.camera.position.copy(w.controls.target).add(offset);w.controls.update();w.update(campaign.mission,new Set(),0);
  return campaign.mission.state.units.filter(u=>u.campId===campId&&u.hp>0).some(u=>{const p=w.screen(u,5);return p.visible&&p.x>0&&p.x<innerWidth&&p.y>0&&p.y<innerHeight;});
 },fixture.campId);
 assert(narrowView,'The cleared base and surviving troops stay in view on a narrow screen');
 await page.screenshot({path:folder+'/after-narrow.png'});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,segments:fixture.wallIds.length,lastBuilding:'warehouse',actualSimulation:true,neighbourUntouched:true,survivorsAlive:true,narrow:true}));
}finally{await browser.close();}
