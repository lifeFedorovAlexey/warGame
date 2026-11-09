import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const folder='campaign/previews/combat-interruption';fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[],sourceJobs=[],sources={};
page.on('pageerror',e=>errors.push(e.stack));
page.on('response',response=>{if(/\/campaign\/[^/]+\.js(?:\?|$)/.test(response.url()))sourceJobs.push(response.body().then(b=>{sources[new URL(response.url()).pathname]=createHash('sha256').update(b).digest('hex');}));});
let report={recordedAt:new Date().toISOString(),scope:'Original campaign vehicles and poses. Added stationary hostile target, actual attack button and two map clicks, normal 1x animation loop; no per-vehicle steering or route overrides.'};
try{
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8893')+'/campaign/');await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});
 await page.evaluate(()=>campaign.radio.setEnabled(false));await page.locator('#begin').click();await page.locator('#pause').click();
 const setup=await page.evaluate(()=>{
  const c=campaign,m=c.mission,w=c.world,units=m.state.units.filter(u=>u.owner==='rai'&&u.kind==='bukhanka');
  const centre=units.reduce((p,u)=>({x:p.x+u.x/units.length,y:p.y+u.y/units.length}),{x:0,y:0});
  const target=m.addStructure('camp-core','scavs',{x:centre.x,y:centre.y+90},{completed:true,progress:1,hp:100000,maxHp:100000}),goal={x:centre.x+180,y:centre.y};
  m.rebuildNavigation();m.updateFog();m.explored.fill(1);c.select(units.map(u=>u.id));
  if(!units.every(u=>m.lineOfSight(u,target)))throw Error('Initial real campaign cars cannot see this target');
  if(!m.nav.terrainAllowed(goal.x,goal.y))throw Error('Requested relocation endpoint is forbidden');
  const t=c.interruptCheck={units,goal,origins:units.map(u=>({x:u.x,y:u.y})),orders:[],samples:[],contacts:[],targetId:target.id,shots:[],acceptedGoals:{}};
  const submit=m.submitOrder.bind(m),advance=m.advance.bind(m),collision=m.vehicleCollision.bind(m),attack=m.attack.bind(m);
  m.submitOrder=(ids,action,target)=>{const time=m.state.time,wall=performance.now(),result=submit(ids,action,target);t.orders.push({ids:[...ids],action,target:{x:target.x,y:target.y,id:target.id},time,wall,result});return result;};
  m.vehicleCollision=(u,s,b)=>{if(b.size&&units.includes(u))t.contacts.push({time:m.state.time,id:u.id,speed:s,blockers:[...b].map(v=>v.id)});return collision(u,s,b);};
  m.attack=(u,v,s)=>{const result=attack(u,v,s);if(result&&units.includes(u))t.shots.push({time:m.state.time,id:u.id,targetId:v.id});return result;};
  m.advance=(...args)=>{const result=advance(...args);
   for(const u of units)if(!u.pendingOrder&&u.routeOrder?.destination)t.acceptedGoals[u.commandRevision+'|'+u.id]??={...u.routeOrder.destination};
   if(t.samples.at(-1)?.time!==m.state.time)t.samples.push({time:m.state.time,wall:performance.now(),units:units.map(u=>({id:u.id,x:u.x,y:u.y,hp:u.hp,pending:!!u.pendingOrder,task:u.task?.type,deploy:u.combatDeployment?.targetId,nav:u.navigation?{...u.navigation}:null}))});return result;};
  w.controls.enableDamping=false;w.centre({x:centre.x,y:centre.y-35},640);c.advance(0);
  const chunks=[],stream=w.renderer.domElement.captureStream(20),recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:2200000});recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.start(1000);c.interruptVideo={chunks,stream,recorder};
  return {targetId:target.id,goal,units:units.map(u=>({id:u.id,x:u.x,y:u.y,heading:u.heading}))};
 });report.setup=setup;
 await page.locator('#attack-order').click();let p=await page.evaluate(id=>campaign.world.screen(campaign.mission.entity(id)),setup.targetId);await page.mouse.click(p.x,p.y);
 await page.locator('#pause').click();
 await page.waitForFunction(()=>new Set(campaign.interruptCheck.shots.map(s=>s.id)).size===campaign.interruptCheck.units.length,null,{timeout:15000});
 await page.screenshot({path:folder+'/firing.png'});
 p=await page.evaluate(goal=>campaign.world.screen(goal),setup.goal);await page.mouse.click(p.x,p.y,{button:'right'});
 assert.equal(await page.evaluate(()=>campaign.interruptCheck.orders.at(-1).action),'attack-move','The persistent Attack button is genuinely still active');
 await page.waitForFunction(()=>{
  const c=campaign,m=c.mission,t=c.interruptCheck,order=t.orders.at(-1);return m.state.time-order.time>=70||t.units.every(u=>!u.task&&!u.pendingOrder&&!u.path.length&&!u.detour);
 },null,{timeout:95000});
 await page.locator('#pause').click();await page.screenshot({path:folder+'/arrived.png'});
 report={...report,...await page.evaluate(()=>{
  const c=campaign,m=c.mission,t=c.interruptCheck,order=t.orders.at(-1);
  return {orders:t.orders,seconds:m.state.time-order.time,contacts:t.contacts,samples:t.samples,shots:t.shots,
   firstMotion:t.units.map((u,i)=>{const sample=t.samples.find(s=>s.wall>=order.wall&&Math.hypot(s.units[i].x-t.origins[i].x,s.units[i].y-t.origins[i].y)>.01);return sample?{id:u.id,simulation:sample.time-order.time,wall:(sample.wall-order.wall)/1000}:null;}),
   units:t.units.map(u=>{const acceptedGoal=t.acceptedGoals[order.result.revision+'|'+u.id];return{id:u.id,x:u.x,y:u.y,hp:u.hp,maxHp:u.maxHp,task:u.task,pending:u.pendingOrder,acceptedGoal,goal:u.routeOrder?.destination,arrived:!!acceptedGoal&&!u.task&&!u.pendingOrder&&!u.path.length&&!u.detour&&Math.hypot(u.x-acceptedGoal.x,u.y-acceptedGoal.y)<2};})};
 })};
 await page.setViewportSize({width:800,height:900});await page.waitForTimeout(200);await page.screenshot({path:folder+'/narrow.png'});
 report.passed=report.units.every(u=>u.arrived&&u.hp===u.maxHp)&&report.firstMotion.every(t=>t&&t.simulation<=.50001&&t.wall<=.5)&&!report.contacts.length&&!errors.length;
}catch(error){report.passed=false;report.failure=error.stack;await page.screenshot({path:folder+'/failure.png'}).catch(()=>{});}
finally{
 const video=await page.evaluate(()=>new Promise(resolve=>{const v=campaign.interruptVideo;if(!v)return resolve([]);v.recorder.onstop=async()=>{resolve(Array.from(new Uint8Array(await new Blob(v.chunks).arrayBuffer())));v.stream.getTracks().forEach(t=>t.stop());};v.recorder.stop();})).catch(()=>[]);
 if(video.length)fs.writeFileSync(folder+'/after.webm',Buffer.from(video));
 await Promise.allSettled(sourceJobs);report.sources=sources;report.errors=errors;
 fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/combat-interruption-browser.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({...report,sources:undefined,samples:undefined,shots:undefined},null,2));await browser.close();
}
assert(report.passed,'Actual rendered combat interruption must start within 0.5s and reach every accepted goal without contacts');
