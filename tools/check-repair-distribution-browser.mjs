import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dir='campaign/previews/repair-distribution';fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{for(const k of ['fieldSound','fieldRadio','fieldStoryVoice'])localStorage.setItem('warGame.'+k,'off');});
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8766/review/repair-distribution-'+Date.now())+'/campaign/');
 await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});
 await page.locator('#begin').click();const skip=page.locator('[data-dream=skip]');if(await skip.isVisible())await skip.click();
 await page.waitForFunction(()=>campaign.mission.state.openingScene?.signId||campaign.state.active,null,{timeout:60000});
 await page.evaluate(()=>{const c=campaign,m=c.mission;c.radio.setEnabled(false);const s=m.entity(m.state.openingScene?.signId);if(s){s.completed=true;s.progress=1;}});
 await page.waitForFunction(()=>campaign.state.active,null,{timeout:25000});await page.locator('#pause').click();
 await page.evaluate(()=>{
  const c=campaign,m=c.mission,w=c.world;c.renderSuspended=true;m.updateMission=()=>{};
  Object.assign(m.state,{units:[],buildings:[],camps:[],raidReserve:[],artifacts:[],pendingCinematics:[],bounds:[0,0,127,127],time:20,status:'running',energy:2400});
  m.state.storyConstruction={enabled:false};m.state.salvage.items=[];m.explored.fill(255);m.visible.fill(255);m.visionSources=[{x:63.5,y:63.5,radius:200}];m.fogRevision++;
  c.repairFactories=[{x:-1656,y:472},{x:-1456,y:448},{x:-1616,y:240,rotation:Math.PI}]
   .map(p=>m.addStructure('factory','rai',p,{completed:true,progress:1,rotation:p.rotation??0}).id);
  for(let i=0;i<9;i++){
   const u=m.addUnit('bukhanka','rai',{x:-1560+i*35,y:336},{heading:0});u.hp=40;
   u.combatRetreat={status:'planning',started:20,resume:{action:'move',target:{x:u.x,y:0},origin:{x:u.x,y:0}}};
   u.trafficOnScreen=true;u.previousX=u.x;u.previousY=u.y;u.previousHeading=u.heading;
  }
  m.rebuildNavigation();c.select([],false,false);document.querySelector('#toast').hidden=true;
  w.fixedRenderScale=1;w.renderer.setPixelRatio(1);w.controls.enableDamping=false;
  w.controls.target.set(-1530,345,w.field.heightAt(-1530,345));w.camera.position.copy(w.controls.target).add({x:20,y:-480,z:620});w.controls.update();
  c.advance(.1);m.finishPendingStep();c.advance(0);w.update(m,new Set(),0);
 });
 await page.locator('#production-toggle').click();
 const assignment=await page.evaluate(()=>campaign.repairFactories.map(id=>campaign.mission.state.units.filter(u=>u.combatRetreat?.home?.id===id).length));
 assert(assignment.every(n=>n>=2&&n<=4),JSON.stringify(assignment));
 for(const [name,width,height] of [['wide',1440,900],['narrow',390,844]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(100);
  await page.evaluate(()=>{campaign.advance(0);campaign.world.update(campaign.mission,new Set(),0);});
  const rows=page.locator('[data-factory-row]');assert.equal(await rows.count(),3);
  const badges=await rows.locator('[data-factory-priority] .production-count').allTextContents();assert.deepEqual(badges.map(Number),assignment);
  await page.screenshot({path:dir+'/'+name+'.png'});
 }
 await page.setViewportSize({width:1440,height:900});
 const serviced=new Set();let state;
 for(let i=0;i<18;i++){
  state=await page.evaluate(()=>{
   const c=campaign,m=c.mission;
   const events=[];
   for(let j=0;j<50;j++){m.advance(.1);m.finishPendingStep();events.push(...m.events.filter(e=>['factory-admitted','factory-repair-complete'].includes(e.type)));m.events=[];}
   c.advance(0);c.world.update(m,new Set(),0);
   return {time:m.state.time,events,units:m.state.units.map(u=>({id:u.id,hp:u.hp,phase:u.factoryVisit?.phase,factory:u.factoryVisit?.factoryId,reason:u.navigation?.reason}))};
  });
  for(const event of state.events)serviced.add(event.factory);
  if(serviced.size===3)break;
 }
 await page.screenshot({path:dir+'/servicing.png'});
 const report={assignment,serviced:[...serviced],state,errors};fs.writeFileSync(dir+'/result.json',JSON.stringify(report,null,2));
 assert.equal(serviced.size,3,JSON.stringify(report));assert.deepEqual(errors,[]);
 console.log(JSON.stringify(report));
}finally{await browser.close();}
