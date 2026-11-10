import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {injectMinimalCommandMarks} from './minimal-command-source.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH??'C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const option=(n,d)=>process.argv.find(a=>a.startsWith('--'+n+'='))?.slice(n.length+3)??d;
const output=option('output','campaign/reports/frame-budget/minimal-command-latency'),seconds=+option('seconds',90),runs=+option('runs',6);
const digest=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
assert(!fs.existsSync(path.join(output,'schedule.json')),'Use a fresh directory');fs.mkdirSync(output,{recursive:true});
const paired='campaign/reports/frame-budget/path-search/variants',source=path.join(paired,'baseline/runtime'),manifest=JSON.parse(fs.readFileSync(path.join(paired,'manifest.json'))),fixture=JSON.parse(fs.readFileSync('campaign/reports/frame-budget/baseline-final/convoy-fixture.json'));
for(const [file,hash] of Object.entries(manifest.files.baseline))assert.equal(digest(path.join(source,file)),hash,file);
const supplement=path.join(output,'supplement');fs.cpSync('campaign/reports/frame-budget/command-latency/supplement',supplement,{recursive:true});
const extra=JSON.parse(fs.readFileSync(path.join(supplement,'manifest.json')));for(const [file,hash] of Object.entries(extra))assert.equal(digest(path.join(supplement,file)),hash,file);
for(const file of ['tools/minimal-command-marks.mjs']){fs.copyFileSync(file,path.join(supplement,file));extra[file]=digest(file);}
fs.writeFileSync(path.join(supplement,'manifest.json'),JSON.stringify(extra,null,2));
const transformed={},servedHashes={};
for(const rel of ['campaign/mission.js','campaign/command-planner.js','campaign/command-motion.js']){
 const body=injectMinimalCommandMarks(rel,fs.readFileSync(path.join(source,rel),'utf8'));transformed[rel]=body;
 const file=path.join(output,'instrumented',rel);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,body);servedHashes[rel]=digest(file);
}
const tools=['profile-minimal-command-latency.mjs','minimal-command-marks.mjs','minimal-command-source.mjs','check-minimal-command-marks.mjs'];
for(const name of tools){fs.mkdirSync(path.join(output,'tools'),{recursive:true});fs.copyFileSync('tools/'+name,path.join(output,'tools',name));}
fs.writeFileSync(path.join(output,'fixture.json'),JSON.stringify(fixture));
const schedule={mode:'minimal source timestamps; ?perf OFF; no latency wrapper/audit/GPU query/CPU profiler/CDP trace',seconds,runs,rate:4,renderScale:1,warmupFrames:300,viewport:{width:1920,height:1080},cpu:os.cpus()[0].model,node:process.version,sourceHashes:manifest.files.baseline,servedHashes,supplementHashes:extra,toolHashes:Object.fromEntries(tools.map(f=>[f,digest('tools/'+f)])),started:new Date().toISOString(),completed:[]};
fs.writeFileSync(path.join(output,'schedule.json'),JSON.stringify(schedule,null,2));
for(let run=1;run<=runs;run++){
 for(const [file,hash] of Object.entries(schedule.toolHashes))assert.equal(digest('tools/'+file),hash);
 const folder=path.join(output,`run-${run}`);fs.mkdirSync(folder,{recursive:true});console.log(JSON.stringify({run,started:new Date().toISOString()}));
 const browser=await chromium.launch({executablePath:process.env.EDGE_PATH??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11','--enable-precise-memory-info']});
 try{
  schedule.browser=browser.version();if(!schedule.gpu){const cdp=await browser.newBrowserCDPSession();schedule.gpu=(await cdp.send('SystemInfo.getInfo')).gpu;await cdp.detach();}
  const page=await browser.newPage({viewport:schedule.viewport}),errors=[];page.on('pageerror',e=>errors.push(e.stack));
  await page.route('**/*',route=>{let rel=new URL(route.request().url()).pathname.slice(1);if(rel==='campaign/')rel+='index.html';if(transformed[rel])return route.fulfill({body:transformed[rel],contentType:'text/javascript'});const file=[path.join(source,rel),path.join(supplement,rel)].find(f=>fs.existsSync(f)&&fs.statSync(f).isFile());return file?route.fulfill({path:file}):route.continue();});
  await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8766')+'/campaign/');
  await page.waitForFunction(()=>window.campaign?.ready&&typeof document.querySelector('#load').onclick==='function',null,{timeout:120000});
  await page.evaluate(async({save,origin})=>{
   const {lockRenderScale}=await import('/tools/frame-benchmark-conditions.mjs');lockRenderScale(campaign.world,1);campaign.radio.setEnabled(false);
   localStorage.setItem('warGame.alpha.mission01.v1',save);await document.querySelector('#load').onclick();document.querySelector('#pause').onclick();document.querySelector('#tempo').onclick();document.querySelector('#tempo').onclick();
   campaign.world.controls.enableDamping=false;campaign.world.centre(origin,600);campaign.select(campaign.mission.state.units.filter(u=>u.owner==='rai'&&u.kind==='bukhanka').map(u=>u.id),false,false);
  },{save:fixture.initialSave,origin:fixture.origin});
  const result=await page.evaluate(async({seconds,origin})=>{
   if(globalThis.wargamePerf)throw Error('Perf instrumentation must be off');
   const c=campaign,m=c.mission,w=c.world,{installMinimalCommandMarks}=await import('/tools/minimal-command-marks.mjs');
   const warmup={frames:0,simStart:m.state.time};for(let i=0;i<300;i++){await new Promise(requestAnimationFrame);if(w.renderer.getPixelRatio()!==1)throw Error('Scale drift in warmup');warmup.frames++;}warmup.simEnd=m.state.time;
   const marks=installMinimalCommandMarks(m),ids=m.state.units.filter(u=>u.owner==='rai'&&u.kind==='bukhanka').map(u=>u.id);
   for(const id of ids){const u=m.entity(id),goal={x:u.x,y:u.y+100};u.path=[goal];u.task={type:'move',...goal};u.routeOrder={destination:{...goal}};}
   m.state.navigationSurfaceVersion='obsolete';
   const capacity=Math.ceil(seconds*500+1000),wall=new Float64Array(capacity),raf=new Float64Array(capacity),calls=new Uint32Array(capacity),triangles=new Uint32Array(capacity);
   const orders=[],cameras=[];let count=0,cameraPhase=-1,orderPhase=0;
   document.querySelector('#pause').onclick();const start=performance.now(),simStart=m.state.time;
   while(true){const stamp=await new Promise(requestAnimationFrame),at=performance.now(),elapsed=(at-start)/1000;if(elapsed>=seconds)break;
    if(w.renderer.getPixelRatio()!==1||!w.fixedRenderScale)throw Error('Scale drift');if(count>=capacity)throw Error('Frame buffer exceeded');
    wall[count]=at;raf[count]=stamp;calls[count]=w.renderer.info.render.calls;triangles[count]=w.renderer.info.render.triangles;count++;
    const phase=Math.floor(elapsed/5);if(phase!==cameraPhase){cameraPhase=phase;const mode=(phase+Math.floor(phase/6))%3;w.centre({x:origin.x+[0,1200,330][mode],y:origin.y},600);cameras.push({elapsed,mode});}
    const order=Math.floor(elapsed/30);if(order!==orderPhase){orderPhase=order;const goal={x:origin.x,y:origin.y+(order%2?-10:150)};marks.arm(ids);const result=m.submitOrder(ids,'move',goal);marks.returned(result);orders.push({elapsed,goal,result});}
   }
   c.renderSuspended=true;const ended=performance.now(),done=u=>u&&!u.pendingOrder&&!u.path.length&&!u.task&&!u.detour&&!u.yieldReturn;
   const minimal=marks.report();marks.restore();
   return {minimal,warmup,conditions:{scale:1,verifiedFrames:count,perfEnabled:!!globalThis.wargamePerf},start,ended,simSeconds:m.state.time-simStart,rate:c.state.speed,orders,cameras,
    frameTimes:Array.from(wall.subarray(0,count)),rafTimes:Array.from(raf.subarray(0,count)),drawCalls:Array.from(calls.subarray(0,count)),triangles:Array.from(triangles.subarray(0,count)),
    alive:ids.filter(id=>m.entity(id)?.hp>0).length,arrived:ids.filter(id=>done(m.entity(id))).length,emergencyStops:m.trafficCoordinator.stats.emergencyStops,status:m.state.status};
  },{seconds,origin:fixture.origin});
  assert.equal(errors.length,0);assert.equal(result.warmup.frames,300);assert.equal(result.warmup.simStart,result.warmup.simEnd);assert.equal(result.rate,4);
  result.errors=errors;fs.writeFileSync(path.join(folder,'minimal.json'),JSON.stringify(result));
  await page.evaluate(()=>{const c=campaign,u=c.mission.state.units.find(u=>u.owner==='rai'&&u.hp>0);if(u)c.world.centre(u,500);c.world.update(c.mission,new Set(c.selected),0,false);});
  await page.screenshot({path:path.join(folder,'desktop.png')});await page.setViewportSize({width:800,height:900});await page.waitForTimeout(200);await page.evaluate(()=>campaign.world.update(campaign.mission,new Set(campaign.selected),0,false));await page.screenshot({path:path.join(folder,'narrow.png')});
  schedule.completed.push(run);fs.writeFileSync(path.join(output,'schedule.json'),JSON.stringify(schedule,null,2));
  console.log(JSON.stringify({run,frames:result.conditions.verifiedFrames,clockReads:result.minimal.clockReads,alive:result.alive,arrived:result.arrived,commands:result.minimal.groups.map(g=>({revision:g.revision,atomic:g.atomic,first:g.rows.map(r=>r.firstMotionAt===null?null:r.firstMotionAt-g.receivedAt),route:g.rows.map(r=>r.routeThresholdAt===null?null:r.routeThresholdAt-g.receivedAt)}))}));
 }finally{await browser.close();}
}
