import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const baseline=process.argv.includes('--baseline'),folder='docs/playtest-evidence/wg035/'+(baseline?'before':'after');
fs.mkdirSync(folder,{recursive:true});
const report={baseline,errors:[]};
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
let page;
try{
 page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.addInitScript(()=>{for(const k of ['fieldSound','fieldRadio','fieldStoryVoice'])localStorage.setItem('warGame.'+k,'off');});
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8777')+'/campaign/?mission=m02');
 await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});await page.locator('#begin').click();
 await page.waitForFunction(()=>campaign.state.active&&document.querySelector('#welcome').hidden&&!campaign.state.openingPlaying,null,{timeout:60000});
 await page.locator('#pause').click();
 await page.waitForTimeout(8000);
 report.fixture=await page.evaluate(async()=>{
  const T=await import('/demo/vendor/three.module.js'),c=campaign,m=c.mission,w=c.world,p=w.field.gridToWorld(m.config.startGrid);
  c.radio.setEnabled(false);c.renderSuspended=true;w.fixedRenderScale=1;w.renderer.setPixelRatio(1);
  m.state.units=[];m.state.buildings=[];m.state.camps=[];m.state.projectiles=[];m.drainEffects();m.updateMission=()=>{};
  const guns=['bukhanka','twin-machinegun'].map((kind,i)=>m.addUnit(kind,'rai',{x:p.x+(i?16:-16),y:p.y}));
  const targets=guns.map(u=>m.addUnit('raider','scavs',{x:u.x,y:u.y+90}));
  for(const u of [...guns,...targets]){u.heading=0;u.previousHeading=0;u.task=null;u.path=[];}
  for(const u of targets)u.hp=u.maxHp=10000;
  m.rebuildNavigation();m.updateFog();m.explored.fill(255);m.visible.fill(255);m.drainEvents();c.select(guns.map(u=>u.id));
  const realNow=performance.now.bind(performance);window.review={T,guns,targets,realNow,clock:realNow()/1000+8};
  Object.defineProperty(performance,'now',{configurable:true,value:()=>review.clock*1000});
  w.controls.target.set(p.x,p.y+3,w.field.heightAt(p.x,p.y)+7);w.camera.position.copy(w.controls.target).add(new T.Vector3(0,-90,90));w.controls.update();
  review.step=age=>{review.clock=review.born+age;w.update(m,new Set(guns.map(u=>u.id)),0,false);};
  review.fire=()=>{review.clock+=1;review.born=review.clock;for(let i=0;i<2;i++){guns[i].cooldown=0;if(!m.attack(guns[i],targets[i],m.unitSpec(guns[i])))throw Error('Fixture cannot fire '+guns[i].kind);}review.step(0);};
  // Let the actual HUD refresh its selection and expire entry notices while
  // the simulation is paused, then freeze rendering for reproducible pulses.
  c.renderSuspended=false;
  for(let i=0;i<3;i++){review.clock+=10;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));}
  c.renderSuspended=true;
  w.update(m,new Set(guns.map(u=>u.id)),0,false);review.fire();
  // WebGL clears its drawing buffer after composition. Keep presenting the
  // same real scene while screenshots wait for layout/ResizeObserver.
  const present=()=>{w.renderer.render(w.scene,w.camera);requestAnimationFrame(present);};requestAnimationFrame(present);
  return guns.map((u,i)=>({id:u.id,kind:u.kind,x:u.x,y:u.y,damage:m.unitSpec(u).damage,cooldown:m.unitSpec(u).cooldown,targetHp:targets[i].hp}));
 });
 console.log('Firing fixture ready');
 report.pulses=[];
 for(const age of [.015,.075,.135,.195,.255,.315]){
  const pulse=await page.evaluate(age=>{
   review.step(age);const {T,guns}=review,w=campaign.world,mesh=w.scene.getObjectByName('field_muzzle_flash'),matrix=new T.Matrix4();
   const flashes=Array.from({length:mesh.count},(_,i)=>{mesh.getMatrixAt(i,matrix);const p=new T.Vector3().setFromMatrixPosition(matrix),gun=guns.reduce((a,b)=>p.distanceToSquared(new T.Vector3(a.x,a.y,p.z))<p.distanceToSquared(new T.Vector3(b.x,b.y,p.z))?a:b);
    return {gun:gun.kind,position:p.toArray()};});
   return {age,flashes,tracers:w.statistics.tracers,muzzles:guns.map(u=>({kind:u.kind,primary:w.vehicles.muzzles.get(u.id)?.toArray(),secondary:w.vehicles.secondaryMuzzles?.get(u.id)?.toArray()}))};
  },age);report.pulses.push(pulse);
 }
 report.flashCounts=Object.fromEntries(['bukhanka','twin-machinegun'].map(kind=>[kind,report.pulses.flatMap(p=>p.flashes).filter(f=>f.gun===kind).length]));
 assert.equal(report.flashCounts.bukhanka,3);assert.equal(report.flashCounts['twin-machinegun'],baseline?3:6);
 if(!baseline)for(const [i,p] of report.pulses.entries()){
  const flash=p.flashes.find(f=>f.gun==='twin-machinegun'),muzzles=p.muzzles.find(m=>m.kind==='twin-machinegun'),muzzle=i%2?muzzles.secondary:muzzles.primary;
  assert(muzzle);assert(Math.abs(Math.hypot(...flash.position.map((v,j)=>v-muzzle[j]))-.45)<.001,'The flash follows the correct barrel after its independent recoil');
  assert(Math.hypot(...muzzles.primary.map((v,j)=>v-muzzles.secondary[j]))>1.8,'The two real barrel origins remain separate');
 }
 if(!baseline){
  report.designPreview=await page.evaluate(()=>{
   review.fire();review.step(.075);const model=campaign.world.vehicles.makeDesignModel(['C01','B01','U02'],'olive'),recoil=[];
   model.root.traverse(node=>{if(node.name==='recoil_1')recoil.push(node.position.y);});model.dispose();return recoil;
  });assert.deepEqual(report.designPreview,[0,0],'The design/cargo clone resets both recoils independently of the last shot');
 }
 for(const [width,height] of (baseline?[[1440,900]]:[[1440,900],[844,390],[667,375]])){
  await page.setViewportSize({width,height});
  for(const [name,age] of [['left-barrel',.015],['right-barrel',.075]]){
   await page.evaluate(age=>{review.fire();review.step(age);},age);
   await page.screenshot({path:folder+'/'+name+'-'+width+'.png'});
  }
 }
 if(!baseline){
  for(const [width,height] of [[1440,900],[844,390],[667,375]]){
   await page.setViewportSize({width,height});
   await page.evaluate(()=>{const w=campaign.world;w.camera.position.copy(w.controls.target).add(new review.T.Vector3(0,-50,50));w.controls.update();review.fire();review.step(.075);});
   await page.screenshot({path:folder+'/close-'+width+'.png'});
  }
  // A short unedited recording of the real canvas shows the alternating
  // pulses better than a still frame. This is the same paused firing fixture.
  await page.setViewportSize({width:844,height:390});
  const video=await page.evaluate(async()=>{
   const stream=campaign.world.renderer.domElement.captureStream(30),chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:1600000});
   recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.start();
   for(let frame=0;frame<144;frame++){if(frame%36===0)review.fire();review.step(frame%36/60);await new Promise(requestAnimationFrame);}
   const stopped=new Promise(resolve=>recorder.onstop=resolve);recorder.stop();await stopped;stream.getTracks().forEach(t=>t.stop());
   const bytes=new Uint8Array(await new Blob(chunks).arrayBuffer());let data='';for(let i=0;i<bytes.length;i+=8192)data+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(data);
  });fs.writeFileSync(folder+'/comparison.webm',Buffer.from(video,'base64'));
  report.rotationAndRemoval=await page.evaluate(()=>{
   const m=campaign.mission,w=campaign.world,{guns,targets,T}=review;
   guns[1].heading=guns[1].previousHeading=.65;targets[1].x=guns[1].x+40;targets[1].previousX=targets[1].x;
   review.fire();review.step(.075);
   const flash=w.scene.getObjectByName('field_muzzle_flash'),mat=new T.Matrix4();flash.getMatrixAt(0,mat);
   const distance=new T.Vector3().setFromMatrixPosition(mat).distanceTo(w.vehicles.secondaryMuzzles.get(guns[1].id));
   m.state.units=m.state.units.filter(u=>!guns.includes(u));review.step(.195);
   const hiddenFlashes=flash.count;review.step(1);
   return {rotatedMuzzleOffset:distance,hiddenFlashes,remainingShots:w.statistics.shots};
  });
  assert(Math.abs(report.rotationAndRemoval.rotatedMuzzleOffset-.45)<.001);assert.equal(report.rotationAndRemoval.hiddenFlashes,0);assert.equal(report.rotationAndRemoval.remainingShots,0);
  report.effectBudget=await page.evaluate(async()=>{
   const {createCombatEffects}=await import('/campaign/combat-effects.js'),{T}=review,scene=new T.Scene(),fx=createCombatEffects(T,scene,4.5,null,campaign.world.field),start=new T.Vector3(0,0,20),end=new T.Vector3(0,100,20),camera=campaign.world.camera;
   for(let i=0;i<160;i++)fx.spawn(start,end,'mg',0,camera,{from:i,barrels:2});
   fx.update(.255,camera,390,null,(_,barrel)=>start.clone().add(new T.Vector3(barrel*2,0,0)));
   const result={...fx.statistics,capacity:scene.getObjectByName('short_tracer').instanceMatrix.count,flashCapacity:scene.getObjectByName('field_muzzle_flash').instanceMatrix.count,effectMeshes:scene.children.filter(m=>['short_tracer','field_muzzle_flash'].includes(m.name)).length};
   fx.update(1,camera,390,null,()=>start);result.remainingShots=fx.statistics.shots;return result;
  });
  assert.equal(report.effectBudget.shots,128);assert(report.effectBudget.tracers<=report.effectBudget.capacity);assert.equal(report.effectBudget.effectMeshes,2);assert.equal(report.effectBudget.remainingShots,0);
 }
 // Muting and the bounded voice pool remain real FieldSound behavior. The
 // actual recording is rendered offline so this test does not use speakers.
 report.sound=await page.evaluate(async()=>{
  const {FieldSound}=await import('/campaign/field-sound.js');
  const data=await (await fetch('/assets/campaign/alpha/mission01/combat-sfx/mg-burst.ogg')).arrayBuffer();
  const results=[];
  for(const barrels of [1,2]){
   const ctx=new OfflineAudioContext(2,48000,48000),clip=await ctx.decodeAudioData(data.slice(0)),starts=[];
   const makeSource=ctx.createBufferSource.bind(ctx);ctx.createBufferSource=()=>{const source=makeSource(),start=source.start.bind(source);source.start=(time=0)=>{starts.push({time,rate:source.playbackRate.value});start(time);};return source;};
   const sound=Object.assign(Object.create(FieldSound.prototype),{context:ctx,combatClips:new Map([['mg',clip]]),combatVoices:new Set(),combatOutput:ctx.destination,last:new Map(),enabled:true,ready:()=>true});
   sound.shot('mg',1,0,barrels);const rendered=await ctx.startRendering();let energy=0;for(const value of rendered.getChannelData(0))energy+=value*value;
   results.push({barrels,starts,rms:Math.sqrt(energy/rendered.length),remainingVoices:sound.combatVoices.size});
  }
  return results;
 });
 assert.equal(report.sound[0].starts.length,1);assert.equal(report.sound[1].starts.length,baseline?1:2);
 for(const s of report.sound)assert(s.rms>0);
 if(!baseline){assert(Math.abs(report.sound[1].starts[1].time-report.sound[1].starts[0].time-.06)<1e-6);assert(report.sound[1].starts.every(s=>s.rate===1));}
 assert.deepEqual(report.errors,[]);console.log(JSON.stringify({flashes:report.flashCounts,sound:report.sound,errors:report.errors}));
}catch(error){report.failure=error.stack;if(page)await page.screenshot({path:folder+'/failure.png'}).catch(()=>{});throw error;}
finally{fs.writeFileSync(folder+'/verification.json',JSON.stringify(report,null,2));await browser.close();}
