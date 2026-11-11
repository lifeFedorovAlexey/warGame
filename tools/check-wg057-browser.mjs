import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const folder='campaign/previews/playtest-WG-057/browser';fs.mkdirSync(folder,{recursive:true});
function movement(report){
 const rows=report.result.trace.rows,last=rows.at(-1);
 return report.start.origin.map(start=>{
  const current=last.units.find(u=>u.id===start.id),living=rows.flatMap(row=>row.units.filter(u=>u.id===start.id&&!u.dead)),u=living.at(-1);
  return {id:start.id,alive:!current.dead,retreat:u?.retreat,side:u?.side,distance:u?Math.hypot(u.x-start.x,u.y-start.y):0,wait:u?.wait,reason:u?.reason};
 });
}
// Reuse an existing native trace when correcting report accounting; this does
// not run another simulation or replace observed positions with test fixtures.
if(process.argv.includes('--analyze')){
 const p=folder+'/verification.json',r=JSON.parse(fs.readFileSync(p,'utf8'));r.movement=movement(r);
 assert.equal(r.errors.length,0);assert(r.movement.every(u=>u.distance>10));
 r.initialReportFailure=r.failure;r.reportCorrection='A vehicle destroyed during combat uses its last living position, rather than fabricated zero displacement.';delete r.failure;
 fs.writeFileSync(p,JSON.stringify(r));console.log(JSON.stringify({moved:r.movement.filter(u=>u.distance>10).length,surviving:r.movement.filter(u=>u.alive).length,errors:r.errors}));process.exit(0);
}
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
const report={errors:[]};
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});page.on('pageerror',e=>report.errors.push(e.message));
 await page.addInitScript(()=>{for(const k of ['fieldRadio','fieldSound','fieldStoryVoice'])localStorage.setItem('warGame.'+k,'off');});
 await page.route('**/api/radio/published',r=>r.fulfill({json:{document:JSON.parse(fs.readFileSync('assets/radio/situations_catalog.json','utf8'))}}));
 await page.goto('http://127.0.0.1:8768/campaign/?mission=m02&perf=1');await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:120000});
 await page.locator('#begin').click();await page.waitForFunction(()=>campaign.state.active&&!campaign.state.openingPlaying,null,{timeout:120000});await page.locator('#pause').click();
 await page.evaluate(save=>campaign.mission.load(save),fs.readFileSync('campaign/previews/playtest-WG-045/m02-split-hit.json','utf8'));
 report.start=await page.evaluate(async()=>{
  const {roadDrivingLane}=await import('/campaign/road-merge.js'),c=campaign,m=c.mission,w=c.world;w.fixedRenderScale=1;w.renderer.setPixelRatio(1);document.querySelector('#performance-overlay').hidden=true;c.radio.setEnabled(false);
  const units=m.state.units.filter(u=>u.owner==='rai'),ids=units.map(u=>u.id),origin=units.map(u=>({id:u.id,x:u.x,y:u.y}));
  window.wg={start:m.state.time,rows:[],ids,origin};const original=m.continueTick.bind(m);let last=m.state.time;
  m.continueTick=function(...args){const result=original(...args);if(this.pendingTick||last===this.state.time)return result;last=this.state.time;
   wg.rows.push({time:this.state.time-wg.start,units:ids.map(id=>{const u=this.entity(id);if(!u)return {id,dead:true};const lane=u.path.length?roadDrivingLane(this,u,u.path[0],this.config.worldScale):null;
    return {id,x:u.x,y:u.y,hp:u.hp,speed:u.driveSpeed,heading:u.heading,steering:u.steering,retreat:!!u.combatRetreat,side:u.combatRetreat?.shoulderSide,lane:lane&&{x:lane.x,y:lane.y,shoulder:lane.retreatShoulder},wait:u.navigation?.waitSeconds,reason:u.navigation?.reason};})});return result;};
  const centre={x:units.reduce((s,u)=>s+u.x,0)/units.length,y:units.reduce((s,u)=>s+u.y,0)/units.length};c.select(ids);w.centre(centre,500);return {ids,origin,time:m.state.time};
 });
 console.log('Started native M02 opposing streams',report.start.ids.length);await page.evaluate(()=>wargamePerf.reset());await page.locator('#pause').click();
 await page.waitForFunction(()=>campaign.mission.state.time-wg.start>=6,null,{timeout:25000});await page.locator('#pause').click();
 await page.evaluate(()=>{const units=campaign.mission.state.units.filter(u=>wg.ids.includes(u.id)&&u.hp>0);campaign.world.centre({x:units.reduce((s,u)=>s+u.x,0)/units.length,y:units.reduce((s,u)=>s+u.y,0)/units.length},500);});
 for(const viewport of [{width:1440,height:900},{width:844,height:390},{width:667,height:375}]){await page.setViewportSize(viewport);await page.waitForTimeout(200);await page.screenshot({path:folder+'/opposing-'+viewport.width+'.png'});}
 await page.setViewportSize({width:1440,height:900});await page.locator('#pause').click();await page.waitForFunction(()=>campaign.mission.state.time-wg.start>=20,null,{timeout:40000});await page.locator('#pause').click();
 report.result=await page.evaluate(()=>{wargamePerf.stop();return {trace:wg,performance:wargamePerf.report()};});
 report.movement=movement(report);
 await page.screenshot({path:folder+'/after.png'});console.log(JSON.stringify({movement:report.movement,errors:report.errors}));
 assert.equal(report.errors.length,0);assert(report.movement.every(u=>u.distance>10),'Every member of this opposing-flow scene must make physical progress');
}catch(e){report.failure=e.stack;throw e;}finally{fs.writeFileSync(folder+'/verification.json',JSON.stringify(report));await browser.close();}
