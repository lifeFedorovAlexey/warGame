import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const folder='campaign/previews/vehicle-paint';fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
 await page.addInitScript(()=>{for(const key of ['fieldRadio','fieldSound','fieldStoryVoice'])localStorage.setItem('warGame.'+key,'off');});
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8766/review/vehicle-paint')+'/campaign/');
 await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});
 await page.locator('#begin').click();
 const skip=page.locator('[data-dream="skip"]');if(await skip.isVisible())await skip.click();
 // This review concerns paint, so finish the opening in its test fixture.
 await page.evaluate(()=>{const m=campaign.mission;campaign.radio.setEnabled(false);const sign=m.entity(m.state.openingScene.signId);sign.completed=true;sign.progress=1;});
 await page.waitForFunction(()=>campaign.state.active,null,{timeout:20000});
 await page.locator('#pause').click();
 await page.evaluate(()=>{
  const {mission:m,world:w}=campaign,p=w.field.gridToWorld(m.config.startGrid);
  m.state.units=m.state.units.filter(u=>u.owner!=='rai');
  for(const [index,kind,paint] of [[0,'builder',undefined],[1,'bukhanka',undefined],[2,'builder','sand']]){
   const u=m.addUnit(kind,'rai',{x:p.x+(index-1)*36,y:p.y-45},{heading:Math.PI,paint});
   u.previousHeading=u.heading;
  }
  m.explored.fill(255);m.visible.fill(255);m.visionSources.push({x:63.5,y:63.5,radius:200});m.fogRevision++;
  w.controls.enableDamping=false;w.fixedRenderScale=1;
  w.controls.target.set(p.x,p.y-45,w.field.heightAt(p.x,p.y-45)+4);
  w.camera.position.copy(w.controls.target).add({x:95,y:-145,z:125});w.controls.update();
  campaign.select([],false,false);campaign.advance(0);
 });
 await page.waitForTimeout(700);await page.screenshot({path:folder+'/field-desktop.png'});
 await page.locator('#design-toggle').click();
 await page.getByRole('button',{name:'Проектор',exact:true}).click();
 assert.equal(await page.locator('[data-paint=gray]').getAttribute('aria-pressed'),'true','Builder starts gray');
 assert.equal(await page.locator('[data-design-paints] button').count(),6);
 await page.waitForTimeout(600);await page.screenshot({path:folder+'/designer-gray.png'});
 await page.locator('[data-paint=slate]').click();
 assert.equal(await page.locator('[data-paint=slate]').getAttribute('aria-pressed'),'true');
 await page.locator('#project-name').fill('Серо-синий строитель');
 await page.waitForTimeout(300);await page.screenshot({path:folder+'/designer-slate.png'});
 await page.locator('#design-form [type=submit]').click();
 assert.equal(await page.evaluate(()=>campaign.mission.state.designs.find(p=>p.name==='Серо-синий строитель').paint),'slate');
 await page.locator('#design-toggle').click();
 await page.setViewportSize({width:390,height:844});
 await page.waitForTimeout(500);
 const fit=await page.evaluate(()=>{
  const dialog=document.querySelector('#designer').getBoundingClientRect();
  return [...document.querySelectorAll('[data-design-paints] button,#design-form [type=submit],#project-name')].every(n=>{const r=n.getBoundingClientRect();return r.left>=dialog.left&&r.right<=dialog.right&&r.top>=dialog.top&&r.bottom<=dialog.bottom;});
 });
 assert(fit,'All paint choices and save controls fit the narrow screen');
 await page.screenshot({path:folder+'/designer-narrow.png'});
 await page.locator('[data-paint=gray]').focus();await page.keyboard.press('Enter');
 assert.equal(await page.locator('[data-paint=gray]').getAttribute('aria-pressed'),'true','Keyboard paint selection');
 await page.locator('[data-close-designer]').click();
 await page.evaluate(()=>{const w=campaign.world,p=campaign.mission.state.units.find(u=>u.owner==='rai'&&u.kind==='builder');w.controls.target.set(p.x,p.y,w.field.heightAt(p.x,p.y)+4);w.camera.position.copy(w.controls.target).add({x:65,y:-90,z:100});w.controls.update();});
 await page.waitForTimeout(400);await page.screenshot({path:folder+'/field-narrow.png'});
 assert.deepEqual(errors,[]);
 console.log('PASS: actual builder/combat paint, constructor default/selection/save, narrow layout, keyboard selection, no browser/shader errors');
} finally {await browser.close();}
