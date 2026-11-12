import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const folder='campaign/previews/factory-menu';fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{for(const k of ['fieldRadio','fieldSound','fieldStoryVoice'])localStorage.setItem('warGame.'+k,'off');});
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8766')+'/campaign/');
 await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});
 await page.locator('#begin').click();await page.waitForFunction(()=>document.getElementById('welcome').hidden);
 if(await page.locator('[data-dream=skip]').isVisible())await page.locator('[data-dream=skip]').click();
 await page.evaluate(()=>{const c=campaign,m=c.mission;c.radio.setEnabled(false);const s=m.entity(m.state.openingScene.signId);s.completed=true;s.progress=1;});
 await page.waitForFunction(()=>campaign.state.active,null,{timeout:25000});await page.locator('#pause').click();
 const ids=await page.evaluate(()=>{
  const c=campaign,m=c.mission,w=c.world,p=w.field.gridToWorld(m.config.startGrid);
  const a=m.addStructure('factory','rai',{x:p.x+140,y:p.y+100},{completed:true,progress:1});
  const b=m.addStructure('factory','rai',{x:p.x-140,y:p.y+100},{completed:true,progress:1});
  m.state.energy=2400;
  for(const {spec} of m.vehicleRecipes)if(spec.requires)m.state.research[spec.requires]=true;
  for(const {kind,spec,components} of m.availableVehicleRecipes())if(kind!=='builder')m.saveDesign(spec.name,components);
  m.rebuildNavigation();m.updateFog();w.centre(p,500);
  return [a.id,b.id];
 });
 await page.locator('#production-toggle').click();
 const unit=page.locator('[data-production=bukhanka]'),hint=page.locator('#factory-production-hint');
 await unit.waitFor({state:'visible'});
 const projectCount=await page.evaluate(()=>campaign.mission.factoryProjects().length);
 assert.equal(await page.locator('.factory-catalogue [data-production]').count(),projectCount);
 assert.equal(await unit.count(),1);
 const lengths=()=>page.evaluate(ids=>ids.map(id=>campaign.mission.entity(id).queue.length),ids);
 for(let i=0;i<6;i++)await unit.click();
 assert.deepEqual(await lengths(),[3,3]);
 await unit.hover();
 await page.waitForFunction(()=>document.querySelector('#factory-production-hint .factory-hint-distribution').textContent==='Завод 1 · 3\nЗавод 2 · 3');
 assert.equal(await unit.locator('.production-count').textContent(),'6');
 await unit.click({button:'right'});assert.deepEqual(await lengths(),[3,2]);
 await page.waitForFunction(()=>document.querySelector('#factory-production-hint .factory-hint-distribution').textContent==='Завод 1 · 3\nЗавод 2 · 2');
 await page.locator('[data-production=builder]').click();
 assert.equal(await page.evaluate(()=>campaign.mission.state.buildings.flatMap(b=>b.queue).filter(job=>job.kind==='builder').length),1);
 await page.locator('[data-factory-row] [data-icon=factory]').click();
 const second=page.locator('[data-factory-row="'+ids[1]+'"]');
 await second.locator('[data-factory-priority]').click();
 assert.equal(await page.evaluate(id=>campaign.mission.entity(id).workPriority,ids[1]),'production');
 await second.locator('[data-factory-modernization]').click();
 assert(await page.evaluate(id=>campaign.mission.entity(id).autoModernize,ids[1]));
 await page.evaluate(()=>{
  const c=campaign,m=c.mission,p=c.world.field.gridToWorld(m.config.startGrid);
  for(let i=0;i<8;i++){
   const f=m.addStructure('factory','rai',{x:p.x+360+i*150,y:p.y+500},{completed:true,progress:1});
   if(!m.produce(f.id,'bukhanka').ok)throw Error('Test fixture could not add an order');
  }
  c.advance(0);
 });
 await page.waitForFunction(()=>document.querySelector('[data-production=bukhanka]').dataset.distribution.includes('Завод 10 · 1'));
 assert.equal(await page.locator('.factory-catalogue [data-production]').count(),projectCount);
 assert.equal(await page.locator('[data-factory-row]').count(),1);
 for(const [name,width,height] of [['desktop',1440,900],['landscape',844,390],['small-landscape',667,375]]){
  await page.setViewportSize({width,height});await unit.hover();await hint.waitFor({state:'visible'});
  const issues=await page.locator('.factory-queues').evaluate(root=>[...root.querySelectorAll('button, [role=tooltip]')].filter(el=>{
   const r=el.getBoundingClientRect();return r.left<0||r.top<0||r.right>innerWidth+1||r.bottom>innerHeight+1;
  }).map(el=>el.getAttribute('aria-label')??el.id));
  assert.deepEqual(issues,[],name);await page.screenshot({path:folder+'/'+name+'.png'});
 }
 await page.mouse.move(10,120);await hint.waitFor({state:'hidden'});
 await unit.focus();await hint.waitFor({state:'visible'});
 assert.deepEqual(errors,[]);
 console.log('PASS: shared production catalogue, live per-factory tooltip, cancellation, factory settings, desktop and landscape');
}finally{await browser.close();}
