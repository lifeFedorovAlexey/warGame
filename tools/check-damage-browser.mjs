import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url);
let playwright;
try{playwright=require('playwright');}catch{playwright=require(process.env.PLAYWRIGHT_PATH??'C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const benchmark=process.argv.includes('--benchmark'),software=process.argv.includes('--software'),allNear=process.argv.includes('--all-near'),budget=process.argv.includes('--budget');
const performanceBudget=JSON.parse(fs.readFileSync('tools/performance-budget.json'));
const profileMode=process.argv.includes('--profile');
const reportPath='campaign/reports/damage-benchmark'+(budget?'-500-budget'+(allNear?'-all-near':''):allNear?'-all-near':'')+(profileMode?'-profile':'')+'.json';
const executablePath=process.env.EDGE_PATH??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser=await playwright.chromium.launch({executablePath,headless:true,args:['--enable-precise-memory-info',...(budget?['--disable-frame-rate-limit','--disable-gpu-vsync']:[]),...(software?['--enable-unsafe-swiftshader','--use-angle=swiftshader']:['--use-angle=d3d11'])]});
const errors=[];
try{
  const viewport=benchmark?performanceBudget.viewport:{width:1280,height:720};
  const page=await browser.newPage({viewport});
  page.on('pageerror',e=>{errors.push(e.message);console.log(JSON.stringify({pageError:e.message}));});page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.log(JSON.stringify({browserError:m.text()}));}});
  await page.goto((process.env.DAMAGE_BASE_URL??'http://127.0.0.1:8766')+'/campaign/?damage=1');
  await page.waitForFunction(()=>window.campaign?.damageDebug,{},{timeout:120000});
  const browserSession=await browser.newBrowserCDPSession(),gpuInfo=await browserSession.send('SystemInfo.getInfo');
  const profiler=process.argv.includes('--profile')?await page.context().newCDPSession(page):null;
  if(profiler){await profiler.send('Profiler.enable');await profiler.send('Profiler.setSamplingInterval',{interval:100});}
  const environment=await page.evaluate(()=>{const w=window.campaign.world,g=w.renderer.getContext(),ext=g.getExtension('WEBGL_debug_renderer_info');return {renderer:ext?g.getParameter(ext.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER),webgl:g.getParameter(g.VERSION),timerQuery:!!g.getExtension('EXT_disjoint_timer_query_webgl2'),userAgent:navigator.userAgent,viewport:[1280,720],hardwareConcurrency:navigator.hardwareConcurrency};});
  environment.browser=browser.version();environment.gpuDevices=gpuInfo.gpu.devices;environment.date=new Date().toISOString();
  environment.damageLODOverride=allNear?0:null;
  environment.viewport=[viewport.width,viewport.height];environment.unlimitedFrameRate=budget;
  environment.node=process.version;environment.sources=Object.fromEntries([...fs.readdirSync('campaign').filter(n=>n.startsWith('damage-')||n.includes('salvage')||n==='field-modification-models.js').map(n=>'campaign/'+n),'campaign/vehicle-layer.js','campaign/world.js','campaign/mission.js','campaign/main.js','campaign/fog-mask.js','campaign/unit-spatial-index.js','campaign/navigation.js','assets/campaign/alpha/mission01/gameplay.json','tools/check-damage-browser.mjs','tools/performance-budget.json'].map(path=>[path,createHash('sha256').update(fs.readFileSync(path)).digest('hex')]));
  for(const path of ['campaign/traffic-coordinator.js','campaign/wreck-lifecycle.js','campaign/flame-effects.js','campaign/combat-effects.js','campaign/vehicle-motion.js','campaign/vehicle-collision.js','campaign/vehicle-impact.js','campaign/vehicle-contact-shadows.js','campaign/builder-kinematics.js','campaign/field-vehicles.js'])environment.sources[path]=createHash('sha256').update(fs.readFileSync(path)).digest('hex');
  for(const path of ['campaign/vehicle-contact-rock.js','campaign/terrain-passability.js','campaign/combat-policy.js','campaign/combat-deployment.js'])environment.sources[path]=createHash('sha256').update(fs.readFileSync(path)).digest('hex');
  console.log(JSON.stringify({environment:{renderer:environment.renderer,browser:environment.browser,date:environment.date,timerQuery:environment.timerQuery}}));
  fs.mkdirSync('campaign/reports',{recursive:true});fs.mkdirSync('campaign/previews',{recursive:true});
  if(process.argv.includes('--destruction')){
    await (await import('./check-destruction-browser.mjs')).checkDestructionBrowser(page);assert.deepEqual(errors,[]);
  }else if(process.argv.includes('--contacts')){
    await (await import('./check-vehicle-contact-browser.mjs')).checkVehicleContactBrowser(page);assert.deepEqual(errors,[]);
  }else if(process.argv.includes('--salvage')){
    await (await import('./check-salvage-browser.mjs')).checkSalvageBrowser(page);assert.deepEqual(errors,[]);
  }else if(process.argv.includes('--individuality')){
    await (await import('./damage-lookdev.mjs')).captureDamageIndividuality(page);assert.deepEqual(errors,[]);
  }else if(process.argv.includes('--lookdev')){
    await (await import('./damage-lookdev.mjs')).captureDamageLook(page);assert.deepEqual(errors,[]);
  }else{
  const smoke=await page.evaluate(async()=>{
    const c=window.campaign,w=c.world,m=c.mission,d=c.damageDebug;c.renderSuspended=true;w.fixedRenderScale=true;w.renderer.setPixelRatio(1);
    const unit=m.state.units.find(u=>u.kind==='bukhanka'),pristine=JSON.stringify(unit);
    unit.hp=unit.maxHp=5000;document.querySelector('#welcome').hidden=true;d.selectTarget(unit.id);d.view(unit.id,38);w.update(m,new Set(),1/60);
    const single=d.hit(unit.id,{type:'bullet'}),burst=d.hit(unit.id,{type:'burst',side:'left'});
    // Exercise a direct pane contact before a body collision can break the
    // same pane indirectly through local structural load.
    const glass=d.hit(unit.id,{type:'bullet',power:22,partId:13});w.update(m,new Set(),1/60);
    const dent=d.hit(unit.id,{type:'collision',power:110,side:'right'});w.update(m,new Set(),1/60);
    const cage=unit.damage.cage.slice(),marks=unit.damage.marks.length;
    const before=JSON.stringify(unit.damage);unit.x+=8;unit.previousX=unit.x;unit.heading=.4;unit.previousHeading=.4;w.update(m,new Set(),1/60);
    const follows=before===JSON.stringify(unit.damage);
    const originalCount=w.damage.statistics.textureRows;
    for(let i=0;i<5;i++)w.update(m,new Set(),1/60);
    const idleUploads=w.damage.statistics.textureRows-originalCount;
    d.view(unit.id,1400);w.update(m,new Set(),1/60);const far=w.damage.records.get(unit.id).lod;
    d.view(unit.id,38);w.camera.position.x+=1000;w.controls.target.x+=1000;w.controls.update();w.update(m,new Set(),1/60);
    const offscreen=w.damage.records.get(unit.id).lod,offscreenRows=w.damage.statistics.textureRows;
    unit.x+=2;unit.previousX=unit.x;
    d.hit(unit.id,{type:'bullet',power:1,side:'rear'});const hiddenRevision=unit.damage.revision;w.update(m,new Set(),1/60);
    const deferred=w.damage.statistics.textureRows===offscreenRows;
    const offscreenPose=Math.abs(w.vehicles.transforms.get(unit.id).position.x-unit.x)<1e-5;
    d.view(unit.id,38);w.update(m,new Set(),1/60);const near=w.damage.records.get(unit.id).lod;
    const restored=w.damage.records.get(unit.id).revision===hiddenRevision;
    unit.wheelDistance=unit.previousWheelDistance=2.4;unit.steering=unit.previousSteering=.32;
    unit.aimTarget={x:unit.x+80,y:unit.y+35,z:w.field.heightAt(unit.x,unit.y)+22};
    w.update(m,new Set(),1/60);
    const weapon=d.hit(unit.id,{type:'bullet',power:1,partId:9});
    const lamp=d.hit(unit.id,{type:'bullet',power:24,partId:5});w.update(m,new Set(),1/60);
    const detached=Object.values(unit.damage.parts).some(p=>p.detached),physics=w.damage.statistics.activePhysics;
    const wheel=d.hit(unit.id,{type:'bullet',power:110,partId:1});w.update(m,new Set(),1/60);
    const bumper=d.hit(unit.id,{type:'bullet',power:170,partId:7});w.update(m,new Set(),1/60);
    const save=m.save();m.load(save);const loaded=m.state.units.find(u=>u.id===unit.id);const persists=JSON.stringify(loaded.damage)===JSON.stringify(unit.damage);
    d.view(loaded.id,38);w.update(m,new Set(),1/60);
    m.state.units=[loaded];d.view(loaded.id,38);w.update(m,new Set(),1/60);
    return {single,burst,dent,marks,cageMax:Math.max(...cage.map(Math.abs)),follows,idleUploads,far,near,offscreen,offscreenPose,deferred,restored,lamp,wheel,bumper,glass,weapon,detached,physics,persists,id:unit.id};
  });
  console.log(JSON.stringify({smoke}));
  assert.equal(smoke.wheel?.partId,1);assert.equal(smoke.bumper?.partId,7);assert.equal(smoke.glass?.partId,13);assert.equal(smoke.weapon?.partId,9);
  assert.equal(smoke.offscreen,3);assert(smoke.deferred&&smoke.restored&&smoke.offscreenPose);
  assert(smoke.single&&smoke.burst&&smoke.dent);assert(smoke.cageMax>0);assert(smoke.follows&&smoke.persists);assert.equal(smoke.idleUploads,0);assert.equal(smoke.far,2);assert.equal(smoke.near,0);assert(smoke.detached);assert(smoke.physics<=24);
  await page.screenshot({path:'campaign/previews/damage-bukhanka.png'});
  const wreck=await page.evaluate(async id=>{
    const c=window.campaign,u=c.mission.entity(id);c.damageDebug.hit(id,{type:'shell',power:u.hp,side:'rear'});c.world.update(c.mission,new Set(),1/60);
    for(let i=0;i<60;i++){await new Promise(requestAnimationFrame);c.world.update(c.mission,new Set(),1/30);}
    return {retained:!!u.damage.wreck&&c.world.vehicles.transforms.has(u.id),marks:u.damage.marks.length,cage:!!u.damage.cage,missing:Object.values(u.damage.parts).filter(p=>p.detached).length};
  },smoke.id);
  assert(wreck.retained&&wreck.cage&&wreck.missing>0);
  await page.screenshot({path:'campaign/previews/damage-wreck.png'});
  const buildings=[];
  for(const [i,kind] of ['factory','lab','generator','mg-tower'].entries()){
    buildings.push(await page.evaluate(async({i,kind})=>{
      const c=window.campaign,w=c.world,m=c.mission,d=c.damageDebug,start=w.field.gridToWorld(m.config.startGrid);
      const entity=m.addStructure(kind,'rai',{x:start.x+80+i*115,y:start.y+80},{completed:true,progress:1});entity.hp=entity.maxHp=10000;
      m.updateFog();d.selectTarget(entity.id);d.view(entity.id,170);w.update(m,new Set(),1/60);
      const template=w.damage.getTemplate(entity),part=Object.entries(template.parts).find(([,p])=>p.material==='glass')??Object.entries(template.parts).find(([,p])=>p.detachable);
      const result=d.hit(entity.id,{type:'shell',power:280,partId:Number(part[0])});w.update(m,new Set(),1/60);
      const equipment=Object.entries(template.parts).find(([id,p])=>id!==part[0]&&p.detachable&&p.material!=='glass');
      const equipmentHit=equipment?d.hit(entity.id,{type:'shell',power:600,partId:Number(equipment[0])}):null;w.update(m,new Set(),1/60);
      for(let frame=0;frame<60;frame++){await new Promise(requestAnimationFrame);w.update(m,new Set(),1/30);}d.refresh();
      return {kind,hit:!!result,part:result?.partId,equipment:equipmentHit?.partId,equipmentExpected:Number(equipment?.[0]),equipmentDetached:!!entity.damage?.parts[equipment?.[0]]?.detached,noCage:!entity.damage?.cage,detached:Object.values(entity.damage?.parts??{}).some(p=>p.detached)};
    },{i,kind}));
    await page.screenshot({path:'campaign/previews/damage-'+kind+'.png'});
  }
  console.log(JSON.stringify({buildings}));assert(buildings.every(b=>b.hit&&b.noCage&&b.detached&&b.equipment===b.equipmentExpected&&b.equipmentDetached));
  await page.screenshot({path:'campaign/previews/damage-buildings.png'});
  const buildingWreck=await page.evaluate(()=>{const c=window.campaign,e=c.mission.state.buildings.findLast(b=>b.kind==='mg-tower'),hit=c.damageDebug.hit(e.id,{type:'shell',power:e.hp});c.world.update(c.mission,new Set(),1/60);return {hit:!!hit,wreck:e.damage?.wreck,retained:c.world.buildingObjects.get(e.id)?.visible,parts:Object.keys(e.damage?.parts??{}).length};});
  assert(buildingWreck.hit&&buildingWreck.wreck&&buildingWreck.retained&&buildingWreck.parts>1);
  if(!benchmark){assert.deepEqual(errors,[]);fs.writeFileSync('campaign/reports/damage-smoke.json',JSON.stringify({environment,smoke,wreck,buildings,buildingWreck,errors},null,2));}
  else{
    await page.evaluate(()=>{window.campaign.damageDebug.panel.hidden=true;});
    const counts=(process.env.DAMAGE_COUNTS??(budget?'500':allNear?'200':'1,10,50,100,200')).split(',').map(Number),results=[];
    for(const count of counts)for(const enabled of (profiler?[true]:[false,true])){
      const fixture=await page.evaluate(async({count,enabled,allNear,viewport,budget})=>{
        const c=window.campaign,w=c.world,m=c.mission,d=c.damageDebug;
        m.pendingTick=null;m.unitFrameTimes=new WeakMap();m.unitIndexActive=false;m.accumulator=0;m.state.time=0;
        m.state.units=[];m.state.buildings=[];m.state.salvage.items=[];m.effects=[];m.events=[];w.damage.reset();w.damage.enabled=enabled;m.damageEnabled=enabled;
        if(allNear&&!c.damageOriginalRepresentation){c.damageOriginalRepresentation=w.damage.representation;w.damage.representation=(...args)=>{const rep=c.damageOriginalRepresentation(...args);if(rep.visible){rep.lod=0;w.damage.records.get(args[0].id).lod=0;}return rep;};}
        const p=w.field.gridToWorld(m.config.startGrid),cols=Math.ceil(Math.sqrt(count)),rows=Math.ceil(count/cols);
        const units=[];
        for(let i=0;i<count;i++){const u=m.addUnit('bukhanka','rai',{x:p.x+(i%cols-(cols-1)/2)*(budget?34:22),y:p.y+(Math.floor(i/cols)-(rows-1)/2)*26});u.hp=u.maxHp=100000;units.push(u);}
        w.controls.enableDamping=false;w.controls.minDistance=18;
        const distance=Math.max(85,cols*(budget?56:43));w.controls.target.set(p.x,p.y,w.field.heightAt(p.x,p.y)+6);w.camera.position.set(p.x+distance*.42,p.y-distance*.65,w.controls.target.z+distance*.75);w.controls.update();
        w.fixedRenderScale=true;w.renderer.setPixelRatio(1);w.renderer.setSize(viewport.width,viewport.height,false);w.camera.aspect=viewport.width/viewport.height;w.camera.updateProjectionMatrix();
        w.update(m,new Set(),1/60);
        // Identical known damage before sampling; disabled case retains pristine state.
        if(enabled)for(const u of units){d.hit(u.id,{type:'collision',power:110,side:'right'});d.hit(u.id,{type:'burst',side:'front'});}
        for(let i=0;i<90;i++){await new Promise(requestAnimationFrame);w.update(m,new Set(),1/60);}
        c.damageBenchUnits=units.map(u=>u.id);w.damage.resetMetrics();
        return {illegalTerrainStarts:units.filter(u=>!m.nav.terrainAllowed(u.x,u.y)).length,
          navigation:'Synthetic grid and direct forward waypoints; does not validate a mass UI order or legal route arrival'};
      },{count,enabled,allNear,viewport,budget});
      for(const phase of (profiler?['simulation']:budget?performanceBudget.requiredPhases:['settled','impacts'])){
        if(phase==='simulation')await page.evaluate(()=>{
          const c=window.campaign,m=c.mission;m.updateMission=()=>{};m.state.status='running';m.state.pendingCinematics=[];m.rebuildNavigation();
          for(const unit of m.state.units){unit.heading=unit.previousHeading=-Math.PI/2;unit.path=[{x:unit.x+500,y:unit.y}];unit.task={type:'move',...unit.path[0]};}
          c.benchCameraAnchor={unitX:m.state.units[0].x,cameraX:c.world.camera.position.x,targetX:c.world.controls.target.x};
        });
        if(profiler){
          await page.evaluate(()=>{
            const c=window.campaign;c.benchTimings={};
            for(const [object,key] of [[c.mission,'updateUnit'],[c.mission,'updateFog'],[c.mission.nav,'findPath'],[c.world,'update']]){
              const original=object[key];object[key]=function(...args){const start=performance.now();try{return original.apply(this,args);}finally{const elapsed=performance.now()-start,s=c.benchTimings[key]??={calls:0,total:0,max:0,slow:[]};s.calls++;s.total+=elapsed;s.max=Math.max(s.max,elapsed);if(elapsed>6&&s.slow.length<20)s.slow.push({ms:elapsed,unit:args[0]?.id,time:c.mission.state.time});}};
            }
          });
          await profiler.send('Profiler.start');
        }
        const run=await page.evaluate(async({phase,seconds})=>{
          const c=window.campaign,w=c.world,m=c.mission,gl=w.renderer.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2'),queries=[],gpu=[],cpu=[],intervals=[],draw=[],triangles=[],stateBefore=w.damage.statistics;
          const simulationStart=m.state.time;
          let start=null,last=null,nextHit=0,activeMax=0,disjoint=false,frames=0,visibleMin=Infinity,movingMax=0,simulationCpuMs=0,backlogMax=0;
          const endTime=seconds*1000;
          while(true){
            const now=await new Promise(requestAnimationFrame),frameDt=last===null?0:(now-last)/1000;if(start===null){start=last=now;}else intervals.push(now-last);last=now;
            if(now-start>=endTime)break;
            const cpuStart=performance.now();
            if(phase==='simulation'){
              const tickStart=performance.now();m.advance(frameDt,{budgetMs:m.config.simulationCpuBudgetMs});simulationCpuMs+=performance.now()-tickStart;
              backlogMax=Math.max(backlogMax,m.accumulator+(m.pendingTick?m.config.simulationStep:0));
              movingMax=Math.max(movingMax,m.state.units.filter(u=>Math.hypot(u.x-u.previousX,u.y-u.previousY)>.01).length);
              const anchor=c.benchCameraAnchor,offset=m.state.units[0].x-anchor.unitX;w.camera.position.x=anchor.cameraX+offset;w.controls.target.x=anchor.targetX+offset;w.controls.update();
            }
            if(phase==='impacts'&&now-start>=nextHit){const side=Math.round(nextHit/500)%2?'right':'front';nextHit+=500;for(const id of c.damageBenchUnits)c.damageDebug.hit(id,{type:'collision',power:22,side});}
            let query=null;if(ext&&queries.length<10){query=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,query);}
            w.update(m,new Set(),phase==='simulation'?frameDt:1/60);
            if(query){gl.endQuery(ext.TIME_ELAPSED_EXT);queries.push(query);}
            cpu.push(performance.now()-cpuStart);draw.push(w.renderer.info.render.calls);triangles.push(w.renderer.info.render.triangles);frames++;
            activeMax=Math.max(activeMax,w.damage.statistics.activePhysics);visibleMin=Math.min(visibleMin,w.vehicles.visible.length);
            if(ext){disjoint||=gl.getParameter(ext.GPU_DISJOINT_EXT);while(queries.length&&gl.getQueryParameter(queries[0],gl.QUERY_RESULT_AVAILABLE)){const q=queries.shift();gpu.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);gl.deleteQuery(q);}}
          }
          for(let i=0;i<15&&queries.length;i++){
            await new Promise(requestAnimationFrame);disjoint||=gl.getParameter(ext.GPU_DISJOINT_EXT);
            while(queries.length&&gl.getQueryParameter(queries[0],gl.QUERY_RESULT_AVAILABLE)){const q=queries.shift();gpu.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);gl.deleteQuery(q);}
          }
          for(const q of queries)gl.deleteQuery(q);
          const summary=a=>{const sorted=a.slice().sort((a,b)=>a-b);return {mean:a.reduce((s,x)=>s+x,0)/Math.max(1,a.length),p95:sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))]??null,max:sorted.at(-1)??null};};
          const after=w.damage.statistics,delta={};for(const k of ['hitCount','hitCpuMs','hitStateCpuMs','deformationCpuMs','geometryUpdates','instanceBufferUpdates','textureRows','textureBytes'])delta[k]=after[k]-stateBefore[k];
          return {phase,frames,seconds:(last-start)/1000,fps:1000/(intervals.reduce((s,x)=>s+x,0)/intervals.length),cpuFrameMs:summary(cpu),frameIntervalMs:summary(intervals),gpuFrameMs:ext&&!disjoint&&gpu.length?summary(gpu):null,gpuFrameReason:!ext?'EXT_disjoint_timer_query_webgl2 unavailable':disjoint?'GPU disjoint invalidated timings':!gpu.length?'No completed timer queries':null,gpuSamples:gpu.length,drawCalls:summary(draw),triangles:summary(triangles),visibleMin,movingMax,simulationCpuMs,simulationElapsed:m.state.time-simulationStart,simulationBacklogMax:backlogMax,activePhysicsMax:activeMax,damage:delta,atlasBytes:after.atlasBytes,jsHeap:performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize}:null,geometryCount:w.renderer.info.memory.geometries,textureCount:w.renderer.info.memory.textures,lods:[0,1,2,3].map(l=>[...w.damage.records.values()].filter(r=>r.lod===l).length)};
        },{phase,seconds:Number(process.env.DAMAGE_SECONDS??6)});
        if(profiler){const {profile}=await profiler.send('Profiler.stop');fs.writeFileSync('campaign/reports/damage-500.cpuprofile',JSON.stringify(profile));run.profileTimings=await page.evaluate(()=>window.campaign.benchTimings);}
        const processes=await browserSession.send('SystemInfo.getProcessInfo');
        let processMemory;
        try{processMemory=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File','tools/damage-process-metrics.ps1','-ProcessIds',processes.processInfo.map(p=>p.id).join(',')],{encoding:'utf8',windowsHide:true}));}catch(error){processMemory={reason:error.message};}
        const result={count,enabled,...run,fixture,processMemory};results.push(result);
        fs.writeFileSync(reportPath,JSON.stringify({environment,results,errors},null,2));
        console.log(JSON.stringify({count,enabled,phase,fps:run.fps,cpu:run.cpuFrameMs.mean,gpu:run.gpuFrameMs?.mean,draw:run.drawCalls.mean,visible:run.visibleMin,damage:run.damage,memory:processMemory}));
        assert.equal(run.visibleMin,count,'Every fixture vehicle must actually be rendered');assert(run.activePhysicsMax<=24);if(phase==='settled')assert.equal(run.damage.textureRows,0,'Idle damaged vehicles upload no damage data');
      }
    }
    assert.deepEqual(errors,[]);
    if(budget&&!profileMode){
      for(const enabled of [false,true])for(const phase of performanceBudget.requiredPhases)assert(results.some(r=>r.count===performanceBudget.vehicles&&r.enabled===enabled&&r.phase===phase),'Missing required benchmark phase');
      const failed=results.filter(r=>r.enabled&&(r.fps<performanceBudget.minimumFps||r.frameIntervalMs.p95>performanceBudget.frameP95BudgetMs||r.cpuFrameMs.p95>performanceBudget.cpuP95BudgetMs||!r.gpuFrameMs||r.gpuFrameMs.p95>performanceBudget.gpuP95BudgetMs||(r.phase==='simulation'&&(r.movingMax<r.count*.9||r.simulationElapsed<r.seconds-.2||r.simulationBacklogMax>.2))));
      fs.writeFileSync(reportPath,JSON.stringify({environment,performanceBudget,passed:!failed.length,results,errors},null,2));
      assert.equal(failed.length,0,'500-unit performance budget failed: '+failed.map(r=>r.phase).join(', '));
    }
  }
  }
}finally{await browser.close();}
