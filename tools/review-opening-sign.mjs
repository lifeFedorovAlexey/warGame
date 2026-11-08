import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const folder='campaign/previews/opening-sign';fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8766/review/opening-sign')+'/campaign/');
 await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});
 await page.locator('#begin').click();
 await page.locator('[data-dream="skip"]').click();
 for(const scene of ['p02','p03']){
  await page.waitForFunction(id=>campaign.radio.entry?.storyScene===id,scene);
  await page.locator('#radio [data-dismiss]').click();
 }
 // Run real simulation steps, including navigation, builder aim and construction.
 await page.evaluate(()=>campaign.advance(45));
 await page.waitForFunction(()=>campaign.radio.entry?.storyScene==='p04');
 await page.evaluate(()=>{campaign.radio.until=Infinity;campaign.renderSuspended=true;});
 assert.equal(await page.evaluate(()=>campaign.state.active),false);
 await page.keyboard.press('f');assert.equal(await page.evaluate(()=>campaign.state.orderMode),null);
 const sign=await page.evaluate(()=>campaign.mission.entity(campaign.mission.state.openingScene.signId));
 assert(sign.completed);
 await page.evaluate(()=>{campaign.renderSuspended=false;});
 await page.screenshot({path:folder+'/sign-desktop.png'});
 await page.setViewportSize({width:390,height:844});
 await page.waitForFunction(()=>{
  const {world,mission}=campaign,sign=mission.entity(mission.state.openingScene.signId);
  const top=world.screen(sign,mission.config.buildings['base-sign'].realSizeMetres[2]*mission.config.worldScale);
  return top.y>44&&top.y<innerHeight-140;
 });
 await page.screenshot({path:folder+'/sign-narrow.png'});
 await page.locator('#radio [data-dismiss]').click();
 await page.waitForFunction(()=>campaign.state.active);
 await page.keyboard.press('f');assert.equal(await page.evaluate(()=>campaign.state.orderMode),'attack');
 // Exercise the actual load UI with a legacy height and unchanged XY/rotation.
 const saved=await page.evaluate(()=>{
  const data=JSON.parse(campaign.mission.save()),sign=data.state.buildings.find(b=>b.id===data.state.openingScene.signId);
  const expected={x:sign.x,y:sign.y,rotation:sign.rotation,groundHeight:sign.groundHeight,progress:sign.progress,completed:sign.completed};
  sign.groundHeight+=12;localStorage.setItem('warGame.alpha.mission01.v1',JSON.stringify(data));return expected;
 });
 await page.reload();await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});
 await page.locator('#resume-save').click();await page.waitForFunction(()=>campaign.state.active);
 const restored=await page.evaluate(()=>{
  const sign=campaign.mission.entity(campaign.mission.state.openingScene.signId);
  return {x:sign.x,y:sign.y,rotation:sign.rotation,groundHeight:sign.groundHeight,progress:sign.progress,completed:sign.completed};
 });
 assert.deepEqual(restored,saved,'Loading must correct the old elevation without relocating or rebuilding the sign');
 await page.locator('#pause').click();
 // A close inspection only for the review shot; the game itself keeps its camera.
 await page.setViewportSize({width:1440,height:900});
 await page.evaluate(()=>{
  const {world,mission}=campaign,sign=mission.entity(mission.state.openingScene.signId);
  world.centre(sign,220);
 });
 await page.screenshot({path:folder+'/sign-at-hill.png'});
 await page.evaluate(()=>{
  const {world,mission}=campaign,sign=mission.entity(mission.state.openingScene.signId);
  const z=sign.groundHeight+1.7*mission.config.worldScale,angle=sign.rotation;
  world.controls.target.set(sign.x,sign.y,z);
  world.camera.position.set(sign.x+Math.sin(angle)*102,sign.y-Math.cos(angle)*102,z+43);
  world.controls.update();
 });
 await page.screenshot({path:folder+'/sign-lettering-close.png'});
 await page.screenshot({path:folder+'/sign-lettering-detail.png',clip:{x:480,y:310,width:480,height:310}});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:folder+'/sign-lettering-narrow.png'});
 await page.setViewportSize({width:1440,height:900});
 const footing=await page.evaluate(async()=>{
  const T=await import('../demo/vendor/three.module.js');
  const {world,mission}=campaign,sign=mission.entity(mission.state.openingScene.signId),scale=mission.config.worldScale;
  const chunks=world.scene.getObjectByName('Alpha_4064m_heightfield').children.filter(o=>o.name.startsWith('alpha_terrain_chunk_'));
  world.scene.updateMatrixWorld(true);
  const [width,depth]=mission.config.buildings['base-sign'].realSizeMetres,c=Math.cos(sign.rotation),s=Math.sin(sign.rotation),ray=new T.Raycaster(),gaps=[];
  for(let i=0;i<=32;i++)for(const y of [-depth/2,depth/2]){
   const x=-width/2+width*i/32,px=sign.x+(x*c-y*s)*scale,py=sign.y+(x*s+y*c)*scale;
   ray.set(new T.Vector3(px,py,1000),new T.Vector3(0,0,-1));
   const hit=ray.intersectObjects(chunks,false)[0];
   if(!hit)throw new Error('Missing rendered terrain under sign');
   gaps.push(sign.groundHeight-.60*scale-hit.point.z);
  }
  return {samples:gaps.length,maxGap:Math.max(...gaps)};
 });
 assert(footing.maxGap<0,JSON.stringify(footing));
 for(const [name,offset] of [['left',-.75],['right',.75],['rear',Math.PI]]){
  await page.evaluate(offset=>{
   const {world,mission}=campaign,sign=mission.entity(mission.state.openingScene.signId),a=sign.rotation+offset,z=sign.groundHeight+7;
   world.controls.target.set(sign.x,sign.y,z);world.camera.position.set(sign.x+Math.sin(a)*102,sign.y-Math.cos(a)*102,z+43);world.controls.update();
  },offset);
  await page.screenshot({path:folder+'/sign-seated-'+name+'.png'});
 }
 assert.deepEqual(errors,[]);
 fs.writeFileSync(folder+'/footing-checks.json',JSON.stringify({saved,restored,footing,errors},null,2));
 console.log('PASS: real construction, legacy height corrected through load UI, '+footing.samples+' rendered terrain samples have no gap, front/left/right/rear and narrow screenshots');
}finally{await browser.close();}
