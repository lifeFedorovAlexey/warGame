import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const folder='campaign/previews/petrovich';fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1}),errors=[];
 page.on('pageerror',e=>errors.push(e.stack??e.message));
 page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
 await page.addInitScript(()=>localStorage.setItem('warGame.fieldRadio','off'));
 await page.goto('http://127.0.0.1:8766/campaign/');await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});
 await page.locator('#begin').click();await page.evaluate(()=>campaign.advance(40));await page.waitForFunction(()=>campaign.state.active,null,{timeout:60000});await page.locator('#pause').click();
 await page.evaluate(()=>{
  const c=campaign,m=c.mission,r=c.radio,d=r.director;r.reset();d.bind(m);m.drainEvents();m.drainEffects();
  c.world.fixedRenderScale=1;c.world.renderer.setPixelRatio(1);
  for(const id of d.scenes.keys())d.data.scenes[id]={status:'done',cursor:0,endedAt:d.data.clock-30000};
  for(const id of ['r38','r39','r40','r41','r42','r46'])delete d.data.scenes[id];
  d.data.active=null;d.data.lastScene=null;d.data.lastEnd=d.data.clock-20000;d.data.facts={clearedCamps:m.state.camps.slice(0,2).map(c=>c.id),chiefAssault:true};
  m.state.camps.slice(0,3).forEach(c=>c.cleared=true);m.state.camps[3].cleared=false;
  m.state.flags.raidWon=true;m.state.flags.raidStarted=true;m.state.flags.raidIds=[];
  m.state.artifactKeys.push('mg-tower');m.state.research['mg-tower']=true;m.effects=[];
  m.state.bounds=m.config.finalMapBounds.slice();m.rebuildNavigation();
  const p=m.field.gridToWorld([14,20]);
  const unit=m.addUnit('bukhanka','rai',p,{heading:Math.PI});
  m.updateFog();c.world.centre(p,420);c.select([unit.id]);
  window.petrovich={unit:unit.id,initial:{x:unit.x,y:unit.y},lines:[],camera:c.world.controls.target.toArray(),
   chiefVisible:m.visibleAt(m.state.camps[3].x,m.state.camps[3].y),clearedAt:performance.now()};
  const signal=r.onSignal;
  r.onSignal=(s,chapter,keep,urgent,cue)=>{
   const line=cue?{id:cue.id,scene:cue.storyScene,text:cue.text,started:performance.now(),duration:cue.clip?.duration}:null;
   if(line)petrovich.lines.push(line);
   return signal(s,chapter,keep?until=>{if(line&&Number.isFinite(until))line.ended=performance.now();keep(until);}:keep,urgent,cue);
  };
  // Hold the combat condition without changing voice duration or advancing it.
  petrovich.combatTimer=setInterval(()=>d.data.lastCombat=d.data.clock,50);d.data.lastCombat=d.data.clock;
  r.setEnabled(true);c.advance(0);
 });
 const done=id=>page.waitForFunction(id=>campaign.radio.director.record(id).status==='done',id,{timeout:90000});
 await done('r38');await done('r41');
 await page.waitForFunction(()=>campaign.storyAudio.cueId==='m01-s11-l001',null,{timeout:15000});
 const movement=await page.evaluate(()=>{
  const c=campaign,m=c.mission,u=m.entity(petrovich.unit),result=m.order([u.id],'move',m.field.gridToWorld([15,22]));
  c.advance(2);return {result,travel:Math.hypot(u.x-petrovich.initial.x,u.y-petrovich.initial.y),controls:c.world.controls.enabled,camera:c.world.controls.target.toArray()};
 });
 assert(movement.result.ok);assert(movement.travel>1,'Vehicles keep accepting and executing orders during the conversation');assert(movement.controls);
 await page.screenshot({path:folder+'/petrovich-desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:folder+'/petrovich-narrow.png'});
 assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));
 await done('r42');
 const result=await page.evaluate(()=>{
  clearInterval(petrovich.combatTimer);
  return {...petrovich,combatTimer:undefined,controls:campaign.world.controls.enabled,finished:campaign.radio.director.record('r42').status};
 });
 assert(!result.chiefVisible,'The chief must remain outside player sight when the call starts');
 assert.deepEqual(movement.camera,result.camera,'Conversation must not move the camera');
 const lines=result.lines.filter(l=>l.ended),scenes=[...new Set(lines.map(l=>l.scene))];
 assert.deepEqual(scenes,['r38','r41','r42']);
 assert.equal(lines.filter(l=>l.scene==='r42').length,10);
 for(const line of lines)assert(line.duration&&line.ended-line.started>=(line.duration-.15)*1000,JSON.stringify(line));
 const first41=lines.find(l=>l.scene==='r41'),last38=lines.filter(l=>l.scene==='r38').at(-1),first42=lines.find(l=>l.scene==='r42'),last41=lines.filter(l=>l.scene==='r41').at(-1);
 assert(first41.started-last38.ended<3500&&first42.started-last41.ended<3500,'Only the normal two-second radio gaps may separate the exchanges');
 assert.deepEqual(errors,[]);
 fs.writeFileSync(folder+'/verification.json',JSON.stringify({passed:true,movement,...result,errors},null,2));
 console.log('PASS third camp → introduction → all 10 Petrovich lines; unseen HQ, combat, pending research, live movement, unchanged camera, natural audio, desktop and narrow screenshots');
}finally{await browser.close();}
