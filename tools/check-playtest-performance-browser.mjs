import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH??'C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const phase=process.env.PERF_PHASE??'after',folder='campaign/previews/playtest-WG-046/'+phase;fs.mkdirSync(folder,{recursive:true});
const seconds=Number(process.env.PERF_SECONDS??12),report={phase,seconds,errors:[],runs:[],host:{cpu:os.cpus()[0].model,logicalCpus:os.cpus().length,node:process.version}},browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
try{
 report.browser=browser.version();
 for(const missionName of (process.env.PERF_MISSION?[process.env.PERF_MISSION]:['m01','m02'])){
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
  page.on('pageerror',e=>report.errors.push(e.stack??e.message));
  await page.addInitScript(()=>{for(const k of ['fieldSound','fieldStoryVoice','fieldRadio'])localStorage.setItem('warGame.'+k,'off');});
  await page.route('**/api/radio/published',r=>r.fulfill({json:{document:JSON.parse(fs.readFileSync('assets/radio/situations_catalog.json','utf8'))}}));
  if(process.env.PERF_BASELINE==='1')for(const file of ['campaign/mission.js','campaign/radio/engine.js'])await page.route('**/'+file,r=>r.fulfill({body:fs.readFileSync('campaign/previews/playtest-WG-046/before-source/'+file,'utf8'),contentType:'text/javascript'}));
  await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8768')+'/campaign/?perf=1'+(missionName==='m02'?'&mission=m02':''));
  await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:120000});await page.locator('#begin').click();
  if(missionName==='m01'){
   await page.locator('[data-dream=skip]').click();await page.evaluate(()=>{const m=campaign.mission,s=m.entity(m.state.openingScene.signId);s.completed=true;s.progress=1;});
  }
  await page.waitForFunction(()=>campaign.state.active&&!campaign.state.openingPlaying,null,{timeout:120000});
  await page.locator('#pause').click();
  const environment=await page.evaluate(()=>{
   const w=campaign.world,gl=w.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');w.fixedRenderScale=1;w.renderer.setPixelRatio(1);campaign.radio.setEnabled(false);
   document.querySelector('#performance-overlay').hidden=true;
   return {gpu:ext&&gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),viewport:[innerWidth,innerHeight],pixelRatio:w.renderer.getPixelRatio(),mission:campaign.mission.state.mission??'m01'};
  });
  const profiler=await page.context().newCDPSession(page);await profiler.send('Profiler.enable');await profiler.send('Profiler.setSamplingInterval',{interval:1000});
  for(const scene of (process.env.PERF_SCENES??'base,crossing,combat').split(',')){
   if(scene==='retreat'&&missionName!=='m02')continue;
   const savePath='campaign/previews/playtest-WG-046/'+missionName+'-'+scene+'.save.json';
   if(phase!=='before'&&fs.existsSync(savePath))await page.evaluate(save=>campaign.mission.load(save),fs.readFileSync(savePath,'utf8'));
   else{
    await page.evaluate(scene=>{
     const c=campaign,m=c.mission,start=m.field.gridToWorld(m.config.startGrid);
     if(scene==='crossing'){
      const units=[];
      for(let row=-7;row<=7&&units.length<80;row++)for(let col=-8;col<=10&&units.length<80;col++){
       const p={x:start.x+col*26,y:start.y+row*26,heading:0,kind:'bukhanka',owner:'rai'};
       if(!m.inBounds(p.x,p.y)||!m.nav.terrainAllowed(p.x,p.y)||!m.vehicleMotionClear(p,p,p)||m.state.units.some(u=>u.hp>0&&Math.hypot(u.x-p.x,u.y-p.y)<24))continue;
       units.push(m.addUnit('bukhanka','rai',p));
      }
      if(units.length<25)throw Error('Not enough clear real terrain: '+units.length);
      window.perfUnits=units.map(u=>u.id);const mid=Math.floor(units.length/2),a=units.slice(0,mid),b=units.slice(mid),centre=xs=>xs.reduce((p,u)=>({x:p.x+u.x/xs.length,y:p.y+u.y/xs.length}),{x:0,y:0});
      m.explored.fill(255);m.submitOrder(a.map(u=>u.id),'move',centre(b));m.submitOrder(b.map(u=>u.id),'move',centre(a));c.select(perfUnits);
     }
     if(scene==='combat'){
      m.stop(perfUnits);const units=perfUnits.map(id=>m.entity(id)).filter(u=>u?.hp>0),centre=units.reduce((p,u)=>({x:p.x+u.x/units.length,y:p.y+u.y/units.length}),{x:0,y:0});
      const enemies=[];
      for(let row=-4;row<=4&&enemies.length<12;row++)for(let col=4;col<=10&&enemies.length<12;col++){
       const p={x:centre.x+col*25,y:centre.y+row*26,heading:Math.PI,kind:'raider',owner:'scavs'};
       if(!m.inBounds(p.x,p.y)||!m.nav.terrainAllowed(p.x,p.y)||!m.vehicleMotionClear(p,p,p)||m.state.units.some(u=>u.hp>0&&Math.hypot(u.x-p.x,u.y-p.y)<24))continue;
       enemies.push(m.addUnit('raider','scavs',p));
      }
      m.updateFog();const target=enemies[0]??{x:centre.x+160,y:centre.y};m.submitOrder(perfUnits,'attack-move',{x:target.x,y:target.y});
     }
     if(scene==='retreat'){
      if(!m.state.m02)throw Error('Retreat fixture requires M02');
      const segments=m.nav.roads.routes.get('junction-1--junction-7-2'),at=n=>{
       const s=segments.find(p=>p.progress<=n&&p.progress+p.length>=n);
       return {x:s.a.x+s.ux*(n-s.progress),y:s.a.y+s.uy*(n-s.progress),heading:Math.atan2(-s.ux,s.uy),ux:s.ux,uy:s.uy};
      },units=[];
      for(let row=0;row<14&&units.length<20;row++)for(const lateral of [-8,8]){
       const p=at(440-row*25);p.x+=p.uy*lateral;p.y-=p.ux*lateral;Object.assign(p,{kind:'bukhanka',owner:'rai'});
       if(!m.vehicleMotionClear(p,p,p)||m.state.units.some(u=>u.hp>0&&Math.hypot(u.x-p.x,u.y-p.y)<16))continue;
       units.push(m.addUnit('bukhanka','rai',p,{heading:p.heading}));
      }
      if(units.length!==20)throw Error('Retreat fixture needs 20 vehicles');
      m.setCombatPolicy(units.map(u=>u.id),{retreat:'light',response:'ignore'});
      m.order(units.map(u=>u.id),'attack-move',at(745));
      const enemy=m.state.buildings.find(b=>b.owner==='scavs'&&b.hp>0);
      for(const u of units.slice(0,10))m.damage(u,70,enemy);
      m.state.performanceFixture={ids:units.map(u=>u.id)};m.updateFog();
     }
    },scene);
    fs.writeFileSync(savePath,await page.evaluate(()=>campaign.mission.save()));
   }
   const initial=await page.evaluate(scene=>{
    const c=campaign,m=c.mission,units=m.state.units.filter(u=>u.owner==='rai'&&u.hp>0&&(scene!=='retreat'||m.state.performanceFixture.ids.includes(u.id))),centre=units.reduce((p,u)=>({x:p.x+u.x/units.length,y:p.y+u.y/units.length}),{x:0,y:0});
    c.select(scene==='base'?[]:units.map(u=>u.id));c.world.centre(centre,scene==='base'?500:760);
    return {simTime:m.state.time,units:m.state.units.filter(u=>u.hp>0).length,selected:scene==='base'?0:units.length,status:m.state.status};
   },scene);
   await page.waitForTimeout(1000);await profiler.send('Profiler.start');
   // Exclude profiler startup and Playwright's actionability waits from frames.
   await page.evaluate(()=>{wargamePerf.reset();document.querySelector('#pause').click();});
   await page.waitForTimeout(seconds*1000);await page.evaluate(()=>{document.querySelector('#pause').click();wargamePerf.stop();});const {profile}=await profiler.send('Profiler.stop');
   const result=await page.evaluate(()=>{wargamePerf.stop();const m=campaign.mission;return {...wargamePerf.report(),simTime:m.state.time,status:m.state.status,living:m.state.units.filter(u=>u.hp>0).length,world:campaign.world.statistics,fixture:m.state.performanceFixture?.ids.map(id=>{const u=m.entity(id);return u?{id,x:u.x,y:u.y,hp:u.hp,retreat:!!u.combatRetreat,path:u.path.length,reason:u.navigation?.reason}:{id,removed:true};})};});
   fs.writeFileSync(folder+'/'+missionName+'-'+scene+'.cpuprofile',JSON.stringify(profile));fs.writeFileSync(folder+'/'+missionName+'-'+scene+'.json',JSON.stringify(result,null,2));
   await page.screenshot({path:folder+'/'+missionName+'-'+scene+'.png'});
   if(process.env.PERF_CAPTURE_NARROW==='1'){
    for(const viewport of [{width:844,height:390},{width:667,height:375}]){
     await page.setViewportSize(viewport);await page.waitForTimeout(250);
     await page.screenshot({path:folder+'/'+missionName+'-'+scene+'-'+viewport.width+'x'+viewport.height+'.png'});
    }
    await page.setViewportSize({width:1440,height:900});
   }
   const summary={missionName,scene,environment,initial,simSeconds:result.simTime-initial.simTime,frame:result.frameMs,cpu:result.cpuMs,stages:result.stages,drawCalls:result.drawCalls,over50:result.over50,longTasks:result.longTasks.length,living:result.living,status:result.status};report.runs.push(summary);console.log(JSON.stringify({missionName,scene,frameP95:result.frameMs.p95,frameP99:result.frameMs.p99,maxFrame:result.frameMs.max,maxSimulation:result.stages.simulation?.max,over50:result.over50,simSeconds:summary.simSeconds}));
  }
  await page.close();
 }
 assert.deepEqual(report.errors,[]);report.passed=true;
}finally{fs.writeFileSync(folder+'/summary.json',JSON.stringify(report,null,2));await browser.close();}
