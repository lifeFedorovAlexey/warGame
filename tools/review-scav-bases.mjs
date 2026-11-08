import assert from 'node:assert/strict';
import fs from 'node:fs';import {createRequire} from 'node:module';
process.env.PLAYWRIGHT_BROWSERS_PATH='D:/warGame/tools/.runtime-media/playwright';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const record=process.argv.includes('--video');
const folder='campaign/previews/scav-bases';fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080},...(record?{recordVideo:{dir:folder,size:{width:1280,height:720}}}:{})}),errors=[];
 page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.error(m.text());}});
 await page.addInitScript(()=>localStorage.setItem('warGame.fieldRadio','off'));
 await page.goto('http://127.0.0.1:8766/review/scav-bases-'+Date.now()+'/campaign/');
 await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});
 await page.locator('#begin').click();await page.evaluate(()=>campaign.advance(40));await page.waitForFunction(()=>campaign.state.active,{},{timeout:30000});
 await page.evaluate(()=>{campaign.renderSuspended=true;const m=campaign.mission;m.state.flags.lastRevealed=true;m.state.bounds=m.config.finalMapBounds.slice();m.rebuildNavigation();m.visible.fill(255);m.explored.fill(255);m.visionSources=m.state.camps.map(c=>({x:c.grid[0],y:c.grid[1],radius:15}));m.fogRevision++;campaign.world.controls.enableDamping=false;});
 const views=[];
 for(const id of ['nw-pocket','nw-west','nw-east','west-south']){
  const result=await page.evaluate(async id=>{
   const {campBaseLayout}=await import('./scav-base-layout.js'),m=campaign.mission,w=campaign.world,c=m.state.camps.find(c=>c.id===id),l=campBaseLayout(c),n=l.normal,z=w.field.heightAt(l.centre.x,l.centre.y);
   w.controls.target.set(l.centre.x,l.centre.y,z+8);w.camera.position.set(l.centre.x+n.x*240-n.y*115,l.centre.y+n.y*240+n.x*115,z+238);w.controls.update();w.update(m,new Set(),0);
   const b=m.state.buildings.filter(b=>b.campId===id);
   return {id,buildings:b.length,towers:b.filter(b=>b.kind==='mg-tower').length,producers:b.filter(b=>b.scavProduction).map(b=>({kind:b.kind,type:b.scavProduction.type})),drawCalls:w.statistics.drawCalls,triangles:w.statistics.triangles};
  },id);
  assert(result.towers>=2);assert.equal(result.producers.length,2);views.push(result);
  await page.screenshot({path:folder+'/'+id+'.png'});
 }
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>{const w=campaign.world,offset=w.camera.position.clone().sub(w.controls.target).multiplyScalar(3.2);w.controls.maxDistance=2000;w.camera.position.copy(w.controls.target).add(offset);w.controls.update();w.update(campaign.mission,new Set(),0);});
 await page.screenshot({path:folder+'/narrow.png'});
 let sorties=[];
 if(record){
  await page.setViewportSize({width:1920,height:1080});
  await page.evaluate(()=>{document.getElementById('tempo').click();document.getElementById('tempo').click();});
  sorties=await page.evaluate(async()=>{
   const {campBaseLayout}=await import('./scav-base-layout.js'),m=campaign.mission,w=campaign.world,c=m.state.camps[0],l=campBaseLayout(c),n=l.normal,z=w.field.heightAt(l.centre.x,l.centre.y),events=[];
   w.controls.target.set(l.centre.x,l.centre.y,z+8);w.camera.position.set(l.centre.x+n.x*240-n.y*115,l.centre.y+n.y*240+n.x*115,z+238);w.controls.update();
   const emit=m.emit;m.emit=function(type,data){if(type==='scav-sortie'||type==='scav-produced')events.push({type,time:m.state.time,...data});return emit.call(this,type,data);};
   const start=m.state.time;let previous=performance.now();
   while(m.state.time-start<135){
    await new Promise(requestAnimationFrame);const now=performance.now(),dt=Math.min(.05,(now-previous)/1000);previous=now;
    campaign.advance(dt*4);m.visible.fill(255);m.explored.fill(255);m.visionSources=[{x:c.grid[0],y:c.grid[1],radius:15}];m.fogRevision++;w.update(m,new Set(),dt);
   }
   m.emit=emit;return events;
  });
  assert(sorties.some(e=>e.type==='scav-sortie'&&e.camp==='nw-pocket'&&e.productionType==='vehicles'));
  assert(sorties.some(e=>e.type==='scav-sortie'&&e.camp==='nw-pocket'&&e.productionType==='infantry'));
  await page.screenshot({path:folder+'/sortie.png'});
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(folder+'/visual-checks.json',JSON.stringify({views,errors,sorties},null,2));console.log(JSON.stringify({views,errors,sorties}));
 if(record){const video=page.video();await page.close();await video.saveAs(folder+'/production.webm');}
}finally{await browser.close();}
