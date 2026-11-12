import fs from 'node:fs';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const baseline=process.argv.includes('--baseline'),folder=process.env.WARGAME_EVIDENCE_DIR??'docs/playtest-evidence/wg010/'+(baseline?'before':'after');fs.mkdirSync(folder,{recursive:true});
const report={errors:[],screens:[]},b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});let page;
try{
 page=await b.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});page.on('pageerror',e=>report.errors.push(e.message));
 await page.addInitScript(()=>{for(const k of ['fieldSound','fieldRadio','fieldStoryVoice'])localStorage.setItem('warGame.'+k,'off');});
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:'+(baseline?8766:8777))+'/campaign/?mission=m02');await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});
 await page.locator('#begin').click();await page.waitForFunction(()=>campaign.state.active&&!campaign.state.openingPlaying);await page.locator('#pause').click();await page.waitForTimeout(8000);
 report.alarms=await page.evaluate(async()=>{
  const c=campaign,m=c.mission,w=c.world,T=await import('/demo/vendor/three.module.js'),p=m.field.gridToWorld(m.config.startGrid);
  const {FieldSound}=await import('/campaign/field-sound.js'),signal=FieldSound.prototype.signal;
  let alarms=0;
  FieldSound.prototype.signal=function(kind){if(kind==='attack-alarm')alarms++;return signal.call(this,kind);};
  c.radio.setEnabled(false);m.state.units=[];m.state.buildings=[];m.state.camps=[];m.updateMission=()=>{};m.drainEvents();m.drainEffects();
  const u=m.addUnit('bukhanka','rai',p),f=m.addStructure('generator','rai',{x:p.x+620,y:p.y+80},{completed:true,progress:1}),enemy=m.addUnit('raider','scavs',{x:p.x+900,y:p.y+600});
  m.rebuildNavigation();m.updateFog();m.explored.fill(255);c.select([u.id]);w.fixedRenderScale=1;w.renderer.setPixelRatio(1);
  const centre=()=>{w.controls.target.set(u.x,u.y,m.field.heightAt(u.x,u.y));w.camera.position.copy(w.controls.target).add(new T.Vector3(0,-100,140));w.controls.update();};centre();
  const hit=(...targets)=>{m.state.time+=1;for(const target of targets)m.damage(target,1,enemy);c.advance(0);};
  hit(u);const inView=alarms;
  hit(f);const outOfView=alarms-inView;
  window.attackReview={u,f,enemy,centre,get alarms(){return alarms;},timer:setInterval(()=>hit(u,f),500)};
  return {inView,outOfView};
 });
 if(!baseline)assert.deepEqual(report.alarms,{inView:0,outOfView:1});
 for(const [width,height] of [[1440,900],[844,390],[667,375]]){
  await page.setViewportSize({width,height});await page.evaluate(()=>attackReview.centre());await page.waitForTimeout(700);
  const state=await page.evaluate(()=>({pulses:campaign.world.attackPulses?.count??0,focus:document.querySelector('#objective-focus').getAttribute('aria-label'),enemyVisible:campaign.mission.visibleAt(attackReview.enemy.x,attackReview.enemy.y),mesh:campaign.world.scene.getObjectByName('friendly_attack_pulses')?.geometry.drawRange.count??0}));
  assert(!state.enemyVisible);if(!baseline){assert(state.pulses>0);assert.match(state.focus,/под огнём/);assert(state.mesh<=16*32*6);}
  await page.screenshot({path:`${folder}/attack-${width}.png`});report.screens.push({width,height,...state});
 }
 if(!baseline){
  assert.equal(await page.evaluate(()=>attackReview.alarms),1,'Sustained attacks keep the markers without repeating the alarm');
  const selection=await page.evaluate(()=>campaign.selected);await page.locator('#objective-focus').click();await page.waitForTimeout(250);await page.locator('#objective-focus').click();await page.waitForTimeout(350);
  report.focus=await page.evaluate(()=>({target:campaign.world.controls.target.toArray(),factory:{x:attackReview.f.x,y:attackReview.f.y},selected:campaign.selected}));
  assert(Math.hypot(report.focus.target[0]-report.focus.factory.x,report.focus.target[1]-report.focus.factory.y)<1);assert.deepEqual(report.focus.selected,selection);
  await page.screenshot({path:folder+'/second-attack-667.png'});
 }
 await page.evaluate(()=>clearInterval(attackReview.timer));await page.waitForTimeout(3400);
 report.expired=await page.evaluate(()=>({pulses:campaign.world.attackPulses?.count??0,focus:document.querySelector('#objective-focus').getAttribute('aria-label')}));
 if(!baseline){assert.equal(report.expired.pulses,0);assert(!report.expired.focus?.includes('под огнём'));}
 assert.deepEqual(report.errors,[]);console.log(JSON.stringify(report));
}catch(error){report.failure=error.stack;if(page)await page.screenshot({path:folder+'/failure.png'}).catch(()=>{});throw error;}
finally{fs.writeFileSync(folder+'/browser.json',JSON.stringify(report,null,2));await b.close();}
