import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH??'C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base='campaign/previews/playtest-WG-051',phase=process.env.MANEUVER_PHASE??'after',before=phase.startsWith('before'),out=base+'/browser-'+phase;
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
const reports=[];
try{for(const name of (process.env.MANEUVER_MISSIONS??'m01,m02').split(',')){
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{for(const k of ['fieldSound','fieldStoryVoice','fieldRadio'])localStorage.setItem('warGame.'+k,'off');});
 await page.route('**/*.js*',route=>{
  const relative=decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//,''),file=path.join(base,before&&relative==='campaign/predictive-traffic.js'?'before-source':'verification-source',relative);
  return fs.existsSync(file)?route.fulfill({body:fs.readFileSync(file),contentType:'text/javascript'}):route.continue();
 });
 await page.route('**/api/radio/published',r=>r.fulfill({json:{document:JSON.parse(fs.readFileSync('assets/radio/situations_catalog.json','utf8'))}}));
 await page.goto('http://127.0.0.1:8768/campaign/?perf=1'+(name==='m02'?'&mission=m02':''));
 await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:120000});await page.locator('#begin').click();
 if(name==='m01'){await page.locator('[data-dream=skip]').click();await page.evaluate(()=>{const m=campaign.mission,s=m.entity(m.state.openingScene.signId);s.completed=true;s.progress=1;});}
 await page.waitForFunction(()=>campaign.state.active&&!campaign.state.openingPlaying,null,{timeout:120000});await page.locator('#pause').click();
 const environment=await page.evaluate(()=>{
  const w=campaign.world,gl=w.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');w.fixedRenderScale=1;w.renderer.setPixelRatio(1);campaign.radio.setEnabled(false);document.querySelector('#performance-overlay').hidden=true;
  window.wgOriginal={continueTick:campaign.mission.continueTick,vehicleCollision:campaign.mission.vehicleCollision};
  return {gpu:ext&&gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),pixelRatio:w.renderer.getPixelRatio()};
 });
 const file=base+'/'+name+'-real-map.save.json';
 if(!fs.existsSync(file)){
  const setup=await page.evaluate(()=>{
   const m=campaign.mission,start=m.field.gridToWorld(m.config.startGrid);let origin;
   outer:for(let radius=220;radius<1100;radius+=70)candidate:for(let a=0;a<24;a++){
    const p={x:start.x+Math.cos(a*Math.PI/12)*radius,y:start.y+Math.sin(a*Math.PI/12)*radius};
    for(const r of [0,40,80,120,160])for(let b=0;b<16;b++){
     const q={x:p.x+Math.cos(b*Math.PI/8)*r,y:p.y+Math.sin(b*Math.PI/8)*r,heading:0,kind:'bukhanka',owner:'rai'};
     if(!m.inBounds(q.x,q.y)||!m.nav.terrainAllowed(q.x,q.y)||!m.vehicleMotionClear(q,q,q)||m.state.units.some(u=>u.hp>0&&Math.hypot(u.x-q.x,u.y-q.y)<(u.owner==='scavs'?250:26)))continue candidate;
    }
    origin=p;break outer;
   }
   if(!origin)throw Error('No clear patch of real terrain');
   const u=m.addUnit('bukhanka','rai',origin,{heading:0});m.state.wg051={origin,ids:[u.id]};m.explored.fill(255);m.updateFog();return {origin,id:u.id,save:m.save()};
  });
  fs.writeFileSync(file,setup.save);console.log(JSON.stringify({name,setup:{origin:setup.origin,id:setup.id}}));
 }
 for(const scene of (process.env.MANEUVER_SCENES??(before?'moving-reversal,reverse-offset':'moving-reversal,reverse-offset,side-close,group-reverse')).split(',')){
  await page.evaluate(save=>{Object.assign(campaign.mission,wgOriginal);campaign.mission.load(save);},fs.readFileSync(file,'utf8'));
  const initial=await page.evaluate(scene=>{
   const c=campaign,m=c.mission,{origin,ids}=m.state.wg051;
   if(scene==='group-reverse')for(let i=1;i<6;i++)ids.push(m.addUnit('bukhanka','rai',{x:origin.x+i%3*24,y:origin.y-Math.floor(i/3)*28},{heading:0}).id);
   const delta=scene==='moving-reversal'?{x:0,y:160}:scene==='reverse-offset'?{x:4,y:-25}:scene==='side-close'?{x:10,y:0}:{x:0,y:-120};
   const response=m.submitOrder(ids,'move',{x:origin.x+delta.x,y:origin.y+delta.y});if(!response.ok)throw Error(JSON.stringify(response));
   window.wgTrace={scene,start:m.state.time,ids:[...ids],origin,rows:[],frames:[],goals:{},goalChanges:[],contacts:[],replaced:false,complete:false};
   const t=wgTrace,original=m.continueTick.bind(m),collision=m.vehicleCollision.bind(m);let lastTime=m.state.time;
   m.vehicleCollision=(u,s,b)=>{if(ids.includes(u.id)&&b.size)t.contacts.push({id:u.id,time:m.state.time,ids:[...b].map(o=>o.id)});return collision(u,s,b);};
   m.continueTick=function(...args){
    const result=original(...args);if(this.pendingTick||this.state.time===lastTime)return result;lastTime=this.state.time;
    const elapsed=this.state.time-t.start;
    if(scene==='moving-reversal'&&!t.replaced&&elapsed>=2){this.submitOrder(ids,'move',{x:origin.x,y:origin.y-120});t.replaced=true;t.goals={};}
    const rows=ids.map(id=>{
     const u=this.entity(id),goal=u.routeOrder?.destination;
     if(!u.pendingOrder&&!u.proposedOrder&&goal){if(!t.goals[id])t.goals[id]={...goal};else if(Math.hypot(goal.x-t.goals[id].x,goal.y-t.goals[id].y)>.001)t.goalChanges.push(id);}
     return {id,x:u.x,y:u.y,heading:u.heading,speed:u.driveSpeed,steering:u.steering,reverse:!!u.reversing,hp:u.hp,maxHp:u.maxHp,reason:u.navigation?.reason,detour:!!u.detour,joint:u.jointTraffic,done:!u.pendingOrder&&!u.proposedOrder&&!u.task&&!u.path.length&&!u.detour&&!u.yieldReturn&&!u.jointTraffic&&!u.traffic};
    });t.rows.push({time:elapsed,units:rows});t.complete=rows.every(r=>r.done)&&(scene!=='moving-reversal'||t.replaced);return result;
   };
   const frame=now=>{if(window.wgTrace!==t)return;const units=ids.map(id=>{const pose=c.world.vehicles.transforms.get(id);return {id,render:pose&&{x:pose.position.x,y:pose.position.y,z:pose.position.z,heading:pose.heading}};});t.frames.push({now,time:m.state.time-t.start,units});requestAnimationFrame(frame);};requestAnimationFrame(frame);
   c.select(ids);c.world.centre({x:origin.x,y:origin.y-25},scene==='group-reverse'?380:260);
   return {origin,ids,time:m.state.time};
  },scene);
  await page.waitForTimeout(400);await page.evaluate(()=>{wargamePerf.reset();document.querySelector('#pause').click();});
  await page.waitForTimeout(700);await page.screenshot({path:out+'/'+name+'-'+scene+'-moving.png'});
  if(process.env.MANEUVER_CAPTURE==='1'&&scene==='moving-reversal'){
   await page.waitForTimeout(1500);
   for(let frame=0;frame<4;frame++){await page.screenshot({path:out+'/'+name+'-turn-'+frame+'.png'});await page.waitForTimeout(350);}
  }
  const seconds=Number(process.env.MANEUVER_SECONDS??22);
  try{await page.waitForFunction(seconds=>wgTrace.complete||campaign.mission.state.time-wgTrace.start>seconds,seconds,{timeout:(seconds+15)*1000});}catch{}
  await page.evaluate(()=>{document.querySelector('#pause').click();wargamePerf.stop();});
  const result=await page.evaluate(()=>({trace:wgTrace,performance:wargamePerf.report(),save:JSON.parse(campaign.mission.save())}));
  const stats=initial.ids.map((id,i)=>{
   const rows=result.trace.rows.map(r=>r.units[i]);let travel=0,steer=0,flips=0,gear=0,gears=0;
   for(let j=0;j<rows.length;j++){const r=rows[j],s=Math.abs(r.steering)>.04?Math.sign(r.steering):0,g=r.speed>.2?(r.reverse?-1:1):0;if(s&&steer&&s!==steer&&r.speed>1)flips++;if(s)steer=s;if(g&&gear&&g!==gear)gears++;if(g)gear=g;if(j)travel+=Math.hypot(r.x-rows[j-1].x,r.y-rows[j-1].y);}
   const last=rows.at(-1),goal=result.trace.goals[id];return {id,done:last?.done,seconds:result.trace.rows.find(r=>r.units[i].done&&(scene!=='moving-reversal'||r.time>2))?.time,travel,steerFlips:flips,gearChanges:gears,error:goal&&Math.hypot(last.x-goal.x,last.y-goal.y),hpLost:last.maxHp-last.hp};
  });
  const report={name,scene,phase,initial,environment,errors,stats,contacts:result.trace.contacts,goalChanges:result.trace.goalChanges,...result};
  fs.writeFileSync(out+'/'+name+'-'+scene+'.json',JSON.stringify(report));reports.push({name,scene,stats,errors,contacts:report.contacts.length,goalChanges:report.goalChanges});console.log(JSON.stringify(reports.at(-1)));
  await page.screenshot({path:out+'/'+name+'-'+scene+'-done.png'});
  if(scene==='group-reverse'||scene==='turn-around')for(const viewport of [{width:844,height:390},{width:667,height:375}]){await page.setViewportSize(viewport);await page.waitForTimeout(300);await page.screenshot({path:out+'/'+name+'-'+viewport.width+'.png'});}
  await page.setViewportSize({width:1440,height:900});
 }
 await page.close();
}}finally{await browser.close();fs.writeFileSync(out+'/summary.json',JSON.stringify(reports,null,2));}
if(!before)for(const r of reports){assert.equal(r.errors.length,0);assert(r.stats.every(s=>s.done&&s.error<.65&&s.hpLost===0),r.name+' '+r.scene+': arrival');assert.equal(r.contacts,0);assert.equal(r.goalChanges.length,0);}
