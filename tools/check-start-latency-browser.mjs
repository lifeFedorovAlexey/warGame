import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH??'C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const baseline=process.argv.includes('--before'),forward=process.argv.includes('--forward'),complete=process.argv.includes('--complete'),label=(baseline?'before':'after')+(forward?'-forward':'')+(complete?'-complete':''),folder='campaign/previews/start-latency';fs.mkdirSync(folder,{recursive:true});
const hashes=()=>Object.fromEntries(fs.readdirSync('campaign').filter(name=>/^(mission|navigation|arrival-planner|command-planner|traffic-|turning-|road-|vehicle-motion|vehicle-collision|maneuver-admission|passage-|combat-|group-command|formation-assignment)/.test(name)&&name.endsWith('.js')).map(name=>[name,createHash('sha256').update(fs.readFileSync('campaign/'+name)).digest('hex')]));
const sources=hashes();
const browser=await chromium.launch({executablePath:process.env.EDGE_PATH??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8893')+'/campaign/');await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});
 await page.evaluate(()=>campaign.radio.setEnabled(false));
 await page.locator('#begin').click();await page.locator('#pause').click();
 const fixture=await page.evaluate(async(forward)=>{
  const c=campaign,m=c.mission,w=c.world,{vehicleClearance}=await import('./vehicle-collision.js');c.radio.setEnabled(false);
  Object.assign(m.state,{units:[],buildings:[],camps:[],pendingCinematics:[],artifacts:[],time:0});m.state.salvage.items=[];m.updateMission=()=>{};m.pendingTick=null;m.accumulator=0;m.effects=[];w.damage.reset();
  const p=m.field.gridToWorld(m.config.startGrid),units=Array.from({length:6},(_,i)=>m.addUnit('bukhanka','rai',{x:p.x+(i<3?-1:1)*6,y:p.y+(i%3-1)*26},{heading:forward?0:Math.PI}));
  m.rebuildNavigation();m.updateFog();m.explored.fill(255);c.select(units.map(u=>u.id));w.controls.enableDamping=false;w.centre({x:p.x,y:p.y+80},600);c.advance(0);
  const origins=units.map(u=>({x:u.x,y:u.y})),samples=[],idle=units.map(()=>0),longestIdle=units.map(()=>0),start=m.state.time,departure=[],accepted=units.map(()=>null),unexplained=new Set();
  m.trafficDepartureDebug=event=>departure.push(event);
  let wallStart,wallLast;
  let minimum=Infinity;
  const advance=m.advance.bind(m);m.advance=(dt,...args)=>{const before=performance.now();if(dt>0)wallStart??=before;const result=advance(dt,...args);const cpu=performance.now()-before,t=m.state.time-start;
   if(samples.length&&samples.at(-1).t===t)return result;
   const displacements=units.map((u,i)=>Math.hypot(u.x-origins[i].x,u.y-origins[i].y));
   const elapsed=t-(samples.at(-1)?.t??0);
   units.forEach((u,i)=>{
    if(u.routeOrder&&!accepted[i])accepted[i]={...u.routeOrder.destination};
    const previous=samples.at(-1)?.units[i]??origins[i],moving=Math.hypot(u.x-previous.x,u.y-previous.y)>1e-4;
    idle[i]=(u.pendingOrder||u.task||u.detour||u.yieldReturn)&&!moving?idle[i]+elapsed:0;longestIdle[i]=Math.max(longestIdle[i],idle[i]);
    if(u.navigation?.potentialDefect)unexplained.add(u.id);
   });
   for(let i=0;i<units.length;i++)for(let j=0;j<i;j++)minimum=Math.min(minimum,vehicleClearance(units[i],units[j],m.config.worldScale,m.field));
   samples.push({t,wall:wallStart===undefined?0:(before-wallStart)/1000,frameMs:wallLast===undefined?0:before-wallLast,cpuMs:cpu,displacements,units:units.map(u=>({id:u.id,x:u.x,y:u.y,heading:u.heading,speed:u.driveSpeed,hp:u.hp,maxHp:u.maxHp,traffic:u.traffic?{...u.traffic}:null,hold:u.trafficHold,detour:!!u.detour,departure:!!u.detour?.departure,path:u.path.length,navigation:u.navigation?{...u.navigation}:null}))});wallLast=before;return result;};
  c.startCheck={units,origins,samples,longestIdle,departure,accepted,unexplained,get minimum(){return minimum;}};
  return {goal:{x:p.x,y:p.y+240},legal:units.every(u=>m.nav.terrainAllowed(u.x,u.y)),ids:units.map(u=>u.id)};
 },forward);
 assert(fixture.legal,'Fixture must be on legal terrain');
 const point=await page.evaluate(goal=>campaign.world.screen(goal,0),fixture.goal);
 await page.mouse.click(point.x,point.y,{button:'right'});
 assert(await page.evaluate(()=>campaign.startCheck.units.every(u=>u.pendingOrder?.type==='move'||u.task?.type==='move')),'The real click must be accepted for every vehicle');
 await page.screenshot({path:folder+'/'+label+'-start.png'});
 await page.evaluate(()=>{const chunks=[],stream=campaign.world.renderer.domElement.captureStream(20),recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:1800000});recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.start(1000);campaign.startVideo={chunks,stream,recorder};});
 await page.locator('#pause').click();
 if(complete){
  await page.waitForFunction(()=>campaign.mission.state.time>=90||campaign.mission.state.time>1&&campaign.startCheck.units.every(u=>!u.pendingOrder&&!u.task&&!u.path.length&&!u.detour&&!u.yieldReturn),null,{timeout:125000});
  await page.locator('#pause').click();
 }else{
 await page.waitForFunction(()=>campaign.mission.state.time>=15,null,{timeout:40000});await page.locator('#pause').click();
 }
 const result=await page.evaluate(()=>{const c=campaign.startCheck;return {samples:c.samples,longestIdle:c.longestIdle,minimum:c.minimum,departure:c.departure,unexplained:[...c.unexplained],accepted:c.accepted,
  arrived:c.units.map((u,i)=>!!c.accepted[i]&&!u.pendingOrder&&!u.task&&!u.path.length&&!u.detour&&!u.yieldReturn&&Math.hypot(u.x-c.accepted[i].x,u.y-c.accepted[i].y)<2),
  goals:c.units.map(u=>({id:u.id,pending:u.pendingOrder??null,task:u.task,request:u.routeOrder?.request,destination:u.routeOrder?.destination})),firstMotion:c.units.map((u,i)=>{const s=c.samples.find(s=>s.displacements[i]>.05);return s?{simulation:s.t,wall:s.wall}:null;})};});
 await page.screenshot({path:folder+'/'+label+'-15s.png'});
 const video=await page.evaluate(()=>new Promise(resolve=>{const v=campaign.startVideo;v.recorder.onstop=async()=>{resolve(Array.from(new Uint8Array(await new Blob(v.chunks).arrayBuffer())));v.stream.getTracks().forEach(t=>t.stop());};v.recorder.stop();}));
 fs.writeFileSync(folder+'/'+label+'.webm',Buffer.from(video));
 await page.setViewportSize({width:800,height:900});await page.waitForTimeout(250);await page.screenshot({path:folder+'/'+label+'-narrow.png'});
 const sourceChanged=JSON.stringify(sources)!==JSON.stringify(hashes());
 const report={label,recordedAt:new Date().toISOString(),sources,sourceChanged,fixture,...result,errors};fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/start-latency-browser-'+label+'.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({label,minimum:result.minimum,firstMotion:result.firstMotion,longestIdle:result.longestIdle,at10:result.samples.find(s=>s.t>=10).displacements,peakAdvanceCpuMs:Math.max(...result.samples.map(s=>s.cpuMs)),arrived:result.arrived,seconds:result.samples.at(-1).t,unexplained:result.unexplained,errors}));
 assert(!sourceChanged,'Navigation changed during recording; repeat on a stable tree');
 assert.deepEqual(errors,[]);assert(result.minimum>=-.001,'No overlap while leaving the group');
 if(!baseline){assert(result.firstMotion.every(t=>t&&t.simulation<=.5&&t.wall<=.5),'Every vehicle reacts within half a second');if(!complete)assert(Math.max(...result.longestIdle)<=.50001,'No unexplained wait longer than half a second');assert(result.samples.find(s=>s.t>=10).displacements.every(d=>d>20),'Every car must leave its initial position promptly');assert(result.samples.every(s=>s.units.every(u=>u.hp===u.maxHp)),'A group order must not cause friendly collision damage');if(complete){assert(result.arrived.every(Boolean),'All accepted destinations must actually be reached');assert.deepEqual(result.unexplained,[],'No unexplained stops or wait cycles');}}
}finally{await browser.close();}
