import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {bridgeTrafficFixture} from './bridge-traffic-fixture.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH??'C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const option=(name,fallback)=>process.argv.find(a=>a.startsWith('--'+name+'='))?.split('=').slice(1).join('=')??fallback;
const baselineRef=option('baseline-ref',null),label=option('label','browser-after'),seconds=Number(option('seconds','15'));
const opponent=process.argv.includes('--opponent');
const playthrough=process.argv.includes('--playthrough');
const changed=[...new Set(['predictive-traffic.js','vehicle-collision.js','road-traffic.js','mission.js','turning-headway.js','maneuver-admission.js','world.js','selection-rings.js','combat-sight.js',
 ...execFileSync('git',['diff','--diff-filter=M','--name-only',baselineRef??'0b0984f','--','campaign'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(p=>p.endsWith('.js')).map(p=>p.split('/').at(-1)),
 ...(!baselineRef?['forecast-clearance.js']:[])])];
const sources=baselineRef?new Map(changed.map(name=>[name,execFileSync('git',['show',baselineRef+':campaign/'+name])])):null;
const dir='campaign/reports/bridge-driving/'+label;fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.connectOverCDP(process.env.CDP_URL??'http://127.0.0.1:9337'),summary=[];
try{
 for(const count of option('counts',playthrough?'46':'50,100,250,500').split(',').map(Number)){
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1}),page=await context.newPage(),errors=[],hashes={},responses=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{const path=new URL(r.url()).pathname;if(path.startsWith('/campaign/')&&changed.includes(path.split('/').at(-1)))responses.push(r.body().then(bytes=>{hashes[path]=createHash('sha256').update(bytes).digest('hex');}));});
  try{
   if(sources)await page.route('**/campaign/*.js',route=>{const name=new URL(route.request().url()).pathname.split('/').at(-1);return sources.has(name)?route.fulfill({body:sources.get(name),contentType:'text/javascript'}):route.continue();});
   await page.addInitScript(()=>{for(const key of ['fieldRadio','fieldSound','fieldStoryVoice'])localStorage.setItem('warGame.'+key,'off');});
   await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8899')+'/campaign/?mission=m02&perf');
   await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:120000});await page.locator('#begin').click();
   await page.waitForFunction(()=>campaign.state.active&&!campaign.state.openingPlaying,null,{timeout:120000});await page.locator('#pause').click();
   const setup=await page.evaluate(({save,opponent,playthrough})=>{
    const c=campaign,m=c.mission,w=c.world;m.load(save);
    if(!playthrough){m.updateMission=()=>{};
     for(const spec of [...(opponent?[]:Object.values(m.config.units)),...Object.values(m.config.buildings)])spec.damage=0;
    }
    c.radio.dismiss();c.radio.setEnabled(false);w.fixedRenderScale=true;w.renderer.setPixelRatio(1);w.controls.enableDamping=false;
    const bridge=m.field.river.bridges[1],a=bridge.points[0],b=bridge.points.at(-1),length=Math.hypot(b.x-a.x,b.y-a.y),ux=(b.x-a.x)/length,uy=(b.y-a.y)/length;
    window.scaleTargets=[{x:b.x+ux*180,y:b.y+uy*180},{x:a.x-ux*180,y:a.y-uy*180}];
    window.scaleOpponent=opponent;
    window.scalePlaythrough=playthrough;
    w.centre({x:(a.x+b.x)/2,y:(a.y+b.y)/2},1100);c.select(m.state.units.filter(u=>u.owner==='rai').map(u=>u.id));
    const gl=w.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
    return {count:m.state.units.length,gpu:gl.getParameter(ext?.UNMASKED_RENDERER_WEBGL??gl.RENDERER),scale:w.renderer.getPixelRatio()};
   },{save:playthrough?JSON.parse(fs.readFileSync('docs/campaign/alpha/m02/playthrough-50.json','utf8')).state
    :bridgeTrafficFixture(count,1,{opponent}).mission.save(),opponent,playthrough});
   await page.evaluate(()=>new Promise(resolve=>{let n=90;const frame=()=>--n?requestAnimationFrame(frame):resolve();requestAnimationFrame(frame);}));
   const cdp=process.argv.includes('--profile')?await context.newCDPSession(page):null;if(cdp){await cdp.send('Profiler.enable');await cdp.send('Profiler.start');}
   await page.evaluate(()=>{
    const m=campaign.mission,units=m.state.units,half=Math.ceil(units.length/2);
    window.scaleStart={at:performance.now(),sim:m.state.time,positions:units.map(u=>({id:u.id,owner:u.owner,x:u.x,y:u.y,hp:u.hp}))};
    document.querySelector('#pause').click();
    if(scalePlaythrough)m.submitOrder(units.filter(u=>u.owner==='rai'&&u.hp>0&&m.unitSpec(u).damage).map(u=>u.id),'attack-move',m.state.m02.bases.east_factory.gate);
    else{
     m.submitOrder(units.slice(0,half).map(u=>u.id),scaleOpponent?'attack-move':'move',scaleTargets[0]);
     if(!scaleOpponent)m.submitOrder(units.slice(half).map(u=>u.id),'move',scaleTargets[1]);
    }
    wargamePerf.reset();
   });
   await new Promise(r=>setTimeout(r,seconds*1000));
   const result=await page.evaluate(()=>{
    wargamePerf.stop();document.querySelector('#pause').click();const m=campaign.mission,s=scaleStart,wall=(performance.now()-s.at)/1000,perf=wargamePerf.report();delete perf.frames;
    return {wallSeconds:wall,simulationSeconds:m.state.time-s.sim,simulationRate:(m.state.time-s.sim)/wall,perf,
     moved:s.positions.filter(p=>{const u=m.entity(p.id);return u&&Math.hypot(u.x-p.x,u.y-p.y)>1;}).length,
     damaged:s.positions.filter(p=>m.entity(p.id)?.hp<p.hp).length,pending:m.state.units.filter(u=>u.pendingOrder).length,
     enemies:s.positions.filter(p=>p.owner==='scavs').length,
     enemyMoved:s.positions.filter(p=>{const u=m.entity(p.id);return p.owner==='scavs'&&u&&Math.hypot(u.x-p.x,u.y-p.y)>1;}).length,
     predictive:m.trafficCoordinator.stats,command:m.commandPlanner?.stats};
   });
   if(cdp)fs.writeFileSync(dir+'/'+count+'.cpuprofile',JSON.stringify((await cdp.send('Profiler.stop')).profile));
   await page.evaluate(()=>{document.querySelector('#performance-overlay')?.remove();});
   await page.screenshot({path:dir+'/'+count+'-1440.png'});
   if(process.argv.includes('--layout')&&count===500)for(const [width,height] of [[844,390],[667,375]]){await page.setViewportSize({width,height});await page.screenshot({path:dir+'/'+count+'-'+width+'.png'});}
   await Promise.all(responses);for(const [path,hash] of Object.entries(hashes))assert.equal(hash,createHash('sha256').update(sources?.get(path.split('/').at(-1))??fs.readFileSync('.'+path)).digest('hex'),path+' source matches');
   assert.equal(Object.keys(hashes).length,changed.length);assert.deepEqual(errors,[]);
   const report={baselineRef,scenario:playthrough?'saved-playthrough':opponent?'opposing-armies':'bridge-traffic',setup,...result,hashes,errors};summary.push(report);fs.writeFileSync(dir+'/'+count+'.json',JSON.stringify(report,null,2));
   console.log(JSON.stringify({count,rate:result.simulationRate,frame:result.perf.frameMs,simulation:result.perf.stages.simulation,moved:result.moved,pending:result.pending,errors}));
  }finally{await context.close();}
 }
 fs.writeFileSync(dir+'/scale.json',JSON.stringify(summary,null,2));
}finally{await browser.close();}
