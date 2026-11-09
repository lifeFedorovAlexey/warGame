import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dir='campaign/previews/factory-service';fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 const snapshot=process.argv.find(arg=>arg.startsWith('--snapshot='))?.slice(11);
 if(snapshot)await page.route(/\/campaign\/(?:[^/]+\.(?:js|css|html))?$/,route=>{
  const name=new URL(route.request().url()).pathname.split('/').at(-1)||'index.html',file=snapshot+'/campaign/'+name;
  return fs.existsSync(file)?route.fulfill({contentType:name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(file)}):route.continue();
 });
 page.on('pageerror',e=>{errors.push(e.message);console.error('Browser:',e.message);});page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>{for(const k of ['fieldSound','fieldRadio','fieldStoryVoice'])localStorage.setItem('warGame.'+k,'off');});
 const url=process.argv.find(arg=>arg.startsWith('--url='))?.slice(6)??'http://127.0.0.1:8766/review/factory-service/campaign/';
 await page.goto(url);await page.waitForFunction(()=>window.campaign?.ready||document.getElementById('loading')?.dataset.phase==='error',null,{timeout:90000});
 assert(await page.evaluate(()=>!!window.campaign?.ready),await page.locator('#loading-status').textContent());
 await page.locator('#begin').click();await page.waitForFunction(()=>document.getElementById('welcome').hidden);const skip=page.locator('[data-dream=skip]');if(await skip.isVisible())await skip.click();
 await page.evaluate(()=>{const c=campaign,m=c.mission;c.radio.setEnabled(false);const s=m.entity(m.state.openingScene.signId);s.completed=true;s.progress=1;});
 await page.waitForFunction(()=>campaign.state.active,null,{timeout:25000});await page.locator('#pause').click();
 await page.evaluate(async()=>{
  const c=campaign,m=c.mission,w=c.world;
  m.state.units=[];m.state.buildings=[];m.state.salvage.items=[];m.state.storyConstruction={enabled:false};m.updateMission=()=>{};
  m.explored.fill(255);m.visible.fill(255);m.visionSources.push({x:63.5,y:63.5,radius:200});m.fogRevision++;
  const f=m.addStructure('factory','rai',{x:-1424,y:240},{completed:true,progress:1});c.serviceFactory=f.id;
  f.queue=[{kind:'bukhanka',progress:.4,cost:130,funding:{paid:130}}];f.productionPaused=true;
  for(let i=0;i<3;i++){
   const u=m.addUnit('bukhanka','rai',{x:f.x,y:f.y-13.5});u.hp=100+i*10;
   u.factoryVisit={factoryId:f.id,phase:'inside',slot:i,queued:i,arrived:i,repairStartHp:50,factory:{...f,queue:[]}};
   u.combatRetreat={status:'servicing',service:i?'waiting-bay':'repairing'};
   if(!i)f.activeRepair={unitId:u.id,progress:.35};
  }
  m.addUnit('builder','rai',{x:f.x-90,y:f.y-50},{heading:1});
  const car=m.addUnit('bukhanka','rai',{x:f.x+55,y:f.y-115},{heading:.5});car.hp=180;
  c.select([f.id],false,false);document.querySelector('#toast').hidden=true;
  w.fixedRenderScale=1;w.renderer.setPixelRatio(1);w.controls.enableDamping=false;
  w.controls.target.set(f.x,f.y-10,10);w.camera.position.copy(w.controls.target).add({x:100,y:-215,z:180});w.controls.update();
  for(let i=0;i<30;i++)w.update(m,new Set(c.selected),.05);
 });
 const control=page.locator('[data-factory-priority]');await control.waitFor();assert.equal(await control.getAttribute('data-factory-priority'),'repair');
 assert.equal(await control.locator('.production-count').textContent(),'3');
 const view=await page.evaluate(()=>{const c=campaign,w=c.world,f=c.mission.entity(c.serviceFactory),shutter=w.buildingObjects.get(f.id).getObjectByName('factory_shutter');
  return {open:shutter.position.z,sparks:w.scene.getObjectByName('factory_welding_sparks').geometry.drawRange.count,smoke:w.scene.getObjectByName('factory_service_'+f.id).visible,
   hidden:c.mission.state.units.filter(u=>u.factoryVisit).every(u=>!w.vehicles.transforms.has(u.id)),progress:f.queue[0].progress};});
 assert(view.open>3&&view.sparks===12&&view.smoke&&view.hidden,JSON.stringify(view));
 await page.screenshot({path:dir+'/wide.png'});
 const signal=()=>page.evaluate(()=>{
  const w=campaign.world,arrow=w.scene.getObjectByName('factory_gate_arrows'),lamp=w.scene.getObjectByName('factory_repair_lamps'),boards=w.scene.getObjectByName('factory_gate_boards');
  return {arrows:arrow.count,lamps:lamp.count,boards:boards.count,arrowColor:Array.from(arrow.instanceColor.array.slice(0,3)),repairColor:Array.from(lamp.instanceColor.array.slice(0,3)),matrix:Array.from(arrow.instanceMatrix.array.slice(0,16))};
 });
 const repairing=await signal();assert.equal(repairing.lamps,2);assert.equal(repairing.arrows,0);assert.equal(repairing.boards,2);
 await page.evaluate(()=>{const m=campaign.mission,f=m.entity(campaign.serviceFactory),u=m.state.units.find(u=>u.kind==='bukhanka'&&!u.factoryVisit);campaign.signalCar=u.id;u.factoryVisit={factoryId:f.id,phase:'gate'};f.garageGate=u.id;});
 await page.waitForTimeout(150);const entering=await signal();assert.equal(entering.arrows,1);assert.equal(entering.lamps,2);assert(entering.matrix[10]>0);
 await page.screenshot({path:dir+'/entry.png'});
 await page.evaluate(()=>{const m=campaign.mission,f=m.entity(campaign.serviceFactory),u=m.entity(campaign.signalCar);u.factoryVisit.phase='leaving';u.hp=u.maxHp;u.x=f.x;u.y=f.y+45;u.heading=0;delete f.garageGate;f.garageExit=u.id;f.activeRepair=null;const w=campaign.world;w.camera.position.copy(w.controls.target).add({x:100,y:215,z:180});w.controls.update();for(let i=0;i<30;i++)w.update(m,new Set(campaign.selected),.05);});
 await page.waitForTimeout(150);const leaving=await signal();assert.equal(leaving.arrows,1);assert.equal(leaving.lamps,0);assert(leaving.matrix[10]<0);assert.notDeepEqual(leaving.arrowColor,entering.arrowColor);
 assert(await page.evaluate(()=>campaign.world.buildingObjects.get(campaign.serviceFactory).getObjectByName('factory_exit_shutter').position.z>3),'Rear shutter opens for departing cars');
 await page.screenshot({path:dir+'/exit.png'});
 await page.evaluate(()=>{const m=campaign.mission,f=m.entity(campaign.serviceFactory),u=m.entity(campaign.signalCar);u.hp=0;});
 await page.waitForTimeout(100);assert.equal((await signal()).arrows,0,'A stale gate id for a destroyed car cannot show an arrow');
 await page.evaluate(()=>{const m=campaign.mission,f=m.entity(campaign.serviceFactory);delete f.garageGate;f.activeRepair={unitId:m.state.units.find(u=>u.factoryVisit?.phase==='inside').id,progress:.35};});
 await control.click();assert.equal(await control.getAttribute('data-factory-priority'),'production');
 assert.equal(await page.evaluate(()=>campaign.mission.entity(campaign.serviceFactory).workPriority),'production');
 await control.click();assert.equal(await control.getAttribute('data-factory-priority'),'repair');
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{const w=campaign.world;w.camera.position.copy(w.controls.target).add({x:130,y:-370,z:430});w.controls.update();});
 await page.waitForTimeout(250);const box=await control.boundingBox();assert(box.x>=0&&box.x+box.width<=390&&box.y+box.height<=844,JSON.stringify(box));
 await page.screenshot({path:dir+'/narrow.png'});
 const clips=await page.evaluate(async()=>{const module=await import('./story-director.js'),story=await module.loadMissionStory(),context=new OfflineAudioContext(1,24000,24000),clips=[];
  for(const cue of story.barks.filter(c=>c.id.startsWith('factory-'))){const r=await fetch('../assets/campaign/alpha/mission01/'+cue.clip.file),buffer=await context.decodeAudioData(await r.arrayBuffer());clips.push({id:cue.id,seconds:buffer.duration});}
  return clips;});assert.equal(clips.length,3);assert(clips.every(c=>c.seconds>1));assert.deepEqual(errors,[]);
 console.log('PASS: entry/exit arrows, amber repair lamp, stale gate suppression, open factory gate, welding/smoke, hidden internal vehicles, priority both ways, narrow viewport, voice clips, no browser errors');
}finally{await browser.close();}
