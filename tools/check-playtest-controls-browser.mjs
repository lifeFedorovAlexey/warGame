import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH??'C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const baseline=process.argv.includes('--baseline'),folder='campaign/previews/playtest-WG-005-006'+(baseline?'/before':'');fs.mkdirSync(folder,{recursive:true});
const report={baseline,errors:[]};
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 page.on('requestfailed',r=>{if(r.failure()?.errorText==='net::ERR_ABORTED')return;const text=(r.failure()?.errorText??'request failed')+' '+r.url();report.errors.push(text);console.log(text);});
 page.on('pageerror',e=>report.errors.push(e.stack??e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());});
 await page.addInitScript(()=>{for(const key of ['fieldRadio','fieldSound','fieldStoryVoice'])localStorage.setItem('warGame.'+key,'off');});
 if(baseline)for(const name of ['mission.js','combat-policy.js','combat-retreat-state.js','traffic-coordinator.js','factory-repair.js'])await page.route('**/campaign/'+name,route=>route.fulfill({body:fs.readFileSync('campaign/previews/playtest-WG-005-006/before/'+name,'utf8'),contentType:'text/javascript'}));
 // Expose the ordinary HUD refresh while simulation is paused. This only adds
 // a test entry point; the roster and game logic are the real production code.
 await page.route('**/campaign/main.js',route=>route.fulfill({body:fs.readFileSync(baseline?'campaign/previews/playtest-WG-005-006/before/main.js':'campaign/main.js','utf8').replace('ready: true, mission, world, select, radio,',`ready: true, mission, world, select, radio,
 reviewRefreshUi(){flushUi();minimapView.render(performance.now());if(performance.now()>=toastUntil)$('toast').hidden=true;},`),contentType:'text/javascript'}));
 console.log('Loading campaign');
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8766')+'/campaign/?damage=1');await page.waitForFunction(()=>window.campaign?.damageDebug,null,{timeout:120000});
 console.log('Campaign ready');
 await page.locator('#begin').click();await page.locator('[data-dream=skip]').click({timeout:60000});
 await page.evaluate(()=>{const m=campaign.mission;campaign.radio.setEnabled(false);const sign=m.entity(m.state.openingScene.signId);sign.completed=true;sign.progress=1;});
 await page.waitForFunction(()=>campaign.state.active,null,{timeout:30000});await page.locator('#pause').click();
 await page.evaluate(()=>{
  const c=campaign,m=c.mission,w=c.world;c.renderSuspended=true;c.damageDebug.panel.hidden=true;
  Object.assign(m.state,{units:[],buildings:[],camps:[],artifacts:[],raidReserve:[],pendingCinematics:[],energy:1000,bounds:[0,0,127,127],storyConstruction:{enabled:false}});m.state.flags.raidWon=true;
  m.visible.fill(255);m.explored.fill(255);m.visionSources=[{x:63.5,y:63.5,radius:200}];m.fogRevision++;m.visibleAt=m.exploredAt=()=>true;w.fixedRenderScale=1;w.renderer.setPixelRatio(1);w.controls.enableDamping=false;
  window.review={cars:[],builders:[],refresh(dt=0){c.reviewRefreshUi();w.update(m,new Set(c.selected),dt,false,true);},add(kind,i){return m.addUnit(kind,'rai',{x:-1700+i*38,y:kind==='builder'?310:250});},advance(seconds){for(let t=0;t<seconds-1e-8;t+=.1){m.advance(.1);if(Math.round(t*10)%5===0)this.refresh(.5);}this.refresh();}};
  for(let i=0;i<3;i++)review.cars.push(review.add('bukhanka',i));for(let i=0;i<2;i++)review.builders.push(review.add('builder',i));m.rebuildNavigation();c.select([]);c.damageDebug.view(review.cars[1].id,350);review.refresh();
 });
 const groups=kind=>page.locator('#roster [data-icon="'+kind+'"]').evaluateAll(bs=>bs.map(b=>({ids:b.dataset.units.split('/'),active:b.classList.contains('active'),count:b.querySelector('.stack-count')?.textContent??null,outline:getComputedStyle(b).outlineStyle,background:getComputedStyle(b).backgroundColor,repairing:b.classList.contains('repairing')})));
 const capture=async name=>{
  for(const [suffix,width,height] of [['desktop',1440,900],['landscape',844,390],['landscape-small',667,375]]){
   await page.setViewportSize({width,height});await page.evaluate(()=>new Promise(requestAnimationFrame));await page.evaluate(()=>review.refresh());
   const layout=await page.evaluate(()=>({width:document.documentElement.scrollWidth,height:document.querySelector('#world').getBoundingClientRect().height,overflow:[...document.querySelectorAll('#roster button')].filter(b=>{const r=b.getBoundingClientRect();return r.left<0||r.right>innerWidth||r.bottom>innerHeight;}).map(b=>b.ariaLabel)}));assert.equal(layout.width,width);assert.equal(layout.height,height);assert.deepEqual(layout.overflow,[]);
   await page.screenshot({path:folder+'/'+name+'-'+suffix+'.png'});
  }
  await page.setViewportSize({width:1440,height:900});await page.evaluate(()=>new Promise(requestAnimationFrame));await page.evaluate(()=>review.refresh());
 };
 report.initial={cars:await groups('bukhanka'),builders:await groups('builder')};assert.equal(report.initial.cars.length,baseline?3:1);assert.equal(report.initial.builders.length,baseline?2:1);
 await capture('WG-006-first-five');
 if(!baseline){
  await page.evaluate(()=>{campaign.select([review.cars[0].id]);review.refresh();});assert.deepEqual((await groups('bukhanka')).map(t=>[t.ids.length,t.active]),[[1,true],[2,false]]);
  await page.evaluate(()=>{review.cars.push(review.add('bukhanka',3));review.refresh();});assert.deepEqual((await groups('bukhanka')).map(t=>[t.ids.length,t.active]),[[1,true],[3,false]]);
  await page.evaluate(()=>{review.cars[3].hp=0;review.refresh();});assert.deepEqual((await groups('bukhanka')).map(t=>[t.ids.length,t.active]),[[1,true],[2,false]]);
  await page.evaluate(()=>{review.cars.pop();for(let i=3;i<10;i++)review.cars.push(review.add('bukhanka',i));campaign.select(review.cars.slice(0,7).map(u=>u.id));review.refresh();});
  report.split=await groups('bukhanka');assert.deepEqual(report.split.map(t=>[t.ids.length,t.active,t.count]),[[7,true,'×7'],[3,false,'×3']]);assert.equal(report.split[0].outline,'solid');assert.equal(report.split[1].outline,'none');assert(report.split.every(t=>t.background==='rgba(0, 0, 0, 0)'));
  await capture('WG-006-seven-three');
  await page.locator('#roster [data-icon="bukhanka"]:not(.active)').click();await page.evaluate(()=>review.refresh());assert.equal(await page.evaluate(()=>campaign.selected.length),3);
  await page.locator('#roster [data-icon="bukhanka"]:not(.active)').click({modifiers:['Shift']});await page.evaluate(()=>review.refresh());assert.equal(await page.evaluate(()=>campaign.selected.length),10);assert.equal((await groups('bukhanka')).length,1);
  await page.evaluate(()=>{campaign.select([]);review.refresh();});await page.locator('#roster [data-icon="bukhanka"]').dblclick({delay:160});
  assert(await page.evaluate(()=>{const p=campaign.world.controls.target,us=review.cars;return Math.hypot(p.x-us.reduce((n,u)=>n+u.x,0)/us.length,p.y-us.reduce((n,u)=>n+u.y,0)/us.length)<.01;}));
 }
 console.log('PASS WG-006 browser');
 await page.evaluate(()=>{
  const c=campaign,m=c.mission;m.state.units=[];m.state.buildings=[];m.drainEffects();m.drainEvents();c.world.damage.reset();
  review.factory=m.addStructure('factory','rai',{x:-1656,y:472},{completed:true,progress:1,groundHeight:m.field.heightAt(-1656,472)});
  review.builder=m.addUnit('builder','rai',{x:-1656,y:310});review.car=m.addUnit('bukhanka','rai',{x:-1540,y:310});
  review.builder.hp=review.builder.maxHp*.7;review.car.hp=review.car.maxHp*.7;m.rebuildNavigation();c.select([review.builder.id]);c.damageDebug.view(review.factory.id,410);review.refresh();
 });
 await page.locator('#combat-modes').click();await page.locator('[data-policy="retreat"][data-value="light"]').click();await page.evaluate(()=>review.refresh());
 report.policy=await page.evaluate(()=>({builder:review.builder.combatPolicy??null,car:review.car.combatPolicy}));
 await capture('WG-005-retreat-rule');
 await page.locator('#combat-modes').click();
 report.retreat=await page.evaluate(()=>{const b=review.builder,p={x:b.x,y:b.y};review.advance(6);return {moved:Math.hypot(b.x-p.x,b.y-p.y),status:b.combatRetreat?.status??null,phase:b.factoryVisit?.phase??null,hp:b.hp};});
 if(baseline){assert.equal(report.policy.builder,null);assert.equal(report.retreat.moved,0);}else{assert.equal(report.policy.builder.retreat,'light');assert(report.retreat.moved>10);}
 await capture('WG-005-on-the-way');
 if(!baseline){
  report.repaired=await page.evaluate(()=>{let n=0;while(n++<1600&&(review.builder.hp<review.builder.maxHp||review.builder.combatRetreat||review.builder.factoryVisit||review.builder.task||review.builder.pendingOrder)){campaign.mission.advance(.1);if(n%10===0)review.refresh(.1);}review.refresh();return {hp:review.builder.hp,maxHp:review.builder.maxHp,retreat:review.builder.combatRetreat??null,phase:review.builder.factoryVisit?.phase??null,x:review.builder.x,y:review.builder.y,task:review.builder.task};});
  assert.equal(report.repaired.hp,report.repaired.maxHp);assert.equal(report.repaired.retreat,null);assert(Math.hypot(report.repaired.x+1656,report.repaired.y-310)<2.01);await capture('WG-005-repaired-returned');
 }
 console.log('PASS WG-005 browser');assert.deepEqual(report.errors,[]);
}finally{fs.writeFileSync(folder+'/verification.json',JSON.stringify(report,null,2));await browser.close();}
