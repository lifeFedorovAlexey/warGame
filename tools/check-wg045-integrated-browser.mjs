import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const {chromium}=createRequire(import.meta.url)('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dir='docs/playtest-evidence/wg045-integrated';
fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
const report={build:'7251fad',scenario:'M02, 20 vehicles; 10 lightly damaged retreat against advancing traffic; native browser, real elapsed time',errors:[],views:[]};
let page;
const pending=new Set();
try{
 page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 page.on('pageerror',e=>report.errors.push(e.message));
 page.on('request',r=>pending.add(r.url()));
 page.on('requestfinished',r=>pending.delete(r.url()));
 page.on('requestfailed',r=>{pending.delete(r.url());if(r.failure()?.errorText!=='net::ERR_ABORTED')(report.requestFailures??=[]).push({url:r.url(),error:r.failure()});});
 await page.addInitScript(()=>{for(const key of ['fieldRadio','fieldSound','fieldStoryVoice'])localStorage.setItem('warGame.'+key,'off');});
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8766')+'/campaign/?mission=m02&perf=1');
 console.log('Page opened');
 for(let attempt=0;attempt<2;attempt++){
  let failed=false;
  const onFailure=r=>{if(r.failure()?.errorText!=='net::ERR_ABORTED')failed=true;};page.on('requestfailed',onFailure);
  let ready=false;
  try{
   for(let elapsed=0;elapsed<90;elapsed++){
    const state=await page.evaluate(()=>({ready:!!window.campaign?.ready,error:document.querySelector('#loading')?.dataset.phase==='error',status:document.querySelector('#loading-status')?.textContent}));
    if(state.error)throw Error(state.status);
    if(state.ready){ready=true;break;}
    if(failed||report.requestFailures?.length)break;
    await page.waitForTimeout(1000);
   }
  }finally{page.off('requestfailed',onFailure);}
  if(ready)break;
  if(attempt===1)throw Error('Game did not become ready; see network failures');
  report.initialRequestFailures=report.requestFailures??[];delete report.requestFailures;
  console.log('Retrying browser load after network failure');await page.reload();
 }
 console.log('Game ready');
 await page.locator('#begin').click();
 await page.waitForFunction(()=>campaign.state.active&&!campaign.state.openingPlaying,null,{timeout:90000});
 await page.locator('#pause').click();
 await page.evaluate(save=>campaign.mission.load(save),fs.readFileSync('campaign/previews/playtest-WG-045/m02-split-hit.json','utf8'));
 report.start=await page.evaluate(async()=>{
  const c=campaign,m=c.mission;
  const {roadDrivingLane}=await import('/campaign/road-merge.js');
  const units=m.state.units.filter(u=>u.owner==='rai'&&u.hp>0),ids=units.map(u=>u.id);
  const origin=units.map(u=>({id:u.id,x:u.x,y:u.y}));
  window.wg045={time:m.state.time,rows:[],ids,origin};
  c.world.fixedRenderScale=1;c.world.renderer.setPixelRatio(1);c.radio.setEnabled(false);c.select(ids);
  const original=m.continueTick.bind(m);let last=m.state.time;
  m.continueTick=function(...args){
   const result=original(...args);
   if(this.pendingTick||last===this.state.time)return result;
   last=this.state.time;
   wg045.rows.push({time:this.state.time,units:ids.map(id=>{
    const u=this.entity(id);if(!u||u.hp<=0)return {id,dead:true};
    const lane=u.path.length?roadDrivingLane(this,u,u.path[0],this.config.worldScale):null;
    return {id,x:u.x,y:u.y,hp:u.hp,retreat:!!u.combatRetreat,shoulder:!!lane?.retreatShoulder,wait:u.navigation?.waitSeconds??0,reason:u.navigation?.reason};
   })});return result;
  };
  return {time:m.state.time,origin,fortifications:m.state.m02.fortificationVersion};
 });
 assert.equal(report.start.origin.length,20);
 assert.equal(report.start.fortifications,4);
 await page.evaluate(()=>wargamePerf.reset());await page.locator('#pause').click();
 await page.waitForFunction(()=>campaign.mission.state.time-wg045.time>=6,null,{timeout:45000});
 await page.locator('#pause').click();
 await page.evaluate(()=>{
  const c=campaign,units=c.mission.state.units.filter(u=>wg045.ids.includes(u.id)&&u.hp>0);
  c.world.centre({x:units.reduce((n,u)=>n+u.x,0)/units.length,y:units.reduce((n,u)=>n+u.y,0)/units.length},500);
  document.querySelector('#performance-overlay').hidden=true;
 });
 for(const [width,height] of [[1440,900],[844,390],[667,375]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(250);
  const view=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth}));
  assert.equal(view.scrollWidth,width);report.views.push(view);
  await page.screenshot({path:dir+'/traffic-'+width+'.png'});
 }
 await page.setViewportSize({width:1440,height:900});await page.locator('#pause').click();
 await page.waitForFunction(()=>campaign.mission.state.time-wg045.time>=20,null,{timeout:60000});
 await page.locator('#pause').click();
 report.trace=await page.evaluate(()=>wg045.rows);
 report.performance=await page.evaluate(()=>{wargamePerf.stop();const {frames,worstFrames,...summary}=wargamePerf.report();return summary;});
 report.performanceNote='Includes pauses and viewport changes for screenshots; not an FPS benchmark.';
 report.movement=report.start.origin.map(start=>{
  const samples=report.trace.flatMap(row=>row.units.filter(u=>u.id===start.id&&!u.dead)),last=samples.at(-1);
  return {id:start.id,distance:last?Math.hypot(last.x-start.x,last.y-start.y):0,maxWait:Math.max(0,...samples.map(u=>u.wait)),usedShoulder:samples.some(u=>u.shoulder),alive:!report.trace.at(-1).units.find(u=>u.id===start.id).dead};
 });
 await page.screenshot({path:dir+'/after.png'});
 assert(report.movement.every(u=>u.distance>10),'Every member must make real progress before any combat death');
 assert(report.movement.filter(u=>u.usedShoulder).length>=8,'Damaged stream must use the shoulders');
 assert.deepEqual(report.errors,[]);
 console.log(JSON.stringify({movement:report.movement,views:report.views,errors:report.errors}));
}catch(error){report.failure=error.stack;report.pending=[...pending];if(page){report.pageText=await page.locator('body').innerText({timeout:5000}).catch(()=>null);await page.screenshot({path:dir+'/failure.png',timeout:10000}).catch(()=>{});}throw error;}
finally{fs.writeFileSync(dir+'/browser.json',JSON.stringify(report,null,2));await browser.close();}
