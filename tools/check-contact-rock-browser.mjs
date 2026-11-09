import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH??'C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const folder='campaign/previews/contact-rock';fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.EDGE_PATH??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8893')+'/campaign/');await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});
 await page.locator('#begin').click();await page.locator('#pause').click();
 const contact=await page.evaluate(async()=>{
  const c=campaign,m=c.mission,w=c.world,{vehicleContact}=await import('./vehicle-impact.js');c.renderSuspended=true;c.radio.setEnabled(false);
  m.state.units=[];m.state.buildings=[];m.state.camps=[];m.state.salvage.items=[];m.state.artifacts=[];m.state.pendingCinematics=[];m.state.time=0;m.effects=[];w.damage.reset();
  const p=m.field.gridToWorld(m.config.startGrid),parked=m.addUnit('bukhanka','rai',p),driver=m.addUnit('bukhanka','rai',{x:p.x-24,y:p.y});
  parked.heading=parked.previousHeading=0;driver.heading=driver.previousHeading=-Math.PI/2;
  for(let i=0;i<5;i++)driver.x+=vehicleContact(driver,parked,m.config.worldScale,m.field).gap-.35;
  driver.previousX=driver.x;driver.driveSpeed=9;driver.reversing=false;driver.path=[{x:p.x+40,y:p.y}];driver.task={type:'move',...driver.path[0]};
  m.rebuildNavigation();m.updateFog();c.select([parked.id]);c.advance(0);
  w.fixedRenderScale=true;w.renderer.setPixelRatio(1);w.controls.enableDamping=false;w.controls.minDistance=18;w.minimumCameraHeight=3;
  const z=m.field.heightAt(p.x,p.y);w.controls.target.set(p.x-6,p.y,z+7);w.camera.position.set(p.x+35,p.y+37,z+26);w.controls.update();w.update(m,new Set([parked.id]),1/60);
  m.move(driver,.1);c.contactLook={driver,parked,position:{x:parked.x,y:parked.y},frames:[],step(time){m.state.time=time;w.update(m,new Set([parked.id]),1/60);this.frames.push({time,position:w.vehicles.transforms.get(parked.id).position.toArray(),matrix:w.vehicles.transforms.get(parked.id).matrix.toArray()});}};
  return {rock:parked.contactRock,hp:[driver.hp,parked.hp],position:{x:parked.x,y:parked.y}};
 });
 assert(contact.rock,'The real movement contact must trigger the suspension');assert.deepEqual(contact.hp,[320,320]);
 await page.evaluate(()=>campaign.contactLook.step(.12));await page.screenshot({path:folder+'/lean.png'});
 const result=await page.evaluate(async()=>{
  const c=campaign,w=c.world,look=c.contactLook,chunks=[],stream=w.renderer.domElement.captureStream(60),recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:5000000});
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};const done=new Promise(resolve=>recorder.onstop=resolve);recorder.start();
  for(let i=0;i<=150;i++){await new Promise(requestAnimationFrame);look.step(i/60);}
  recorder.stop();await done;stream.getTracks().forEach(t=>t.stop());
  return {video:Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())),frames:look.frames,position:{x:look.parked.x,y:look.parked.y},hp:look.parked.hp};
 });
 fs.writeFileSync(folder+'/suspension.webm',Buffer.from(result.video));delete result.video;
 assert.deepEqual(result.position,contact.position,'The hit car must not be pushed');assert.equal(result.hp,320);
 const initial=result.frames.at(-1).matrix;assert(result.frames.some(f=>Math.abs(f.matrix[2]-initial[2])>.02),'Visible roll actually changes the rendered matrix');
 assert(result.frames.every(f=>Math.abs(f.position[2]-result.frames[0].position[2])<1e-6),'No floating or vertical displacement');
 await page.screenshot({path:folder+'/settled.png'});
 await page.setViewportSize({width:800,height:900});await page.evaluate(async()=>{const w=campaign.world;w.renderer.setSize(800,900,false);w.camera.aspect=800/900;w.camera.updateProjectionMatrix();campaign.contactLook.step(.12);await new Promise(requestAnimationFrame);});
 await page.screenshot({path:folder+'/narrow.png'});assert.deepEqual(errors,[]);
 fs.writeFileSync('campaign/reports/contact-rock-browser.json',JSON.stringify({contact,...result,errors},null,2));console.log(JSON.stringify({passed:true,contact,frames:result.frames.length,position:result.position,errors}));
}finally{await browser.close();}
