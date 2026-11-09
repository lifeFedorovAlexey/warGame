import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const software=process.argv.includes('--software'),dir='campaign/previews/dam-aged',prefix=software?'software-':'';fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:software?['--enable-unsafe-swiftshader','--use-angle=swiftshader']:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];
 page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.error(m.text());}});
 await page.addInitScript(()=>{for(const k of ['fieldSound','fieldRadio','fieldStoryVoice'])localStorage.setItem('warGame.'+k,'off');});
 await page.goto('http://127.0.0.1:8766/review/dam-aged/campaign/');await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});
 await page.locator('#begin').click();const skip=page.locator('[data-dream=skip]');if(await skip.isVisible())await skip.click();
 await page.waitForFunction(()=>campaign.mission.state.openingScene?.signId||campaign.state.active,null,{timeout:60000});
 await page.evaluate(()=>{const c=campaign,m=c.mission;c.radio.setEnabled(false);const s=m.entity(m.state.openingScene?.signId);if(s){s.completed=true;s.progress=1;}});
 await page.waitForFunction(()=>campaign.state.active,null,{timeout:25000});await page.locator('#pause').click();
 await page.evaluate(async()=>{const c=campaign,m=c.mission,w=c.world;c.renderSuspended=true;c.damModule=await import('./dam-layout.js');c.damLayout=c.damModule.damLayout(w.field,m.config);m.state.time=9.7;m.updateMission=()=>{};c.select([],false,false);w.fixedRenderScale=1;w.renderer.setPixelRatio(1);w.controls.enableDamping=false;document.querySelector('#toast').hidden=true;});
 async function shot(view){
  await page.evaluate(view=>{const c=campaign,w=c.world,m=c.mission,p=c.damModule.damWorld(c.damLayout,view.x,view.y,view.z);m.visible.fill(255);m.explored.fill(255);m.visionSources=[{x:63.5,y:63.5,radius:200}];m.fogRevision++;w.controls.target.set(p.x,p.y,p.z);w.camera.position.copy(w.controls.target).add({x:view.dx,y:view.dy,z:view.dz});w.controls.update();w.update(m,new Set(),0);},view);
  await page.waitForTimeout(200);await page.screenshot({path:`${dir}/${prefix}${view.name}.png`});
 }
 await shot({name:'wide',x:0,y:-9,z:8,dx:470,dy:-145,dz:320});
 await shot({name:'wall',x:-22,y:-7,z:9,dx:180,dy:-10,dz:105});
 await shot({name:'drains',x:19,y:-22,z:.5,dx:100,dy:60,dz:95});
 const result=await page.evaluate(()=>{
  const c=campaign,m=c.mission,w=c.world,dam=w.scene.getObjectByName('western_dam'),props=dam.getObjectByName('dam_yard_props'),structure=dam.getObjectByName('western_dam_structure'),paint=dam.getObjectByName('tsoi_graffiti'),state=c.damModule.damState(m),light=props.getObjectByName('dam_barrel_light_0');
  const before=JSON.stringify({nav:m.nav.solids.map(s=>s.id),units:m.state.units.map(u=>u.id),buildings:m.state.buildings.map(b=>b.id)}),nodes=[];dam.traverse(n=>nodes.push(n));
  const initial=light.intensity;m.state.time+=.13;w.update(m,new Set(),0);const changed=light.intensity!==initial,pausedValue=light.intensity;w.update(m,new Set(),0);const paused=pausedValue===light.intensity;
  c.damModule.setDamSectionDamage(state,'monolith_03',1);w.update(m,new Set(),0);const followsDamage=!paint.parent.visible;c.damModule.setDamSectionDamage(state,'monolith_03',0);m.state.time=9.7;w.update(m,new Set(),0);
  const after=[];dam.traverse(n=>after.push(n));
  return {pools:nodes.filter(n=>n.name.startsWith('dam_catch_pool_')).length,barrels:nodes.filter(n=>n.name.startsWith('dam_barrel_fire_')).length,sections:structure.children.filter(n=>n.name.startsWith('monolith_')).length,handPainted:paint.userData.handPainted,followsDamage,changed,paused,stableNodes:nodes.length===after.length,unchanged:before===JSON.stringify({nav:m.nav.solids.map(s=>s.id),units:m.state.units.map(u=>u.id),buildings:m.state.buildings.map(b=>b.id)})};
 });
 assert.deepEqual(result,{pools:3,barrels:2,sections:14,handPainted:true,followsDamage:true,changed:true,paused:true,stableNodes:true,unchanged:true});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);await shot({name:'narrow',x:0,y:-9,z:8,dx:900,dy:-180,dz:680});
 assert.deepEqual(errors,[]);console.log(JSON.stringify(result));console.log('PASS: aged wall, three drains, animated barrels pause with mission, no collision/entity changes, wide and narrow rendering');
}finally{await browser.close();}
