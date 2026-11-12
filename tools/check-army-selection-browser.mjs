import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const folder='campaign/previews/army-selection';fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>{for(const k of ['fieldSound','fieldRadio','fieldStoryVoice'])localStorage.setItem('warGame.'+k,'off');});
 await page.goto('http://127.0.0.1:8766/review/army-selection/campaign/');
 await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});
 await page.locator('#begin').click();await page.waitForFunction(()=>document.getElementById('welcome').hidden);
 if(await page.locator('[data-dream=skip]').isVisible())await page.locator('[data-dream=skip]').click();
 await page.evaluate(()=>{campaign.radio.setEnabled(false);const m=campaign.mission,s=m.entity(m.state.openingScene.signId);s.completed=true;s.progress=1;});
 await page.waitForFunction(()=>campaign.state.active,null,{timeout:25000});await page.locator('#pause').click();
 const fixture=await page.evaluate(()=>{
  const c=campaign,m=c.mission,p=m.field.gridToWorld(m.config.startGrid);
  m.state.units=[];m.state.buildings=[];m.state.camps=[];m.updateMission=()=>{};
  m.explored.fill(255);m.visible.fill(255);m.fogRevision++;
  m.setArmyCombatPolicy({retreat:'light',response:'return',priority:'strongest'});
  const ready=Array.from({length:6},(_,i)=>m.addUnit('bukhanka','rai',{x:p.x+i%3*35,y:p.y+Math.floor(i/3)*40}));
  ready[5].x+=1800;ready[5].y+=1800;
  ready[0].task={type:'move',x:p.x-60,y:p.y};
  const worker=m.addUnit('builder','rai',{x:p.x-40,y:p.y});
  const wounded=m.addUnit('bukhanka','rai',{x:p.x-40,y:p.y+45});wounded.hp=wounded.maxHp*.8;
  const critical=m.addUnit('bukhanka','rai',{x:p.x-40,y:p.y+85});critical.hp=critical.maxHp*.3;
  const retreating=m.addUnit('bukhanka','rai',{x:p.x+80,y:p.y-35});retreating.combatRetreat={status:'travelling'};
  const repairing=m.addUnit('bukhanka','rai',{x:p.x+120,y:p.y-35});repairing.factoryVisit={factoryId:'test-factory',phase:'waiting'};repairing.hp=repairing.maxHp*.9;
  const stranded=m.addUnit('bukhanka','rai',{x:p.x+120,y:p.y+40});stranded.hp=stranded.maxHp*.4;
  stranded.factoryVisit={factoryId:'test-factory',phase:'waiting'};
  stranded.navigation={reason:'factory-route-unavailable'};
  m.addUnit('bukhanka','scavs',{x:p.x+700,y:p.y});m.addUnit('bukhanka','rai',{x:p.x+750,y:p.y},{hp:0});
  c.select([worker.id],false,false);c.advance(0);c.world.centre(p,360);
  return {ready:ready.map(u=>u.id),stranded:stranded.id,worker:worker.id,wounded:wounded.id,critical:critical.id};
 });
 const selected=()=>page.evaluate(()=>campaign.selected),state=()=>page.evaluate(()=>campaign.mission.state.units.map(u=>({id:u.id,task:u.task,path:u.path,combatPolicy:u.combatPolicy,combatRetreat:u.combatRetreat,factoryVisit:u.factoryVisit})));
 const original=await state(),camera=await page.evaluate(()=>campaign.world.controls.target.toArray());
 const available=[...fixture.ready,fixture.stranded];
 await page.keyboard.press('F2');assert.deepEqual(new Set(await selected()),new Set(available));assert.deepEqual(await state(),original);
 assert.deepEqual(await page.evaluate(()=>campaign.world.controls.target.toArray()),camera);
 await page.waitForFunction(()=>document.getElementById('select-army').getAttribute('aria-pressed')==='true');
 await page.evaluate(id=>campaign.select([id],false,false),fixture.worker);await page.locator('#select-army').click();assert.deepEqual(new Set(await selected()),new Set(available));
 await page.keyboard.press('KeyF');await page.keyboard.press('F2');assert.equal(await page.evaluate(()=>campaign.state.orderMode),'attack');assert.deepEqual(await state(),original);await page.keyboard.press('Escape');
 await page.locator('#combat-modes').click();await page.locator('[data-policy=retreat][data-value=heavy]').click();await page.keyboard.press('Escape');await page.keyboard.press('F2');
 assert.deepEqual(new Set(await selected()),new Set([...available,fixture.wounded]));
 await page.locator('#combat-modes').click();await page.locator('[data-policy=response][data-value=ignore]').click();await page.keyboard.press('Escape');await page.keyboard.press('F2');
 assert.deepEqual(new Set(await selected()),new Set([...available,fixture.wounded]),'Hold fire remains selectable and keeps its fire policy');
 assert(await page.evaluate(ids=>ids.every(id=>campaign.mission.entity(id).combatPolicy.response==='ignore'),fixture.ready));
 await page.locator('#design-toggle').click();await page.locator('#project-name').focus();const beforeTyping=await selected();await page.keyboard.press('F2');assert.deepEqual(await selected(),beforeTyping);await page.locator('[data-close-designer]').click();
 await page.evaluate(id=>{campaign.select([id],false,false);const input=document.createElement('div');input.id='typing-test';input.contentEditable='true';document.body.append(input);input.focus();},fixture.worker);
 await page.keyboard.press('F2');assert.deepEqual(await selected(),[fixture.worker]);await page.evaluate(()=>document.getElementById('typing-test').remove());
 await page.keyboard.press('F2');
 const audit=()=>page.evaluate(()=>{
  const button=document.getElementById('select-army'),r=button.getBoundingClientRect(),icon=button.querySelector('svg'),i=icon.getBoundingClientRect(),roster=document.getElementById('roster').getBoundingClientRect(),css=getComputedStyle(button);
  return {inViewport:r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,beside:r.right<=roster.left,centered:Math.abs(r.x+r.width/2-i.x-i.width/2)<.5&&Math.abs(r.y+r.height/2-i.y-i.height/2)<.5,icon:icon.getBBox().width>0,background:css.backgroundColor,border:css.borderTopWidth,caption:button.textContent.trim(),key:button.getAttribute('aria-keyshortcuts')};
 });
 for(const [label,width,height] of [['wide',1440,900],['landscape',844,390],['small-landscape',667,375]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(250);const a=await audit();assert(a.inViewport&&a.beside&&a.centered&&a.icon,JSON.stringify(a));assert.equal(a.border,'0px');assert.equal(a.background,'rgba(0, 0, 0, 0)');assert.equal(a.caption,'');assert.equal(a.key,'F2');
  await page.screenshot({path:folder+'/'+label+'.png'});
 }
 await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(150);await page.locator('.squad').screenshot({path:folder+'/controls.png'});
 await page.evaluate(id=>{for(const u of campaign.mission.state.units)if(u.kind!=='builder')u.hp=0;campaign.select([id],false,false);campaign.advance(0);},fixture.worker);
 await page.waitForFunction(()=>document.getElementById('select-army').disabled);
 await page.keyboard.press('F2');assert.deepEqual(await selected(),[fixture.worker]);
 assert.deepEqual(errors,[]);console.log('PASS: F2 and button, offscreen army, retreat modes, repairs excluded, preserved orders/fire policy/attack cursor, typing guard, empty army, desktop/narrow/landscape');
}finally{await browser.close();}
