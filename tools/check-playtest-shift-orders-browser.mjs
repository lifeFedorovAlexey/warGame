import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH??'C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const baseline=process.argv.includes('--baseline'),folder=process.env.SHIFT_REVIEW_DIR??'campaign/previews/playtest-WG-027/'+(baseline?'before-captures':'after');fs.mkdirSync(folder,{recursive:true});
const report={baseline,errors:[],cases:[]},browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 page.on('pageerror',e=>report.errors.push(e.stack??e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 await page.addInitScript(()=>{for(const k of ['fieldSound','fieldStoryVoice','fieldRadio'])localStorage.setItem('warGame.'+k,'off');});
 await page.route('**/api/radio/published',r=>r.fulfill({json:{document:JSON.parse(fs.readFileSync('assets/radio/situations_catalog.json','utf8'))}}));
 if(baseline)for(const file of ['mission','minimap','command-planner','pickup-orders','builder-auto-repair'])await page.route('**/campaign/'+file+'.js',r=>r.fulfill({body:fs.readFileSync('campaign/previews/playtest-WG-027/before/'+file+'.js','utf8'),contentType:'text/javascript'}));
 await page.route('**/campaign/main.js',r=>r.fulfill({body:fs.readFileSync(baseline?'campaign/previews/playtest-WG-027/before/main.js':'campaign/main.js','utf8').replace('ready: true, mission, world, select, radio,',`ready: true, mission, world, select, radio,
 reviewRefresh(){flushUi();world.update(mission,selected,0,false,true);minimapView.render(performance.now());if(performance.now()>=Math.max(toastUntil,typeof milestoneToastUntil==='number'?milestoneToastUntil:0))$('toast').hidden=true;},`),contentType:'text/javascript'}));
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8768')+'/campaign/');await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:120000});
 await page.locator('#begin').click();await page.locator('[data-dream=skip]').click();
 await page.evaluate(()=>{const m=campaign.mission,s=m.entity(m.state.openingScene.signId);s.completed=true;s.progress=1;campaign.radio.setEnabled(false);});
 await page.waitForFunction(()=>campaign.state.active,null,{timeout:30000});await page.locator('#pause').click();
 await page.evaluate(()=>{
  const c=campaign,m=c.mission;c.renderSuspended=true;c.world.controls.enableDamping=false;c.world.fixedRenderScale=1;c.world.renderer.setPixelRatio(1);
  m.visible.fill(255);m.explored.fill(255);m.visibleAt=m.exploredAt=()=>true;m.fogRevision++;
  window.shiftReview={unit:m.state.units.filter(u=>u.owner==='rai'&&u.kind==='bukhanka')[1].id};
  c.select([shiftReview.unit]);c.world.centre(m.entity(shiftReview.unit),360);c.reviewRefresh();
 });
 await page.waitForTimeout(5500);
 const refresh=()=>page.evaluate(()=>campaign.reviewRefresh());
 const snapshot=()=>page.evaluate(()=>{const u=campaign.mission.entity(shiftReview.unit);return {current:u.proposedOrder??u.pendingOrder,queue:u.orderQueue??[],records:campaign.mission.state.commandOrders?.length??0};});
 for(const [width,height] of [[1440,900],[844,390],[667,375]]){
  await page.setViewportSize({width,height});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.evaluate(()=>{const c=campaign,m=c.mission;m.stop([shiftReview.unit]);c.select([shiftReview.unit]);c.world.centre(m.entity(shiftReview.unit),360);c.reviewRefresh();});
  const points=await page.evaluate(()=>{const r=document.querySelector('#world').getBoundingClientRect();return [.32,.49,.66].map(f=>({x:Math.round(r.width*f),y:Math.round(r.height*.46)}));});
  await page.mouse.click(points[0].x,points[0].y,{button:'right'});await refresh();const first=await snapshot();
  await page.keyboard.down('Shift');
  for(const p of points.slice(1)){await page.mouse.click(p.x,p.y,{button:'right'});await refresh();}
  await page.keyboard.up('Shift');const appended=await snapshot();
  if(baseline){assert.equal(appended.queue.length,0);assert.notEqual(appended.current.revision,first.current.revision);}
  else{assert.equal(appended.queue.length,2);assert.deepEqual(appended.current,first.current);}
  report.cases.push({width,height,surface:'map',first,appended});
  // The same modifier must work through the explicit Move tool and minimap.
  if(!baseline){
   await page.keyboard.press('m');await refresh();await page.keyboard.down('Shift');await page.mouse.click(points[0].x,points[0].y);await page.keyboard.up('Shift');await refresh();
   assert.equal((await snapshot()).queue.length,3);
   const rect=await page.locator('#minimap').boundingBox();await page.keyboard.down('Shift');await page.mouse.click(rect.x+rect.width*.4,rect.y+rect.height*.6,{button:'right'});await page.keyboard.up('Shift');await refresh();
   assert.equal((await snapshot()).queue.length,4);report.cases.push({width,height,surface:'move-tool-and-minimap',snapshot:await snapshot()});
  }
  await page.screenshot({path:folder+'/shift-orders-'+width+'x'+height+'.png'});
  await page.mouse.click(points[0].x,points[0].y,{button:'right'});await refresh();assert.equal((await snapshot()).queue.length,0);
  if(!baseline){
   await page.locator('details.settings > summary').click();await page.locator('#controls-help').click();await refresh();
   assert.match(await page.locator('#control-hints').innerText(),/Добавить приказ в очередь/);
   await page.screenshot({path:folder+'/shift-help-'+width+'x'+height+'.png'});
   await page.locator('details.settings > summary').click();
  }
 }
 if(!baseline){
  await page.setViewportSize({width:1440,height:900});await page.evaluate(()=>new Promise(requestAnimationFrame));
  const points=await page.evaluate(()=>{
   const c=campaign,m=c.mission,u=m.entity(shiftReview.unit);m.stop([u.id]);c.world.centre(u,360);c.reviewRefresh();
   return [35,75,115].map(d=>c.world.screen({x:u.x,y:u.y+d},0));
  });
  const goals=[];
  for(const [i,p] of points.entries()){
   if(i===1)await page.keyboard.down('Shift');await page.mouse.click(p.x,p.y,{button:'right'});await refresh();
   goals.push(await page.evaluate(()=>{const u=campaign.mission.entity(shiftReview.unit);return u.orderQueue?.at(-1)?.target??(u.proposedOrder??u.pendingOrder).target;}));
  }
  await page.keyboard.up('Shift');
  report.movement=await page.evaluate(goals=>{
   const m=campaign.mission,u=m.entity(shiftReview.unit),visited=[],start=m.state.time;
   for(let n=0;n<1000;n++){
    m.advance(.1);m.effects=[];
    if(visited.length<goals.length&&Math.hypot(u.x-goals[visited.length].x,u.y-goals[visited.length].y)<3)visited.push({x:u.x,y:u.y,time:m.state.time});
    if(!u.task&&!u.path.length&&!u.pendingOrder&&!u.proposedOrder&&!u.orderQueue?.length)break;
   }
   campaign.reviewRefresh();return {goals,visited,seconds:m.state.time-start,final:{x:u.x,y:u.y,task:u.task,pending:u.pendingOrder,queue:u.orderQueue}};
  },goals);
  assert.equal(report.movement.visited.length,3,JSON.stringify(report.movement));
  await page.screenshot({path:folder+'/shift-orders-arrived.png'});
 }
 assert.deepEqual(report.errors,[]);report.passed=true;console.log(JSON.stringify({passed:true,baseline,cases:report.cases.length}));
}finally{fs.writeFileSync(folder+'/verification.json',JSON.stringify(report,null,2));await browser.close();}
