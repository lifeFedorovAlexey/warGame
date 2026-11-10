import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {motionScene,createMotionTrace} from './traffic-motion-scenes.mjs';
import {distribution} from '../campaign/performance.js';

const arg=(name,fallback)=>process.argv.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
const output=arg('output','campaign/reports/traffic-motion');
const modes=arg('scenes','narrow-pass,repair-return').split(',');
const seconds=Number(arg('seconds',60));
const verifyRepair=process.argv.includes('--verify-repair');
const screenshots=process.argv.includes('--screenshots');
assert(Number.isFinite(seconds)&&seconds>0);
const config=JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/gameplay.json'));
fs.mkdirSync(output,{recursive:true});

function save(name,result){
 const file=path.join(output,name+'.json');
 fs.writeFileSync(file,JSON.stringify(result),{flag:'wx'});
 const {scene,rate,simulationSeconds,metrics,frameMs,frameOver33}=result;
 console.log(JSON.stringify({file,scene,rate,simulationSeconds,frameMs,frameOver33,crossed:metrics.crossedWithin60SimSeconds,
  opposingTicks:metrics.opposingOccupancyTicks,contactPairs:metrics.contactPairs,emergencyStops:metrics.emergencyStops,
  units:metrics.units.map(u=>({id:u.id,arrived:u.arrived,stops:u.stops,blockedSeconds:u.blockedSeconds,service:u.service,state:u.last?.state,reason:u.last?.reason}))}));
 if(verifyRepair&&scene==='repair-return')assertRepairReturn(result);
}

function assertRepairReturn({metrics}){
 const damaged=metrics.units.filter(u=>u.damaged);
 assert.equal(damaged.length,1,'Only the fixture car should lose HP');
 assert(damaged[0].service.repair!==null&&damaged[0].service.clear!==null,'The damaged car must repair and clear the factory exit');
 assert(metrics.units.filter(u=>!u.damaged).every(u=>u.service.gate===null&&u.service.inside===null),'Healthy cars must park outside the service queue');
 assert(metrics.units.every(u=>u.arrived),'All six retreat orders must finish');
 assert.equal(metrics.contactPairs,0,'No external body penetration on completed ticks');
}

