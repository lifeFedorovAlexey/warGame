import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const folder='docs/playtest-evidence/wg060';fs.mkdirSync(folder,{recursive:true});
const report={errors:[],screens:[]},browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
let page;
try{
 page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});page.on('pageerror',e=>report.errors.push(e.message));
 await page.addInitScript(()=>{for(const k of ['fieldSound','fieldRadio','fieldStoryVoice'])localStorage.setItem('warGame.'+k,'off');});
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8777')+'/campaign/?mission=m02');
 await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});await page.locator('#begin').click();
 await page.waitForFunction(()=>campaign.state.active&&!campaign.state.openingPlaying,null,{timeout:60000});await page.locator('#pause').click();
 await page.waitForTimeout(8000);
 report.fixture=await page.evaluate(async()=>{
  const c=campaign,m=c.mission,w=c.world,T=await import('/demo/vendor/three.module.js');c.radio.setEnabled(false);
  const existing=m.state.buildings.filter(f=>f.owner==='rai'&&f.kind==='factory'&&f.completed),p=m.field.gridToWorld(m.config.startGrid);
  m.state.units=[];m.state.buildings=existing;m.state.camps=[];m.state.projectiles=[];m.updateMission=()=>{};
  const f=existing[0]??m.addStructure('factory','rai',{x:p.x,y:p.y+160},{completed:true,progress:1});
  const a=f.rotation??0,point=(x,y)=>({x:f.x+x*Math.cos(a)-y*Math.sin(a),y:f.y+x*Math.sin(a)+y*Math.cos(a)});
  const u=m.addUnit('bukhanka','rai',point(-25,-180),{heading:a}),other=m.addUnit('twin-machinegun','rai',point(120,-190));
  m.rebuildNavigation();m.updateFog();m.explored.fill(255);m.visible.fill(255);m.state.research['twin-machinegun']=true;m.state.energy=1000;
  c.select([u.id,other.id]);w.fixedRenderScale=1;w.renderer.setPixelRatio(1);
  w.controls.target.set(f.x,f.y-30,m.field.heightAt(f.x,f.y));w.camera.position.copy(w.controls.target).add(new T.Vector3(0,-310,390));w.controls.update();
  window.refitReview={u,other,f};m.drainEvents();m.drainEffects();
  return {factory:{id:f.id,x:f.x,y:f.y,existing:existing.length},unit:{id:u.id,x:u.x,y:u.y},other:other.id};
 });console.log('Fixture',JSON.stringify(report.fixture));
 await page.locator('#combat-modes').click();
 const upgrade=page.locator('#combat-menu [data-modernize]');await upgrade.waitFor({state:'visible'});
 assert.equal(await upgrade.getAttribute('aria-label'),'Переоснастить на спарку');
 assert.equal(await upgrade.getAttribute('aria-disabled'),'false');
 assert.match(await upgrade.getAttribute('aria-description'),/переоснащения: 1/);
 for(const [width,height] of [[1440,900],[844,390],[667,375]]){
  await page.setViewportSize({width,height});await upgrade.focus();await page.waitForTimeout(350);
  const layout=await page.evaluate(()=>{
   const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
   const menu=document.querySelector('#combat-menu'),hint=document.querySelector('#combat-hint'),buttons=[...menu.querySelectorAll('button')];
   const r=menu.getBoundingClientRect(),gap=document.elementFromPoint(r.left+42,r.top+90);
   return {menu:rect(menu),hint:rect(hint),buttons:buttons.map(rect),hudButtons:['pause','menu-button','combat-modes'].map(id=>document.getElementById(id)).filter(Boolean).map(rect),background:getComputedStyle(menu).backgroundColor,gapIsButton:!!gap?.closest('button'),title:hint.textContent};
  });
  for(const r of [...layout.buttons,layout.hint])assert(r.x>=0&&r.y>=0&&r.x+r.width<=width+1&&r.y+r.height<=height+1);
  const overlaps=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
  for(const r of [...layout.buttons,...layout.hudButtons])assert(!overlaps(r,layout.hint),'Tooltip must not overlap any control');
  for(const r of layout.buttons)for(const h of layout.hudButtons)assert(!overlaps(r,h),'Menu must not overlap HUD controls');
  assert.equal(layout.background,'rgba(0, 0, 0, 0)');
  await page.screenshot({path:`${folder}/menu-${width}.png`});report.screens.push({width,height,...layout});
 }
 await page.setViewportSize({width:1440,height:900});await upgrade.click();
 report.ordered=await page.evaluate(()=>{const {u,other,f}=refitReview;return {kind:u.kind,request:u.modernizationRequested,otherRequest:!!other.modernizationRequested,auto:!!f.autoModernize,oil:campaign.mission.state.energy};});
 assert.deepEqual(report.ordered,{kind:'bukhanka',request:true,otherRequest:false,auto:false,oil:1000});
 await page.locator('#combat-modes').click();
 report.travel=await page.evaluate(async()=>{
  const m=campaign.mission,id=refitReview.u.id,phases=[],events=[];let previous;
  m.advance(.5);const save=m.save();m.load(save);refitReview.u=m.entity(id);refitReview.f=m.entity(refitReview.f.id);
  if(!refitReview.u.modernizationRequested)throw Error('Save lost the refit order');
  for(let i=0;i<1000;i++){
   const u=refitReview.u,kind=u.kind,inside=u.factoryVisit?.phase==='inside';m.advance(.1);
   if(u.kind!==kind&&!inside)throw Error('Weapon changed outside the factory');
   const phase=u.factoryVisit?.phase??'outside';if(phase!==previous){phases.push({time:m.state.time,phase,kind:u.kind});previous=phase;}
   events.push(...m.drainEvents());m.drainEffects();
   if(u.kind==='twin-machinegun'&&!u.factoryVisit)break;
   if(i%20===0)await new Promise(requestAnimationFrame);
  }
  const u=refitReview.u;return {phases,kind:u.kind,visit:u.factoryVisit,oil:m.state.energy,modernized:events.filter(e=>e.type==='vehicle-modernized'),navigation:u.navigation};
 });console.log('Travel',JSON.stringify(report.travel));
 assert.equal(report.travel.kind,'twin-machinegun');assert(!report.travel.visit);assert.equal(report.travel.oil,985);assert.equal(report.travel.modernized.length,1);
 for(const phase of ['entering','inside','leaving','departure'])assert(report.travel.phases.some(p=>p.phase===phase));
 await page.waitForTimeout(300);await page.screenshot({path:folder+'/after-factory.png'});
 assert.deepEqual(report.errors,[]);console.log('WG-060 browser passed');
}catch(error){report.failure=error.stack;if(page)await page.screenshot({path:folder+'/failure.png'}).catch(()=>{});throw error;}
finally{fs.writeFileSync(folder+'/browser.json',JSON.stringify(report,null,2));await browser.close();}
