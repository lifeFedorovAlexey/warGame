import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const folder='campaign/previews/playtest-WG-055/browser';fs.mkdirSync(folder,{recursive:true});
const store=path.resolve(folder,'radio-store');fs.mkdirSync(store,{recursive:true});
const code="import sys\nfrom pathlib import Path\nsys.path.insert(0,'tools')\nimport radio_library\nradio_library.STORE=Path(sys.argv[1])\nfrom serve import ReviewServer,ReviewHandler\ns=ReviewServer(('127.0.0.1',0),ReviewHandler)\nprint(s.server_port,flush=True)\ns.serve_forever()";
const server=spawn('python',['-u','-c',code,store],{windowsHide:true,stdio:['ignore','pipe','pipe']});let serverErrors='';server.stderr.on('data',d=>serverErrors+=d);
let browser;const report={errors:[],consoleErrors:[],requests:[],captures:[]};
try{
 const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(serverErrors||'Server timeout')),15000);server.stdout.once('data',d=>{clearTimeout(timer);resolve(Number(String(d).trim()));});server.once('error',reject);});
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});page.on('pageerror',e=>report.errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text());});
 page.on('response',r=>{if(r.url().includes('/api/radio/speech'))report.requests.push({url:r.url(),status:r.status()});});
 await page.addInitScript(()=>{
  for(const k of ['fieldSound','fieldStoryVoice'])localStorage.setItem('warGame.'+k,'on');localStorage.setItem('warGame.fieldRadio','off');
  window.wgAudio=[];const start=AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start=function(){if(window.campaign?.radio?.entry?.dynamic&&this.buffer){let peak=0;for(const n of this.buffer.getChannelData(0))peak=Math.max(peak,Math.abs(n));wgAudio.push({id:campaign.radio.entry.id,text:campaign.radio.entry.text,duration:this.buffer.duration,peak,context:this.context.state});}return start.apply(this,arguments);};
 });
 await page.goto('http://127.0.0.1:'+port+'/campaign/?perf=1');await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:120000});
 await page.locator('#begin').click();await page.locator('[data-dream=skip]').click();await page.evaluate(()=>{const m=campaign.mission,s=m.entity(m.state.openingScene.signId);s.completed=true;s.progress=1;});
 await page.waitForFunction(()=>campaign.state.active&&!campaign.state.openingPlaying,null,{timeout:120000});await page.locator('#pause').click();
 await page.evaluate(save=>campaign.mission.load(save),fs.readFileSync('campaign/previews/playtest-WG-051/m01-real-map.save.json','utf8'));
 report.setup=await page.evaluate(()=>{
  const c=campaign,m=c.mission,r=c.radio,d=r.director,w=c.world,gl=w.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');w.fixedRenderScale=1;w.renderer.setPixelRatio(1);document.querySelector('#performance-overlay').hidden=true;
  d.bind(m);for(const id of d.scenes.keys())d.data.scenes[id]={status:'done',cursor:0,endedAt:d.data.clock-20000};d.data.active=null;r.hide();
  m.state.time=Math.max(30,m.state.time);r.dynamic.bind();const e=m.radioObserver.engine;e.state.queue=[];e.pending.clear();e.active=null;
  // Isolate the four new event sources; all movement and collision code is real.
  for(const rule of m.radioObserver.library.rules)if(!['traffic.retreat_contact','traffic.panic_blocked','traffic.panic_escaped','damage.panic_failed'].includes(rule.id))rule.enabled=false;
  // Select two authored exchanges to verify both participants, not a random solo line.
  for(const [id,variant] of [['traffic.retreat_contact','v4'],['traffic.panic_escaped','v7']])for(const tier of m.radioObserver.library.rules.find(r=>r.id===id).tiers)tier.graphs=tier.graphs.filter(g=>g.id===id+'.'+variant);
  const origin=m.state.wg051.origin,u=m.entity(m.state.wg051.ids[0]);u.x=origin.x;u.y=origin.y-100;u.hp=64;u.heading=0;u.driveSpeed=0;
  const f=m.addStructure('factory','rai',{x:origin.x,y:origin.y+120},{completed:true,progress:1});m.addStructure('generator','rai',{x:origin.x+220,y:origin.y+200},{completed:true,progress:1});
  m.rebuildNavigation();m.explored.fill(255);m.updateFog();const response=m.retreat([u.id]);if(!response.ok)throw Error(JSON.stringify(response));
  window.wg={id:u.id,factory:f.id,start:m.state.time,rows:[],events:[],lines:[],blocker:null};
  const original=m.continueTick.bind(m),emit=m.emit.bind(m);let last=m.state.time;
  m.emit=(type,data)=>{if(type.startsWith('retreat-'))wg.events.push({type,at:m.state.time,...structuredClone(data)});return emit(type,data);};
  m.continueTick=function(...args){const result=original(...args);if(this.pendingTick||this.state.time===last)return result;last=this.state.time;
   if(!wg.blocker&&u.path.length&&u.driveSpeed>10){const b=this.addUnit('bukhanka','rai',{x:u.x-Math.sin(u.heading)*40,y:u.y+Math.cos(u.heading)*40},{heading:u.heading});wg.blocker=b.id;}
   wg.rows.push({time:this.state.time,x:u.x,y:u.y,speed:u.driveSpeed,hp:u.hp,reason:u.navigation?.reason,visit:u.factoryVisit?.phase,retreat:u.combatRetreat?.status,other:wg.blocker&&{...this.entity(wg.blocker)}});
   const line=c.radio.entry;if(line?.dynamic&&!wg.lines.some(l=>l.id===line.id))wg.lines.push({id:line.id,text:line.text,at:this.state.time,clip:line.clip});return result;};
  c.select([u.id]);w.centre({x:u.x,y:u.y+25},170);r.setEnabled(true);
  return {origin,id:u.id,factory:f.id,gpu:ext&&gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),terrain:m.field.heightAt(u.x,u.y)};
 });
 console.log('Scene ready',JSON.stringify(report.setup));
 await page.waitForTimeout(350);await page.screenshot({path:folder+'/before.png'});await page.evaluate(()=>wargamePerf.reset());await page.locator('#pause').click();
 await page.waitForFunction(()=>wg.events.some(e=>e.type==='retreat-contact'),null,{timeout:30000});
 await page.locator('#pause').click();await page.waitForTimeout(200);
 report.contact=await page.evaluate(()=>{const m=campaign.mission,u=m.entity(wg.id),b=m.entity(wg.blocker);campaign.world.centre({x:(u.x+b.x)/2,y:(u.y+b.y)/2},115);return {event:wg.events.find(e=>e.type==='retreat-contact'),units:[u,b].map(v=>({id:v.id,x:v.x,y:v.y,heading:v.heading,hp:v.hp,damage:structuredClone(v.damage)}))};});
 await page.waitForTimeout(400);await page.screenshot({path:folder+'/contact-close.png'});report.captures.push('contact-close.png');
 await page.locator('#pause').click();await page.waitForFunction(()=>wg.lines.some(l=>l.id.startsWith('traffic.retreat_contact')),null,{timeout:15000});
 await page.locator('#pause').click();
 for(const viewport of [{width:1440,height:900},{width:844,height:390},{width:667,height:375}]){
  await page.setViewportSize(viewport);await page.waitForTimeout(250);await page.screenshot({path:folder+'/contact-'+viewport.width+'.png'});report.captures.push('contact-'+viewport.width+'.png');
 }
 await page.setViewportSize({width:1440,height:900});await page.locator('#pause').click();
 await page.waitForFunction(()=>wg.lines.some(l=>l.id==='traffic.retreat_contact.v4.2')&&wgAudio.some(l=>l.id==='traffic.retreat_contact.v4.2'&&l.peak>.01),null,{timeout:20000});
 await page.screenshot({path:folder+'/indignation.png'});
 await page.waitForFunction(()=>campaign.mission.entity(wg.id).factoryVisit?.phase==='inside',null,{timeout:90000});
 await page.waitForFunction(()=>wg.lines.some(l=>l.id==='traffic.panic_escaped.v7.2')&&wgAudio.some(l=>l.id==='traffic.panic_escaped.v7.2'&&l.peak>.01),null,{timeout:25000});
 await page.locator('#pause').click();
 report.result=await page.evaluate(()=>{wargamePerf.stop();return {trace:wg,audio:wgAudio,performance:wargamePerf.report(),unit:campaign.mission.entity(wg.id),blocker:campaign.mission.entity(wg.blocker)};});
 await page.screenshot({path:folder+'/escaped.png'});
 assert.equal(report.errors.length,0);assert.equal(report.result.trace.events.filter(e=>e.type==='retreat-contact').length,1);
 assert(report.contact.units.every(u=>u.hp>0&&u.damage?.cage?.some(v=>Math.abs(v)>.001)&&u.damage.marks.length&&!Object.values(u.damage.parts).some(p=>p.detached)),'Both actual models receive a local dent without detached components');
 assert(report.result.trace.lines.some(l=>l.id.startsWith('traffic.retreat_contact')));assert(report.result.trace.lines.some(l=>l.id.startsWith('traffic.panic_escaped')));
 console.log(JSON.stringify({events:report.result.trace.events.filter(e=>e.type==='retreat-contact'),lines:report.result.trace.lines,audio:report.result.audio,errors:report.errors}));
}catch(e){report.failure=e.stack;throw e;}finally{fs.writeFileSync(folder+'/verification.json',JSON.stringify(report,null,2));if(browser)await browser.close();server.kill();}
