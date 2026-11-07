import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH??'C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const counts=(process.argv.find(a=>a.startsWith('--counts='))?.split('=')[1]??'100,200,500').split(',').map(Number),seconds=Number(process.argv.find(a=>a.startsWith('--seconds='))?.split('=')[1]??8);
const profileCpu=process.argv.includes('--profile');
const connected=process.argv.includes('--connected'),fixtureMode=connected?'connected':'mixed';
const browser=await chromium.launch({executablePath:process.env.EDGE_PATH??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,
 args:['--use-angle=d3d11','--enable-precise-memory-info','--disable-frame-rate-limit','--disable-gpu-vsync']});
const report={fixtureMode,note:'Actual game animation loop, HUD, production mission and renderer, real authored heightfield, 1920x1080, hardware rendering, no FPS cap. CPU component timings cover advance and world.update; frame intervals also include HUD. Pending and moving counts are reported; high FPS with an unfinished order is not a successful stress test.',sources:{},results:[],errors:[]};
for(const name of fs.readdirSync('campaign').filter(n=>/^(mission|main|navigation|traffic|turning|passage|road|command|group|combat|arrival|vehicle-motion|vehicle-collision|unit-spatial)/.test(n)&&n.endsWith('.js')))
 report.sources[name]=createHash('sha256').update(fs.readFileSync('campaign/'+name)).digest('hex');
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080}}),sourceJobs=[];report.loadedSources={};
 page.on('response',response=>{if(/\/campaign\/[^/]+\.js(?:\?|$)/.test(response.url()))sourceJobs.push(response.body().then(bytes=>{report.loadedSources[new URL(response.url()).pathname]=createHash('sha256').update(bytes).digest('hex');}));});
 page.on('pageerror',e=>{report.errors.push(e.message);console.log(JSON.stringify({pageError:e.message}));});
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8893')+'/campaign/');await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});
 await page.evaluate(()=>campaign.radio.setEnabled(false));await page.locator('#begin').click();await page.locator('#pause').click();await Promise.allSettled(sourceJobs);
 const session=await browser.newBrowserCDPSession(),system=await session.send('SystemInfo.getInfo');
 const profiler=profileCpu?await page.context().newCDPSession(page):null;
 if(profiler){await profiler.send('Profiler.enable');await profiler.send('Profiler.setSamplingInterval',{interval:1000});report.profiling='CPU sampling enabled: diagnostic run, do not compare FPS with unprofiled acceptance measurements.';}
 report.environment=await page.evaluate(()=>{const gl=campaign.world.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return {
  renderer:gl.getParameter(ext?.UNMASKED_RENDERER_WEBGL??gl.RENDERER),userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency,
  viewport:[innerWidth,innerHeight],timerQuery:!!gl.getExtension('EXT_disjoint_timer_query_webgl2'),date:new Date().toISOString()};});
 report.environment.gpuDevices=system.gpu.devices;
 for(const count of counts){
  const setup=await page.evaluate(async({count,connected,fixtureMode})=>{
   const c=campaign,m=c.mission,w=c.world;c.renderSuspended=true;c.radio.setEnabled(false);c.select([]);
   Object.assign(m.state,{units:[],buildings:[],camps:[],artifacts:[],pendingCinematics:[],commandOrders:[],commandGroups:[],bounds:m.config.finalMapBounds.slice(),time:0});
   m.state.salvage.items=[];m.state.trafficControl={version:1,leases:[],waiting:{}};m.commandPlanner=null;m.pendingTick=null;m.accumulator=0;m.unitIndexActive=false;m.unitFrameTimes=new WeakMap();
   m.updateMission=()=>{};m.effects=[];m.events=[];w.damage.reset();m.rebuildNavigation();m.visible.fill(255);m.explored.fill(255);
   const origin=m.field.gridToWorld(m.config.startGrid),goal=m.field.gridToWorld(m.config.camps.find(c=>c.id==='nw-east').gateGrid),points=[];
   const connectivity=connected?(await import('/tools/navigation-connected-fixture.mjs')).connectedSpawnFilter(m,goal):null;
   for(let y=-42;y<=42;y++)for(let x=-42;x<=42;x++)points.push({x:origin.x+x*32,y:origin.y+y*32,d:x*x+y*y});
   points.sort((a,b)=>a.d-b.d||a.y-b.y||a.x-b.x);const units=[];
   for(const p of points){
    if(!m.nav.allowed(...m.nav.grid(p.x,p.y)))continue;
    if(connectivity&&!connectivity.accepts(p))continue;
    const pose={x:p.x,y:p.y,heading:0,kind:'bukhanka',owner:'rai'};
    if(!m.vehicleMotionClear(pose,pose,pose,.52,undefined,[]))continue;
    units.push(m.addUnit('bukhanka','rai',pose,{heading:0}));if(units.length===count)break;
   }
   if(units.length!==count)throw Error('Only '+units.length+' legal starting poses');
   m.updateFog();m.explored.fill(255);
   const xs=units.map(u=>u.x),ys=units.map(u=>u.y),bounds={left:Math.min(...xs),right:Math.max(...xs),bottom:Math.min(...ys),top:Math.max(...ys)};
   w.controls.enableDamping=false;w.centre({x:(bounds.left+bounds.right)/2,y:(bounds.bottom+bounds.top)/2},Math.max(800,(bounds.right-bounds.left)*1.3,(bounds.top-bounds.bottom)*1.8));
   c.navigationBench={ids:units.map(u=>u.id),goal,starts:units.map(u=>({x:u.x,y:u.y,hp:u.hp})),navigationCpu:0,coordinatorCpu:0,contacts:0,terrainStops:0,contactLog:[]};
   if(!m.originalBenchMove){
    m.originalBenchMove=m.moveSteps;m.moveSteps=function*(...args){const iterator=this.originalBenchMove(...args);let step;
     do{const start=performance.now();try{step=iterator.next();}finally{c.navigationBench.navigationCpu+=performance.now()-start;}if(!step.done)yield step.value;}while(!step.done);return step.value;};
    const update=m.trafficCoordinator.update.bind(m.trafficCoordinator);m.trafficCoordinator.update=(...args)=>{const start=performance.now();try{return update(...args);}finally{c.navigationBench.coordinatorCpu+=performance.now()-start;}};
    const collision=m.vehicleCollision.bind(m);m.vehicleCollision=(unit,speed,blockers)=>{
     const bench=c.navigationBench;
     if(blockers.size){bench.contacts++;if(bench.contactLog.length<1000){
      const pose=u=>structuredClone({id:u.id,kind:u.kind,x:u.x,y:u.y,heading:u.heading,speed:u.driveSpeed,driveSpeed:u.driveSpeed,
       reversing:u.reversing,steering:u.steering,previousX:u.previousX,previousY:u.previousY,previousHeading:u.previousHeading,
       previousSteering:u.previousSteering,wheelDistance:u.wheelDistance,previousWheelDistance:u.previousWheelDistance,
       motionFrameTime:m.unitFrameTimes.get(u),path:u.path,task:u.task,detour:u.detour,navigation:u.navigation,
       traffic:u.traffic,trafficHold:u.trafficHold,driveWatch:u.driveWatch,passingLane:u.passingLane,yieldReturn:u.yieldReturn,
       pendingOrder:u.pendingOrder,routeOrder:u.routeOrder,commandRevision:u.commandRevision,
       intent:m.trafficCoordinator.intents.get(u.id),decision:m.trafficCoordinator.decisions.get(u.id),
       trafficLimit:m.trafficCoordinator.limit(u),height:m.field.heightAt(u.x,u.y),gradient:m.field.gradientAt(u.x,u.y)});
      bench.contactLog.push({time:m.state.time,simulationStep:m.config.simulationStep,speed,unit:pose(unit),blockers:[...blockers].map(pose)});
     }}
     else bench.terrainStops++;
     return collision(unit,speed,blockers);
    };
   }
   const initialSave=m.save();
   w.update(m,new Set(),0,false);return {count,fixtureMode,connectivity:connectivity?.metadata??null,bounds,goal,seed:19452,legalStarts:units.length,initialSave,ids:units.map(u=>u.id)};
  },{count,connected,fixtureMode});
  fs.mkdirSync('campaign/reports',{recursive:true});
  setup.fixtureFile='campaign/reports/navigation-browser-'+fixtureMode+'-'+count+'-fixture.json';
  fs.writeFileSync(setup.fixtureFile,JSON.stringify({fixtureMode,count,goal:setup.goal,ids:setup.ids,initialSave:setup.initialSave}));
  delete setup.initialSave;
  await page.evaluate(async()=>{for(let i=0;i<30;i++){await new Promise(requestAnimationFrame);campaign.world.update(campaign.mission,new Set(),0,false);}});
  for(const phase of ['idle','move-order']){
   if(profiler&&phase==='move-order')await profiler.send('Profiler.start');
   await page.evaluate(()=>{campaign.renderSuspended=false;});
   if(await page.evaluate(()=>campaign.state.paused))await page.locator('#pause').click();
   const result=await page.evaluate(async({phase,seconds})=>{
    const c=campaign,m=c.mission,w=c.world,b=c.navigationBench,gl=w.renderer.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
    let order=null,submitMs=null;if(phase==='move-order'){const start=performance.now();order=m.submitOrder(b.ids,'move',b.goal);submitMs=performance.now()-start;}
    const queries=[],gpu=[],frames=[],cpu=[],simulation=[],navigation=[],planner=[],draw=[],visible=[],moving=[],pending=[];
    let start=null,last=null,disjoint=false,maxBacklog=0,firstMotion=null;const simulationStart=m.state.time,contactsBefore=b.contacts,terrainBefore=b.terrainStops,contactLogStart=b.contactLog.length;
    const advance=m.advance,update=w.update;let lastSimulationCpu=0;
    m.advance=function(...args){
     const began=performance.now(),oldNav=b.navigationCpu+b.coordinatorCpu,oldPlan=m.commandPlanner?.stats.cpuMs??0;
     try{return advance.apply(this,args);}finally{
      lastSimulationCpu=performance.now()-began;simulation.push(lastSimulationCpu);
      const plan=(m.commandPlanner?.stats.cpuMs??0)-oldPlan;planner.push(plan);navigation.push(b.navigationCpu+b.coordinatorCpu-oldNav+plan);
     }
    };
    w.update=function(...args){
     const began=performance.now();let query;
     if(ext&&queries.length<10){query=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,query);}
     try{return update.apply(this,args);}finally{
      if(query){gl.endQuery(ext.TIME_ELAPSED_EXT);queries.push(query);}
      cpu.push(performance.now()-began+lastSimulationCpu);draw.push(w.renderer.info.render.calls);visible.push(w.vehicles.visible.length);
     }
    };
    try{
    while(true){
     const now=await new Promise(requestAnimationFrame);if(start===null)start=last=now;const dt=(now-last)/1000;
     if(now-start>=seconds*1000)break;if(dt>0)frames.push(now-last);last=now;
     const units=m.state.units,active=units.filter((u,i)=>Math.hypot(u.x-b.starts[i].x,u.y-b.starts[i].y)>.5).length;
     if(active&&firstMotion===null)firstMotion=(now-start)/1000;
     moving.push(units.filter(u=>(u.navigation?.speed??0)>.1).length);pending.push(units.filter(u=>u.pendingOrder?.status==='planning').length);
     maxBacklog=Math.max(maxBacklog,m.accumulator+(m.pendingTick?m.config.simulationStep:0));
     if(ext){disjoint||=gl.getParameter(ext.GPU_DISJOINT_EXT);while(queries.length&&gl.getQueryParameter(queries[0],gl.QUERY_RESULT_AVAILABLE)){const q=queries.shift();gpu.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);gl.deleteQuery(q);}}
    }
    }finally{m.advance=advance;w.update=update;c.renderSuspended=true;}
    for(let i=0;i<15&&queries.length;i++){
     await new Promise(requestAnimationFrame);disjoint||=gl.getParameter(ext.GPU_DISJOINT_EXT);
     while(queries.length&&gl.getQueryParameter(queries[0],gl.QUERY_RESULT_AVAILABLE)){const q=queries.shift();gpu.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);gl.deleteQuery(q);}
    }
    for(const q of queries)gl.deleteQuery(q);
    const stats=a=>{const sorted=a.slice().sort((a,b)=>a-b),at=p=>sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))]??null;return {p50:at(.5),p95:at(.95),p99:at(.99),max:sorted.at(-1)??null,mean:a.reduce((s,x)=>s+x,0)/Math.max(1,a.length)};};
    const units=m.state.units,physical=w.damage.statistics;
    return {phase,order,submitMs,firstMotion,frames:frames.length,fps:1000/stats(frames).mean,frameMs:stats(frames),cpuFrameMs:stats(cpu),simulationCpuMs:stats(simulation),
     navigationCpuMs:stats(navigation),navigationScope:'Command planner + TrafficCoordinator + actual moveSteps generator slices; excludes combat logic and renderer.',plannerCpuMs:stats(planner),
     gpuFrameMs:ext&&!disjoint&&gpu.length?stats(gpu):null,gpuReason:!ext?'EXT_disjoint_timer_query_webgl2 unavailable':disjoint?'disjoint timer':gpu.length?null:'no completed queries',
     drawCalls:stats(draw),visibleMin:Math.min(...visible),movingMax:Math.max(...moving),pendingMax:Math.max(...pending),pendingEnd:units.filter(u=>u.pendingOrder?.status==='planning').length,
     blockedEnd:units.filter(u=>u.pendingOrder?.status==='blocked').length,started:units.filter((u,i)=>Math.hypot(u.x-b.starts[i].x,u.y-b.starts[i].y)>.5).length,
     contacts:b.contacts-contactsBefore,contactLog:b.contactLog.slice(contactLogStart),terrainStops:b.terrainStops-terrainBefore,damage:units.reduce((sum,u,i)=>sum+Math.max(0,b.starts[i].hp-u.hp),0),simulatedSeconds:m.state.time-simulationStart,maxBacklog,
     jsHeap:performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize}:null,
     geometryUpdates:physical.geometryUpdates,activePhysics:physical.activePhysics,geometries:w.renderer.info.memory.geometries,textures:w.renderer.info.memory.textures};
   },{phase,seconds});
   if(profiler&&phase==='move-order'){
    const {profile}=await profiler.send('Profiler.stop');fs.mkdirSync('campaign/reports',{recursive:true});
    result.cpuProfile=`campaign/reports/navigation-${count}-${Date.now()}.cpuprofile`;fs.writeFileSync(result.cpuProfile,JSON.stringify(profile));
   }
   if(!(await page.evaluate(()=>campaign.state.paused)))await page.locator('#pause').click();
   await page.evaluate(()=>{campaign.renderSuspended=true;});
   const processes=await session.send('SystemInfo.getProcessInfo');let processMemory;
   try{processMemory=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File','tools/damage-process-metrics.ps1','-ProcessIds',processes.processInfo.map(p=>p.id).join(',')],{encoding:'utf8',windowsHide:true}));}catch(error){processMemory={unavailable:error.message};}
   report.results.push({count,setup,...result,processMemory});fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/navigation-browser-'+fixtureMode+'.json',JSON.stringify(report,null,2));
   console.log(JSON.stringify({count,phase,fps:result.fps,navP95:result.navigationCpuMs.p95,simP95:result.simulationCpuMs.p95,firstMotion:result.firstMotion,started:result.started,pending:result.pendingEnd,blocked:result.blockedEnd,contacts:result.contacts,gpuP95:result.gpuFrameMs?.p95}));
  }
 }
}finally{await browser.close();}
