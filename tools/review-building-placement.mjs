import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const folder='campaign/previews/building-placement';fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
 await page.addInitScript(()=>{for(const key of ['fieldRadio','fieldSound','fieldStoryVoice'])localStorage.setItem('warGame.'+key,'off');});
 await page.goto('http://127.0.0.1:8766/review/building-placement/campaign/');
 await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});await page.locator('#begin').click();
 const skip=page.locator('[data-dream=skip]');if(await skip.isVisible())await skip.click();
 await page.evaluate(()=>{const m=campaign.mission;campaign.radio.setEnabled(false);const sign=m.entity(m.state.openingScene.signId);sign.completed=true;sign.progress=1;});
 await page.waitForFunction(()=>campaign.state.active,null,{timeout:20000});await page.locator('#pause').click();
 const setup=await page.evaluate(()=>{
  const {mission:m,world:w}=campaign,p=w.field.gridToWorld(m.config.startGrid);
  m.state.storyConstruction={enabled:false};m.state.energy=5000;m.explored.fill(255);m.visible.fill(255);m.visionSources.push({x:63.5,y:63.5,radius:200});m.fogRevision++;
  let first,beside;
  search:for(let x=p.x-200;x<=p.x+100;x+=24)for(let y=p.y-200;y<=p.y+100;y+=24){
   const a=m.placement('lab',x,y);if(!a.ok)continue;
   const b=m.addStructure('lab','rai',a,{...a,completed:true,progress:1});m.rebuildNavigation();
   const next=m.placement('lab',b.x+b.halfWidth*2+.5,b.y+.5);
   if(next.ok){first=b;beside=next;break search;}
   m.state.buildings=m.state.buildings.filter(item=>item!==b);m.rebuildNavigation();
  }
  if(!first)throw new Error('No adjacent lab site');
  const builder=m.state.units.find(u=>u.owner==='rai'&&m.unitSpec(u).role==='builder');campaign.select([builder.id],false,false);
  w.fixedRenderScale=1;w.controls.enableDamping=false;w.controls.target.set(first.x+35,first.y,w.field.heightAt(first.x,first.y));
  w.camera.position.copy(w.controls.target).add({x:20,y:-250,z:300});w.controls.update();campaign.advance(0);
  return {first:{x:first.x,y:first.y},beside:{x:beside.x+.5,y:beside.y+.5},builder:builder.id};
 });
 const screen=p=>page.evaluate(p=>campaign.world.screen(p,0),p);
 const preview=()=>page.evaluate(()=>{const grid=campaign.world.scene.getObjectByName('building_placement_grid');return {...grid.userData,visible:grid.visible,lines:grid.getObjectByName('placement_grid_lines').visible};});
 const move=async p=>{const at=await screen(p);await page.mouse.move(at.x,at.y);await page.waitForTimeout(120);return at;};
 await page.locator('#build-toggle').click();await page.locator('#build-cards [data-icon=lab]').click();
 await move(setup.beside);let initial=await preview();assert(initial.valid,JSON.stringify(initial));assert(initial.visible&&initial.lines);assert(Math.abs(initial.x-setup.first.x-81)<1e-6);
 await page.locator('#toast').waitFor({state:'hidden'});await page.screenshot({path:folder+'/desktop.png'});
 await page.keyboard.press('r');let turned=await preview();assert.equal(turned.rotation,Math.PI/2);assert.equal(turned.x,initial.x);assert.equal(turned.y,initial.y);
 await page.keyboard.press('Shift+r');assert.equal((await preview()).rotation,0);
 await page.locator('#rotate-building').click();assert.equal((await preview()).rotation,Math.PI/2);
 await page.locator('#rotate-building').click({button:'right'});assert.equal((await preview()).rotation,0);
 await move(setup.beside);const camera=await page.evaluate(()=>campaign.world.camera.position.toArray());
 await page.keyboard.down('Shift');await page.mouse.wheel(0,120);await page.keyboard.up('Shift');await page.waitForTimeout(200);
 assert.equal((await preview()).rotation,Math.PI/2);assert((await page.evaluate(()=>campaign.world.camera.position.toArray())).every((v,i)=>Math.abs(v-camera[i])<1e-6),'Shift+wheel rotates without zoom');
 await page.keyboard.press('Shift+r');
 await move({x:setup.first.x+10,y:setup.first.y});const blocked=await preview();assert(!blocked.valid);assert(Math.abs(blocked.x%8)<1e-6);assert(await page.locator('#placement-status').isVisible());
 await page.screenshot({path:folder+'/blocked.png'});
 await move(setup.beside);await page.keyboard.down('Alt');const free=await preview();assert(!free.lines);assert.equal(await page.locator('#placement-snap').getAttribute('aria-pressed'),'false');
 await page.keyboard.press('r');assert.equal((await preview()).rotation,Math.PI/2);assert.equal(await page.evaluate(()=>campaign.state.buildKind),'lab');await page.keyboard.press('Shift+r');
 await page.keyboard.up('Alt');assert((await preview()).lines);
 await page.locator('#placement-snap').click();assert(!(await preview()).lines);await page.locator('#placement-snap').click();
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{const w=campaign.world,offset=w.camera.position.clone().sub(w.controls.target).multiplyScalar(1.8);w.camera.position.copy(w.controls.target).add(offset);w.controls.update();});await page.waitForTimeout(400);await move(setup.beside);
 const fit=await page.locator('#placement').evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight};});
 assert(fit.left>=0&&fit.right<=fit.width&&fit.bottom<=fit.height,JSON.stringify(fit));await page.screenshot({path:folder+'/narrow.png'});
 await page.setViewportSize({width:1440,height:900});await page.evaluate(()=>{const w=campaign.world,offset=w.camera.position.clone().sub(w.controls.target).divideScalar(1.8);w.camera.position.copy(w.controls.target).add(offset);w.controls.update();});await page.waitForTimeout(300);await move(setup.beside);await page.keyboard.press('r');const finalPose=await preview();assert(finalPose.valid);
 const count=await page.evaluate(()=>campaign.mission.state.buildings.length);await page.mouse.down();await page.mouse.up();
 const built=await page.evaluate(()=>{const b=campaign.mission.state.buildings.at(-1);return {count:campaign.mission.state.buildings.length,x:b.x,y:b.y,rotation:b.rotation};});
 assert.equal(built.count,count+1);assert.equal(built.x,finalPose.x);assert.equal(built.y,finalPose.y);assert.equal(built.rotation,finalPose.rotation);assert(!(await preview()).visible);
 assert.deepEqual(errors,[]);console.log('PASS: actual canvas edge snap, invalid preview, R/Shift+R/buttons/wheel, no wheel zoom, Alt/free grid, exact rotated placement confirmation, desktop/narrow layout');
}finally{await browser.close();}
