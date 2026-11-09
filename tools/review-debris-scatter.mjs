import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dir='campaign/previews/debris-scatter';fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>{for(const k of ['fieldSound','fieldRadio','fieldStoryVoice'])localStorage.setItem('warGame.'+k,'off');});
 await page.goto('http://127.0.0.1:8766/review/debris-scatter/campaign/?damage=1');await page.waitForFunction(()=>window.campaign?.damageDebug,null,{timeout:90000});
 await page.evaluate(()=>{
  const c=campaign,m=c.mission,w=c.world;c.renderSuspended=true;document.querySelector('#welcome').hidden=true;c.damageDebug.panel.hidden=true;c.radio.setEnabled(false);
  m.state.units=[];m.state.buildings=[];m.state.salvage.items=[];m.state.pendingCinematics=[];m.pendingTick=null;m.accumulator=0;m.effects=[];m.updateMission=()=>{};m.state.storyConstruction={enabled:false};
  m.explored.fill(255);m.visible.fill(255);m.visionSources.push({x:63.5,y:63.5,radius:200});m.fogRevision++;
  w.fixedRenderScale=1;w.controls.enableDamping=false;w.minimumCameraHeight=3;
  window.fxNow=performance.now();Object.defineProperty(performance,'now',{configurable:true,value:()=>window.fxNow});
  window.scatterFactory=()=>{
   w.damage.debris.reset();m.state.buildings=[];m.state.salvage.items=[];m.effects=[];w.update(m,new Set(),0);
   const p=w.field.gridToWorld(m.config.startGrid),f=m.addStructure('factory','rai',{x:p.x-50,y:p.y},{completed:true,progress:1});
   c.scatterId=f.id;w.controls.target.set(f.x,f.y,10);w.camera.position.set(f.x+170,f.y-190,175);w.controls.update();w.update(m,new Set(),0);
  };
  window.scatterHit=side=>{const f=m.entity(c.scatterId);m.damage(f,f.hp+100,null,{type:'shell',point:[0,-7*side,3],normal:[0,-side,0],direction:[0,side,0],worldDirection:[0,side,0],partId:0,partSpec:{material:'concrete'}});};
  window.scatterStep=()=>{window.fxNow+=1000/30;m.advance(1/30);w.update(m,new Set(),1/30);};
  const stream=w.renderer.domElement.captureStream(30),chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:3000000});
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};window.scatterMovie={stream,chunks,recorder};recorder.start();
 });
 const poses=[];
 for(let take=0;take<2;take++){
  await page.evaluate(()=>window.scatterFactory());
  for(const [start,end] of [[0,32],[32,150]]){
   await page.evaluate(async({start,end,take})=>{for(let frame=start;frame<end;frame++){if(frame===15)window.scatterHit(take===0?1:-1);window.scatterStep();await new Promise(resolve=>setTimeout(resolve,1000/30));}},{start,end,take});
   if(start===0){
    poses.push(await page.evaluate(()=>campaign.world.damage.debris.root.children.map(n=>[...n.position.toArray(),...n.quaternion.toArray()])));
    await page.screenshot({path:dir+`/scatter-${take+1}.png`});
   }
  }
  await page.evaluate(()=>{for(let i=0;i<65;i++)window.scatterStep();});
  await page.screenshot({path:dir+`/settled-${take+1}.png`});
 }
 const movie=await page.evaluate(async()=>{const {stream,chunks,recorder}=window.scatterMovie,done=new Promise(resolve=>recorder.onstop=resolve);recorder.stop();await done;stream.getTracks().forEach(t=>t.stop());return Array.from(new Uint8Array(await new Blob(chunks,{type:'video/webm'}).arrayBuffer()));});
 fs.writeFileSync(dir+'/scatter.webm',Buffer.from(movie));
 assert(poses[0].length>10&&poses[1].length>10,'Both factories create actual detached model pieces');
 const different=poses[0].filter((p,i)=>p.some((n,j)=>Math.abs(n-(poses[1][i]?.[j]??n))>.05)).length;
 assert(different>poses[0].length*.8,'Repeated factories have different paths and rotations');
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(250);
 await page.evaluate(()=>{window.scatterFactory();const w=campaign.world,offset=w.camera.position.clone().sub(w.controls.target).multiplyScalar(1.5);w.camera.position.copy(w.controls.target).add(offset);w.controls.update();window.scatterHit(1);for(let i=0;i<17;i++)window.scatterStep();});
 await page.screenshot({path:dir+'/scatter-narrow.png'});
 const stats=await page.evaluate(()=>campaign.world.statistics);assert(stats.damage.activePhysics<=24);assert.deepEqual(errors,[]);
 fs.writeFileSync(dir+'/report.json',JSON.stringify({different,counts:poses.map(p=>p.length),stats},null,2));
 console.log(`PASS: ${different} detached pieces changed trajectory; two real factory explosions, bounded physics, wide/narrow screenshots and video, no browser/shader errors`);
}finally{await browser.close();}