function summarizeMotion(result){
 const {frames,metrics,rate}=result;
 const limit=60.00001;
 const ticks=metrics.ticks.filter(t=>t.time<=limit);
 const steeringDeadband=.02,accelerationDeadband=.1;
 const jerkSamples=[];
 const units=metrics.units.map(unit=>{
  const rows=ticks.map(t=>t.rows.find(row=>row.id===unit.id));
  let steering=0,steerReversals=0,accelerationSign=0,alternatingAccelerations=0;
  let previousSpeed,previousPhase;
  for(const row of rows){
   if(!row.pathRemaining||row.visit==='inside'){previousSpeed=undefined;steering=accelerationSign=0;continue;}
   const steer=Math.abs(row.steering)>steeringDeadband?Math.sign(row.steering):0;
   if(steer){if(steering&&steer!==steering)steerReversals++;steering=steer;}
   const speed=row.speed/metrics.scale;
   if(previousSpeed!==undefined&&previousPhase===row.visit){
    const acceleration=(speed-previousSpeed)/(ticks[1]?.time-ticks[0]?.time||.1);
    if(Math.abs(acceleration)>accelerationDeadband){
     const sign=Math.sign(acceleration);
     if(accelerationSign&&sign!==accelerationSign)alternatingAccelerations++;
     accelerationSign=sign;
    }
   }else accelerationSign=0;
   previousSpeed=speed;previousPhase=row.visit;
  }
  const jerk=[];
  if(frames)for(let i=3;i<frames.length;i++){
   const window=frames.slice(i-3,i+1);
   if(window[3].sim>limit)break;
   const states=window.map(f=>f.units.find(row=>row.id===unit.id));
   if(!states.every(row=>row.render)||!states.some(row=>row.pathRemaining||['gate','entering','leaving','departure'].includes(row.phase)))continue;
   const poses=states.map(row=>row.render);
   const dt=window.slice(1).map(f=>f.dt/1000*rate);
   if(dt.some(step=>step<=0))continue;
   const v=dt.map((step,index)=>Math.hypot(poses[index+1].x-poses[index].x,poses[index+1].y-poses[index].y)/metrics.scale/step);
   const a0=(v[1]-v[0])/((dt[0]+dt[1])/2),a1=(v[2]-v[1])/((dt[1]+dt[2])/2);
   const magnitude=Math.abs(a1-a0)/((dt[0]+2*dt[1]+dt[2])/4);
   jerk.push(magnitude);
   jerkSamples.push({magnitude,longFrame:window.slice(1).some(f=>f.over33),tickChanged:window[0].tick!==window[3].tick});
  }
  return {id:unit.id,damaged:unit.damaged,arrived:unit.arrived,service:unit.service,crossedAt:unit.crossedAt,
   fullCapture:{stops:unit.stops,stopsPer100m:unit.stopsPer100m,minSpeedWithPath:unit.minSpeedWithPath,
    blockedSeconds:unit.blockedSeconds,resumeSeconds:distribution(unit.resumeSeconds)},
   first60SimSeconds:{steerReversals,alternatingAccelerations,renderedJerk:distribution(jerk)}};
 });
 const jerk=distribution(jerkSamples.map(row=>row.magnitude));
 const tail=jerkSamples.filter(row=>row.magnitude>0&&row.magnitude>=jerk.p95);
 return {scene:result.scene,rate,seconds:result.seconds,simulationSeconds:result.simulationSeconds,tickCount:metrics.ticks.length,
  commonWindowSimSeconds:ticks.at(-1)?.time??0,frameMs:result.frameMs,frameOver33:result.frameOver33,frameOver50:result.frameOver50,
  contactsInFirst60SimSeconds:metrics.contacts.filter(row=>row.time<=limit).length,contactPairs:metrics.contactPairs,
  opposingOccupancyTicks:metrics.opposingOccupancyTicks,crossedInFirst60SimSeconds:metrics.crossedWithin60SimSeconds,
  emergencyStops:metrics.emergencyStops,units,
  jerk:{units:'metres per simulated second cubed from rendered positions, using rate-scaled frame intervals',stats:jerk,
   upperTail:tail.length,tailNearLongFrame:tail.filter(row=>row.longFrame).length,tailSpansTickChange:tail.filter(row=>row.tickChanged).length,
   allNearLongFrame:jerkSamples.filter(row=>row.longFrame).length}};
}

