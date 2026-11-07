import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH??'C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const folder='campaign/previews/independent-builders';fs.mkdirSync(folder,{recursive:true});
const sources=Object.fromEntries(['mission.js','navigation.js','traffic-coordinator.js','traffic-start.js','main.js'].map(name=>[name,createHash('sha256').update(fs.readFileSync('campaign/'+name)).digest('hex')]));
const browser=await chromium.launch({executablePath:process.env.EDGE_PATH??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
const context=await browser.newContext({viewport:{width:1920,height:1080}});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));
let report={sources,recordedAt:new Date().toISOString(),note:'Real initial campaign vehicles and terrain; two separate selection/build clicks; story unlocks disabled for a navigation-only fixture. No movement/route/collision overrides.'};
try{
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8893')+'/campaign/');await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});
 await page.evaluate(()=>{const chunks=[],stream=campaign.world.renderer.domElement.captureStream(20),recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:2500000});recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.start(1000);campaign.builderVideo={chunks,stream,recorder};});
 await page.evaluate(()=>campaign.radio.setEnabled(false));await page.locator('#begin').click();await page.locator('#pause').click();
 const setup=await page.evaluate(()=>{
  const c=campaign,m=c.mission,w=c.world; m.state.storyConstruction.enabled=false;
  const builders=m.state.units.filter(u=>u.owner==='rai'&&u.kind==='builder'),p=m.field.gridToWorld(m.config.startGrid);
  const candidates=[];
  for(let dy=-160;dy<=160;dy+=8)for(let dx=-160;dx<=160;dx+=8){
   const q=m.placement('generator',p.x+dx,p.y+dy);
   if(q.ok&&!q.blockers.length)candidates.push(q);
  }
  candidates.sort((a,b)=>Math.hypot(a.x-builders[0].x,a.y-builders[0].y)-Math.hypot(b.x-builders[0].x,b.y-builders[0].y)||a.x-b.x||a.y-b.y);
  const generator=candidates[0];if(!generator)throw new Error('No legal nearby construction site');
  const oil=m.config.oilFields.map(grid=>m.field.gridToWorld(grid)).map(p=>m.placement('derrick',p.x,p.y)).filter(q=>q.ok&&!q.blockers.length).sort((a,b)=>Math.hypot(a.x-builders[1].x,a.y-builders[1].y)-Math.hypot(b.x-builders[1].x,b.y-builders[1].y))[0];
  if(!oil)throw new Error('No legal explored oil field');
  const units=m.state.units.filter(u=>u.owner==='rai'),origins=Object.fromEntries(units.map(u=>[u.id,{x:u.x,y:u.y,heading:u.heading}]));
  const samples=[],contacts=[],orders=[];const build=m.build.bind(m),advance=m.advance.bind(m),collision=m.vehicleCollision.bind(m);
  m.build=(ids,...args)=>{const at=performance.now(),result=build(ids,...args);orders.push({ids:[...ids],kind:args[0],time:m.state.time,wall:at,result});return result;};
  m.vehicleCollision=(unit,speed,obstacles)=>{if(unit.owner==='rai')contacts.push({time:m.state.time,unit:unit.id,speed,blockers:[...obstacles].map(b=>b.id)});return collision(unit,speed,obstacles);};
  m.advance=(...args)=>{const result=advance(...args);if(samples.at(-1)?.time!==m.state.time)samples.push({time:m.state.time,wall:performance.now(),units:units.map(u=>({id:u.id,x:u.x,y:u.y,hp:u.hp,task:u.task?{...u.task}:null,working:!!u.builderWorking,reason:u.navigation?.reason,wait:u.navigation?.waitSeconds,detour:!!u.detour,yield:!!u.yieldReturn})),buildings:orders.map(o=>m.entity(o.result.id)).filter(Boolean).map(b=>({id:b.id,progress:b.progress,completed:b.completed,clearing:b.clearing}))});return result;};
  c.builderCheck={units,origins,orders,contacts,samples};
  w.controls.enableDamping=false;w.centre({x:(generator.x+oil.x+p.x)/3,y:(generator.y+oil.y+p.y)/3},490);c.advance(0);
  return {builders:builders.map(u=>u.id),generator:{x:generator.x,y:generator.y},oil:{x:oil.x,y:oil.y},origins};
 });report.setup=setup;
 async function select(id){
  const p=await page.evaluate(id=>campaign.world.screen(campaign.mission.entity(id),campaign.mission.config.worldScale*1.4),id);
  await page.mouse.click(p.x,p.y);
  assert.deepEqual(await page.evaluate(()=>campaign.selected),[id],'Select exactly one builder using its visible model');
 }
 await select(setup.builders[0]);await page.locator('#build-toggle').click();await page.locator('#build-cards [data-icon="generator"]').click();
 let p=await page.evaluate(point=>campaign.world.screen(point),setup.generator);await page.mouse.click(p.x,p.y);
 assert.equal(await page.evaluate(()=>campaign.builderCheck.orders.length),1,'First UI construction order accepted');
 await select(setup.builders[1]);p=await page.evaluate(point=>campaign.world.screen(point),setup.oil);await page.mouse.click(p.x,p.y);
 assert.equal(await page.evaluate(()=>campaign.builderCheck.orders.length),2,'Second independent oil-field click accepted');
 await page.screenshot({path:folder+'/orders.png'});await page.locator('#pause').click();
 await page.evaluate(()=>campaign.builderCheck.resumedAt=performance.now());
 await page.waitForFunction(()=>{
  const c=campaign,m=c.mission,t=c.builderCheck;return m.state.time>=110||t.orders.length===2&&t.orders.every(o=>m.entity(o.result.id)?.completed);
 },null,{timeout:135000});await page.locator('#pause').click();
 const result=await page.evaluate(()=>{
  const c=campaign,m=c.mission,t=c.builderCheck;
  return {...t,units:t.units.map(u=>({id:u.id,kind:u.kind,x:u.x,y:u.y,hp:u.hp,task:u.task,navigation:u.navigation})),seconds:m.state.time,
   completed:t.orders.map(o=>!!m.entity(o.result.id)?.completed),
   firstMotion:t.orders.map(o=>{const id=o.ids[0],start=t.origins[id],sample=t.samples.find(s=>s.time>=o.time&&s.units.some(u=>u.id===id&&(u.working||Math.hypot(u.x-start.x,u.y-start.y)>.01)));return sample?{id,simulation:sample.time-o.time,wallAfterResume:(sample.wall-t.resumedAt)/1000}:null;}),
   firstHalfWorld:t.orders.map(o=>{const id=o.ids[0],start=t.origins[id],sample=t.samples.find(s=>s.time>=o.time&&s.units.some(u=>u.id===id&&(u.working||Math.hypot(u.x-start.x,u.y-start.y)>.5)));return sample?{id,simulation:sample.time-o.time}:null;})};
 });
 report={...report,...result,errors};
 await page.screenshot({path:folder+'/result.png'});
 report.passed=result.completed.every(Boolean)&&!errors.length&&!result.contacts.length&&result.orders.every((o,i)=>o.ids.length===1&&o.ids[0]===setup.builders[i]);
 report.failures=[];if(!result.completed.every(Boolean))report.failures.push('Both independent constructions must actually finish');if(result.contacts.length)report.failures.push('Physical contact during construction approach');if(errors.length)report.failures.push('Browser error');
}catch(error){report={...report,passed:false,failure:error.stack,errors};await page.screenshot({path:folder+'/failure.png'}).catch(()=>{});}
finally{
 const video=await page.evaluate(()=>new Promise(resolve=>{const v=campaign.builderVideo;if(!v)return resolve([]);v.recorder.onstop=async()=>{resolve(Array.from(new Uint8Array(await new Blob(v.chunks).arrayBuffer())));v.stream.getTracks().forEach(t=>t.stop());};v.recorder.stop();})).catch(()=>[]);
 if(video.length)fs.writeFileSync(folder+'/after.webm',Buffer.from(video));
 await context.close();await browser.close();
 fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/builder-orders-browser.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({...report,samples:undefined,sources:undefined,units:undefined,origins:undefined}));
}
assert(report.passed,'Independent builder UI test failed; video/report saved');
