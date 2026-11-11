import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH??'C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const baseline=process.argv.includes('--baseline'),folder=process.env.ROUTE_REVIEW_DIR??'campaign/previews/playtest-WG-014-015/'+(baseline?'before-captures':'after');fs.mkdirSync(folder,{recursive:true});
const report={baseline,errors:[],cases:[]},browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 page.on('pageerror',e=>report.errors.push(e.stack??e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 await page.addInitScript(()=>{for(const k of ['fieldSound','fieldStoryVoice','fieldRadio'])localStorage.setItem('warGame.'+k,'off');});
 await page.route('**/api/radio/published',r=>r.fulfill({json:{document:JSON.parse(fs.readFileSync('assets/radio/situations_catalog.json','utf8'))}}));
 if(baseline)await page.route('**/campaign/world.js',r=>r.fulfill({body:fs.readFileSync('campaign/previews/playtest-WG-014-015/before/world.js','utf8'),contentType:'text/javascript'}));
 await page.route('**/campaign/main.js',r=>r.fulfill({body:fs.readFileSync(baseline?'campaign/previews/playtest-WG-014-015/before/main.js':'campaign/main.js','utf8').replace('ready: true, mission, world, select, radio,',`ready: true, mission, world, select, radio,
 reviewRefresh(){flushUi();world.update(mission,selected,0,false,true);minimapView.render(performance.now());if(performance.now()>=Math.max(toastUntil,typeof milestoneToastUntil==='number'?milestoneToastUntil:0))$('toast').hidden=true;},`),contentType:'text/javascript'}));
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8768')+'/campaign/');await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:120000});
 await page.locator('#begin').click();await page.locator('[data-dream=skip]').click();
 await page.evaluate(()=>{const m=campaign.mission,s=m.entity(m.state.openingScene.signId);s.completed=true;s.progress=1;campaign.radio.setEnabled(false);});
 await page.waitForFunction(()=>campaign.state.active,null,{timeout:30000});await page.locator('#pause').click();
 await page.evaluate(()=>{
  const c=campaign,m=c.mission;c.renderSuspended=true;c.world.controls.enableDamping=false;c.world.fixedRenderScale=1;c.world.renderer.setPixelRatio(1);
  m.visible.fill(255);m.explored.fill(255);m.visibleAt=m.exploredAt=()=>true;m.fogRevision++;
  window.routeReview={ids:m.state.units.filter(u=>u.owner==='rai'&&u.kind==='bukhanka').map(u=>u.id)};
  routeReview.unit=routeReview.ids[1];c.select([routeReview.unit]);c.world.centre(m.entity(routeReview.unit),360);c.reviewRefresh();
 });
 await page.waitForTimeout(5500);
 const refresh=async()=>{await page.waitForTimeout(120);await page.evaluate(()=>campaign.reviewRefresh());};
 const snapshot=()=>page.evaluate(()=>{
  const m=campaign.mission,u=m.entity(routeReview.unit),view=campaign.world.orderRoutes;
  return {task:u.task,pending:u.proposedOrder??u.pendingOrder,queue:u.orderQueue??[],routes:view?.snapshot??[],stats:view?.statistics??null,
   layerMeshes:view?.root.children.filter(o=>o.isMesh).map(o=>o.name)??[],
   transient:campaign.world.scene.children.filter(o=>o.geometry?.parameters?.innerRadius===6&&o.geometry?.parameters?.outerRadius===7).some(o=>o.visible)};
 });
 for(const [width,height] of [[1440,900],[844,390],[667,375]]){
  await page.setViewportSize({width,height});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  for(const scenario of baseline?['queue','attack','group']:['queue','attack','group','attack-group','enemy']){
   await page.keyboard.press('Escape');await page.evaluate(scenario=>{
    const c=campaign,m=c.mission;m.stop(routeReview.ids);c.select(scenario.endsWith('group')?routeReview.ids:[routeReview.unit]);
    if(scenario==='enemy'){const u=m.entity(routeReview.unit),enemy=m.addUnit('raider','scavs',{x:u.x+70,y:u.y+100});enemy.hp=enemy.maxHp=10000;routeReview.enemy=enemy.id;}
    c.world.centre(m.entity(routeReview.unit),360);c.reviewRefresh();
   },scenario);
   if(scenario.startsWith('attack')||scenario==='enemy')await page.keyboard.press('f');await refresh();
   const points=await page.evaluate(scenario=>{const c=campaign,u=c.mission.entity(routeReview.unit);if(scenario==='enemy')return[c.world.screen(c.mission.entity(routeReview.enemy),3)];return(scenario.startsWith('attack')?[[45,105]]:[[-50,30],[-50,105],[65,105]]).map(([dx,dy])=>c.world.screen({x:u.x+dx,y:u.y+dy},0));},scenario);
   for(const [i,p] of points.entries()){
    if(i===1)await page.keyboard.down('Shift');assert(p.x>5&&p.x<width-5&&p.y>40&&p.y<height-60,JSON.stringify(p));await page.mouse.click(p.x,p.y,{button:'right'});await refresh();
   }
   await page.keyboard.up('Shift');
   if(!baseline)await page.evaluate(()=>{const m=campaign.mission;for(let i=0;i<3000&&routeReview.ids.some(id=>{const u=m.entity(id);return u.pendingOrder||u.proposedOrder;});i++)m.advance(0,{budgetMs:6});campaign.reviewRefresh();});
   await page.waitForTimeout(1300);await refresh();
   const result=await snapshot();assert(!result.transient,'The one-second click ring has expired');
   assert(result.pending||result.task,'The actual order was accepted');
   if(baseline)assert.equal(result.routes.length,0);
   else{assert.equal(result.routes.length,1,JSON.stringify(result));assert.equal(result.routes[0].points.length,points.length);assert.equal(result.routes[0].points[0].action,scenario==='enemy'?'attack':scenario.startsWith('attack')?'attack-move':'move');if(scenario.endsWith('group'))assert.equal(result.routes[0].units.length,3);}
   if(!baseline){
    assert.deepEqual(result.layerMeshes,['order_destination_marks']);assert.equal(result.stats.drawCalls,1);
    if(scenario!=='enemy'){
     assert.equal(result.stats.placements,scenario.endsWith('group')?3:1);
     assert.equal(result.stats.markers,points.length-1+result.stats.placements);
     const goals=await page.evaluate(()=>routeReview.ids.map(id=>{const u=campaign.mission.entity(id);return{id,goal:u.routeOrder?.destination};}));
     for(const p of result.routes[0].placements){const goal=goals.find(u=>u.id===p.unit).goal;assert.deepEqual([p.x,p.y],[goal.x,goal.y]);}
    }else assert.equal(result.routes[0].points[0].targetId,await page.evaluate(()=>routeReview.enemy));
   }
   report.cases.push({width,height,scenario,...result});await page.screenshot({path:folder+'/'+scenario+'-'+width+'x'+height+'.png'});
   if(scenario==='enemy'){
    if(width===1440){
     const capture=()=>page.evaluate(()=>{
      const w=campaign.world,r=w.renderer,gl=r.getContext(),p=w.orderRoutes.snapshot[0].points[0],s=w.screen(p,.8),size=150;
      const x=Math.round(s.x)-size/2,y=innerHeight-Math.round(s.y)-size/2,pixels=new Uint8Array(size*size*4);
      r.render(w.scene,w.camera);gl.readPixels(x,y,size,size,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return Array.from(pixels);
     });
     const before=await capture();await page.waitForTimeout(700);await refresh();const after=await capture();
     let changed=0;for(let i=0;i<before.length;i+=4)if(Math.abs(before[i]-after[i])+Math.abs(before[i+1]-after[i+1])+Math.abs(before[i+2]-after[i+2])>50)changed++;
     assert(changed>40,'The target reticle must visibly rotate');report.rotation={changedPixels:changed,targetId:result.routes[0].points[0].targetId};
     await page.screenshot({path:folder+'/enemy-rotated-1440x900.png'});
    }
    const tracked=await page.evaluate(()=>{const c=campaign,m=c.mission,enemy=m.entity(routeReview.enemy);enemy.x+=20;c.reviewRefresh();return {x:enemy.x,point:c.world.orderRoutes.snapshot[0].points[0]};});
    await refresh();assert.equal((await snapshot()).routes[0].points[0].x,tracked.x);
    await page.evaluate(()=>{const m=campaign.mission;m.stop(routeReview.ids);m.state.units=m.state.units.filter(u=>u.id!==routeReview.enemy);delete routeReview.enemy;campaign.reviewRefresh();});
   }
  }
 }
 if(!baseline){
  await page.evaluate(()=>{const m=campaign.mission,u=m.entity(routeReview.unit);m.submitOrder([u.id],'move',{x:u.x,y:u.y+90});campaign.reviewRefresh();});await refresh();
  await page.evaluate(()=>{campaign.select([]);campaign.reviewRefresh();});await refresh();assert.equal((await snapshot()).routes.length,0);
  await page.evaluate(()=>{campaign.select([routeReview.unit]);campaign.reviewRefresh();});await refresh();assert.equal((await snapshot()).routes.length,1);
  await page.evaluate(()=>{campaign.mission.stop(routeReview.ids);campaign.reviewRefresh();});await refresh();assert.equal((await snapshot()).routes.length,0);
  report.lifecycle=['deselection hides','reselection restores','Stop clears'];
  await page.setViewportSize({width:1440,height:900});await page.evaluate(()=>new Promise(requestAnimationFrame));
  await page.evaluate(()=>{
   const c=campaign,m=c.mission,u=m.entity(routeReview.unit);routeReview.goals=[35,75,115].map(d=>({x:u.x,y:u.y+d}));
   for(const [i,p] of routeReview.goals.entries())m.submitOrder([u.id],'move',p,{append:i>0});
   for(let i=0;i<1000&&u.pendingOrder;i++)m.advance(0,{budgetMs:6});
   c.world.centre(u,360);c.reviewRefresh();
  });await refresh();assert.equal((await snapshot()).routes[0].points[0].state,'active');
  await page.screenshot({path:folder+'/active-route-1440x900.png'});
  report.saved=await page.evaluate(()=>{const m=campaign.mission;const before=campaign.world.orderRoutes.snapshot.map(r=>r.points);m.load(m.save());campaign.reviewRefresh();return {before,after:campaign.world.orderRoutes.snapshot.map(r=>r.points)};});assert.deepEqual(report.saved.after,report.saved.before);
  report.progress=await page.evaluate(()=>{
   const c=campaign,m=c.mission,u=m.entity(routeReview.unit),visited=[],counts=[];
   for(let i=0;i<1000;i++){
    m.advance(.1);m.effects=[];c.reviewRefresh();
    const count=c.world.orderRoutes.statistics.points;if(counts.at(-1)!==count)counts.push(count);
    if(visited.length<routeReview.goals.length&&Math.hypot(u.x-routeReview.goals[visited.length].x,u.y-routeReview.goals[visited.length].y)<3)visited.push({x:u.x,y:u.y});
    if(!u.task&&!u.path.length&&!u.pendingOrder&&!u.orderQueue?.length)break;
   }
   c.reviewRefresh();return {visited,counts,final:c.world.orderRoutes.statistics};
  });assert.equal(report.progress.visited.length,3);assert.deepEqual(report.progress.counts,[3,2,1,0]);assert.equal(report.progress.final.drawCalls,0);
  // Actual rendered pixels must remain legible at both close and distant zoom.
  await page.evaluate(()=>{const m=campaign.mission,u=m.entity(routeReview.unit);m.submitOrder([u.id],'attack-move',{x:u.x+60,y:u.y+80});campaign.reviewRefresh();});await refresh();
  report.zoom=[];
  for(const distance of [260,700,1600]){
   await page.evaluate(distance=>{const c=campaign,p=c.world.orderRoutes.snapshot[0].points[0];c.world.centre(p,distance);c.reviewRefresh();},distance);await refresh();
   const pixels=await page.evaluate(()=>{
    const w=campaign.world,renderer=w.renderer,gl=renderer.getContext(),p=w.orderRoutes.snapshot[0].points[0],screen=w.screen(p,.6);
    const x=Math.round(screen.x)-22,y=innerHeight-Math.round(screen.y)-22,width=70,height=70;
    const before=new Uint8Array(width*height*4),after=new Uint8Array(before.length);
    renderer.render(w.scene,w.camera);gl.readPixels(x,y,width,height,gl.RGBA,gl.UNSIGNED_BYTE,after);
    w.orderRoutes.root.visible=false;renderer.render(w.scene,w.camera);gl.readPixels(x,y,width,height,gl.RGBA,gl.UNSIGNED_BYTE,before);w.orderRoutes.root.visible=true;renderer.render(w.scene,w.camera);
    let changed=0;for(let i=0;i<after.length;i+=4)if(Math.abs(after[i]-before[i])+Math.abs(after[i+1]-before[i+1])+Math.abs(after[i+2]-before[i+2])>35)changed++;
    return {changed,screen,drawCalls:w.orderRoutes.statistics.drawCalls};
   });assert(pixels.changed>45,JSON.stringify(pixels));assert.equal(pixels.drawCalls,1);report.zoom.push({distance,...pixels});
   await page.screenshot({path:folder+'/attack-zoom-'+distance+'.png'});
  }
 }
 assert.deepEqual(report.errors,[]);report.passed=true;console.log(JSON.stringify({passed:true,baseline,cases:report.cases.length}));
}finally{fs.writeFileSync(folder+'/verification.json',JSON.stringify(report,null,2));await browser.close();}
