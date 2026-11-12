import fs from 'node:fs';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const save=JSON.parse(fs.readFileSync('campaign/previews/wg031/m02-battle.json','utf8')),folder='docs/playtest-evidence/wg031';
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
const report={errors:[],screens:[]};let page;
try{
 page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});page.on('pageerror',e=>report.errors.push(e.message));
 await page.addInitScript(()=>{for(const key of ['fieldSound','fieldRadio','fieldStoryVoice'])localStorage.setItem('warGame.'+key,'off');});
 await page.goto('http://127.0.0.1:8777/campaign/?mission=m02');await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});
 await page.locator('#begin').click();await page.waitForFunction(()=>campaign.state.active&&!campaign.state.openingPlaying);await page.locator('#pause').click();await page.waitForTimeout(7000);
 for(const [width,height] of [[1440,900],[844,390],[667,375]]){
  await page.setViewportSize({width,height});
  await page.evaluate(async save=>{
   const c=campaign,m=c.mission,w=c.world,T=await import('/demo/vendor/three.module.js');
   c.radio.setEnabled(false);m.load(save);m.drainEvents();m.drainEffects();
   // The long simulation used durable targets to observe successive waves.
   // Restore ordinary HP for this live, rendered battle.
   for(const u of [...m.state.units,...m.state.buildings])if(u.owner==='rai')u.hp=u.maxHp=(m.config.units[u.kind]?m.unitSpec(u):m.buildingSpec(u)).hp;
   m.updateFog();c.select([]);w.fixedRenderScale=1;w.renderer.setPixelRatio(1);
   const allies=[...m.state.units,...m.state.buildings].filter(u=>u.owner==='rai'&&u.hp>0),enemies=m.state.units.filter(u=>u.owner==='scavs'&&u.hp>0&&u.m02Produced);
   const distance=u=>Math.min(...enemies.map(e=>Math.hypot(e.x-u.x,e.y-u.y)));allies.sort((a,b)=>distance(a)-distance(b));
   const u=allies[0];c.select([u.id]);w.controls.target.set(u.x,u.y,m.field.heightAt(u.x,u.y));w.camera.position.copy(w.controls.target).add(new T.Vector3(110,-180,230));w.controls.update();
   window.battleReview={hits:0,shots:0,target:u.id,start:m.state.time};
   const emit=window.battleEmit??=m.emit.bind(m);m.emit=(type,data)=>{if(type==='under-attack')battleReview.hits++;return emit(type,data);};
  },save);
  for(let i=0;i<14;i++){
   await page.evaluate(()=>campaign.advance(.5));await page.waitForTimeout(100);
   if(i>=4&&await page.evaluate(()=>battleReview.hits>0))break;
  }
  await page.waitForTimeout(150);
  const result=await page.evaluate(()=>({hits:battleReview.hits,elapsed:campaign.mission.state.time-battleReview.start,pulses:campaign.world.attackPulses.count,focus:document.querySelector('#objective-focus').getAttribute('aria-label'),drawCalls:campaign.world.renderer.info.render.calls}));
  assert(result.hits>0,'Autonomous enemies hit the player in the actual renderer');assert.match(result.focus,/под огнём/);
  await page.screenshot({path:`${folder}/battle-${width}.png`});report.screens.push({width,height,...result});
 }
 assert.deepEqual(report.errors,[]);console.log(JSON.stringify(report));
}catch(error){report.failure=error.stack;if(page)await page.screenshot({path:folder+'/browser-failure.png'}).catch(()=>{});throw error;}
finally{fs.writeFileSync(folder+'/browser.json',JSON.stringify(report,null,2));await browser.close();}
