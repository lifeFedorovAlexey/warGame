import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH??'C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const baseline=process.argv.includes('--baseline'),folder='campaign/previews/playtest-WG-013/'+(baseline?'before-captures':'after');fs.mkdirSync(folder,{recursive:true});
const report={baseline,errors:[],cases:[]},browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 page.on('pageerror',e=>report.errors.push(e.stack??e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 await page.addInitScript(()=>{for(const k of ['fieldSound','fieldStoryVoice','fieldRadio'])localStorage.setItem('warGame.'+k,'off');});
 await page.route('**/api/radio/published',r=>r.fulfill({json:{document:JSON.parse(fs.readFileSync('assets/radio/situations_catalog.json','utf8'))}}));
 if(baseline)await page.route('**/campaign/minimap.js',r=>r.fulfill({body:fs.readFileSync('campaign/previews/playtest-WG-013/before/minimap.js','utf8'),contentType:'text/javascript'}));
 await page.route('**/campaign/main.js',r=>r.fulfill({body:fs.readFileSync('campaign/main.js','utf8').replace('ready: true, mission, world, select, radio,',`ready: true, mission, world, select, radio,
 reviewRefresh(){flushUi();world.update(mission,selected,0,false,true);minimapView.render(performance.now());},`),contentType:'text/javascript'}));
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8766')+'/campaign/');await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:120000});
 await page.locator('#begin').click();await page.locator('[data-dream=skip]').click();
 await page.evaluate(()=>{const m=campaign.mission,s=m.entity(m.state.openingScene.signId);s.completed=true;s.progress=1;campaign.radio.setEnabled(false);});
 await page.waitForFunction(()=>campaign.state.active,null,{timeout:30000});await page.locator('#pause').click();
 await page.evaluate(()=>{
  const c=campaign,m=c.mission;c.renderSuspended=true;c.world.controls.enableDamping=false;c.world.fixedRenderScale=1;c.world.renderer.setPixelRatio(1);
  m.visible.fill(255);m.explored.fill(255);m.visibleAt=m.exploredAt=()=>true;m.fogRevision++;
  window.miniReview={unit:m.state.units.filter(u=>u.owner==='rai'&&u.kind==='bukhanka')[1].id};
  miniReview.enemy=m.addUnit('raider','scavs',m.field.gridToWorld([19,50])).id;
  c.select([miniReview.unit]);c.reviewRefresh();
 });
 const refresh=()=>page.evaluate(()=>campaign.reviewRefresh());
 const snapshot=()=>page.evaluate(()=>({camera:campaign.world.controls.target.toArray().slice(0,2),orders:campaign.mission.state.commandOrders?.length??0,last:campaign.mission.state.commandOrders?.at(-1),mode:campaign.state.orderMode,selection:campaign.selected}));
 const at=grid=>page.evaluate(async grid=>{
  const {minimapPosition,minimapPoint}=await import(new URL('./minimap.js',location.href)),m=campaign.mission,r=document.querySelector('#minimap').getBoundingClientRect();
  const p=m.field.gridToWorld(grid),[px,py]=minimapPosition(m.field,p,r.width,r.height,m.state.bounds),x=Math.round(r.left+px),y=Math.round(r.top+py);
  const expected=minimapPoint(m.field,r,x,y,m.state.bounds),nw=m.field.gridToWorld(m.state.bounds.slice(0,2)),se=m.field.gridToWorld(m.state.bounds.slice(2));
  return {x,y,expected:[Math.max(nw.x,Math.min(se.x,expected.x)),Math.max(se.y,Math.min(nw.y,expected.y))]};
 },grid);
 const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
 const resetMode=async()=>{await page.keyboard.press('Escape');await refresh();};
 for(const [width,height] of baseline?[[1440,900]]:[[1440,900],[844,390],[667,375]]){
  await page.setViewportSize({width,height});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await refresh();
  for(const mode of ['default','attack','move']){
   await resetMode();await page.evaluate(()=>{campaign.select([miniReview.unit]);campaign.world.centre(campaign.mission.entity(miniReview.unit),360);campaign.reviewRefresh();});
   if(mode==='attack')await page.locator('#attack-order').click();if(mode==='move')await page.keyboard.press('m');await refresh();
   const before=await snapshot(),p=await at([18,53]);await page.mouse.click(p.x,p.y);await refresh();const after=await snapshot();
   const result={width,height,mode,cameraMoved:distance(before.camera,after.camera),cameraError:distance(p.expected,after.camera),newOrders:after.orders-before.orders,modeAfter:after.mode};report.cases.push(result);
   if(baseline&&mode!=='default'){assert.equal(result.cameraMoved,0);assert.equal(result.newOrders,1);}
   else{assert(result.cameraError<.01,JSON.stringify(result));assert.equal(result.newOrders,0);assert.deepEqual(after.selection,before.selection);assert.equal(after.mode,before.mode);}
   if(mode==='attack')await page.screenshot({path:folder+'/left-attack-'+width+'x'+height+'.png'});
  }
  if(baseline)continue;
  // Dragging in attack mode pans throughout, including pointer capture outside.
  await resetMode();await page.locator('#attack-order').click();await refresh();let before=await snapshot();
  const p=await at([15,53]),q=await at([17,54]);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(q.x,q.y,{steps:4});await page.mouse.up();await refresh();
  let after=await snapshot();assert(distance(after.camera,q.expected)<.01);assert.equal(after.orders,before.orders);
  const dragRect=await page.locator('#minimap').boundingBox();
  await page.mouse.move(q.x,q.y);await page.mouse.down();await page.mouse.move(dragRect.x+dragRect.width+10,dragRect.y-10,{steps:4});await page.mouse.up();await refresh();
  const corner=await page.evaluate(()=>{const m=campaign.mission,p=m.field.gridToWorld([m.state.bounds[2],m.state.bounds[1]]);return[p.x,p.y];});
  after=await snapshot();assert(distance(after.camera,corner)<.01);assert.equal(after.orders,before.orders);
  // Right-clicking preserves the camera and dispatches the actual game order.
  for(const [mode,grid,action] of [['default',[17,55],'move'],['attack',[20,55],'attack-move'],['attack',[19,50],'attack']]){
   await resetMode();if(mode==='attack')await page.locator('#attack-order').click();await refresh();before=await snapshot();
   const pt=await at(grid);await page.mouse.click(pt.x,pt.y,{button:'right'});await refresh();after=await snapshot();
   assert.equal(after.last.action,action);assert.equal(after.orders,before.orders+1);assert(distance(after.camera,before.camera)<.01);
   if(action==='attack')assert.equal(after.last.target.id,await page.evaluate(()=>miniReview.enemy));
   report.cases.push({width,height,button:'right',action,cameraMoved:distance(after.camera,before.camera)});
  }
  // Empty selection and both outer edges never issue accidental orders.
  await resetMode();await page.evaluate(()=>{campaign.select([]);campaign.reviewRefresh();});before=await snapshot();
  const pt=await at([18,54]);await page.mouse.click(pt.x,pt.y,{button:'right'});await refresh();after=await snapshot();assert.equal(after.orders,before.orders);assert(distance(after.camera,before.camera)<.01);
  const rect=await page.locator('#minimap').boundingBox();
  for(const [x,y] of [[rect.x+1,rect.y+1],[rect.x+rect.width-1,rect.y+rect.height-1]]){await page.mouse.click(x,y);await refresh();}
  after=await snapshot();assert.equal(after.orders,before.orders);
  await page.evaluate(()=>{campaign.select([miniReview.unit]);campaign.world.centre(campaign.mission.entity(miniReview.unit),360);campaign.reviewRefresh();});
  const layout=await page.evaluate(()=>{const r=document.querySelector('#minimap').getBoundingClientRect(),w=document.querySelector('#world').getBoundingClientRect();return{mapInside:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,fullWorld:w.width===innerWidth&&w.height===innerHeight};});assert(layout.mapInside&&layout.fullWorld);
  await page.screenshot({path:folder+'/controls-'+width+'x'+height+'.png'});console.log('PASS minimap '+width+'x'+height);
 }
 if(!baseline){
  await resetMode();await page.evaluate(()=>{campaign.select([miniReview.unit]);campaign.reviewRefresh();});
  const p=await at([17,55]);await page.mouse.click(p.x,p.y,{button:'right'});
  const movement=await page.evaluate(()=>{const m=campaign.mission,u=m.entity(miniReview.unit),start={x:u.x,y:u.y};for(let i=0;i<40;i++)m.advance(.1);return Math.hypot(u.x-start.x,u.y-start.y);});
  assert(movement>2,'The selected vehicle actually moves after the minimap order');report.movementAfterFourSeconds=movement;
 }
 assert.deepEqual(report.errors,[]);report.passed=true;
}finally{fs.writeFileSync(folder+'/verification.json',JSON.stringify(report,null,2));await browser.close();}
