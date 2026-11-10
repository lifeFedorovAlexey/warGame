import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH??'C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const folder='campaign/previews/factory-priorities/smoke';fs.mkdirSync(folder,{recursive:true});const report={errors:[],captures:[]};
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
  window.review={factories:[],refresh(){c.reviewRefreshUi();w.update(m,new Set(c.selected),0,false,true);},
   frame(){const f=this.factories[0],z=f.groundHeight;w.controls.target.set(f.x+95,f.y+5,z+25);w.camera.position.set(f.x+175,f.y-320,z+430);w.controls.update();this.refresh();},
   jobs(f,n){f.queue=Array.from({length:n},(_,i)=>({kind:'bukhanka',cost:130,progress:i?0:.4,funding:{paid:130},orderSerial:i,autoFactory:true}));},
   advance(seconds){m.state.time+=seconds;this.refresh();},
   smoke(){const mesh=w.scene.getObjectByName('factory_chimney_smoke');return {count:mesh.count,loads:structuredClone(mesh.userData.loads)};}};
  for(const x of [-1656,-1456]){const f=m.addStructure('factory','rai',{x,y:472},{completed:true,progress:1,groundHeight:m.field.heightAt(x,472)});f.workPriority='production';review.factories.push(f);}
  m.rebuildNavigation();c.select([]);review.frame();
 });
 await page.locator('#production-toggle').click();await page.mouse.move(20,200);await page.waitForTimeout(5500);await page.evaluate(()=>review.refresh());
 const capture=async name=>{
  for(const [suffix,width,height] of [['desktop',1440,900],['landscape',844,390],['landscape-small',667,375]]){
   await page.setViewportSize({width,height});await page.evaluate(()=>new Promise(requestAnimationFrame));await page.evaluate(()=>review.frame());
   const layout=await page.evaluate(()=>({width:document.documentElement.scrollWidth,height:document.querySelector('#world').getBoundingClientRect().height,
    overflow:[...document.querySelectorAll('[data-factory-row] button')].filter(b=>{const r=b.getBoundingClientRect();return r.width&&(r.left<0||r.right>innerWidth||r.bottom>innerHeight);}).map(b=>b.ariaLabel),smoke:review.smoke()}));
   assert.equal(layout.width,width);assert.equal(layout.height,height);assert.deepEqual(layout.overflow,[]);report.captures.push({name,suffix,...layout});
   await page.screenshot({path:folder+'/'+name+'-'+suffix+'.png'});
  }
 };
 report.idle=await page.evaluate(()=>review.smoke());await capture('WG-034-idle');
 report.rise=await page.evaluate(()=>{review.factories.forEach(f=>review.jobs(f,1));review.advance(.1);return review.smoke();});
 assert(report.rise.loads.every((l,i)=>l.intensity>report.idle.loads[i].intensity&&l.intensity<l.target),'Load changes ease in');
 report.light=await page.evaluate(()=>{review.advance(8);return review.smoke();});
 report.heavy=await page.evaluate(()=>{review.jobs(review.factories[1],12);review.advance(8);return review.smoke();});
 const [light,heavy]=await page.evaluate(()=>review.factories.map(f=>review.smoke().loads.find(l=>l.id===f.id)));
 assert(heavy.intensity>light.intensity*2);assert(heavy.maxOpacity>light.maxOpacity*3);assert.equal(report.heavy.count,24,'One bounded particle batch serves both factories');
 await capture('WG-034-load-smoke');
 for(const [suffix,width,height] of [['desktop',1440,900],['landscape-small',667,375]]){
  await page.setViewportSize({width,height});await page.evaluate(()=>new Promise(requestAnimationFrame));
  await page.evaluate(()=>{const f=review.factories[0],w=campaign.world,z=f.groundHeight;w.controls.target.set(f.x+95,f.y,z+20);w.camera.position.set(f.x+105,f.y-30,z+460);w.controls.update();review.refresh();});
  await page.screenshot({path:folder+'/WG-034-roof-overhead-'+suffix+'.png'});
 }
 report.pause=await page.evaluate(()=>{const mesh=campaign.world.scene.getObjectByName('factory_chimney_smoke'),before=Array.from(mesh.instanceMatrix.array.slice(0,mesh.count*16)),alpha=Array.from(mesh.geometry.attributes.smokeAlpha.array),time=campaign.mission.state.time;review.refresh();let movement=0,opacity=0;for(let i=0;i<mesh.count;i++){for(const k of [12,13,14])movement=Math.max(movement,Math.abs(before[i*16+k]-mesh.instanceMatrix.array[i*16+k]));opacity=Math.max(opacity,Math.abs(alpha[i]-mesh.geometry.attributes.smokeAlpha.array[i]));}return {movement,opacity,timeBefore:time,timeAfter:campaign.mission.state.time};});assert(report.pause.movement<1e-6&&report.pause.opacity<1e-6&&report.pause.timeBefore===report.pause.timeAfter,'Smoke animation pauses with simulation: '+JSON.stringify(report.pause));
 report.starved=await page.evaluate(()=>{const m=campaign.mission,f=review.factories[1];f.queue.forEach(j=>j.funding.paid=0);m.state.energy=0;review.advance(8);return review.smoke().loads.find(l=>l.id===f.id);});
 assert(report.starved.intensity<light.intensity*.2,'An unpaid stalled queue does not produce a heavy exhaust');
 report.repair=await page.evaluate(()=>{const m=campaign.mission,f=review.factories[1];m.state.energy=1000;f.queue=[];f.workPriority='repair';
  for(let i=0;i<8;i++){const u=m.addUnit('bukhanka','rai',{x:f.x,y:f.y});u.hp=100;u.factoryVisit={factoryId:f.id,phase:'inside',arrived:i};u.combatRetreat={home:{id:f.id}};}
  m.updateEconomy(.1);review.advance(8);return review.smoke().loads.find(l=>l.id===f.id);});
 assert(report.repair.intensity>light.intensity*2,'Repair workload also drives the furnace');
 report.empty=await page.evaluate(()=>{const m=campaign.mission;for(const f of review.factories){f.queue=[];f.activeRepair=null;}for(const u of m.state.units)u.hp=u.maxHp;review.advance(8);return review.smoke();});
 assert(report.empty.loads.every(l=>l.intensity<.04),'Smoke settles back to idle after work ends');
 report.rotation=await page.evaluate(()=>{const m=campaign.mission,f=review.factories[1],w=campaign.world;f.rotation=Math.PI/2;review.refresh();const p=review.smoke().loads.find(l=>l.id===f.id).origin;return {actual:p,expected:[f.x-20*.303*m.config.worldScale,f.y+26*.287*m.config.worldScale,w.buildingObjects.get(f.id).position.z+(9-.08)*m.config.worldScale]};});
 report.rotation.actual.forEach((v,i)=>assert(Math.abs(v-report.rotation.expected[i])<1e-6,'Smoke starts at the rotated chimney rim'));
 report.lifecycle=await page.evaluate(async()=>{const m=campaign.mission,f=review.factories[1],w=campaign.world,save=m.save(),model=w.buildingObjects.get(f.id);
  const id=Object.entries(model.userData.damageParts).find(([,p])=>p.name.startsWith('stack_'))[0];
  const {createDamageState}=await import(new URL('./damage-state.js',location.href));f.damage??=createDamageState();f.damage.parts[id]={damage:1000,detached:true};f.damage.revision++;review.refresh();const broken=!review.smoke().loads.some(l=>l.id===f.id);
  m.load(save);review.factories=review.factories.map(f=>m.entity(f.id));review.refresh();const restored=review.smoke().loads.some(l=>l.id===f.id);
  review.factories[1].hp=0;review.refresh();const destroyed=!review.smoke().loads.some(l=>l.id===f.id);
  m.state.buildings=[];review.refresh();return {broken,restored,destroyed,removed:review.smoke().count===0};});
 assert.deepEqual(report.lifecycle,{broken:true,restored:true,destroyed:true,removed:true});assert.deepEqual(report.errors,[]);
 console.log('PASS idle/light/heavy smoke, repair and production loads, smooth transitions, no-oil and pause, rotated/destroyed chimney, save/load, desktop and two narrow screens');
}finally{fs.writeFileSync(folder+'/browser.json',JSON.stringify(report,null,2));await browser.close();}
