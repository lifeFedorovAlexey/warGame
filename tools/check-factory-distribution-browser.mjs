import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const folder='campaign/previews/factory-distribution';fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];
 page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
 await page.addInitScript(()=>{for(const k of ['fieldRadio','fieldSound','fieldStoryVoice'])localStorage.setItem('warGame.'+k,'off');});
 await page.goto('http://127.0.0.1:8766/review/factory-distribution-'+Date.now()+'/campaign/');
 await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});
 await page.locator('#begin').click();await page.waitForFunction(()=>document.getElementById('welcome').hidden);
 await page.evaluate(()=>{const m=campaign.mission,s=m.entity(m.state.openingScene.signId);s.completed=true;s.progress=1;});
 await page.waitForFunction(()=>campaign.state.active,null,{timeout:25000});await page.locator('#pause').click();
 const ids=await page.evaluate(()=>{
  const c=campaign,m=c.mission,w=c.world,p=w.field.gridToWorld(m.config.startGrid);
  const a=m.addStructure('factory','rai',{x:p.x+170,y:p.y+100},{completed:true,progress:1});
  const b=m.addStructure('factory','rai',{x:p.x-170,y:p.y+100},{completed:true,progress:1});
  m.state.energy=2400;m.state.research.flamethrower=true;m.saveDesign('Огнемёт',['C01','B01','mission-flamer']);
  m.rebuildNavigation();m.updateEconomy(0);m.updateFog();c.advance(0);
  w.fixedRenderScale=1;w.controls.enableDamping=false;w.controls.target.set(p.x,p.y+70,w.field.heightAt(p.x,p.y));w.camera.position.copy(w.controls.target).add({x:70,y:-470,z:570});w.controls.update();
  return [a.id,b.id];
 });
 await page.locator('#production-toggle').click();
 const auto=page.locator('#actions > [data-production][data-icon=bukhanka]');
 for(let i=0;i<6;i++)await auto.click();
 const lengths=()=>page.evaluate(ids=>ids.map(id=>campaign.mission.entity(id).queue.length),ids);
 assert.deepEqual(await lengths(),[3,3]);assert.equal(await auto.locator('.production-count').textContent(),'6');
 assert.equal(await page.locator('[data-factory-row]').count(),2);
 const row=id=>page.locator('[data-factory-row="'+id+'"]');
 for(const id of ids)assert.equal(await row(id).locator('[data-factory-production=bukhanka] .production-count').textContent(),'3');
 await page.evaluate(ids=>{const m=campaign.mission;m.updateEconomy(6);m.entity(ids[1]).queue[0].progress=.6;campaign.advance(0);},ids);
 const values=await page.locator('[data-factory-production=bukhanka] progress').evaluateAll(ps=>ps.map(p=>p.value));assert(values[0]>0&&values[1]>values[0]);
 await row(ids[1]).locator('[data-factory-production=bukhanka]').click({button:'right'});assert.deepEqual(await lengths(),[3,2]);
 await row(ids[0]).locator('[data-factory-production=builder]').click();assert.deepEqual(await lengths(),[4,2]);
 await auto.click({button:'right'});assert.deepEqual(await lengths(),[3,2],'Global cancel preserves progressed front jobs');
 await page.evaluate(()=>{const m=campaign.mission;m.load(m.save());campaign.advance(0);});
 await row(ids[1]).locator('[data-factory-priority]').click();
 assert.equal(await page.evaluate(id=>campaign.mission.entity(id).workPriority,ids[1]),'production');
 assert.equal(await row(ids[1]).locator('[data-factory-priority] progress').count(),1,'Updating icon retains one progress control');
 for(const [name,width,height] of [['desktop',1920,1080],['narrow',390,844],['landscape',844,390]]){
  await page.setViewportSize({width,height});await page.mouse.move(width/2,80);await page.waitForTimeout(250);
  const issues=await page.locator('#actions').evaluate(root=>{
   const issues=[];for(const b of root.querySelectorAll('button')){
    const r=b.getBoundingClientRect();if(r.left<0||r.right>innerWidth+1||r.top<0||r.bottom>innerHeight+1)issues.push('Offscreen '+b.title);
   }
   for(const row of root.querySelectorAll('[data-factory-row]')){
    const style=getComputedStyle(row);if(style.backgroundColor!=='rgba(0, 0, 0, 0)'||style.borderTopWidth!=='0px')issues.push('Framed row');
    const rs=[...row.children].map(b=>b.getBoundingClientRect());if(rs.some(r=>Math.abs(r.top-rs[0].top)>1))issues.push('Factory split into several rows');
   }
   return issues;
  });assert.deepEqual(issues,[],name);await page.screenshot({path:folder+'/'+name+'.png'});
  if(name==='desktop')await page.locator('#actions').screenshot({path:folder+'/controls.png'});
 }
 await page.evaluate(id=>{campaign.mission.entity(id).hp=0;campaign.advance(0);},ids[1]);
 assert.equal(await page.locator('[data-factory-row]').count(),0,'Single-factory controls do not duplicate rows');
 await page.evaluate(()=>{const m=campaign.mission,p=campaign.world.field.gridToWorld(m.config.startGrid);m.addStructure('factory','rai',{x:p.x-170,y:p.y+100},{completed:true,progress:1});campaign.advance(0);});
 assert.equal(await page.locator('[data-factory-row]').count(),2);
 assert.deepEqual(errors,[]);
 fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/factory-distribution.json',JSON.stringify({queuesAfterSixOrders:[3,3],progress:values,errors,checks:['actual menu clicks','per-factory order and cancellation','global cancel preserves work','save/load','repair priorities','factory removal','desktop/narrow/landscape']},null,2));
 console.log('PASS: menu orders split 3/3; independent factory rows, progress, explicit order/cancel, global cancel, save/load, repair priority, live factory list, desktop/narrow/landscape; no browser errors');
}finally{await browser.close();}
