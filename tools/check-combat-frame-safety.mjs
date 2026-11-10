import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {verifyFrameConditions} from './frame-benchmark-conditions.mjs';
import {injectLatencyHooks} from './latency-source-hooks.mjs';
import {injectMinimalCommandMarks} from './minimal-command-source.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH??'C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const option=(n,d)=>process.argv.find(a=>a.startsWith('--'+n+'='))?.slice(n.length+3)??d;
const folder=path.resolve(option('output','campaign/reports/frame-budget/safety-fix/combat')),paired=path.resolve(option('paired','campaign/reports/frame-budget/safety-fix/variants'));
const seconds=+option('seconds',180),variants=option('variants','baseline,after').split(','),walkProbe=option('walkProbe','off');
const latencyProbe=option('latencyProbe','false')==='true',supplement=option('supplement',null);
const commandTimeline=option('commandTimeline','false')==='true';
const minimalMarks=option('minimalMarks','false')==='true';
assert(!commandTimeline||latencyProbe,'Detailed timeline requires the latency probe');
assert(!(minimalMarks&&commandTimeline),'Run minimal first-motion marks and detailed diagnostics separately');
const renderScale=+option('renderScale',1),warmupFrames=+option('warmupFrames',300);
assert(Number.isFinite(renderScale)&&renderScale>0);assert(Number.isInteger(warmupFrames)&&warmupFrames>0);
const manifest=JSON.parse(fs.readFileSync(path.join(paired,'manifest.json'))),fixture=JSON.parse(fs.readFileSync('campaign/reports/frame-budget/baseline-final/convoy-fixture.json'));
const digest=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'fixture.json'),JSON.stringify(fixture));
const report={seconds,rate:4,renderScale,warmupFrames,scenario:'Authored mission, original hostile units/camps/raid and six allied vans. No enemy or safety overrides. Real rAF and wall-clock CPU budgets; fixed render scale and equal paused warmup frame count.',cpu:os.cpus()[0].model,node:process.version,fixtureHash:digest(path.join(folder,'fixture.json')),harnessHash:digest(new URL(import.meta.url)),results:[]};
report.latencyProbe=latencyProbe;
report.commandTimeline=commandTimeline;
report.minimalMarks=minimalMarks;
if(supplement){report.supplementHashes=JSON.parse(fs.readFileSync(path.join(supplement,'manifest.json')));for(const [file,hash] of Object.entries(report.supplementHashes))assert.equal(digest(path.join(supplement,file)),hash,file);}
fs.copyFileSync(new URL(import.meta.url),path.join(folder,'harness.mjs'));
if(fs.existsSync(path.join(folder,'summary.json'))){
 const previous=JSON.parse(fs.readFileSync(path.join(folder,'summary.json')));
 assert.equal(previous.fixtureHash,report.fixtureHash);assert.equal(previous.seconds,seconds);
 report.results=previous.results.filter(r=>!variants.includes(r.variant)).map(r=>({...r,harnessHash:r.harnessHash??previous.harnessHash}));
}
const browser=await chromium.launch({executablePath:process.env.EDGE_PATH??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11','--enable-precise-memory-info']});
try{
 const system=await browser.newBrowserCDPSession();report.gpu=(await system.send('SystemInfo.getInfo')).gpu;report.browserVersion=browser.version();
 for(const variant of variants){
  const source=path.join(paired,variant,'runtime'),errors=[];
  for(const [file,hash] of Object.entries(manifest.files[variant]))assert.equal(digest(path.join(source,file)),hash,file);
  const page=await browser.newPage({viewport:{width:1920,height:1080}});page.on('pageerror',e=>errors.push(e.stack));
  const diagnostics=[];page.on('console',m=>{if(m.type()==='error')diagnostics.push(m.text());});page.on('requestfailed',r=>diagnostics.push({url:r.url(),failure:r.failure()}));
  const transformed={};
  if(commandTimeline||minimalMarks)for(const rel of ['campaign/mission.js','campaign/command-planner.js','campaign/command-motion.js']){
   let body=fs.readFileSync(path.join(source,rel),'utf8');if(commandTimeline&&rel!=='campaign/command-motion.js')body=injectLatencyHooks(rel,body);if(minimalMarks)body=injectMinimalCommandMarks(rel,body);transformed[rel]=body;
   const target=path.join(folder,'instrumented',variant,rel);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,body);
  }
  await page.route('**/*',route=>{let rel=new URL(route.request().url()).pathname.slice(1);if(rel==='campaign/')rel+='index.html';if(transformed[rel])return route.fulfill({body:transformed[rel],contentType:'text/javascript'});const files=[path.join(source,rel),...(supplement?[path.join(supplement,rel)]:[])],file=files.find(f=>fs.existsSync(f)&&fs.statSync(f).isFile());return file?route.fulfill({path:file}):route.continue();});
  await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8766')+'/campaign/?perf');
  try{await page.waitForFunction(()=>window.campaign?.ready&&typeof document.querySelector('#load').onclick==='function',null,{timeout:120000});}
  catch(error){fs.writeFileSync(path.join(folder,variant+'-startup-error.json'),JSON.stringify({errors,diagnostics,body:await page.locator('body').innerText()},null,2));await page.screenshot({path:path.join(folder,variant+'-startup-error.png')});throw error;}
  await page.evaluate(async({save,origin,renderScale})=>{
   const {lockRenderScale}=await import('/tools/frame-benchmark-conditions.mjs');lockRenderScale(campaign.world,renderScale);
   campaign.radio.setEnabled(false);localStorage.setItem('warGame.alpha.mission01.v1',save);await document.querySelector('#load').onclick();
   document.querySelector('#pause').onclick();document.querySelector('#tempo').onclick();document.querySelector('#tempo').onclick();
   campaign.world.controls.enableDamping=false;campaign.world.centre(origin,600);
   campaign.select(campaign.mission.state.units.filter(u=>u.owner==='rai'&&u.kind==='bukhanka').map(u=>u.id),false,false);
  },{save:fixture.initialSave,origin:fixture.origin,renderScale});
  const warmup=await page.evaluate(async requestedFrames=>{
   const c=campaign,started=performance.now(),simStart=c.mission.state.time,scales=[];
   for(let i=0;i<requestedFrames;i++){await new Promise(requestAnimationFrame);scales.push(c.world.renderer.getPixelRatio());}
   return {requestedFrames,frames:scales.length,scales,simStart,simEnd:c.mission.state.time,wallMs:performance.now()-started,locked:c.world.fixedRenderScale};
  },warmupFrames);
  verifyFrameConditions([{renderScale}],warmup,renderScale);
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:1000});
  await cdp.send('Tracing.start',{categories:'devtools.timeline,v8,disabled-by-default-v8.gc,blink.user_timing',transferMode:'ReturnAsStream'});await cdp.send('Profiler.start');
  const result=await page.evaluate(async({seconds,origin,walkProbe,latencyProbe,commandTimeline,minimalMarks})=>{
   const c=campaign,m=c.mission,w=c.world,T=await import('/demo/vendor/three.module.js'),{distribution}=await import('/campaign/performance.js');
   const {installTickContactAudit}=await import('/tools/frame-contact-audit.mjs');
   const {vehicleRadiusBound}=await import('/campaign/vehicle-collision.js'),{isInfantry}=await import('/campaign/scav-unit-profiles.js');
   const ids=m.state.units.filter(u=>u.owner==='rai'&&u.kind==='bukhanka').map(u=>u.id);
   const latency=latencyProbe?(await import('/tools/frame-latency-probe.mjs')).installFrameLatencyProbe(m,w):null;
   const marks=minimalMarks?(await import('/tools/minimal-command-marks.mjs')).installMinimalCommandMarks(m):null;
   const timeline=commandTimeline?(await import('/tools/command-latency-probe.mjs')).installCommandLatencyProbe(m,{CommandPlanner:(await import('/campaign/command-planner.js')).CommandPlanner}):null;
   const audit=installTickContactAudit(m);
   const queryProbe=walkProbe==='off'?null:(await import('/tools/walk-query-probe.mjs')).installWalkQueryProbe(m,{capture:walkProbe==='capture'});
   const cameraMatrix=new T.Matrix4(),frustum=new T.Frustum(),sphere=new T.Sphere();
   function inspect(){
    w.camera.updateMatrixWorld();frustum.setFromProjectionMatrix(cameraMatrix.multiplyMatrices(w.camera.projectionMatrix,w.camera.matrixWorldInverse));
    let mismatches=0,visible=0,hidden=0;
    for(const u of m.state.units){if(u.hp<=0||u.owner!=='rai'||isInfantry(u))continue;
     const scale=m.config.worldScale;sphere.center.set(u.x,u.y,m.field.heightAt(u.x,u.y)+scale*1.5);
     sphere.radius=Math.hypot(vehicleRadiusBound(u.kind,scale),scale*1.8)+(m.config.units[u.kind]?.speed??0)*m.config.simulationStep;
     if(u.trafficOnScreen!==frustum.intersectsSphere(sphere))mismatches++;
     if(u.trafficOnScreen===false)hidden++;else visible++;
    }return {mismatches,visible,hidden};
   }
   const stats={preTickMismatches:0,postTickPoseLagFrames:0,telemetryMismatches:0,advanceCalls:0,cameraChanges:[],orders:[],combatHits:0,collisionDamageHits:0,damageHp:0,deaths:[],samples:[]};
   const advance=m.advance,worldUpdate=w.update,damage=m.damage;
   m.advance=function(...args){stats.preTickMismatches+=inspect().mismatches;stats.advanceCalls++;const result=advance.apply(this,args);latency?.sample();return result;};
   w.update=function(...args){const result=worldUpdate.apply(this,args),s=inspect();if(s.mismatches)stats.postTickPoseLagFrames++;if(s.visible!==m.trafficCamera.visible||s.hidden!==m.trafficCamera.hidden)stats.telemetryMismatches++;
    latency?.rendered();wargamePerf.measure('contact audit',()=>audit.flush());return result;};
   m.damage=function(target,...args){const hp=target.hp,result=damage.call(this,target,...args),lost=Math.max(0,hp-target.hp);if(lost){stats.damageHp+=lost;if(args[2]?.type==='collision')stats.collisionDamageHits++;else stats.combatHits++;if(hp>0&&target.hp<=0)stats.deaths.push({id:target.id,kind:target.kind,owner:target.owner,time:m.state.time,source:args[1]?.id,type:args[2]?.type});}return result;};
   const gl=w.renderer.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2'),gpu=[],queries=[],render=w.renderer.render;let disjoint=false;
   w.renderer.render=function(...args){let q;if(ext&&queries.length<8){q=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,q);}try{return render.apply(this,args);}finally{if(q){gl.endQuery(ext.TIME_ELAPSED_EXT);queries.push(q);}}};
   const done=u=>u&&!u.pendingOrder&&!u.path.length&&!u.task&&!u.detour&&!u.yieldReturn;
   for(const id of ids){const u=m.entity(id),goal={x:u.x,y:u.y+100};u.path=[goal];u.task={type:'move',...goal};u.routeOrder={destination:{...goal}};}
   m.state.navigationSurfaceVersion='obsolete';
   wargamePerf.reset();audit.reset();document.querySelector('#pause').onclick();
   const start=performance.now(),simStart=m.state.time;let cameraPhase=-1,orderPhase=0,sample=-1;
   while(performance.now()-start<seconds*1000){
    await new Promise(requestAnimationFrame);const elapsed=(performance.now()-start)/1000;if(elapsed>=seconds)break;
    const phase=Math.floor(elapsed/5);
    if(phase!==cameraPhase){cameraPhase=phase;const mode=(phase+Math.floor(phase/6))%3;
     // Absolute camera targets: no variant-dependent search for a moving edge.
     w.centre({x:origin.x+[0,1200,330][mode],y:origin.y},600);stats.cameraChanges.push({elapsed,mode});}
    const order=Math.floor(elapsed/30);if(order!==orderPhase){orderPhase=order;const goal={x:origin.x,y:origin.y+(order%2?-10:150)};marks?.arm(ids);const submitted=m.submitOrder(ids,'move',goal);marks?.returned(submitted);stats.orders.push({elapsed,goal,result:submitted});}
    if(Math.floor(elapsed/15)!==sample){sample=Math.floor(elapsed/15);stats.samples.push({elapsed,time:m.state.time,status:m.state.status,alive:ids.filter(id=>m.entity(id)).length,arrived:ids.filter(id=>done(m.entity(id))).length,emergencyStops:m.trafficCoordinator.stats.emergencyStops});}
    if(ext){disjoint||=gl.getParameter(ext.GPU_DISJOINT_EXT);while(queries.length&&gl.getQueryParameter(queries[0],gl.QUERY_RESULT_AVAILABLE)){const q=queries.shift();gpu.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);gl.deleteQuery(q);}}
   }
   c.renderSuspended=true;audit.flush();const perf=wargamePerf.report();wargamePerf.stop();
   const contactAudit=audit.report();contactAudit.auditDistribution=distribution(contactAudit.auditMs);delete contactAudit.auditMs;
   const latencyMetrics=latency?.report()??null;
   const commandTimelineMetrics=timeline?.report()??null;
   const minimalCommandMetrics=marks?.report()??null;marks?.restore();
   m.advance=advance;m.damage=damage;w.update=worldUpdate;w.renderer.render=render;audit.restore();for(const q of queries)gl.deleteQuery(q);
   queryProbe?.restore();
   timeline?.restore();
   latency?.restore();
   return {minimalCommands:minimalCommandMetrics,commandTimeline:commandTimelineMetrics,latency:latencyMetrics,walkQueries:queryProbe&&{records:queryProbe.records,captures:queryProbe.captures},rate:c.state.speed,wallSeconds:(performance.now()-start)/1000,simSeconds:m.state.time-simStart,...stats,contactAudit,perf,gpuMs:ext&&!disjoint?distribution(gpu):null,
    emergencyStops:m.trafficCoordinator.stats.emergencyStops,arrived:ids.filter(id=>done(m.entity(id))).length,alive:ids.filter(id=>m.entity(id)).length,total:ids.length,
    units:ids.map(id=>{const u=m.state.units.find(u=>u.id===id);return u&&{id,hp:u.hp,x:u.x,y:u.y,path:u.path,task:u.task};}),status:m.state.status};
  },{seconds,origin:fixture.origin,walkProbe,latencyProbe,commandTimeline,minimalMarks});
  result.warmup=warmup;result.conditions=verifyFrameConditions(result.perf.frames,warmup,renderScale);
  if(latencyProbe){
   assert.equal(result.latency.ticks.length,result.contactAudit.completedTicks,'Latency probe must cover every completed tick');
   assert(result.latency.ticks.every(t=>t.workMs>=0&&t.completionWallMs+.001>=t.workMs&&t.slices>0),'CPU work cannot exceed completion wall time');
   assert(result.latency.commands.every(c=>Number.isInteger(c.revision)),'Track concrete command revisions');
  }
  const {profile}=await cdp.send('Profiler.stop');fs.writeFileSync(path.join(folder,variant+'.cpuprofile'),JSON.stringify(profile));
  const completed=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));await cdp.send('Tracing.end');const {stream}=await completed;
  const fd=fs.openSync(path.join(folder,variant+'.trace.json'),'w');while(true){const chunk=await cdp.send('IO.read',{handle:stream});fs.writeSync(fd,chunk.base64Encoded?Buffer.from(chunk.data,'base64'):chunk.data);if(chunk.eof)break;}fs.closeSync(fd);await cdp.send('IO.close',{handle:stream});
  result.errors=errors;result.sources=manifest.sources[variant];fs.writeFileSync(path.join(folder,variant+'.json'),JSON.stringify(result));
  await page.evaluate(()=>{const c=campaign,u=c.mission.state.units.find(u=>u.owner==='rai'&&u.hp>0);if(u)c.world.centre(u,500);c.world.update(c.mission,new Set(c.selected),0,false);});
  await page.screenshot({path:path.join(folder,variant+'-desktop.png')});await page.setViewportSize({width:800,height:900});await page.waitForTimeout(200);await page.evaluate(()=>campaign.world.update(campaign.mission,new Set(campaign.selected),0,false));await page.screenshot({path:path.join(folder,variant+'-narrow.png')});
  const {perf,contactAudit,sources,units,walkQueries,latency,commandTimeline:timelineData,...small}=result;const {rows,events,...contactSummary}=contactAudit;
  const row={variant,harnessHash:report.harnessHash,...small,frameMs:perf.frameMs,over33:perf.over33,over50:perf.over50,longTasks:perf.longTasks.length,stages:perf.stages,contacts:contactSummary};report.results.push(row);
  fs.writeFileSync(path.join(folder,'summary.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({variant,frameMs:row.frameMs,over50:row.over50,longTasks:row.longTasks,emergencyStops:row.emergencyStops,arrived:row.arrived,alive:row.alive,combatHits:row.combatHits,preTickMismatches:row.preTickMismatches,postTickPoseLagFrames:row.postTickPoseLagFrames,contacts:row.contacts}));await page.close();
 }
}finally{await browser.close();}
for(const r of report.results){assert.equal(r.errors.length,0);assert.equal(r.preTickMismatches,0);assert.equal(r.postTickPoseLagFrames,0);assert.equal(r.telemetryMismatches,0);assert.equal(r.contacts.completedTicks,r.contacts.expectedTicks);assert(r.combatHits>0,'Must exercise real combat');}
