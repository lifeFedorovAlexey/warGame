import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const folder=process.env.COLLISION_OUTPUT??'campaign/previews/playtest-WG-056/browser';fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
const reports=[];
try{for(const name of (process.env.COLLISION_MISSIONS??'m01,m02').split(',')){
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{for(const k of ['fieldSound','fieldStoryVoice','fieldRadio'])localStorage.setItem('warGame.'+k,'off');});
 await page.route('**/api/radio/published',r=>r.fulfill({json:{document:JSON.parse(fs.readFileSync('assets/radio/situations_catalog.json','utf8'))}}));
 await page.goto('http://127.0.0.1:8768/campaign/?perf=1'+(name==='m02'?'&mission=m02':''));
 await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:120000});await page.locator('#begin').click();
 if(name==='m01'){await page.locator('[data-dream=skip]').click();await page.evaluate(()=>{const m=campaign.mission,s=m.entity(m.state.openingScene.signId);s.completed=true;s.progress=1;});}
 await page.waitForFunction(()=>campaign.state.active&&!campaign.state.openingPlaying,null,{timeout:120000});await page.locator('#pause').click();
 const env=await page.evaluate(()=>{const w=campaign.world,gl=w.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');w.fixedRenderScale=1;w.renderer.setPixelRatio(1);campaign.radio.setEnabled(false);document.querySelector('#performance-overlay').hidden=true;window.wgOriginalTick=campaign.mission.continueTick;return {gpu:ext&&gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)};});
 for(const scene of process.env.COLLISION_SCENES?.split(',')??(name==='m01'?['close-exit','cluster-all','group-reverse']:['group-reverse'])){
  await page.evaluate(save=>{campaign.mission.continueTick=wgOriginalTick;campaign.mission.load(save);},fs.readFileSync('campaign/previews/playtest-WG-051/'+name+'-real-map.save.json','utf8'));
  const initial=await page.evaluate(scene=>{
   const c=campaign,m=c.mission,origin=m.state.wg051.origin,centre=m.entity(m.state.wg051.ids[0]),ids=[centre.id];
   if(scene==='group-reverse')for(let i=1;i<6;i++)ids.push(m.addUnit('bukhanka','rai',{x:origin.x+i%3*24,y:origin.y-Math.floor(i/3)*28},{heading:0}).id);
   else{
    centre.y=origin.y-35;centre.heading=0;centre.paint='earth';
    for(const [x,y,heading,paint] of [[-9,0,0,'earth'],[9,0,0,'olive'],[-22,-15,Math.PI/2,'olive'],[26,-12,0,'earth']])ids.push(m.addUnit('bukhanka','rai',{x:origin.x+x,y:origin.y+y},{heading,paint}).id);
   }
   for(const id of ids)m.entity(id).trafficOnScreen=true;m.unitIndex.rebuild(m.state.units);
   const moving=scene==='close-exit'?[ids[0]]:ids,goal={x:origin.x,y:origin.y+(scene==='group-reverse'?-120:scene==='close-exit'?80:120)};
   const response=m.submitOrder(moving,'move',goal);if(!response.ok)throw Error(JSON.stringify(response));
   window.wg={scene,ids,moving,origin,start:m.state.time,rows:[],goals:{},firstDone:null,complete:false,parked:ids.filter(id=>!moving.includes(id)).map(id=>{const u=m.entity(id);return {id,x:u.x,y:u.y};})};
   const original=m.continueTick.bind(m);let last=m.state.time;
   m.continueTick=function(...args){const result=original(...args);if(this.pendingTick||last===this.state.time)return result;last=this.state.time;
    const rows=ids.map(id=>{const u=this.entity(id);if(!u.pendingOrder&&!u.proposedOrder&&u.routeOrder?.destination)wg.goals[id]??={...u.routeOrder.destination};
     return {id,x:u.x,y:u.y,hp:u.hp,speed:u.driveSpeed,heading:u.heading,reason:u.navigation?.reason,passThrough:!!u.trafficPassThrough,done:!u.pendingOrder&&!u.proposedOrder&&!u.task&&!u.path.length&&!u.detour&&!u.yieldReturn&&!u.jointTraffic&&!u.traffic};});
    wg.rows.push({time:this.state.time-wg.start,units:rows});if(rows.filter(r=>moving.includes(r.id)).every(r=>r.done)){wg.firstDone??=this.state.time;wg.complete=this.state.time-wg.firstDone>=3;}else wg.firstDone=null;
    return result;};
   c.select(moving);c.world.centre({x:origin.x,y:origin.y+(scene==='group-reverse'?-60:25)},scene==='group-reverse'?300:180);
   return {origin,ids,moving,goal};
  },scene);
  console.log('Started',name,scene);await page.waitForTimeout(250);await page.screenshot({path:folder+'/'+name+'-'+scene+'-before.png'});
  await page.evaluate(()=>wargamePerf.reset());await page.locator('#pause').click();
  if(scene==='close-exit'){
   await page.waitForFunction(()=>campaign.mission.entity(wg.ids[0]).y>wg.origin.y-8,null,{timeout:15000});await page.locator('#pause').click();
   for(const viewport of [{width:1440,height:900},{width:844,height:390},{width:667,height:375}]){await page.setViewportSize(viewport);await page.waitForTimeout(200);await page.screenshot({path:folder+'/passing-'+viewport.width+'.png'});}
   await page.setViewportSize({width:1440,height:900});await page.locator('#pause').click();
  }
  await page.waitForFunction(()=>wg.complete||campaign.mission.state.time-wg.start>45,null,{timeout:65000});await page.locator('#pause').click();
  const r=await page.evaluate(()=>{wargamePerf.stop();return {trace:wg,overlap:campaign.mission.overlapStatistics,performance:wargamePerf.report()};});
  const last=r.trace.rows.at(-1),stats=initial.moving.map(id=>{const u=last.units.find(v=>v.id===id),goal=r.trace.goals[id];return {id,done:u.done,error:goal&&Math.hypot(u.x-goal.x,u.y-goal.y),hp:u.hp,reason:u.reason};});
  const drift=r.trace.parked.map(p=>{const u=last.units.find(v=>v.id===p.id);return Math.hypot(u.x-p.x,u.y-p.y);});
  const report={name,scene,env,errors:[...errors],initial,stats,drift,elapsed:last.time,...r};fs.writeFileSync(folder+'/'+name+'-'+scene+'.json',JSON.stringify(report));reports.push({name,scene,stats,drift,elapsed:last.time,errors});console.log(JSON.stringify(reports.at(-1)));
  await page.screenshot({path:folder+'/'+name+'-'+scene+'-after.png'});
 }
 await page.close();
}}finally{await browser.close();fs.writeFileSync(folder+'/summary.json',JSON.stringify(reports,null,2));}
for(const r of reports){assert.equal(r.errors.length,0);assert(r.stats.every(s=>s.done&&s.error<.65&&s.hp===320),JSON.stringify(r));assert(r.drift.every(v=>v<.001));}
