import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const folder='campaign/previews/base-yard';fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
 await page.addInitScript(()=>localStorage.setItem('warGame.fieldRadio','off'));
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8766/review/base-yard')+'/campaign/');
 await page.waitForFunction(()=>window.campaign?.ready||document.querySelector('#loading-status').textContent.startsWith('Ошибка'),null,{timeout:90000});
 assert(await page.evaluate(()=>window.campaign?.ready),JSON.stringify({errors,status:await page.locator('#loading-status').textContent()}));
 await page.locator('#begin').click();
 await page.evaluate(()=>campaign.advance(45));await page.waitForFunction(()=>campaign.state.active);
 await page.locator('#pause').click();
 const state=await page.evaluate(()=>{
  const {mission:m,world:w}=campaign,start=w.field.gridToWorld(m.config.startGrid);
  // Reveal the yard for this layout review; it does not alter the game's exploration.
  m.explored.fill(255);m.visible.fill(255);m.visionSources.push({x:14.5,y:53.5,radius:14});m.fogRevision++;
  w.centre({x:start.x-25,y:start.y+50},530);
  const yard=w.scene.getObjectByName('base_yard');
  const markings=yard.getObjectByName('building_plot_markings');
  const lights=[];yard.traverse(node=>{if(node.isPointLight)lights.push(node.intensity);});
  return {hasYard:!!yard,plotVertices:markings?.geometry.attributes.position.count,buildings:m.state.buildings.filter(b=>b.owner==='rai').length,lights};
 });
 assert(state.hasYard);
 assert(state.plotVertices>0,'Prepared sites have physical survey markings');
 assert.equal(state.buildings,1,'Only the built sign is a gameplay structure; scenery adds none');
 assert.equal(state.lights.length,7);assert(state.lights.every(i=>i===0),'Yard lamps wait for the AЭС');
 await page.screenshot({path:folder+'/prepared-sites-desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:folder+'/prepared-sites-narrow.png'});
 await page.setViewportSize({width:1440,height:960});
 const power=await page.evaluate(()=>{
  const {mission:m}=campaign;
  for(const site of m.config.baseSites){
   const p=m.field.gridToWorld(site.grid),b=m.addStructure(site.kind,'rai',p,{completed:true,progress:1,rotation:(site.rotationDegrees??0)*Math.PI/180,groundHeight:m.field.heightAt(p.x,p.y)});
  }
  m.updateEconomy(0);campaign.advance(0);
  return {powered:m.state.powered,oil:m.state.oilLinked};
 });
 assert.deepEqual(power,{powered:true,oil:0});
 await page.screenshot({path:folder+'/developed-base-desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:folder+'/developed-base-narrow.png'});
 assert(await page.evaluate(()=>{
  const {mission,world}=campaign,lights=[];
  world.scene.getObjectByName('base_yard').traverse(node=>{if(node.isPointLight)lights.push(node);});
  return lights.every(light=>mission.state.streetFurniture?.[light.name]?light.intensity===0:light.intensity>0);
 }),'AЭС powers intact yard lamps before oil extraction; broken poles remain off');
 await page.setViewportSize({width:1440,height:900});
 await page.evaluate(()=>{
  const {mission:m,world:w}=campaign,sign=m.entity(m.state.openingScene.signId);w.centre(sign,150);
  const radius=Math.hypot(w.camera.position.x-w.controls.target.x,w.camera.position.y-w.controls.target.y);
  w.camera.position.x=w.controls.target.x+Math.sin(sign.rotation)*radius;
  w.camera.position.y=w.controls.target.y-Math.cos(sign.rotation)*radius;w.controls.update();
 });
 await page.screenshot({path:folder+'/i-love-rai.png'});
 assert.deepEqual(errors,[]);console.log('PASS: base scenery, prepared and developed layouts, nuclear power before oil, desktop and narrow screenshots');
}finally{await browser.close();}
