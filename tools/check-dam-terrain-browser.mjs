import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const before=process.argv.includes('--before'),software=process.argv.includes('--software'),dir='campaign/previews/dam-terrain',prefix=(before?'before-':'')+(software?'software-':'');fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:software?['--enable-unsafe-swiftshader','--use-angle=swiftshader']:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>{for(const k of ['fieldSound','fieldRadio','fieldStoryVoice'])localStorage.setItem('warGame.'+k,'off');});
 await page.goto('http://127.0.0.1:8766/review/dam-terrain/campaign/');await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});
 await page.locator('#begin').click();const skip=page.locator('[data-dream=skip]');if(await skip.isVisible())await skip.click();
 await page.waitForFunction(()=>campaign.mission.state.openingScene?.signId||campaign.state.active,null,{timeout:60000});
 await page.evaluate(()=>{const c=campaign,m=c.mission;c.radio.setEnabled(false);const s=m.entity(m.state.openingScene?.signId);if(s){s.completed=true;s.progress=1;}});
 await page.waitForFunction(()=>campaign.state.active,null,{timeout:25000});await page.locator('#pause').click();
 await page.evaluate(async()=>{const c=campaign,m=c.mission,w=c.world;c.renderSuspended=true;c.damModule=await import('./dam-layout.js');c.damLayout=c.damModule.damLayout(w.field,m.config);m.state.time=9.7;m.updateMission=()=>{};c.select([],false,false);w.fixedRenderScale=1;w.renderer.setPixelRatio(1);w.controls.enableDamping=false;document.querySelector('#toast').hidden=true;});
 const results=[];
 const near=software?.5:1;
 for(const view of [{name:'left-close',x:-58,y:2,distance:near},{name:'right-close',x:58,y:2,distance:near},{name:'right-low',x:35,y:-8,distance:1,low:true},{name:'overview',x:0,y:-9,distance:5},{name:'close-again',x:-58,y:2,distance:near}]){
  const result=await page.evaluate(view=>{const c=campaign,w=c.world,m=c.mission,p=c.damModule.damWorld(c.damLayout,view.x,view.y);m.visible.fill(255);m.explored.fill(255);m.visionSources=[{x:63.5,y:63.5,radius:200}];m.fogRevision++;w.controls.target.set(p.x,p.y,w.field.heightAt(p.x,p.y)+20);w.camera.position.copy(w.controls.target).add({x:(view.low?200:140)*view.distance,y:(view.low?200:(view.x>0?85:-85))*view.distance,z:(view.low?85:115)*view.distance});w.controls.update();w.update(m,new Set(),0);const bank=w.scene.getObjectByName('reservoir_earth_banks'),ground=w.terrain.root.children.find(n=>n.name.startsWith('alpha_terrain_chunk'));return {name:view.name,mode:w.statistics.terrainMode,sameMaterial:bank.userData.terrainSourceMaterial===ground.material,bank:bank.material.type,ground:ground.material.type};},view);
  await page.waitForTimeout(100);await page.screenshot({path:`${dir}/${prefix}${view.name}.png`});results.push(result);
 }
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);await page.evaluate(()=>{const c=campaign,w=c.world;w.update(c.mission,new Set(),0);});await page.screenshot({path:`${dir}/${prefix}narrow.png`});
 if(!before){assert(results.every(r=>r.sameMaterial),JSON.stringify(results));assert.deepEqual(results.map(r=>r.mode),['close','close',software?'overview':'close','overview','close']);}
 assert.deepEqual(errors,[]);console.log(JSON.stringify(results));console.log(before?'Recorded baseline seam':'PASS: matching terrain material through close / overview / close, both shoulders and narrow screen');
}finally{await browser.close();}
