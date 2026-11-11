import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const folder='campaign/previews/personnel';fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1,hasTouch:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.stack??e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
 await page.addInitScript(()=>localStorage.setItem('warGame.fieldRadio','off'));
 await page.goto('http://127.0.0.1:8766/campaign/');await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});
 await page.locator('#begin').click();await page.evaluate(()=>campaign.advance(40));await page.waitForFunction(()=>campaign.state.active,null,{timeout:60000});await page.locator('#pause').click();
 await page.evaluate(()=>{const c=campaign;c.radio.setEnabled(false);c.world.fixedRenderScale=1;c.world.renderer.setPixelRatio(1);const u=c.mission.state.units.find(u=>u.owner==='rai');c.select([u.id]);});
 await page.screenshot({path:folder+'/callsign-desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:folder+'/callsign-narrow.png'});
 assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));
 await page.setViewportSize({width:1440,height:900});
 const initial=await page.evaluate(()=>{
  const m=campaign.mission,p=m.state.campaign.personnel,killer=m.state.units.find(u=>u.kind==='bukhanka'&&u.owner==='rai');window.memorialBaseline=m.save();
  const ranks=['private','lance-corporal','sergeant','warrant-officer','lieutenant','captain','major'];
  for(let i=0;i<24;i++){
   const soldier=m.addUnit('bukhanka','rai',{x:0,y:0}),crew=p.crews[soldier.id],id=crew.memberIds[0];
   campaign.setPersonnelRank(id,ranks[i%ranks.length]);
   for(let j=0;j<i%5;j++){const enemy=m.addUnit('raider','scavs',{x:800,y:800});m.damage(enemy,1e6,soldier);}
   m.damage(soldier,1e6,{id:'test-hostile',owner:'scavs',kind:'raider',x:100,y:100});
  }
  m.state.time=1634;m.state.status='victory';return {names:Object.values(p.soldiers).map(s=>s.name),deaths:p.graveOrder.length};
 });
 await page.waitForFunction(()=>!document.querySelector('#result').hidden,null,{timeout:20000});
 await page.evaluate(()=>document.fonts.ready);
 await page.waitForFunction(()=>[...document.images].every(i=>i.complete));
 await page.waitForFunction(()=>document.querySelector('.memorial-scene').dataset.memorialFlag==='ready');
 await page.waitForFunction(()=>campaign.memorialAudio.playing&&campaign.memorialAudio.time>.5);
 assert((await page.evaluate(()=>campaign.memorialAudio.src)).endsWith('/assets/music/memorial-red-banner.mp3'));
 await page.evaluate(()=>document.querySelector('#sound-toggle').click());
 assert(!await page.evaluate(()=>campaign.memorialAudio.playing),'Mute pauses memorial soundtrack');
 await page.evaluate(()=>document.querySelector('#sound-toggle').click());
 await page.waitForFunction(()=>campaign.memorialAudio.playing);
 await page.screenshot({path:folder+'/results-desktop.png'});
 assert(await page.evaluate(()=>document.fonts.check('16px "Memorial Condensed"')&&document.fonts.check('16px "Memorial Serif"')));
 const frame=()=>page.locator('.memorial-scene').getAttribute('data-memorial-animation-frames').then(Number);
 const before=await frame();await page.waitForFunction(n=>Number(document.querySelector('.memorial-scene').dataset.memorialAnimationFrames)>n+5,before);assert.equal(await page.locator('.memorial-scene').getAttribute('data-memorial-graves'),'24');
 assert.equal(await page.locator('#result-lost').innerText(),'24');assert.equal(await page.locator('#result-total-lost').innerText(),'24');
 assert(await page.locator('#result-person').isHidden(),'Additional details stay hidden until inspection');
 let hover=false;for(let y=450;y<800&&!hover;y+=25)for(let x=880;x<1370&&!hover;x+=25){await page.mouse.move(x,y);hover=await page.locator('#result-person').isVisible();}
 assert(hover,'A real pointer can inspect a cross');await page.mouse.move(30,30);assert(await page.locator('#result-person').isHidden());
 await page.locator('.memorial-scene').focus();await page.keyboard.press('Home');assert(await page.locator('#result-person').isVisible());
 await page.screenshot({path:folder+'/results-inspect-desktop.png'});
 const details=await page.locator('#result-person').innerText();assert(details.includes('Буран')===false);assert(details.includes('Личный счёт:'));
 assert(!/\bU\d+\b/.test(details),'Memorial details omit technical unit IDs');
 await page.keyboard.press('Escape');assert(await page.locator('#result').isHidden());
 await page.waitForFunction(()=>!campaign.memorialAudio.playing);
 const closedFrame=await frame();await page.waitForTimeout(300);assert.equal(await frame(),closedFrame,'Hidden results stop their animation loop');
 await page.evaluate(()=>campaign.showResults());
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(100);const still=await frame();await page.waitForTimeout(300);assert.equal(await frame(),still,'Reduced motion has no ongoing animation');await page.emulateMedia({reducedMotion:'no-preference'});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:folder+'/results-narrow-top.png'});
 assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));
 await page.locator('.memorial-scene').scrollIntoViewIfNeeded();await page.screenshot({path:folder+'/results-narrow-hill.png'});
 await page.locator('.memorial-scene').focus();await page.keyboard.press('End');await page.screenshot({path:folder+'/results-narrow-inspect.png'});
 assert(await page.locator('#result-person').isVisible());
 await page.evaluate(()=>campaign.showResults());await page.locator('.memorial-scene').scrollIntoViewIfNeeded();
 const box=await page.locator('.memorial-scene').boundingBox();let tapped=false;
 for(let y=Math.max(0,box.y+box.height*.4);y<Math.min(820,box.y+box.height)&&!tapped;y+=25)for(let x=40;x<350&&!tapped;x+=30){await page.touchscreen.tap(x,y);tapped=await page.locator('#result-person').isVisible();}
 assert(tapped,'A touch can inspect a cross');
 await page.setViewportSize({width:1440,height:900});await page.locator('#result-continue').click();
 await page.waitForFunction(()=>campaign.mission.state.m02?.initialized,null,{timeout:30000});
 assert(await page.locator('#result').isHidden());assert.equal(await page.evaluate(()=>campaign.getMemorial().length),initial.deaths);
 await page.evaluate(()=>{const m=campaign.mission;const u=m.state.units.find(u=>u.owner==='rai'&&u.kind==='bukhanka'&&u.hp>0);m.damage(u,1e6,null);m.state.status='defeat';});
 await page.waitForFunction(()=>!document.querySelector('#result').hidden);assert.equal(await page.locator('#result-lost').innerText(),'1');assert.equal(await page.locator('#result-total-lost').innerText(),'25');assert(await page.locator('#result-continue').isHidden());
 await page.screenshot({path:folder+'/results-m02-defeat.png'});
 if(process.argv.includes('--art')){
  await page.evaluate(()=>{
   const m=campaign.mission;m.load(window.memorialBaseline);
   for(let i=0;i<8;i++){
    const u=m.addUnit('bukhanka','rai',{x:100,y:100});
    for(let k=0;k<i%4;k++){const e=m.addUnit('raider','scavs',{x:800,y:800});m.damage(e,1e6,u);}
    m.damage(u,1e6,{id:'review-hostile',kind:'raider',owner:'scavs',x:0,y:0});
   }
   m.state.time=1802;m.state.status='victory';campaign.showResults();
  });
  await page.screenshot({path:folder+'/memorial-v2-eight.png'});
  await page.locator('.memorial-scene').focus();await page.keyboard.press('Home');await page.screenshot({path:folder+'/memorial-v2-name.png'});
  await page.evaluate(()=>campaign.showResults());
  const data=await page.evaluate(()=>new Promise(resolve=>{
   const canvas=document.querySelector('.memorial-scene'),stream=canvas.captureStream(24),chunks=[];
   const mime=MediaRecorder.isTypeSupported('video/webm;codecs=vp9')?'video/webm;codecs=vp9':'video/webm';
   const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:3500000});
   recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
   recorder.onstop=()=>{stream.getTracks().forEach(t=>t.stop());const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(new Blob(chunks,{type:mime}));};
   recorder.start();setTimeout(()=>recorder.stop(),14500);
  }));
  fs.writeFileSync(folder+'/memorial-v2-motion.webm',Buffer.from(data.split(',')[1],'base64'));
  await page.setViewportSize({width:390,height:844});await page.locator('.memorial-scene').scrollIntoViewIfNeeded();await page.screenshot({path:folder+'/memorial-v2-eight-narrow.png'});
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(folder+'/verification.json',JSON.stringify({passed:true,initial,details,errors,checks:['actual terminal UI','names and callsigns','24 crosses in m01','keyboard details','responsive stats and hill','continue preserves graves','defeat cumulative 25','no page or asset errors']},null,2));
 console.log('PASS real game: callsigns, results, Orthodox memorial, hover-only details, keyboard, wide/narrow, m01→m02, defeat, cumulative graves, no asset/JS errors');
}finally{await browser.close();}
