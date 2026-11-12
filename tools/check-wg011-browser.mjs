import fs from 'node:fs';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const before=process.argv.includes('--before'),folder='docs/playtest-evidence/wg011/'+(before?'before':'after');fs.mkdirSync(folder,{recursive:true});
const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
const report={errors:[],screens:[]};let page;
try{
 page=await b.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});page.on('pageerror',e=>report.errors.push(e.message));
 await page.addInitScript(()=>{for(const key of ['fieldRadio','fieldStoryVoice','fieldSound'])localStorage.setItem('warGame.'+key,'off');});
 await page.goto(`http://127.0.0.1:${before?8777:8788}/campaign/?mission=m02`);await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});
 await page.locator('#begin').click();await page.waitForFunction(()=>campaign.state.active&&!campaign.state.openingPlaying);
 await page.evaluate(async()=>{
  const {MinimapAlerts}=await import('/campaign/minimap-alerts.js'),original=MinimapAlerts.prototype.observe;
  MinimapAlerts.prototype.observe=function(...args){original.apply(this,args);window.reviewAlerts=this;};
  const c=campaign,m=c.mission;c.radio.setEnabled(false);m.advance=()=>0;m.drainEvents();m.drainEffects();
  c.world.fixedRenderScale=1;c.world.renderer.setPixelRatio(1);
  const bases=Object.values(m.state.m02.bases);bases[0].discovered=bases[1].discovered=true;bases[2].discovered=bases[3].discovered=false;
  const explore=p=>{const [x,y]=m.field.worldToGrid(p.x,p.y);for(let r=Math.floor(y)-3;r<=Math.ceil(y)+3;r++)for(let col=Math.floor(x)-3;col<=Math.ceil(x)+3;col++)if(r>=0&&r<128&&col>=0&&col<128)m.explored[r*128+col]=255;};
  m.explored.fill(0);explore(bases[0].gate);explore(bases[1].gate);
  const a=bases[2].artifact;a.state='available';m.state.artifacts.push({id:a.id,key:a.key,...a.point,collected:false});explore(a.point);
  window.reviewScenario={bases,artifactId:a.id};window.reviewCamera=c.world.controls.target.toArray();
 });
 await page.waitForTimeout(4500);
 report.initial=await page.evaluate(()=>({pings:reviewAlerts.active(performance.now()).map(p=>p.kind),notices:document.querySelector('#toast').textContent}));
 if(before)await page.waitForTimeout(28000);
 else await page.waitForFunction(()=>reviewAlerts.pings.some(p=>p.reminder),null,{timeout:40000});
 report.reminders=await page.evaluate(()=>reviewAlerts.active(performance.now()).map(p=>({kind:p.kind,key:p.objectiveKey,reminder:p.reminder,x:p.x,y:p.y})));
 if(before)assert.equal(report.reminders.length,0);else{
  assert.equal(report.reminders.filter(p=>p.kind==='enemyObjective').length,2);assert.equal(report.reminders.filter(p=>p.kind==='artifact').length,1);
  const hidden=await page.evaluate(()=>reviewScenario.bases.slice(2).map(b=>'camp:'+b.id));assert(!report.reminders.some(p=>hidden.includes(p.key)));
 }
 for(const [width,height] of [[1440,900],[844,390],[667,375]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(120);
  if(!before)await page.evaluate(()=>{for(const p of reviewAlerts.pings)if(p.reminder){p.born=performance.now()-450;p.until=performance.now()+3000;}});
  await page.screenshot({path:`${folder}/reminder-${width}.png`});
  const bounds=await page.locator('#minimap').boundingBox();assert(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=width&&bounds.y+bounds.height<=height);
  report.screens.push({width,height,minimap:bounds});
 }
 report.cameraMoved=await page.evaluate(()=>campaign.world.controls.target.toArray().some((n,i)=>Math.abs(n-reviewCamera[i])>.01));assert(!report.cameraMoved);
 if(!before){
  await page.waitForTimeout(3200);
  report.combat={firstShot:await page.evaluate(()=>{
   const m=campaign.mission,u=m.state.units.find(u=>u.owner==='rai'&&u.kind==='bukhanka');
   const enemy=m.addUnit('raider','scavs',{x:u.x+40,y:u.y},{hp:10000,maxHp:10000});
   const shot=()=>{m.state.time+=1;u.cooldown=0;return m.attack(u,enemy,m.unitSpec(u));};
   const hit=()=>{m.damage(u,1,enemy);campaign.advance(0);};
   window.reviewCombat={shot,hit,timer:setInterval(shot,500)};
   reviewAlerts.reminders.elapsed=29500;return shot();
  })};assert(report.combat.firstShot);
  await page.waitForTimeout(1700);
  report.combat.deferred=await page.evaluate(()=>!reviewAlerts.active(performance.now()).some(p=>p.reminder));assert(report.combat.deferred);
  await page.evaluate(()=>{
   clearInterval(reviewCombat.timer);reviewCombat.timer=setInterval(()=>{reviewCombat.shot();reviewCombat.hit();},500);
   reviewCombat.hit();reviewAlerts.reminders.sinceReminder=119500;
  });
  await page.waitForFunction(()=>reviewAlerts.pings.some(p=>p.combatProtected));
  report.combat.deadline=await page.evaluate(()=>reviewAlerts.active(performance.now()).map(p=>({kind:p.kind,protected:!!p.combatProtected})));
  assert.equal(report.combat.deadline.filter(p=>p.protected).length,3);assert(report.combat.deadline.some(p=>p.kind==='attack'));
  for(const [width,height] of [[1440,900],[844,390],[667,375]]){
   await page.setViewportSize({width,height});await page.waitForTimeout(120);
   // Freeze only the pulse's visual phase for comparable screenshots.
   await page.evaluate(()=>{for(const p of reviewAlerts.pings)if(p.combatProtected){p.born=performance.now()-450;p.until=performance.now()+3000;}});
   await page.screenshot({path:`${folder}/combat-${width}.png`});
  }
  await page.waitForTimeout(700);
  report.combat.survivesHits=await page.evaluate(()=>reviewAlerts.active(performance.now()).some(p=>p.combatProtected));assert(report.combat.survivesHits);
  await page.evaluate(()=>clearInterval(reviewCombat.timer));await page.waitForTimeout(3200);
  report.combat.expired=await page.evaluate(()=>!reviewAlerts.active(performance.now()).some(p=>p.reminder));assert(report.combat.expired);
  await page.evaluate(()=>{reviewAlerts.reminders.elapsed=30000;});
  await page.waitForFunction(()=>reviewAlerts.pings.some(p=>p.reminder));
  await page.evaluate(()=>{const m=campaign.mission;reviewScenario.bases[0].state='neutralized';m.state.artifacts.find(a=>a.id===reviewScenario.artifactId).collected=true;});
  await page.waitForTimeout(350);report.afterCompletion=await page.evaluate(()=>reviewAlerts.pings.map(p=>({kind:p.kind,key:p.objectiveKey})));
  assert(!report.afterCompletion.some(p=>p.kind==='artifact'));assert.equal(report.afterCompletion.filter(p=>p.kind==='enemyObjective').length,1);
 }
 assert.deepEqual(report.errors,[]);console.log(JSON.stringify(report));
}catch(error){report.failure=error.stack;if(page)await page.screenshot({path:folder+'/failure.png'}).catch(()=>{});throw error;}
finally{fs.writeFileSync(folder+'/browser.json',JSON.stringify(report,null,2));await b.close();}
