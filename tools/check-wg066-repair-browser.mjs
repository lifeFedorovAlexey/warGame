import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH??'C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const before=process.argv.includes('--before'),url=process.env.WARGAME_URL??`http://127.0.0.1:${before?8766:8788}`;
const dir='docs/playtest-evidence/wg066';fs.mkdirSync(dir,{recursive:true});
const report={before,errors:[],captures:[],events:[]};
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 page.on('pageerror',e=>report.errors.push(e.stack??e.message));
 await page.addInitScript(()=>{for(const key of ['fieldRadio','fieldSound','fieldStoryVoice'])localStorage.setItem('warGame.'+key,'off');});
 await page.route('**/api/radio/published',route=>route.fulfill({json:{document:JSON.parse(fs.readFileSync('assets/radio/situations_catalog.json','utf8'))}}));
 await page.route('**/campaign/main.js',async route=>{
  const response=await route.fetch();
  await route.fulfill({response,body:(await response.text()).replace('ready: true, mission, world, select, radio,',
   'ready: true, mission, world, select, radio, reviewRefreshUi(){flushUi();minimapView.render(performance.now());},')});
 });
 console.log('Loading '+url);await page.goto(url+'/campaign/');
 await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:120000});
 await page.locator('#begin').click();await page.locator('[data-dream=skip]').click({timeout:60000});
 await page.waitForFunction(()=>campaign.mission.state.openingScene?.signId,null,{timeout:30000});
 await page.evaluate(()=>{const c=campaign,m=c.mission;c.radio.setEnabled(false);const sign=m.entity(m.state.openingScene.signId);sign.completed=true;sign.progress=1;});
 await page.waitForFunction(()=>campaign.state.active,null,{timeout:30000});await page.locator('#pause').click();
 report.initial=await page.evaluate(async()=>{
  const {factoryPoint}=await import('/campaign/factory-garage.js'),{factoryRepairQueue}=await import('/campaign/factory-routing.js');
  const c=campaign,m=c.mission,w=c.world;c.renderSuspended=true;m.updateMission=()=>{};
  Object.assign(m.state,{units:[],buildings:[],camps:[],raidReserve:[],artifacts:[],pendingCinematics:[],bounds:[0,0,127,127],time:20,status:'running',energy:2400,storyConstruction:{enabled:false}});
  m.state.salvage.items=[];m.explored.fill(255);m.visible.fill(255);m.visionSources=[{x:63.5,y:63.5,radius:200}];m.fogRevision++;
  m.visibleAt=m.exploredAt=()=>true;
  const factories=[{x:-1656,y:472},{x:-1456,y:448},{x:-1616,y:240,rotation:Math.PI},{x:-1376,y:240,rotation:Math.PI}]
   .map(p=>m.addStructure('factory','rai',p,{completed:true,progress:1,rotation:p.rotation??0,groundHeight:m.field.heightAt(p.x,p.y)}));
  const source=factories[0],interior=[],exterior=[];
  for(let i=0;i<20;i++){
   const u=m.addUnit('bukhanka','rai',factoryPoint(m,source,0,-3));u.hp=40;
   u.factoryVisit={garageVersion:2,factoryId:source.id,phase:'inside',arrived:i,queued:i,slot:i};
   u.combatRetreat={forced:true,home:{id:source.id,x:source.x,y:source.y},started:i,status:'servicing',service:'waiting-bay'};interior.push(u.id);
  }
  for(let i=0;i<4;i++){
   const u=m.addUnit('bukhanka','rai',factoryPoint(m,source,(i-1.5)*8,-20-(i%2)*7));u.hp=40;
   u.factoryVisit={garageVersion:2,factoryId:source.id,phase:i?'approach':'gate',queued:20,slot:i+20};
   u.combatRetreat={forced:true,home:{id:source.id,x:source.x,y:source.y},started:20,status:'moving',phase:'home'};
   u.trafficOnScreen=true;u.previousX=u.x;u.previousY=u.y;u.previousHeading=u.heading;exterior.push(u.id);
  }
  m.rebuildNavigation();c.select([],false,false);m.updateEconomy(.1);
  w.fixedRenderScale=1;w.renderer.setPixelRatio(1);w.controls.enableDamping=false;
  window.review={factories:factories.map(f=>f.id),interior,exterior,source:source.id,
   refresh(){c.reviewRefreshUi();document.querySelector('#toast').hidden=true;w.update(m,new Set(),0,false,true);},
   frame(){w.controls.target.set(-1510,350,m.field.heightAt(-1510,350));w.camera.position.copy(w.controls.target).add({x:35,y:-420,z:620});w.controls.update();this.refresh();},
   counts(){return this.factories.map(id=>factoryRepairQueue(m,m.entity(id)).length);}};
  const before=review.counts();m.advance(.1);m.finishPendingStep();review.frame();
  return {before,queues:review.counts(),outside:review.factories.map(id=>exterior.filter(uid=>m.entity(uid).combatRetreat.home.id===id).length),source:source.id,factories:review.factories};
 });
 console.log(JSON.stringify(report.initial));
 if(before)assert.deepEqual(report.initial.outside,[4,0,0,0]);
 else{assert.equal(report.initial.outside[0],0);assert(report.initial.queues.every(n=>n>0),'All four bays have assigned repair work, including the reserved interior transfer');}
 await page.locator('#production-toggle').click();await page.mouse.move(20,200);await page.waitForTimeout(5500);
 for(const [name,width,height] of (before?[['before-desktop',1440,900]]:[['desktop',1440,900],['landscape',844,390],['landscape-small',667,375]])){
  await page.setViewportSize({width,height});await page.evaluate(()=>new Promise(requestAnimationFrame));await page.evaluate(()=>review.frame());
  const layout=await page.evaluate(()=>({width:document.documentElement.scrollWidth,height:document.querySelector('#world').getBoundingClientRect().height,
   overflow:[...document.querySelectorAll('[data-factory-row] button')].filter(b=>{const r=b.getBoundingClientRect();return r.width&&(r.left<0||r.right>innerWidth||r.top<0||r.bottom>innerHeight);}).map(b=>b.ariaLabel),
   counts:review.counts()}));
  assert.equal(layout.width,width);assert.equal(layout.height,height);assert.deepEqual(layout.overflow,[]);
  assert.equal(await page.locator('[data-factory-row]').count(),4);
  assert.deepEqual((await page.locator('[data-factory-priority] .production-count').allTextContents()).map(Number),layout.counts);
  await page.screenshot({path:dir+'/'+name+'.png'});report.captures.push({name,...layout});
 }
 if(!before){
  const used=new Set(),transferred=new Set(),repairedTransfers=new Set();
  await page.setViewportSize({width:1440,height:900});
  for(let i=0;i<60;i++){
   const state=await page.evaluate(()=>{
    const m=campaign.mission,events=[];
    for(let j=0;j<50;j++){m.advance(.1);m.finishPendingStep();m.drainEffects();events.push(...m.drainEvents().filter(e=>/^factory-(repair-start|repair-complete|repair-rerouted|admitted|released)$/.test(e.type)));}
    review.frame();return {time:m.state.time,events,queues:review.counts(),done:m.state.units.filter(u=>u.hp===u.maxHp).length,units:m.state.units.map(u=>({id:u.id,hp:u.hp,maxHp:u.maxHp,phase:u.factoryVisit?.phase,factory:u.factoryVisit?.factoryId,next:u.factoryVisit?.nextFactoryId,home:u.combatRetreat?.home?.id,reason:u.navigation?.reason}))};
   });
   report.events.push(...state.events);
   for(const e of state.events){
    if(e.type==='factory-repair-start')used.add(e.factory);
    if(e.type==='factory-repair-rerouted')transferred.add(e.unit);
    if(e.type==='factory-repair-complete'&&e.factory!==report.initial.source&&transferred.has(e.unit))repairedTransfers.add(e.unit);
   }
   report.final={...state,events:undefined,used:[...used],transferred:[...transferred],repairedTransfers:[...repairedTransfers]};
   if(i%10===0)console.log(JSON.stringify({seconds:state.time,done:state.done,used:[...used],repairedTransfers:[...repairedTransfers]}));
   if(used.size===4&&repairedTransfers.size&&state.done===24)break;
  }
  await page.screenshot({path:dir+'/repaired-desktop.png'});
  assert.equal(used.size,4,'Every factory must actually perform repair');
  assert(repairedTransfers.size,'An interior car must physically reach and be repaired by its replacement');
  assert.equal(report.final.done,24,'Every car repairs on actual terrain');
 }
 assert.deepEqual(report.errors,[]);console.log('PASS WG-066 browser '+(before?'reproduction':'four factories, physical transfer, desktop and two landscape sizes'));
}finally{fs.writeFileSync(dir+`/browser${before?'-before':''}.json`,JSON.stringify(report,null,2));await browser.close();}
