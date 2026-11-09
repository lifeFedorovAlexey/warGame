import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const folder='campaign/previews/production-paint';fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
 await page.addInitScript(()=>{for(const key of ['fieldRadio','fieldSound','fieldStoryVoice'])localStorage.setItem('warGame.'+key,'off');});
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8766/review/production-paint')+'/campaign/');
 await page.waitForFunction(()=>window.campaign?.ready||document.querySelector('#loading-status')?.textContent.startsWith('Ошибка'),null,{timeout:90000});
 assert(await page.evaluate(()=>window.campaign?.ready),errors.join('\n')||await page.locator('#loading-status').textContent());
 await page.locator('#begin').click();await page.waitForFunction(()=>document.getElementById('welcome').hidden);const skip=page.locator('[data-dream=skip]');if(await skip.isVisible())await skip.click();
 await page.evaluate(()=>{const m=campaign.mission;campaign.radio.setEnabled(false);const sign=m.entity(m.state.openingScene.signId);sign.completed=true;sign.progress=1;});
 await page.waitForFunction(()=>campaign.state.active,null,{timeout:20000});await page.locator('#pause').click();
 const fixture=await page.evaluate(()=>{
  const {mission:m,world:w}=campaign,p=w.field.gridToWorld(m.config.startGrid),parts=m.config.units.bukhanka.components;
  const add=(kind,x,y)=>m.addStructure(kind,'rai',{x,y},{completed:true,progress:1,groundHeight:w.field.heightAt(x,y)});
  const factory=add('factory',p.x+170,p.y+100),generator=add('generator',p.x-170,p.y+100);
  m.rebuildNavigation();m.state.energy=2400;m.updateEconomy(0);
  const old=m.saveDesign('ДБО-1',parts,'gray'),oldProject=m.state.designs.find(p=>p.id===old.id);
  for(let i=0;i<3;i++)m.produce(factory.id,old.id);
  factory.queue[0].progress=.35;
  const latest=m.saveDesign('ДБО-2',parts,'sand');for(let i=0;i<2;i++)m.produce(factory.id,latest.id);
  // This fixture represents an older save with prepaid production orders.
  for(const job of factory.queue){delete job.funding;m.state.energy-=job.cost;}
  // A save from the previous version can still contain both paint projects.
  m.state.designs.unshift(oldProject);
  const liveProjects=m.factoryProjects().filter(p=>p.kind==='bukhanka').map(p=>p.name);
  m.load(m.save());
  m.state.units=m.state.units.filter(u=>u.owner!=='rai');
  const ids=[];for(let i=0;i<10;i++)ids.push(m.addUnit('bukhanka','rai',{x:p.x+(i%5-2)*28,y:p.y-90-Math.floor(i/5)*32},{components:[...parts],projectId:i<5?old.id:latest.id,designName:i<5?'ДБО-1':'ДБО-2',paint:i<5?'gray':'sand'}).id);
  m.explored.fill(255);m.visible.fill(255);m.visionSources.push({x:63.5,y:63.5,radius:200});m.fogRevision++;
  w.fixedRenderScale=1;w.controls.enableDamping=false;w.controls.target.set(p.x+40,p.y,w.field.heightAt(p.x,p.y));w.camera.position.copy(w.controls.target).add({x:40,y:-330,z:360});w.controls.update();
  campaign.select(ids.slice(0,7),false,false);campaign.advance(0);
  return {factoryId:factory.id,generatorId:generator.id,ids,latestId:latest.id,liveProjects,loadedProjects:m.factoryProjects().filter(p=>p.kind==='bukhanka').map(p=>p.name)};
 });
 assert.deepEqual(fixture.liveProjects,['ДБО-2']);assert.deepEqual(fixture.loadedProjects,['ДБО-2']);
 const groups=()=>page.locator('#roster [data-icon=bukhanka]').evaluateAll(bs=>bs.map(b=>({count:b.dataset.units.split('/').length,selected:b.classList.contains('active'),name:b.getAttribute('aria-label'),title:b.title})));
 let roster=await groups();assert.deepEqual(roster.map(g=>[g.count,g.selected]),[[7,true],[3,false]]);assert(roster.every(g=>g.name.startsWith('ДБО-2')&&g.title.startsWith('ДБО-2')));
 await page.screenshot({path:folder+'/roster-mixed-colors.png'});
 await page.evaluate(id=>{campaign.select([id],false,false);campaign.advance(0);},fixture.factoryId);
 const gun=page.locator('#actions [data-production][data-icon=bukhanka]'),builder=page.locator('#actions [data-production][data-icon=builder]');
 assert.equal(await gun.count(),1);assert.equal(await gun.getAttribute('aria-label'),'ДБО-2');
 assert.equal(await gun.locator('.production-count').textContent(),'5');
 assert.equal(await gun.locator('progress').evaluate(p=>p.value),.35);
 const seconds=await page.evaluate(()=>campaign.mission.config.units.bukhanka.seconds);
 assert.equal(await gun.locator('.production-time').textContent(),Math.ceil(.65*seconds)+'с');
 assert(await builder.locator('progress').isHidden());assert(await builder.locator('.production-time').isHidden());
 // Observe actual elapsed production, then pause for deterministic checks.
 await page.locator('#pause').click();await page.waitForFunction(()=>document.querySelector('#actions [data-icon=bukhanka] progress').value>.38);
 assert.equal(await gun.getAttribute('data-production-state'),'running');await page.locator('#pause').click();
 const stopped=await page.evaluate(id=>{
  const m=campaign.mission,f=m.entity(id);return {progress:f.queue[0].progress,paint:f.queue[0].paint};
 },fixture.factoryId);assert.equal(stopped.paint,'gray');
 await page.evaluate(({factoryId,generatorId})=>{const m=campaign.mission;m.entity(generatorId).completed=false;m.updateEconomy(4);campaign.advance(0);},fixture);
 assert(Math.abs(await gun.locator('progress').evaluate(p=>p.value)-stopped.progress-4/seconds)<1e-8,'Prepaid production continues without a nuclear station');
 assert.equal(await gun.locator('.production-time').textContent(),Math.ceil((1-stopped.progress-4/seconds)*seconds)+'с');
 assert(!(await gun.getAttribute('title')).includes('Нет питания'));
 await page.evaluate(({factoryId,generatorId})=>{const m=campaign.mission;m.entity(generatorId).completed=true;const f=m.entity(factoryId);f.queue[0].progress=1;f.exitBlocked=true;f.exitRetryAt=m.state.time+100;campaign.advance(0);},fixture);
 assert.equal(await gun.locator('.production-time').textContent(),'!');assert.equal(await gun.getAttribute('data-production-state'),'blocked');
 await page.evaluate(({factoryId})=>{const m=campaign.mission,f=m.entity(factoryId);f.queue[0].progress=.45;delete f.exitBlocked;delete f.exitRetryAt;m.updateEconomy(0);campaign.advance(0);},fixture);
 for(const [name,width,height] of [['desktop',1440,900],['narrow',390,844],['landscape',844,390]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(300);
  const fit=await gun.evaluate(b=>{
   const r=b.getBoundingClientRect(),count=b.querySelector('.production-count').getBoundingClientRect(),time=b.querySelector('.production-time').getBoundingClientRect(),bar=b.querySelector('progress').getBoundingClientRect();
   return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&time.top>=count.bottom&&time.bottom<=r.bottom+1&&bar.bottom<=r.bottom+1&&bar.right<time.left;
  });assert(fit,'Progress, count and countdown fit at '+name);
  await page.mouse.move(width/2,100);await page.screenshot({path:folder+'/'+name+'.png'});
  if(name==='desktop')await page.locator('#actions').screenshot({path:folder+'/production-controls.png'});
 }
 await gun.click({button:'right'});assert.equal(await gun.locator('.production-count').textContent(),'4');
 assert.equal(await gun.locator('progress').evaluate(p=>p.value),.45,'Cancellation keeps the current order progress');
 await page.evaluate(()=>{const m=campaign.mission;m.saveDesign('ДБО-3',m.config.units.bukhanka.components,'slate');campaign.advance(0);});
 assert.equal(await gun.count(),1);assert.equal(await gun.getAttribute('aria-label'),'ДБО-3');assert.equal(await gun.locator('.production-count').textContent(),'4');
 roster=await groups();assert(roster.every(g=>g.name.startsWith('ДБО-3')),'Existing units adopt the most recent name');
 await page.evaluate(id=>{const m=campaign.mission;m.updateEconomy(m.config.units.bukhanka.seconds);campaign.advance(0);},fixture.factoryId);
 assert.equal(await gun.locator('.production-count').textContent(),'3');
 assert.deepEqual(await page.evaluate(()=>{const u=campaign.mission.state.units.at(-1);return {paint:u.paint,name:u.designName};}),{paint:'gray',name:'ДБО-3'});
 assert(await builder.locator('progress').isHidden());assert.deepEqual(errors,[]);
 console.log('PASS: old paint projects merge, newest name everywhere, 7/3 roster groups, combined queue/count/cancel, live progress/countdown, production without NPP, blocked exit, completion, desktop/narrow/landscape');
}finally{await browser.close();}