if(process.argv.includes('--summarize')){
 const files=fs.readdirSync(output).filter(name=>/^(narrow-pass|repair-return)-(x[14]|fixed-step)\.json$/.test(name));
 assert(files.length,'No motion recordings found');
 const summary=files.map(name=>{
  const result=JSON.parse(fs.readFileSync(path.join(output,name)));
  if(verifyRepair&&result.scene==='repair-return')assertRepairReturn(result);
  return {file:name,...summarizeMotion(result)};
 });
 fs.writeFileSync(path.join(output,'motion-summary.json'),JSON.stringify(summary,null,2));
 console.log(JSON.stringify(summary.map(({units,...result})=>result)));
}else if(process.argv.includes('--node')){
 for(const mode of modes){
  const scene=motionScene(config,mode),trace=createMotionTrace(scene);
  scene.start();
  while(scene.mission.state.time<seconds-1e-8){
   scene.mission.advance(config.simulationStep);
   scene.mission.drainEvents();scene.mission.drainEffects();
  }
  save(mode+'-fixed-step',{scene:mode,clock:'fixed simulation steps',simulationSeconds:scene.mission.state.time,orders:scene.orders,metrics:trace.report()});
 }
}else{
 const require=createRequire(import.meta.url);
 const {chromium}=require(process.env.PLAYWRIGHT_PATH??'C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
 const browser=await chromium.launch({executablePath:process.env.EDGE_PATH??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{for(const key of ['fieldSound','fieldRadio','fieldStoryVoice'])localStorage.setItem('warGame.'+key,'off');});
  await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8766')+'/campaign/');
  await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:120000});
  await page.evaluate(()=>{
   campaign.renderSuspended=true;
   document.querySelector('#welcome').hidden=true;
   campaign.world.fixedRenderScale=true;
   campaign.world.renderer.setPixelRatio(1);
   campaign.world.controls.enableDamping=false;
  });
  for(const mode of modes)for(const rate of arg('rates','1,4').split(',').map(Number)){
   assert(rate===1||rate===4);
   const result=await page.evaluate(async({mode,rate,seconds,config,screenshots})=>{
    const {motionScene,createMotionTrace}=await import('/tools/traffic-motion-scenes.mjs');
    const {distribution}=await import('/campaign/performance.js');
    const scene=motionScene(config,mode),m=scene.mission,w=campaign.world;
    // Production Mission and renderer on a controlled flat simulation fixture.
    // The loaded map remains the visual background. The geometry is logged.
    w.centre({x:0,y:0},mode==='narrow-pass'?2000:760);
    const selected=new Set();
    const nextFrame=()=>new Promise(requestAnimationFrame);
    for(let i=0;i<120;i++){await nextFrame();w.update(m,selected,0,false);}
    const trace=createMotionTrace(scene),frames=[];
    scene.start();
    const start=await nextFrame();
    let previous=start;
    while(true){
     const stamp=await nextFrame(),wall=stamp-start,dt=stamp-previous;
     previous=stamp;
     if(wall>seconds*1000)break;
     const frameStart=performance.now();
     w.updateTrafficVisibility(m);
     m.advance(Math.min(.65,dt/1000)*rate,{budgetMs:m.config.simulationCpuBudgetMs,rate});
     const advanced=performance.now();
     w.update(m,selected,dt/1000,true);
     const rendered=performance.now();
     m.drainEffects();m.drainEvents();
     if(w.renderer.getPixelRatio()!==1)throw Error('Render scale changed');
     const visible=new Map(w.vehicles.visible.map(unit=>[unit.id,unit]));
     const units=scene.cars.map(({car:u})=>{
      const pose=w.vehicles.transforms.get(u.id),n=u.navigation,v=visible.get(u.id);
      return {id:u.id,x:u.x,y:u.y,heading:u.heading,steering:u.steering??0,driveSpeed:u.driveSpeed??0,speed:n?.speed??0,
       state:n?.state??null,reason:n?.reason??null,blocker:n?.blockerId??null,pathRemaining:u.path.length,phase:u.factoryVisit?.phase??null,
       render:pose?{x:pose.position.x,y:pose.position.y,heading:pose.heading,steering:v?.steering??null}:null};
     });
     frames.push({wall,dt,over33:dt>33,sim:m.state.time,tick:trace.ticks.length,pending:!!m.pendingTick,advanceMs:advanced-frameStart,renderMs:rendered-advanced,units});
    }
    trace.restore();
    if(screenshots)globalThis.renderTrafficMotionPreview=()=>w.update(m,selected,0,false);
    return {scene:mode,rate,clock:'browser rAF, production advance and world renderer',renderScale:1,warmupFrames:120,
     seconds,simulationSeconds:m.state.time,orders:scene.orders,geometry:{walls:scene.walls,passage:scene.passage},frameMs:distribution(frames.map(f=>f.dt)),
     frameOver33:frames.filter(f=>f.over33).length,frameOver50:frames.filter(f=>f.dt>50).length,frames,metrics:trace.report()};
   },{mode,rate,seconds,config,screenshots});
   save(`${mode}-x${rate}`,result);
   assert.deepEqual(errors,[]);
   if(screenshots){
    await page.screenshot({path:path.join(output,`${mode}-x${rate}-wide.png`)});
    await page.setViewportSize({width:800,height:900});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
     globalThis.renderTrafficMotionPreview();
     resolve();
    }))));
    await page.screenshot({path:path.join(output,`${mode}-x${rate}-narrow.png`)});
    await page.setViewportSize({width:1440,height:900});
   }
  }
 }finally{await browser.close();}
}
