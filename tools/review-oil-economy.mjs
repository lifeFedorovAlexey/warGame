import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const folder='campaign/previews/oil-economy';fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
 await page.addInitScript(()=>{for(const key of ['fieldRadio','fieldSound','fieldStoryVoice'])localStorage.setItem('warGame.'+key,'off');});
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8766/review/oil-economy')+'/campaign/');
 await page.waitForFunction(()=>window.campaign?.ready||document.querySelector('#loading-status')?.textContent.startsWith('Ошибка'),null,{timeout:90000});
 assert(await page.evaluate(()=>window.campaign?.ready),errors.join('\n'));
 await page.locator('#begin').click();const skip=page.locator('[data-dream=skip]');if(await skip.isVisible())await skip.click();
 await page.evaluate(()=>{const m=campaign.mission;campaign.radio.setEnabled(false);const sign=m.entity(m.state.openingScene.signId);sign.completed=true;sign.progress=1;});
 await page.waitForFunction(()=>campaign.state.active,null,{timeout:20000});await page.locator('#pause').click();
 const ids=await page.evaluate(()=>{
  const {mission:m,world:w}=campaign,p=w.field.gridToWorld(m.config.startGrid);
  const add=(kind,grid)=>{const at=w.field.gridToWorld(grid);return m.addStructure(kind,'rai',at,{completed:true,progress:1,groundHeight:w.field.heightAt(at.x,at.y)});};
  const buildings=m.config.baseSites.map(s=>add(s.kind,s.grid)),station=buildings[0],factory=buildings[1];
  m.state.energy=750;m.updateEconomy(0);campaign.select([factory.id],false,false);
  w.fixedRenderScale=1;w.controls.enableDamping=false;w.controls.target.set(p.x-80,p.y-100,w.field.heightAt(p.x,p.y));w.camera.position.copy(w.controls.target).add({x:40,y:-390,z:460});w.controls.update();
  m.explored.fill(255);m.visible.fill(255);m.visionSources.push({x:63.5,y:63.5,radius:200});m.fogRevision++;campaign.advance(0);
  return {station:station.id,factory:factory.id};
 });
 assert.equal(await page.locator('#power').textContent(),'0/4');
 assert.equal(await page.locator('#energy').textContent(),'750');
 assert(await page.locator('#income').isHidden());
 assert.equal(await page.locator('#oil-resource use').getAttribute('href'),'hud-icons.svg#oil');
 assert((await page.locator('#actions button').first().getAttribute('title')).includes('нефти'));
 await page.evaluate(()=>{const m=campaign.mission;for(const grid of m.config.oilFields.slice(0,4))m.addStructure('derrick','rai',m.field.gridToWorld(grid),{completed:true,progress:1});m.updateEconomy(0);campaign.advance(0);});
 assert.equal(await page.locator('#power').textContent(),'4/4');assert.equal(await page.locator('#income').textContent(),'+20');
 await page.locator('#toast').waitFor({state:'hidden'});
 for(const [name,width,height] of [['desktop',1440,900],['narrow',390,844],['small',320,740]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(350);
  // Include the optional goal shortcut in the space budget.
  const fit=await page.evaluate(()=>{
   document.querySelector('#objective-focus').hidden=false;
   const selectors=['#oil-resource','#power-resource','#population','#objective-focus','#pause','.settings'];
   const rects=selectors.map(s=>{const r=document.querySelector(s).getBoundingClientRect();return {selector:s,left:r.left,right:r.right,top:r.top,bottom:r.bottom};});
   const power=document.querySelector('#power').getBoundingClientRect();
   return {ok:power.width>0&&power.height>0&&rects.every((r,i)=>r.left>=0&&r.right<=innerWidth&&r.bottom<=44&&(!i||r.left>=rects[i-1].right)),rects};
  });assert(fit.ok,JSON.stringify({name,...fit}));
  await page.mouse.move(width/2,Math.min(650,height-100));await page.screenshot({path:folder+'/'+name+'.png'});
  const beside=await page.locator('#income').evaluate(el=>{const rate=el.getBoundingClientRect(),stock=document.querySelector('#energy').getBoundingClientRect();return rate.left-stock.right<=6&&Math.abs(rate.y+rate.height/2-stock.y-stock.height/2)<1;});
  assert(beside,'Rate sits directly beside the oil stock at '+name);
  if(name==='desktop')await page.screenshot({path:folder+'/resources.png',clip:{x:0,y:0,width:400,height:44}});
 }
 await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(200);
 const order=await page.evaluate(id=>{
  const m=campaign.mission,before=m.state.energy,result=m.produce(id,'bukhanka'),ordered=m.state.energy;
  m.updateEconomy(1);campaign.advance(0);
  return {ok:result.ok,before,ordered,after:m.state.energy,paid:m.entity(id).queue[0].funding.paid,progress:m.entity(id).queue[0].progress};
 },ids.factory);
 assert(order.ok);assert.equal(order.ordered,order.before);assert.equal(order.after,order.before-5);assert.equal(order.paid,25);assert.equal(order.progress,0);
 assert.equal(await page.locator('#income').textContent(),'−5');
 assert.equal(await page.locator('#income').evaluate(el=>getComputedStyle(el).color),'rgb(231, 127, 114)');
 assert((await page.locator('#actions [data-icon=bukhanka]').getAttribute('title')).includes('Перечисление нефти 25/130'));
 await page.screenshot({path:folder+'/rate-negative.png',clip:{x:0,y:0,width:170,height:44}});
 await page.locator('#actions').screenshot({path:folder+'/funding.png'});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);await page.screenshot({path:folder+'/funding-narrow.png'});
 await page.evaluate(()=>{const m=campaign.mission;m.updateEconomy(4.2);m.updateEconomy(.5);campaign.advance(0);});
 assert.equal(await page.locator('#income').textContent(),'+20');
 assert.equal(await page.locator('#income').evaluate(el=>getComputedStyle(el).color),'rgb(169, 203, 120)');
 await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(200);
 await page.screenshot({path:folder+'/rate-positive.png',clip:{x:0,y:0,width:170,height:44}});
 await page.evaluate(()=>{const m=campaign.mission;m.addStructure('derrick','rai',m.field.gridToWorld(m.config.oilFields[4]),{completed:true});m.updateEconomy(0);campaign.advance(0);});
 assert.equal(await page.locator('#power').textContent(),'5/4');assert((await page.locator('#power-resource').getAttribute('class')).includes('overloaded'));
 assert((await page.locator('#power-resource').getAttribute('title')).includes('Без питания: 1'));
 assert.equal(await page.locator('#power').evaluate(el=>getComputedStyle(el).color),'rgb(240, 160, 75)');
 await page.locator('.top').screenshot({path:folder+'/overload.png'});
 await page.evaluate(()=>{const m=campaign.mission;m.addStructure('generator','rai',{x:0,y:0},{completed:true});m.updateEconomy(0);campaign.advance(0);});
 assert.equal(await page.locator('#power').textContent(),'5/8');assert.equal(await page.locator('#income').textContent(),'+25');
 assert(!(await page.locator('#power-resource').getAttribute('class')).includes('overloaded'));
 await page.evaluate(()=>{const m=campaign.mission;for(const b of m.state.buildings)if(b.kind==='generator')b.hp=0;m.updateEconomy(0);campaign.advance(0);});
 assert.equal(await page.locator('#power').textContent(),'5/0');assert(await page.locator('#income').isHidden());
 await page.screenshot({path:folder+'/rate-zero.png',clip:{x:0,y:0,width:170,height:44}});
 const labId=await page.evaluate(()=>{
  const m=campaign.mission,lab=m.state.buildings.find(b=>b.kind==='lab'&&b.owner==='rai');
  m.state.energy=130;m.state.storyConstruction={enabled:false};m.state.artifactKeys.push(Object.keys(m.config.research)[0]);
  campaign.select([lab.id],false,false);campaign.advance(0);return lab.id;
 });
 assert.equal(await page.locator('#actions [data-research]').count(),1);
 await page.evaluate(id=>{const m=campaign.mission;if(!m.produce(id,'bukhanka').ok)throw new Error('Order failed');campaign.advance(0);},ids.factory);
 assert.equal(await page.locator('#energy').textContent(),'130');assert.equal(await page.locator('#actions [data-research]').count(),0,'Reserved oil immediately hides unaffordable research');
 await page.evaluate(id=>{campaign.mission.cancelProduction(id,'bukhanka');campaign.advance(0);},ids.factory);
 assert.equal(await page.locator('#actions [data-research]').count(),1,'Cancelling an unpaid order restores availability');
 assert.deepEqual(errors,[]);console.log('PASS: compact signed net flow, real transfer then production, zero hidden, 0/4 → 4/4 → 5/4 → 5/8 → 5/0, overload, desktop/390/320 HUD fit');
}finally{await browser.close();}
