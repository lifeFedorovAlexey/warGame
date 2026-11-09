import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dir='campaign/previews/combat-feedback';fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>{for(const k of ['fieldSound','fieldRadio','fieldStoryVoice'])localStorage.setItem('warGame.'+k,'off');});
 await page.goto('http://127.0.0.1:8766/review/combat-feedback/campaign/?damage=1');await page.waitForFunction(()=>window.campaign?.damageDebug,null,{timeout:90000});
 await page.evaluate(()=>{
  const c=campaign,m=c.mission,w=c.world;c.renderSuspended=true;document.querySelector('#welcome').hidden=true;c.damageDebug.panel.hidden=true;c.radio.setEnabled(false);
  m.state.units=[];m.state.buildings=[];m.state.salvage.items=[];m.state.pendingCinematics=[];m.pendingTick=null;m.accumulator=0;m.effects=[];m.updateMission=()=>{};m.state.storyConstruction={enabled:false};
  const p=w.field.gridToWorld(m.config.startGrid),factory=m.addStructure('factory','rai',{x:p.x-50,y:p.y},{completed:true,progress:1}),car=m.addUnit('bukhanka','rai',{x:p.x+100,y:p.y-30}),builder=m.addUnit('builder','rai',{x:p.x+110,y:p.y-70});
  m.explored.fill(255);m.visible.fill(255);m.visionSources.push({x:63.5,y:63.5,radius:200});m.fogRevision++;m.rebuildNavigation();
  w.fixedRenderScale=1;w.controls.enableDamping=false;w.minimumCameraHeight=3;w.controls.target.set(factory.x,factory.y,10);w.camera.position.set(factory.x+180,factory.y-200,200);w.controls.update();
  window.fxNow=performance.now();Object.defineProperty(performance,'now',{configurable:true,value:()=>window.fxNow});
  c.feedback={factory:factory.id,car:car.id,builder:builder.id};w.update(m,new Set(),1/60);
 });
 const step=async(seconds)=>page.evaluate(async seconds=>{const c=campaign;for(let t=0;t<seconds-.001;t+=1/30){window.fxNow+=1000/30;c.mission.advance(1/30);c.world.update(c.mission,new Set(),1/30);}await new Promise(requestAnimationFrame);},seconds);
 await page.screenshot({path:dir+'/intact.png'});
 const breach=await page.evaluate(()=>{const c=campaign,m=c.mission,f=m.entity(c.feedback.factory),parts=c.world.damage.getTemplate(f).parts;const id=Object.keys(parts).find(k=>parts[k].name==='factory_wall_y_-1_0');const h=c.damageDebug.hit(f.id,{type:'shell',power:230,partId:Number(id)});c.world.update(m,new Set(),1/60);return {hit:!!h,detached:!!f.damage?.parts[id]?.detached,hp:f.hp};});
 assert(breach.hit&&breach.detached&&breach.hp>0,JSON.stringify(breach));await step(.5);await page.screenshot({path:dir+'/breach.png'});
 await page.evaluate(()=>{const c=campaign,m=c.mission,f=m.entity(c.feedback.factory);m.damage(f,f.hp+100,null,{type:'shell',point:[0,-7,3],normal:[0,-1,0],direction:[0,1,0],worldDirection:[0,1,0],partId:0,partSpec:{material:'concrete'}});c.world.update(m,new Set(),1/60);});
 await step(.18);await page.screenshot({path:dir+'/explosion.png'});await step(2.1);await page.screenshot({path:dir+'/collapse.png'});
 const stats=await page.evaluate(()=>campaign.world.statistics);assert(stats.explosions>0&&stats.blastFragments>0);assert(stats.damage.activePhysics<=24);
 await step(4.2);await page.screenshot({path:dir+'/rubble.png'});
 const kicks=await page.evaluate(()=>{const c=campaign,m=c.mission,u=m.entity(c.feedback.car);c.damageDebug.view(u.id,75);c.world.controls.enableDamping=false;c.world.update(m,new Set(),0);
  const before=c.world.vehicles.transforms.get(u.id).matrix?.elements?.slice();const h=c.damageDebug.hit(u.id,{type:'bullet',power:8,side:'right'});return {hit:!!h,rock:u.contactRock,before};});assert(kicks.hit&&kicks.rock);
 await step(.12);const rocking=await page.evaluate(()=>{const u=campaign.mission.entity(campaign.feedback.car);return {hp:u.hp,rock:u.contactRock};});assert(rocking.rock);
 await page.evaluate(()=>{const c=campaign,u=c.mission.entity(c.feedback.car);u.hp=u.maxHp=500;c.damageDebug.hit(u.id,{type:'fire',power:30,side:'right'});c.world.update(c.mission,new Set(),0);});
 await step(.7);assert.equal(await page.evaluate(()=>campaign.world.statistics.burningTargets),1);await page.screenshot({path:dir+'/burning.png'});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(250);await page.evaluate(()=>{const w=campaign.world,offset=w.camera.position.clone().sub(w.controls.target).multiplyScalar(1.4);w.camera.position.copy(w.controls.target).add(offset);w.controls.update();w.update(campaign.mission,new Set(),0);});await step(.1);await page.screenshot({path:dir+'/burning-narrow.png'});
 await step(4.2);assert.equal(await page.evaluate(()=>campaign.world.statistics.burningTargets),0);
 await page.setViewportSize({width:960,height:640});await page.waitForTimeout(250);
 const movie=await page.evaluate(async()=>{
  const c=campaign,m=c.mission,w=c.world,u=m.entity(c.feedback.car);u.hp=u.maxHp=1000;c.damageDebug.view(u.id,60);w.update(m,new Set(),0);
  const canvas=w.renderer.domElement,stream=canvas.captureStream(30),chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:2400000});
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};const done=new Promise(resolve=>recorder.onstop=resolve);recorder.start();
  let matrixChanged=false;const rest=w.vehicles.transforms.get(u.id).matrix.elements.slice();
  for(let frame=0;frame<180;frame++){
   if([18,24,30].includes(frame))c.damageDebug.hit(u.id,{type:'bullet',power:8,side:'right'});
   if(frame===48)c.damageDebug.hit(u.id,{type:'shell',power:85,side:'right'});
   if(frame===81)c.damageDebug.hit(u.id,{type:'fire',power:30,side:'right'});
   window.fxNow+=1000/30;m.advance(1/30);w.update(m,new Set(),1/30);
   if(frame>18&&frame<78){const matrix=w.vehicles.transforms.get(u.id).matrix.elements;matrixChanged ||= Math.abs(matrix[2]-rest[2])>.01||Math.abs(matrix[6]-rest[6])>.01;}
   await new Promise(resolve=>setTimeout(resolve,1000/30));
  }
  recorder.stop();await done;stream.getTracks().forEach(t=>t.stop());return {matrixChanged,video:Array.from(new Uint8Array(await new Blob(chunks,{type:'video/webm'}).arrayBuffer()))};
 });assert(movie.matrixChanged,'Hits actually tilt the rendered vehicle, not just its saved state');fs.writeFileSync(dir+'/weapon-reactions.webm',Buffer.from(movie.video));
 assert.deepEqual(errors,[]);fs.writeFileSync(dir+'/report.json',JSON.stringify({breach,stats,kicks,rocking},null,2));console.log('PASS: rendered wall breach, factory collapse/explosion/rubble, weapon kick, burning and expiry, narrow viewport, no shader/browser errors');
}finally{await browser.close();}
