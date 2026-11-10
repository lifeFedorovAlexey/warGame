import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH??'C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const folder=process.env.FACTORY_REVIEW_DIR??'campaign/previews/factory-priorities';fs.mkdirSync(folder,{recursive:true});const report={errors:[],captures:[]};
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 page.on('pageerror',e=>report.errors.push(e.stack??e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 page.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());});
 await page.addInitScript(()=>{for(const key of ['fieldRadio','fieldSound','fieldStoryVoice'])localStorage.setItem('warGame.'+key,'off');});
 await page.route('**/api/radio/published',route=>route.fulfill({json:{document:JSON.parse(fs.readFileSync('assets/radio/situations_catalog.json','utf8'))}}));
 await page.route('**/campaign/main.js',route=>route.fulfill({body:fs.readFileSync('campaign/main.js','utf8').replace('ready: true, mission, world, select, radio,',`ready: true, mission, world, select, radio,
 reviewRefreshUi(){flushUi();minimapView.render(performance.now());if(performance.now()>=Math.max(toastUntil,typeof milestoneToastUntil==='number'?milestoneToastUntil:0))$('toast').hidden=true;},`),contentType:'text/javascript'}));
 console.log('Loading campaign');await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8766')+'/campaign/?damage=1');await page.waitForFunction(()=>window.campaign?.damageDebug,null,{timeout:120000});
 await page.locator('#begin').click();await page.locator('[data-dream=skip]').click({timeout:60000});
 await page.evaluate(()=>{const m=campaign.mission;campaign.radio.setEnabled(false);const sign=m.entity(m.state.openingScene.signId);sign.completed=true;sign.progress=1;});
 await page.waitForFunction(()=>campaign.state.active,null,{timeout:30000});await page.locator('#pause').click();
 await page.evaluate(()=>{
  const c=campaign,m=c.mission,w=c.world;c.renderSuspended=true;c.damageDebug.panel.hidden=true;
  Object.assign(m.state,{units:[],buildings:[],camps:[],artifacts:[],raidReserve:[],pendingCinematics:[],energy:2400,bounds:[0,0,127,127],storyConstruction:{enabled:false}});m.state.flags.raidWon=true;
  m.visible.fill(255);m.explored.fill(255);m.visionSources=[{x:63.5,y:63.5,radius:200}];m.fogRevision++;m.visibleAt=m.exploredAt=()=>true;w.fixedRenderScale=1;w.renderer.setPixelRatio(1);w.controls.enableDamping=false;
  window.review={factories:[],refresh(){c.reviewRefreshUi();w.update(m,new Set(c.selected),0,false,true);},frame(){const f=this.factories[0],z=f.groundHeight,narrow=innerWidth<900;w.controls.target.set(f.x+(narrow?0:62),f.y-10,z+15);w.camera.position.set(f.x+(narrow?120:180),f.y-(narrow?230:330),z+(narrow?290:420));w.controls.update();this.refresh();}};
  for(const [i,x] of [-1656,-1456].entries()){
   const f=m.addStructure('factory','rai',{x,y:472},{completed:true,progress:1,groundHeight:m.field.heightAt(x,472)});review.factories.push(f);f.workPriority=i?'production':'repair';
   for(let n=0;n<2;n++){
    const u=m.addUnit('bukhanka','rai',{x,y:472});u.hp=u.maxHp*.4;u.factoryVisit={factoryId:f.id,phase:'inside',arrived:n,queued:0,repairStartHp:u.hp};u.combatRetreat={status:'servicing',home:{id:f.id}};
    f.queue.push({kind:'bukhanka',cost:130,progress:i&&n===0?.4:0,funding:{paid:130},orderSerial:i*2+n,autoFactory:true});
   }
  }
  m.rebuildNavigation();m.updateEconomy(1);c.select([]);review.frame();
 });
 await page.locator('#production-toggle').click();await page.mouse.move(20,200);
 // Let the opening objective toast expire before inspecting the roof lettering.
 await page.waitForTimeout(5500);await page.evaluate(()=>review.refresh());
 const capture=async name=>{
  for(const [suffix,width,height] of [['desktop',1440,900],['landscape',844,390],['landscape-small',667,375]]){
   await page.setViewportSize({width,height});await page.evaluate(()=>new Promise(requestAnimationFrame));await page.evaluate(()=>review.frame());
   const layout=await page.evaluate(()=>({width:document.documentElement.scrollWidth,height:document.querySelector('#world').getBoundingClientRect().height,
    overflow:[...document.querySelectorAll('[data-factory-row] button')].filter(b=>{const r=b.getBoundingClientRect();return r.width&&(r.left<0||r.right>innerWidth||r.bottom>innerHeight);}).map(b=>b.ariaLabel),
    boards:review.factories.map(f=>campaign.world.buildingObjects.get(f.id).getObjectByName('factory_status_board')?.userData.status)}));
   assert.equal(layout.width,width);assert.equal(layout.height,height);assert.deepEqual(layout.overflow,[]);assert(layout.boards.every(Boolean));report.captures.push({name,suffix,...layout});
   await page.screenshot({path:folder+'/'+name+'-'+suffix+'.png'});
  }
 };
 await capture('WG-034-priorities');
 // A real close camera view shows how the tally sits between the roof monitors.
 await page.setViewportSize({width:1100,height:700});await page.evaluate(()=>new Promise(requestAnimationFrame));
 await page.evaluate(()=>{const f=review.factories[0],w=campaign.world,z=f.groundHeight;w.controls.target.set(f.x,f.y,z+16);w.camera.position.set(f.x+100,f.y-175,z+220);w.controls.update();review.refresh();});
 await page.screenshot({path:folder+'/WG-034-roof-close.png'});
 await page.setViewportSize({width:1440,height:900});await page.evaluate(()=>new Promise(requestAnimationFrame));await page.evaluate(()=>review.frame());
 const priority=page.locator('[data-factory-priority]').first();assert.match(await priority.getAttribute('title'),/Сначала ремонт, затем сборка/);
 assert.equal(await priority.locator('.production-count').textContent(),'2');await priority.click();await page.evaluate(()=>review.refresh());assert.match(await priority.getAttribute('title'),/Сначала сборка, затем ремонт/);
 report.switch=await page.evaluate(()=>{const m=campaign.mission,f=review.factories[0],u=m.state.units.find(u=>u.factoryVisit?.factoryId===f.id),hp=u.hp,p=f.queue[0].progress;m.updateEconomy(1);review.refresh();return {priority:f.workPriority,hpBefore:hp,hpAfter:u.hp,progressBefore:p,progressAfter:f.queue[0].progress};});
 assert.equal(report.switch.hpAfter,report.switch.hpBefore);assert(report.switch.progressAfter>report.switch.progressBefore);
 // Finish the queued assembly in the ordinary economy, then observe repair.
 report.next=await page.evaluate(()=>{const m=campaign.mission,f=review.factories[0],cars=m.state.units.filter(u=>u.factoryVisit?.factoryId===f.id);
  for(let n=0;n<800&&f.queue.length;n++){m.state.time+=.1;m.updateEconomy(.1);m.state.units=m.state.units.filter(u=>u.factoryVisit);m.rebuildNavigation();}
  const hp=cars[0].hp;m.updateEconomy(1);review.refresh();return {orders:f.queue.length,hpBefore:hp,hpAfter:cars[0].hp};});
 assert.equal(report.next.orders,0);assert(report.next.hpAfter>report.next.hpBefore);await capture('WG-034-after-production');
 // A click in an overloaded row still chooses the factory that finishes sooner.
 report.order=await page.evaluate(()=>{const m=campaign.mission,[a,b]=review.factories;a.queue=Array.from({length:3},(_,i)=>({kind:'builder',cost:150,progress:0,funding:{paid:150},orderSerial:20+i}));b.queue=[];m.state.energy=2400;review.refresh();return {a:a.id,b:b.id};});
 await page.locator('[data-factory-row]').first().locator('[data-factory-production]').first().click();
 assert.equal(await page.evaluate(()=>review.factories[1].queue.length),1);await page.evaluate(()=>review.refresh());
 // Model lifecycle: no sign survives a destroyed or removed factory.
 const lifecycle=await page.evaluate(()=>{const m=campaign.mission,f=review.factories[0],w=campaign.world,save=m.save();f.hp=0;review.refresh();const removed=!w.buildingObjects.get(f.id).getObjectByName('factory_status_board');m.load(save);review.factories=review.factories.map(f=>m.entity(f.id));review.refresh();return {removed,restored:!!w.buildingObjects.get(f.id).getObjectByName('factory_status_board')};});
 assert.deepEqual(lifecycle,{removed:true,restored:true});report.lifecycle=lifecycle;
 report.physical=[];
 for(const priority of ['repair','production'])report.physical.push(await page.evaluate(priority=>{
  const m=campaign.mission,f=review.factories[0];m.state.buildings=[f];m.state.units=[];m.state.energy=2000;m.updateMission=()=>{};f.workPriority=priority;f.producedCount=0;delete f.exitBlocked;delete f.exitRetryAt;delete f.exitYield;
  f.queue=Array.from({length:2},(_,i)=>({kind:'bukhanka',cost:130,progress:0,funding:{paid:130},orderSerial:30+i}));
  const cars=Array.from({length:2},(_,i)=>{const u=m.addUnit('bukhanka','rai',{x:f.x,y:f.y-13.5});u.hp=100;u.factoryVisit={garageVersion:2,factoryId:f.id,phase:'inside',slot:i,arrived:i,factory:{...f,queue:[]}};u.combatRetreat={forced:true,status:'servicing',home:{id:f.id}};return u;});
  m.rebuildNavigation();let steps=0;
  while(steps++<2000&&(f.queue.length||cars.some(u=>u.factoryVisit||u.hp<u.maxHp))){m.advance(.1);m.finishPendingStep();m.effects=[];}
  review.factories=[f];review.refresh();return {priority,steps,orders:f.queue.length,produced:f.producedCount,cars:cars.map(u=>({hp:u.hp,maxHp:u.maxHp,phase:u.factoryVisit?.phase??null,x:u.x,y:u.y,reason:u.navigation?.reason}))};
 },priority));
 for(const result of report.physical){assert.equal(result.orders,0,JSON.stringify(result));assert.equal(result.produced,2);assert(result.cars.every(u=>u.hp===u.maxHp&&!u.phase),JSON.stringify(result));}
 assert.deepEqual(report.errors,[]);console.log('PASS priorities, physical repair and production exits, automatic row orders, roof board lifecycle, desktop and two landscape widths');
}finally{fs.writeFileSync(folder+'/browser.json',JSON.stringify(report,null,2));await browser.close();}
