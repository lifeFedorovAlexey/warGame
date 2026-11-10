import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH??'C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const baseline=process.argv.includes('--baseline');
const historical=process.argv.includes('--historical-lamps');
const folder='campaign/previews/playtest-WG-008-009'+(historical?'/historical-lamps':baseline?'/before':'');
fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
const report={baseline,historical,lamps:[],towers:[],errors:[]};
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 page.on('pageerror',e=>report.errors.push(e.stack??e.message));
 page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 page.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());});
 await page.addInitScript(()=>{for(const key of ['fieldRadio','fieldSound','fieldStoryVoice'])localStorage.setItem('warGame.'+key,'off');});
 if(historical){
  const body=execFileSync('git',['show','e89a6c1^:campaign/damage-system.js'],{encoding:'utf8'});
  await page.route('**/campaign/damage-system.js',route=>route.fulfill({body,contentType:'text/javascript'}));
 }
 if(baseline){
  const body=execFileSync('git',['show','8090258:campaign/scav-prefabs.js'],{encoding:'utf8'});
  await page.route('**/campaign/scav-prefabs.js',route=>route.fulfill({body,contentType:'text/javascript'}));
 }
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8766')+'/campaign/?damage=1');
 await page.waitForFunction(()=>window.campaign?.damageDebug,null,{timeout:120000});
 await page.locator('#begin').click();
 await page.locator('[data-dream=skip]').click({timeout:60000});
 await page.evaluate(()=>{const m=campaign.mission;campaign.radio.setEnabled(false);const sign=m.entity(m.state.openingScene.signId);sign.completed=true;sign.progress=1;});
 await page.waitForFunction(()=>campaign.state.active,null,{timeout:30000});
 await page.locator('#pause').click();
 await page.evaluate(()=>{
  const c=campaign,m=c.mission,w=c.world;
  c.renderSuspended=true;c.damageDebug.panel.hidden=true;
  m.state.bounds=m.config.finalMapBounds.slice();m.state.flags.lastRevealed=true;m.rebuildNavigation();
  m.visible.fill(255);m.explored.fill(255);m.visionSources.push({x:63.5,y:63.5,radius:200});m.fogRevision++;
  m.visibleAt=m.exploredAt=()=>true;
  w.fixedRenderScale=1;w.renderer.setPixelRatio(1);w.controls.enableDamping=false;
  window.review={originalUnits:m.state.units.slice(),originalBuildings:m.state.buildings.slice(),
   tick(dt=0){m.state.time+=dt;w.update(m,new Set(),dt);},
   view(e,distance=60){c.damageDebug.view(e.id,distance);this.tick();},
   fixture(kind){m.drainEffects();m.drainEvents();w.damage.reset();const p=m.field.gridToWorld(m.config.startGrid);const u=m.addUnit(kind,'rai',{x:p.x+90,y:p.y+50},{heading:0});m.state.units=[u];m.state.buildings=[];u.hp=u.maxHp=2000;this.unit=u;this.view(u);return u;}};
 });
 const capture=async name=>{
  await page.evaluate(()=>review.tick());await page.screenshot({path:folder+'/'+name+'-desktop.png'});
  for(const [suffix,width,height] of [['narrow',390,844],['landscape',844,390],['landscape-small',667,375]]){
   await page.setViewportSize({width,height});
   await page.evaluate(()=>new Promise(requestAnimationFrame));await page.evaluate(()=>review.tick());
   await page.screenshot({path:folder+'/'+name+'-'+suffix+'.png'});
   const layout=await page.evaluate(()=>({width:document.documentElement.scrollWidth,height:document.querySelector('#world').getBoundingClientRect().height}));
   assert.equal(layout.width,width);assert.equal(layout.height,height);
  }
  await page.setViewportSize({width:1440,height:900});await page.evaluate(()=>new Promise(requestAnimationFrame));
 };
 const kinds=await page.evaluate(()=>Object.keys(campaign.mission.config.units));
 for(const kind of (process.argv.includes('--towers-only')?[]:historical?['bukhanka']:['bukhanka','builder','flamer','twin-machinegun','sensor','command','raider','scav-zaporozhets','scav-firetruck','scav-bus']).filter(kind=>kinds.includes(kind))){
  await page.evaluate(kind=>review.fixture(kind),kind);
  if(kind==='bukhanka')await capture('WG-008-intact');
  const result=await page.evaluate(kind=>{
   const c=campaign,m=c.mission,w=c.world,u=review.unit;
   // The firetruck's left lamp is covered by its authored frontal armour patch.
   const partId=kind==='scav-firetruck'?6:5;
   const left=c.damageDebug.hit(u.id,{partId,power:24});review.tick();
   // A detached lens is real debris. Let it leave its socket before comparing
   // frames: a paused zero-dt frame still contains that fragment in place.
   for(let i=0;i<15;i++)review.tick(.05);
   const afterLeft={left:!!u.damage?.parts[5]?.detached,right:!!u.damage?.parts[6]?.detached,beams:w.statistics.headlightBeams};
   return {kind,partId,left,afterLeft};
  },kind);
  assert.equal(result.left?.partId,result.partId,kind+' actual ray hits the exposed lamp');
  assert(result.afterLeft.left!==result.afterLeft.right,kind+' lamps break independently');
  if(kind==='bukhanka'){
   assert.equal(result.afterLeft.beams,1);await capture('WG-008-left-broken');
   result.persistence=await page.evaluate(()=>{
    const c=campaign,m=c.mission,w=c.world,id=review.unit.id,state=JSON.stringify(review.unit.damage);
    m.load(m.save());review.unit=m.entity(id);review.view(review.unit);
    const persisted=JSON.stringify(review.unit.damage)===state;
    for(const distance of [450,1100,60])review.view(review.unit,distance);
    return {persisted,lod:w.damage.records.get(id).lod,left:!!review.unit.damage.parts[5]?.detached,right:!!review.unit.damage.parts[6]?.detached};
   });
   assert(result.persistence.persisted&&result.persistence.left&&!result.persistence.right);
   assert.equal(result.persistence.lod,0);
  }
  result.wreck=await page.evaluate(()=>{
   const m=campaign.mission,u=review.unit;m.damage(u,u.hp);review.tick();
   return {hp:u.hp,left:!!u.damage.parts[5]?.detached,right:!!u.damage.parts[6]?.detached,beams:campaign.world.statistics.headlightBeams};
  });
  assert.equal(result.wreck.hp,0);assert(result.wreck.left);
  assert.equal(result.wreck.right,!historical,kind+' wreck lamp regression');
  if(kind==='bukhanka')assert.equal(result.wreck.beams,0);
  if(kind==='bukhanka'){
   for(let i=0;i<15;i++)await page.evaluate(()=>review.tick(.05));
   await capture('WG-008-wreck');
  }
  report.lamps.push(result);console.log((historical?'REPRODUCED historical ':'PASS ')+'WG-008 '+kind);
 }
 for(const site of (historical?[]:['nw-pocket','nw-west','nw-east','west-south','nw-pocket:watch'])){
  const initial=await page.evaluate(site=>{
   const c=campaign,m=c.mission,w=c.world;m.state.units=[];m.state.buildings=[];m.drainEffects();w.damage.reset();
   const p=m.field.gridToWorld(m.config.startGrid),b=m.addStructure('mg-tower','scavs',{x:p.x+90,y:p.y+50},{completed:true,progress:1,campId:site});
   review.tower=b;review.view(b,site==='nw-east'?140:120);
   const template=w.damage.getTemplate(b),parts=Object.entries(template.parts).filter(([,p])=>p.detachable);
   return {site,parts:parts.map(([id,p])=>({id:Number(id),name:p.name})),triangles:template.bindings.reduce((n,b)=>n+b.geometry.attributes.position.count/3,0)};
  },site);
  if(site==='nw-pocket')await capture('WG-009-intact');
  const impact=await page.evaluate(()=>{
   const c=campaign,m=c.mission,w=c.world,b=review.tower;
   // The ray goes through the real posed weapon; destruction uses Mission.damage.
   const hit=c.damageDebug.hit(b.id,{partId:9,power:b.hp,type:'shell'});review.tick();
   return {hit,detached:Object.entries(b.damage.parts).filter(([,p])=>p.detached).map(([id])=>Number(id)),debris:w.damage.statistics.debris,active:w.damage.statistics.activePhysics};
  });
  assert.equal(impact.hit?.partId,9);assert.equal(await page.evaluate(()=>review.tower.hp),0);
  if(!baseline){assert(initial.parts.length>=12,site+' has separate structural fragments');assert(impact.debris>=12,site+' creates real fragments');}
  assert(impact.active<=24);
  for(let i=0;i<12;i++)await page.evaluate(()=>review.tick(.05));
  if(site==='nw-pocket')await capture('WG-009-breaking');
  for(let i=0;i<74;i++)await page.evaluate(()=>review.tick(.05));
  await page.evaluate(()=>{
   const w=campaign.world,b=review.tower,offset=w.camera.position.clone().sub(w.controls.target).multiplyScalar(1.2);
   w.controls.target.z=(b.groundHeight??w.field.heightAt(b.x,b.y))+5;w.camera.position.copy(w.controls.target).add(offset);w.controls.update();review.tick();
  });
  if(site==='nw-pocket'||site==='nw-east')await capture('WG-009-ruins-'+site);
  const settled=await page.evaluate(()=>({debris:campaign.world.damage.statistics.debris,active:campaign.world.damage.statistics.activePhysics,parts:review.tower.damage.parts}));
  report.towers.push({...initial,...impact,settled});console.log((baseline?'BASELINE ':'PASS ')+'WG-009 '+site+' fragments='+impact.debris);
 }
 assert.deepEqual(report.errors,[]);report.passed=true;
}finally{fs.writeFileSync(folder+'/verification.json',JSON.stringify(report,null,2));await browser.close();}
