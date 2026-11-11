import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH??'C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const baseline=process.argv.includes('--baseline'),folder='campaign/previews/playtest-WG-001-004'+(baseline?'/before':'');
fs.mkdirSync(folder,{recursive:true});
const report={baseline,errors:[]};
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 page.on('pageerror',e=>report.errors.push(e.stack??e.message));
 page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 page.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());});
 await page.addInitScript(()=>{for(const key of ['fieldRadio','fieldSound','fieldStoryVoice'])localStorage.setItem('warGame.'+key,'off');});
 if(baseline)for(const name of ['mission.js','camp-demolition.js','mission-results.js','oil-economy.js','world.js'])await page.route('**/campaign/'+name,route=>route.fulfill({body:fs.readFileSync('campaign/previews/playtest-WG-001-004/before/'+name,'utf8'),contentType:'text/javascript'}));
 // Expose the existing HUD refresh for paused, deterministic captures.
 // No visual styles or gameplay code are replaced by this instrumentation.
 await page.route('**/campaign/main.js',route=>route.fulfill({body:fs.readFileSync('campaign/main.js','utf8').replace('ready: true, mission, world, select, radio,',`ready: true, mission, world, select, radio,
 reviewRefreshUi(){flushUi();minimapView.render(performance.now());if(performance.now()>=toastUntil)$('toast').hidden=true;},`),contentType:'text/javascript'}));
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8766')+'/campaign/?damage=1');
 await page.waitForFunction(()=>window.campaign?.damageDebug,null,{timeout:120000});
 await page.locator('#begin').click();await page.locator('[data-dream=skip]').click({timeout:60000});
 await page.evaluate(()=>{const m=campaign.mission;campaign.radio.setEnabled(false);const sign=m.entity(m.state.openingScene.signId);sign.completed=true;sign.progress=1;});
 await page.waitForFunction(()=>campaign.state.active,null,{timeout:30000});await page.locator('#pause').click();
 await page.evaluate(async()=>{
  const c=campaign,m=c.mission,w=c.world;
  c.renderSuspended=true;c.damageDebug.panel.hidden=true;m.state.bounds=m.config.finalMapBounds.slice();m.state.flags.lastRevealed=true;
  m.visible.fill(255);m.explored.fill(255);m.visionSources.push({x:63.5,y:63.5,radius:200});m.fogRevision++;m.visibleAt=m.exploredAt=()=>true;
  w.fixedRenderScale=1;w.renderer.setPixelRatio(1);w.controls.enableDamping=false;
  window.review={isWall:b=>b.kind==='scav-fence'||b.kind==='scav-gate',render(dt=0){w.update(m,new Set(this.selected??[]),dt,false,true);},view(e,d=160){c.damageDebug.view(e.id,d);this.render();},advance(seconds){for(let t=0;t<seconds-1e-8;t+=.1){m.advance(.1);this.render(.1);}}};
  review.ready=(await import('./mission-results.js')).resultsPresentationReady;
  m.state.units=m.state.units.filter(u=>u.owner==='rai');
  for(const [i,kind] of ['generator','derrick','factory','lab','bunker','bunker'].entries())m.addStructure(kind,'rai',{x:100+i*160,y:100},{completed:true,progress:1});
  m.state.statistics.produced=1;m.state.flags.raidWon=true;for(const key of Object.keys(m.config.research))m.state.research[key]=true;
  const camp=m.state.camps[3];review.campId=camp.id;review.last=m.state.buildings.find(b=>b.campId===camp.id&&b.kind==='camp-core');
  for(const b of m.state.buildings)if(b.owner==='scavs'&&!review.isWall(b)&&b!==review.last)m.damage(b,b.hp);
  m.rebuildNavigation();m.updateMission();review.view(review.last,500);
 });
 const capture=async name=>{
  for(const [suffix,width,height] of [['desktop',1440,900],['landscape',844,390],['landscape-small',667,375]]){
   await page.setViewportSize({width,height});await page.evaluate(()=>new Promise(requestAnimationFrame));await page.evaluate(()=>{campaign.select(review.selected??[],false,false);campaign.reviewRefreshUi();review.render();});
   await page.screenshot({path:folder+'/'+name+'-'+suffix+'.png'});
   const layout=await page.evaluate(()=>({width:document.documentElement.scrollWidth,height:document.querySelector('#world').getBoundingClientRect().height}));assert.equal(layout.width,width);assert.equal(layout.height,height);
  }
  await page.setViewportSize({width:1440,height:900});await page.evaluate(()=>new Promise(requestAnimationFrame));
 };
 await capture('WG-001-before-last-hit');
 report.perimeter=await page.evaluate(()=>{const m=campaign.mission;m.damage(review.last,review.last.hp);m.updateMission();review.advance(10);return {status:m.state.status,walls:m.state.buildings.filter(b=>b.campId===review.campId&&review.isWall(b)).map(b=>({id:b.id,hp:b.hp})),obstacles:m.nav.solids.filter(b=>b.campId===review.campId&&review.isWall(b)).length,resultsReady:review.ready(m,campaign.radio)};});
 if(!baseline){assert.equal(report.perimeter.status,'victory');assert.equal(report.perimeter.walls.length,0);assert.equal(report.perimeter.obstacles,0);assert(report.perimeter.resultsReady);}
 else assert(report.perimeter.walls.some(b=>b.hp>0));
 await capture('WG-001-after-victory');console.log('PASS WG-001 browser');
 report.blueprint=await page.evaluate(()=>{
  const m=campaign.mission,w=campaign.world;m.drainEffects();m.drainEvents();w.damage.reset();
  Object.assign(m.state,{status:'running',units:[],buildings:[],camps:[],artifacts:[],raidReserve:[],pendingCinematics:[],energy:1000,storyConstruction:{enabled:false}});m.state.flags.raidWon=true;
  const p=m.field.gridToWorld(m.config.startGrid),builder=m.addUnit('builder','rai',{x:p.x-70,y:p.y});m.rebuildNavigation();review.builder=builder;
  for(let dx=60;dx<=240;dx+=30)for(let dy=30;dy<=240;dy+=30){const result=m.build([builder.id],'bunker',p.x+dx,p.y+dy,0,{snap:false});if(result.ok){review.plan=m.entity(result.id);review.selected=[result.id];review.view(review.plan,130);return {hp:review.plan.hp,maxHp:review.plan.maxHp,progress:review.plan.progress,energy:m.state.energy};}}
  throw new Error('No valid bunker placement');
 });
 await capture('WG-004-blueprint');
 report.hit=await page.evaluate(()=>{const m=campaign.mission,b=review.plan;m.updateEconomy(2);m.damage(b,1,{id:'enemy',kind:'raider',owner:'scavs',x:b.x+40,y:b.y});m.rebuildNavigation();review.render(.1);return {hp:b.hp,energy:m.state.energy,reserved:m.state.buildings.filter(b=>b.hp>0).length,wreck:!!b.damage?.wreck,visible:campaign.world.buildingObjects.get(b.id)?.visible!==false};});
 if(!baseline){assert.equal(report.blueprint.hp,1);assert.equal(report.hit.hp,0);assert.equal(report.hit.energy,1000);assert(!report.hit.wreck);assert(!report.hit.visible);}
 else{assert.equal(report.blueprint.hp,800);assert.equal(report.hit.hp,799);}
 await capture('WG-004-after-hit');
 if(!baseline){
  report.work=await page.evaluate(()=>{
   const m=campaign.mission,old=review.plan;m.state.buildings=[];m.rebuildNavigation();
   const result=m.build([review.builder.id],'bunker',old.x,old.y,0,{snap:false});if(!result.ok)throw new Error(result.reason);review.plan=m.entity(result.id);review.selected=[result.id];
   let steps=0;while(review.plan.progress<.5&&steps++<1500){m.advance(.1);if(steps%10===0)review.render(.1);}
   review.render();return {hp:review.plan.hp,maxHp:review.plan.maxHp,progress:review.plan.progress,steps,working:review.builder.builderWorking};
  });
  assert(report.work.progress>=.5,'The real builder must start and perform construction');assert(report.work.hp<report.work.maxHp);
  await capture('WG-004-half-built');
  report.completed=await page.evaluate(()=>{review.advance(40);return {hp:review.plan.hp,maxHp:review.plan.maxHp,completed:review.plan.completed};});assert(report.completed.completed);assert.equal(report.completed.hp,report.completed.maxHp);
  await capture('WG-004-completed');
  report.cancel=await page.evaluate(()=>{
   const m=campaign.mission,b=review.plan;m.state.buildings=[];m.rebuildNavigation();m.state.energy=1000;
   const result=m.build([review.builder.id],'bunker',b.x,b.y,0,{snap:false});if(!result.ok)throw new Error(result.reason);
   review.plan=m.entity(result.id);review.render();m.updateEconomy(2);const cancelled=m.cancelBuilding(result.id);review.render();
   return {ok:cancelled.ok,energy:m.state.energy,hp:review.plan.hp,visible:campaign.world.buildingObjects.get(result.id)?.visible!==false};
  });assert(report.cancel.ok);assert.equal(report.cancel.energy,1000);assert.equal(report.cancel.hp,0);assert(!report.cancel.visible);
  await capture('WG-004-after-cancel');
 }
 console.log('PASS WG-004 browser');assert.deepEqual(report.errors,[]);
}finally{fs.writeFileSync(folder+'/verification.json',JSON.stringify(report,null,2));await browser.close();}
