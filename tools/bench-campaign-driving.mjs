import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH??'C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const label=process.argv.find(a=>a.startsWith('--label='))?.slice(8)??'after';
const seconds=Number(process.argv.find(a=>a.startsWith('--seconds='))?.slice(10)??15);
const baselineRef=process.argv.find(a=>a.startsWith('--baseline-ref='))?.slice(15),baselineSources=new Map();
const baselineSource=path=>{
 if(!baselineSources.has(path))baselineSources.set(path,execFileSync('git',['show',baselineRef+':'+path.slice(1)]));
 return baselineSources.get(path);
};
if(baselineRef)execFileSync('git',['rev-parse','--verify',baselineRef]);
const dir='campaign/reports/perf-general/'+label;fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.connectOverCDP(process.env.CDP_URL??'http://127.0.0.1:9337');
const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
const sourceJobs=[],sources={};
page.on('response',response=>{const path=new URL(response.url()).pathname;if(/^\/(campaign|demo)\/.*\.js$/.test(path))sourceJobs.push(response.body().then(bytes=>{sources[path]=createHash('sha256').update(bytes).digest('hex');}));});
try{
 if(baselineRef)await page.route('**/campaign/*.js',route=>route.fulfill({body:baselineSource(new URL(route.request().url()).pathname),contentType:'text/javascript'}));
 if(process.argv.includes('--baseline'))await page.route('**/campaign/*.js',route=>{
  const path='campaign/reports/perf-general/before/'+new URL(route.request().url()).pathname.split('/').at(-1);
  return fs.existsSync(path)?route.fulfill({path,contentType:'text/javascript'}):route.continue();
 });
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8899')+'/campaign/?mission=m02&perf');
 await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:120000});
 await page.locator('#begin').click();
 await page.waitForFunction(()=>campaign.state.active&&!campaign.state.openingPlaying,null,{timeout:120000});
 await page.locator('#pause').click();
 const source=JSON.parse(fs.readFileSync('docs/campaign/alpha/m02/playthrough-50.json','utf8')).state;
 const setup=await page.evaluate(snapshot=>{
  const c=campaign,m=c.mission,w=c.world;c.radio.setEnabled(false);c.radio.dismiss();m.load(snapshot);
  w.fixedRenderScale=true;w.renderer.setPixelRatio(1);w.controls.enableDamping=false;
  const units=m.state.units.filter(u=>u.owner==='rai'&&u.hp>0&&m.unitSpec(u).damage);
  const centre={x:units.reduce((n,u)=>n+u.x,0)/units.length,y:units.reduce((n,u)=>n+u.y,0)/units.length};
  w.centre(centre,1050);c.select(units.map(u=>u.id));
  const gl=w.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
  return {time:m.state.time,units:m.state.units.length,army:units.length,renderer:gl.getParameter(ext?.UNMASKED_RENDERER_WEBGL??gl.RENDERER),centre};
 },source);
 await page.evaluate(()=>new Promise(resolve=>{let left=120;const frame=()=>--left?requestAnimationFrame(frame):resolve();requestAnimationFrame(frame);}));
 const profiler=process.argv.includes('--profile')?await context.newCDPSession(page):null;
 if(profiler){await profiler.send('Profiler.enable');await profiler.send('Profiler.start');}
 await page.evaluate(()=>{
  const m=campaign.mission;window.drivingSamples=[];window.drivingLast=null;
  const unit=m.state.units.find(u=>u.owner==='rai'&&u.hp>0&&m.unitSpec(u).damage);
  window.drivingSubject=unit.id;
  window.drivingStart={time:m.state.time,wall:performance.now(),positions:m.state.units.filter(u=>u.owner==='rai'&&u.hp>0).map(u=>({id:u.id,x:u.x,y:u.y}))};
  const frame=now=>{
   if(window.drivingDone)return;
   const p=campaign.world.vehicles.transforms.get(unit.id)?.position;
   if(p){const old=window.drivingLast;window.drivingSamples.push({at:now,x:p.x,y:p.y,delta:old?Math.hypot(p.x-old.x,p.y-old.y):0});window.drivingLast={x:p.x,y:p.y};}
   requestAnimationFrame(frame);
  };requestAnimationFrame(frame);wargamePerf.reset();
 });
 await page.locator('#pause').click();
 const order=await page.evaluate(()=>{
  const m=campaign.mission;
  return m.submitOrder(m.state.units.filter(u=>u.owner==='rai'&&u.hp>0&&m.unitSpec(u).damage).map(u=>u.id),'attack-move',m.state.m02.bases.east_factory.gate);
 });assert(order.ok);
 await new Promise(r=>setTimeout(r,seconds*1000));
 const result=await page.evaluate(()=>{
  window.drivingDone=true;wargamePerf.stop();const m=campaign.mission,s=window.drivingStart,wall=(performance.now()-s.wall)/1000;
  const perf=wargamePerf.report();delete perf.frames;
  return {perf,wallSeconds:wall,simulationSeconds:m.state.time-s.time,simulationRate:(m.state.time-s.time)/wall,
   moved:s.positions.map(p=>({id:p.id,distance:Math.hypot((m.entity(p.id)?.x??p.x)-p.x,(m.entity(p.id)?.y??p.y)-p.y)})),
   pending:m.state.units.filter(u=>u.pendingOrder).length,planning:m.planningStats,predictive:m.trafficCoordinator.stats,
   samples:window.drivingSamples,scale:campaign.world.renderer.getPixelRatio()};
 });
 if(profiler){const {profile}=await profiler.send('Profiler.stop');fs.writeFileSync(dir+'/browser.cpuprofile',JSON.stringify(profile));}
 await page.locator('#pause').click();
 await page.evaluate(()=>{document.querySelector('#performance-overlay')?.remove();});
 await page.screenshot({path:dir+'/wide.png'});
 await page.setViewportSize({width:667,height:375});
 await page.screenshot({path:dir+'/narrow.png'});
 const layout=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,width:innerWidth,canvasHeight:document.querySelector('#world').getBoundingClientRect().height,height:innerHeight}));
 assert.equal(layout.scrollWidth,layout.width);assert.equal(layout.canvasHeight,layout.height);assert.deepEqual(errors,[]);
 await Promise.all(sourceJobs);
 for(const [path,hash] of Object.entries(sources)){
  const baseline='campaign/reports/perf-general/before/'+path.split('/').at(-1);
  const local=process.argv.includes('--baseline')&&fs.existsSync(baseline)?baseline:'.'+path;
  const bytes=baselineRef&&path.startsWith('/campaign/')?baselineSource(path):fs.readFileSync(local);
  assert.equal(hash,createHash('sha256').update(bytes).digest('hex'),'Loaded source matches checkout: '+path);
 }
 const report={setup,order,...result,layout,errors,profiled:!!profiler,baselineRef,sources};
 fs.writeFileSync(dir+'/browser.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({setup,simulationRate:result.simulationRate,simulationSeconds:result.simulationSeconds,frame:result.perf.frameMs,stages:result.perf.stages,pending:result.pending,moved:result.moved.filter(u=>u.distance>1).length,errors}));
}finally{await context.close();await browser.close();}
