import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dir='docs/campaign/alpha/m02/art-v3';fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const errors=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});page.setDefaultTimeout(60000);page.on('pageerror',e=>{errors.push(e.message);console.log(e.message);});
 await page.goto('http://127.0.0.1:8766/campaign/?mission=m02');
 try{await page.waitForFunction(()=>window.campaign?.ready,{},{timeout:120000});}
 catch(error){console.log('STARTUP '+await page.locator('body').innerText());await page.screenshot({path:dir+'/startup-failure.png'});throw error;}
 await page.locator('#begin').click();await page.waitForFunction(()=>campaign.state.active&&!campaign.state.openingPlaying,{},{timeout:120000});
 await page.locator('#pause').click();await page.evaluate(()=>{campaign.radio.dismiss();campaign.select([]);campaign.world.fixedRenderScale=1;campaign.world.renderer.setPixelRatio(1);const m=campaign.mission;for(let y=0;y<128;y++)for(let x=0;x<=53;x++)m.explored[y*128+x]=255;m.fogRevision++;});
 for(const [name,grid,distance] of [['radar-tower',[30.5,88.5],330],['east-base',[34,77.4],490],['west-base',[15,72],600],['energy-base',[26,108.2],670],['overview',[26,88],2150],['junction-east-entry',[37.8,80.4],300],['junction-west-bypass',[7.5,79.5],360],['junction-west',[8.8,76.8],260],['junction-energy',[24.1,111.1],260],['junction-radar',[26.6,89.5],260],['junction-energy-north',[21.8,104.5],260],['junction-energy-entry',[30.5,107.8],260]]){
  await page.evaluate(({grid,distance})=>{const m=campaign.mission;m.visionSources=[{x:grid[0],y:grid[1],radius:45}];m.fogRevision++;campaign.world.centre(m.field.gridToWorld(grid),distance);},{grid,distance});
  await page.waitForTimeout(450);await page.screenshot({path:dir+'/'+name+'.png'});console.log('SCREEN '+name);
 }
 const rotation=await page.evaluate(async()=>{
  const m=campaign.mission,w=campaign.world,p=m.field.gridToWorld([29.6,89.7]),u=m.addUnit('sensor','rai',p);
  w.centre(p,300);m.visionSources=[{x:30.5,y:88.5,radius:45}];m.fogRevision++;
  const tower=m.state.buildings.find(b=>b.kind==='scav-sensor');
  const draw=()=>w.update(m,new Set(),0,false),read=()=>{
   const mount=w.buildingObjects.get(tower.id).getObjectByName('radar_mount');
   const mesh=w.vehicles.root.children.find(o=>o.isInstancedMesh&&o.material.name==='radar_reflector'&&o.count);
   return {tower:mount.rotation.z,mobile:mesh?Array.from(mesh.instanceMatrix.array.slice(0,16)):null};
  };
  draw();const before=read();m.advance(3);draw();const after=read();
  await new Promise(r=>setTimeout(r,300));draw();const paused=read();
  m.state.units=m.state.units.filter(v=>v.id!==u.id);return {before,after,paused};
 });
 assert(rotation.before.mobile&&rotation.after.mobile,'Mobile dish must be rendered');
 assert(Math.abs(rotation.after.tower-rotation.before.tower)>.5,'Tower dish must turn');
 assert.notDeepEqual(rotation.after.mobile,rotation.before.mobile,'Instanced mobile dish must turn');
 assert.deepEqual(rotation.paused,rotation.after,'Both dishes must stop when simulation is paused');
 await page.evaluate(()=>{campaign.mission.state.research.sensor=true;});await page.locator('#design-toggle').click();
 await page.locator('[data-design-slot="upper"]').click();await page.locator('[data-design-component="U21"]').click();await page.waitForTimeout(600);
 await page.screenshot({path:dir+'/radar-module.png'});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(400);await page.screenshot({path:dir+'/radar-module-narrow.png'});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.locator('[data-close-designer]').click();await page.evaluate(()=>{const m=campaign.mission;campaign.radio.dismiss();m.visionSources=[{x:26,y:108.2,radius:45}];m.fogRevision++;campaign.world.centre(m.field.gridToWorld([26,108.2]),500);});await page.waitForTimeout(400);await page.screenshot({path:dir+'/base-narrow.png'});
 await page.evaluate(()=>{const m=campaign.mission;m.visionSources=[{x:34,y:78.5,radius:45}];m.fogRevision++;campaign.world.centre(m.field.gridToWorld([34,78.5]),490);});await page.waitForTimeout(400);await page.screenshot({path:dir+'/east-base-narrow.png'});
 assert.equal(await page.evaluate(()=>document.querySelector('#world').getBoundingClientRect().height),844);assert.deepEqual(errors,[]);
 fs.writeFileSync(dir+'/browser.json',JSON.stringify({passed:true,errors,rotation,viewports:[[1440,900],[390,844]],screenshots:16},null,2));console.log('PASS m02 art, rotating tower + mobile dish, pause, four sites, junction closeups and narrow screen');
}finally{await browser.close();}
