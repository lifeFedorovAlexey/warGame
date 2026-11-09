import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dir='campaign/previews/health-bars';fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1.25}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>{for(const k of ['fieldSound','fieldRadio','fieldStoryVoice'])localStorage.setItem('warGame.'+k,'off');});
 await page.goto('http://127.0.0.1:8766/review/health-bars/campaign/');await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});
 await page.locator('#begin').click();const skip=page.locator('[data-dream=skip]');if(await skip.isVisible())await skip.click();
 await page.evaluate(()=>{const c=campaign,m=c.mission;c.radio.setEnabled(false);const s=m.entity(m.state.openingScene.signId);s.completed=true;s.progress=1;});
 await page.waitForFunction(()=>campaign.state.active,null,{timeout:25000});await page.locator('#pause').click();
 await page.evaluate(async()=>{
  const c=campaign,m=c.mission,w=c.world;window.hpThree=await import('three');
  m.state.units=[];m.state.buildings=[];m.state.salvage.items=[];m.state.storyConstruction={enabled:false};m.updateMission=()=>{};
  m.explored.fill(255);m.visible.fill(255);m.visionSources.push({x:63.5,y:63.5,radius:200});m.fogRevision++;
  c.hpUnits=Array.from({length:9},(_,i)=>{const u=m.addUnit(i===4?'builder':'bukhanka','rai',{x:-1424+(i%3-1)*30,y:240+(Math.floor(i/3)-1)*30});u.heading=i*.8;u.hp=u.maxHp*(i===2?.4:i===5?.2:.8);return u.id;});
  c.select(c.hpUnits,false,false);document.querySelector('#toast').hidden=true;
  w.fixedRenderScale=1;w.renderer.setPixelRatio(1);w.controls.enableDamping=false;w.controls.target.set(-1424,240,3);w.camera.position.copy(w.controls.target).add({x:25,y:-150,z:230});w.controls.update();
 });
 assert.equal(await page.locator('#labels').count(),0,'No independently composited canvas remains');
 const audit=()=>page.evaluate(()=>{
  const c=campaign,m=c.mission,w=c.world,T=window.hpThree;
  w.update(m,new Set(c.selected),0); // Read the framebuffer in this same task, before another animation frame.
  const mesh=w.scene.getObjectByName('unit_health_bars'),rect=mesh.geometry.getAttribute('barRect'),value=mesh.geometry.getAttribute('barValues');
  const u=m.entity(c.hpUnits[0]),pose=w.vehicles.transforms.get(u.id),p=new T.Vector3(0,0,3.2).applyMatrix4(pose.matrix).project(w.camera);
  const x=(p.x+1)*innerWidth/2,y=(1-p.y)*innerHeight/2;
  const gl=w.renderer.getContext(),rgba=new Uint8Array(4),ratio=w.renderer.getPixelRatio();
  gl.readPixels(Math.floor((rect.getX(0)+3.5)*ratio),gl.drawingBufferHeight-1-Math.floor((rect.getY(0)+2.5)*ratio),1,1,gl.RGBA,gl.UNSIGNED_BYTE,rgba);
  return {count:mesh.geometry.instanceCount,visible:mesh.visible,deltaX:Math.abs(rect.getX(0)+rect.getZ(0)/2-x),deltaY:Math.abs(rect.getY(0)+rect.getW(0)+3-y),color:[...rgba],fraction:value.getX(0),error:gl.getError()};
 });
 for(const [angle,distance,ratio] of [[0,280,1],[.5,300,1.15],[-.7,220,.67],[1.2,340,1]]){
  await page.evaluate(([angle,distance,ratio])=>{const w=campaign.world;w.renderer.setPixelRatio(ratio);w.camera.position.copy(w.controls.target).add({x:Math.sin(angle)*distance*.6,y:-Math.cos(angle)*distance*.6,z:distance*.8});w.controls.update();},[angle,distance,ratio]);
  const result=await audit();assert(result.visible&&result.count===9,JSON.stringify(result));assert(result.deltaX<=.51&&result.deltaY<=.51,JSON.stringify(result));assert.equal(result.error,0);
  assert(result.color[1]>result.color[0]+20&&result.color[1]>result.color[2]+30,`HP must exist in the map framebuffer: ${JSON.stringify(result)}`);
 }
 await page.evaluate(()=>{const c=campaign,w=c.world,u=c.mission.entity(c.hpUnits[0]);u.previousX=u.x;u.x+=20;c.mission.renderUnitPhase=()=>.4;w.renderer.setPixelRatio(1);w.camera.position.copy(w.controls.target).add({x:25,y:-170,z:250});w.controls.update();});
 const moving=await audit();assert(moving.deltaX<=.51&&moving.deltaY<=.51,'Anchor must follow the rendered, interpolated vehicle');
 await page.screenshot({path:dir+'/wide.png'});
 const visibility=await page.evaluate(()=>{
  const c=campaign,m=c.mission,w=c.world,mesh=w.scene.getObjectByName('unit_health_bars'),u=m.entity(c.hpUnits[0]);
  c.select([],false,false);u.hp=u.maxHp;w.update(m,new Set(),0);const full=mesh.geometry.instanceCount;
  u.hp=0;w.update(m,new Set(),0);const dead=mesh.geometry.instanceCount;
  w.update(m,new Set(),0,false,false);const hidden=mesh.visible;
  u.hp=u.maxHp*.8;c.select(c.hpUnits,false,false);w.update(m,new Set(c.selected),0);
  return {full,dead,hidden};
 });assert.deepEqual(visibility,{full:8,dead:8,hidden:false});
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>{const w=campaign.world;w.camera.position.copy(w.controls.target).add({x:15,y:-310,z:510});w.controls.update();});
 await page.waitForTimeout(200);const narrow=await audit();assert(narrow.visible&&narrow.count===9);assert(narrow.deltaX<=.51&&narrow.deltaY<=.51);await page.screenshot({path:dir+'/narrow.png'});
 const construction=await page.evaluate(()=>{
  const c=campaign,m=c.mission,w=c.world;m.state.units=[];c.select([],false,false);
  const b=m.addStructure('generator','rai',{x:-1424,y:240},{progress:.4,completed:false,groundHeight:w.field.heightAt(-1424,240)+2});
  w.update(m,new Set(),0);const mesh=w.scene.getObjectByName('unit_health_bars');
  const progress=mesh.geometry.getAttribute('barValues').getW(0),count=mesh.geometry.instanceCount;
  b.completed=true;b.hp=b.maxHp*.7;w.update(m,new Set(),0);const finished=mesh.geometry.instanceCount;
  b.owner='scavs';m.visibleAt=()=>false;w.update(m,new Set(),0);const fog=mesh.geometry.instanceCount;
  return {progress,count,finished,fog};
 });assert(Math.abs(construction.progress-.4)<.001);assert.equal(construction.count,1);assert.equal(construction.finished,1);assert.equal(construction.fog,0);
 assert.deepEqual(errors,[]);console.log('PASS: HP in the same WebGL framebuffer, camera pan/orbit/zoom, render scales 0.67/1/1.15, interpolated units, full/dead/intro visibility, narrow viewport, no browser errors');
}finally{await browser.close();}
