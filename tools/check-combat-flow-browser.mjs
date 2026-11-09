import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const folder='campaign/previews/combat-flow';fs.mkdirSync(folder,{recursive:true});
const software=process.argv.includes('--software');
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:software?['--enable-unsafe-swiftshader','--use-angle=swiftshader']:['--use-angle=d3d11']});
try{
 const context=await browser.newContext({viewport:{width:1920,height:1080}});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8893')+'/campaign/');
 await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});
 const renderer=await page.evaluate(()=>{const gl=campaign.world.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER);});
 await page.locator('#begin').click();await page.locator('#pause').click();
 const fixture=await page.evaluate(()=>{
  const c=campaign,m=c.mission,p=m.field.gridToWorld(m.config.startGrid);c.radio.setEnabled(false);
  m.state.units=[];m.state.buildings=[];m.state.camps=[];m.state.pendingCinematics=[];m.updateMission=()=>{};
  const units=Array.from({length:9},(_,i)=>m.addUnit('bukhanka','rai',{x:p.x+(i%3-1)*28,y:p.y-20-Math.floor(i/3)*30}));
  const enemies=Array.from({length:4},(_,i)=>m.addUnit('raider','scavs',{x:p.x+(i%2?35:-35),y:p.y+165+Math.floor(i/2)*35}));
  m.rebuildNavigation();m.updateFog();m.explored.fill(1);c.select(units.map(u=>u.id));c.world.centre({x:p.x,y:p.y+70},610);c.advance(0);
  window.flowCheck={shots:{},cpu:[],spikes:[],completed:{},phaseConflicts:[],friendlyCollisionDamage:[],started:m.state.time,ids:units.map(u=>u.id),enemies:enemies.map(u=>u.id)};
  const attack=m.attack.bind(m);m.attack=(u,target,spec)=>{const fired=attack(u,target,spec);if(fired)flowCheck.shots[u.id]=(flowCheck.shots[u.id]??0)+1;return fired;};
  const damage=m.damage.bind(m);m.damage=(u,amount,source,contact)=>{const before=u.hp,result=damage(u,amount,source,contact);if(contact?.type==='collision'&&source?.owner===u.owner&&u.hp<before)flowCheck.friendlyCollisionDamage.push({time:m.state.time,id:u.id,source:source.id,hp:before-u.hp});return result;};
  const update=m.updateUnitSteps.bind(m);m.updateUnitSteps=function*(unit,dt){yield* update(unit,dt);if(unit.combatParking&&!unit.task&&!flowCheck.completed[unit.id])flowCheck.completed[unit.id]={time:m.state.time,x:unit.x,y:unit.y,goal:{...unit.combatParking.goal}};if(unit.combatDeployment&&(unit.combatResume||unit.combatParking))flowCheck.phaseConflicts.push({id:unit.id,time:m.state.time});};
  const advance=m.advance.bind(m);m.advance=(...args)=>{const start=performance.now();const result=advance(...args);const ms=performance.now()-start;flowCheck.cpu.push(ms);if(ms>12.5)flowCheck.spikes.push({time:m.state.time,ms});return result;};
  return {ids:units.map(u=>u.id),goal:{x:p.x,y:p.y+270}};
 });
 await page.locator('#attack-order').click();
 const point=await page.evaluate(goal=>campaign.world.screen(goal,0),fixture.goal);await page.mouse.click(point.x,point.y);
 assert.equal(await page.evaluate(()=>campaign.mission.entity(flowCheck.ids[0]).task?.type),'attack-move');
 const arrival=await page.evaluate(()=>({scale:campaign.mission.config.worldScale,slots:flowCheck.ids.map(id=>{const u=campaign.mission.entity(id);return{x:u.task.x,y:u.task.y};})}));
 await page.screenshot({path:folder+'/before.png'});
 await page.evaluate(()=>{
  const stream=campaign.world.renderer.domElement.captureStream(20),chunks=[];
  const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:1800000});
  recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};recorder.start(1000);
  window.flowVideo={recorder,chunks,stream};
 });
 await page.locator('#pause').click();
 const samples=[];
 for(const seconds of [10,25,45,90]){
  await page.waitForFunction(seconds=>campaign.mission.state.time-flowCheck.started>=seconds,seconds,{timeout:60000});
  const sample=await page.evaluate(()=>({time:campaign.mission.state.time-flowCheck.started,enemies:flowCheck.enemies.filter(id=>campaign.mission.entity(id)).length,
   units:flowCheck.ids.map(id=>{const u=campaign.mission.entity(id);return u?{id,x:u.x,y:u.y,hp:u.hp,task:u.task?.type,status:u.combatDeployment?.status,path:u.path.length,maneuver:!!u.detour,parking:u.combatParking,completion:flowCheck.completed[id],shots:flowCheck.shots[id]??0}:null;})}));
  samples.push(sample);console.log(JSON.stringify(sample));await page.screenshot({path:folder+'/'+seconds+'s.png'});
  if(seconds===25){fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/combat-flow-live-state.json',await page.evaluate(()=>campaign.mission.save()));}
 }
 await page.locator('#pause').click();
 const cpu=await page.evaluate(()=>{const c=flowCheck.cpu.sort((a,b)=>a-b);return{p99:c[Math.floor(c.length*.99)],max:c.at(-1),samples:c.length,spikes:flowCheck.spikes};});
 const recording=await page.evaluate(()=>new Promise(resolve=>{
  flowVideo.recorder.onstop=async()=>{const data=await new Blob(flowVideo.chunks,{type:'video/webm'}).arrayBuffer();flowVideo.stream.getTracks().forEach(track=>track.stop());resolve(Array.from(new Uint8Array(data)));};
  flowVideo.recorder.stop();
 }));fs.writeFileSync(folder+'/battle.webm',Buffer.from(recording));
 const friendlyCollisionDamage=await page.evaluate(()=>flowCheck.friendlyCollisionDamage);
 const phaseConflicts=await page.evaluate(()=>flowCheck.phaseConflicts);
 const report={passed:false,renderer,viewport:[1920,1080],arrival,samples,cpu,friendlyCollisionDamage,phaseConflicts,errors};
 fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/combat-flow-browser.json',JSON.stringify(report,null,2));
 const final=samples.at(-1);assert.equal(final.enemies,0,'The group must defeat moving enemies');assert(final.units.every(Boolean),'Test group survives');
 assert(final.units.every(u=>!u.status),'The group must leave deployment after the enemies die');
 assert(final.units.every(u=>u.completion&&Math.hypot(u.completion.x-u.completion.goal.x,u.completion.y-u.completion.goal.y)<=arrival.scale*4),'Reach the actual committed parking slot when completing the order');
 assert(final.units.every(u=>Math.hypot(u.parking.goal.x-u.parking.anchor.x,u.parking.goal.y-u.parking.anchor.y)<=arrival.scale*14),'Parking replans cannot drift away from their arrival area');
 assert(final.units.every(u=>arrival.slots.some(p=>Math.hypot(u.parking.anchor.x-p.x,u.parking.anchor.y-p.y)<=arrival.scale*6+.01)),'The resumed arrival area stays near one of the originally accepted slots');
 assert(final.units.every(u=>!u.task&&!u.path&&!u.maneuver),'Every member must complete regrouping, not only start moving again');
 assert.deepEqual(phaseConflicts,[],'Combat deployment and march planning must never run together');
 assert.deepEqual(friendlyCollisionDamage,[],'Friendly regrouping must not damage the group');
 assert.deepEqual(errors,[]);
 await context.close();
 report.passed=true;fs.writeFileSync('campaign/reports/combat-flow-browser.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({passed:true,renderer,cpu,friendlyCollisionDamage,errors}));
}finally{await browser.close();}
