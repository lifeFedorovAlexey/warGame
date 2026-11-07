import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const folder='campaign/previews/scav-variety';fs.mkdirSync(folder,{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('requestfailed',r=>errors.push(r.url()+' '+r.failure()?.errorText));
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8884')+'/campaign/');
 await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});
 await page.locator('#begin').click();await page.locator('#pause').click();
 const ids=await page.evaluate(()=>{
  const c=window.campaign,m=c.mission,w=c.world,p=w.field.gridToWorld(m.config.startGrid);
  c.radio.setEnabled(false);c.renderSuspended=true;w.fixedRenderScale=true;w.renderer.setPixelRatio(1.5);w.minimumCameraHeight=2;w.controls.minDistance=5;w.controls.enableDamping=false;
  m.state.units=[];m.state.buildings=[];m.visible.fill(1);m.explored.fill(1);c.select([]);
  const kinds=['scav-zaporozhets','scav-firetruck','scav-bus','scav-rifleman','scav-grenadier'];
  const offsets=[[-44,0],[0,0],[46,0],[-8,33],[8,33]];
  const ids=kinds.map((kind,i)=>m.addUnit(kind,'scavs',{x:p.x+offsets[i][0],y:p.y+offsets[i][1]},{raidReserve:true}).id);
  document.querySelector('#labels').hidden=true;document.querySelector('#mission-hud').hidden=true;
  window.scavReview={p,ids};return ids;
 });
 async function camera(point,offset){await page.evaluate(({point,offset})=>{
  const c=window.campaign,w=c.world,z=w.field.heightAt(point.x,point.y);w.controls.target.set(point.x,point.y,z+(point.lift??5));w.camera.position.set(point.x+offset[0],point.y+offset[1],z+offset[2]);w.controls.update();w.update(c.mission,new Set(c.selected),1/60);
 },{point,offset});}
 const p=await page.evaluate(()=>window.scavReview.p);await camera(p,[105,137,116]);await page.screenshot({path:folder+'/lineup.png'});
 for(const [i,name] of ['zaporozhets','firetruck','school-bus','rifleman','grenadier'].entries()){
  const point=await page.evaluate(id=>{const u=window.campaign.mission.entity(id);return{x:u.x,y:u.y,lift:id===window.scavReview.ids[3]||id===window.scavReview.ids[4]?4:6};},ids[i]);
  await camera(point,i>=3?[8,12,10]:i===0?[25,33,23]:[40,50,30]);
  await page.screenshot({path:folder+'/'+name+'.png'});
 }
 const tower=await page.evaluate(()=>{
  const c=window.campaign,m=c.mission,w=c.world,p=window.scavReview.p;
  const tower=m.addStructure('mg-tower','rai',{x:p.x+130,y:p.y},{completed:true,progress:1,rotation:Math.PI,groundHeight:w.field.heightAt(p.x+130,p.y)});
  m.addUnit('bukhanka','rai',{x:tower.x-30,y:tower.y+5});m.addUnit('builder','rai',{x:tower.x-32,y:tower.y-16});
  return{x:tower.x,y:tower.y,lift:24,id:tower.id};
 });
 await camera(tower,[64,83,72]);await page.screenshot({path:folder+'/tower.png'});
 // Research UI: only actionable samples, no completed/unaffordable buttons.
 await page.evaluate(()=>{
  const c=window.campaign,m=c.mission,p=window.scavReview.p;
  const lab=m.addStructure('lab','rai',{x:p.x-130,y:p.y},{completed:true,progress:1});
  m.state.artifactKeys=Object.keys(m.config.research);m.state.research.flamethrower=true;m.state.energy=105;c.select([lab.id]);c.advance(0);document.querySelector('#mission-hud').hidden=false;
 });
 assert.deepEqual(await page.locator('#actions [data-research]').evaluateAll(bs=>bs.map(b=>b.dataset.research)),['mg-ammo-1']);
 assert.equal(await page.locator('#hint').count(),0);
 await camera(p,[105,137,116]);await page.screenshot({path:folder+'/research.png'});
 await page.locator('#actions [data-research]').click();assert.equal(await page.locator('#actions [data-research]').count(),0);
 await page.evaluate(()=>{const c=window.campaign,m=c.mission,p=window.scavReview.p;const lab=m.addStructure('lab','rai',{x:p.x-180,y:p.y},{completed:true,progress:1});m.state.energy=105;c.select([lab.id]);c.advance(0);});
 assert.equal(await page.locator('#actions [data-research]').count(),0,'An item researched in another lab is unavailable');
 await page.evaluate(()=>{const c=window.campaign;c.select([window.scavReview.ids[0],window.scavReview.ids[1],window.scavReview.ids[2]]);c.advance(0);});
 await camera(p,[105,137,116]);
 const clearances=await page.evaluate(()=>{const w=window.campaign.world;return w.scene.getObjectByName('selection_rings').children.filter(r=>r.visible).flatMap(r=>{const a=r.geometry.attributes.position;return Array.from({length:a.count},(_,i)=>a.getZ(i)+r.position.z-w.field.heightAt(a.getX(i)+r.position.x,a.getY(i)+r.position.y));});});
 assert(Math.min(...clearances)>1.09);await page.screenshot({path:folder+'/field.png'});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);await camera(p,[105,137,116]);await page.screenshot({path:folder+'/narrow.png'});
 const combat=await page.evaluate(()=>{
  const c=window.campaign,m=c.mission,w=c.world,p=window.scavReview.p;
  const grenadier=m.entity(window.scavReview.ids[4]);
  const target=m.addUnit('bukhanka','rai',{x:grenadier.x,y:grenadier.y+35});
  const hp=target.hp,started=m.attack(grenadier,target,m.config.units[grenadier.kind]);
  const flight=m.state.projectiles[0];if(!flight)return{started,projectile:false};
  m.state.time=(flight.born+flight.impactAt)/2;w.update(m,new Set(),1/60);
  const inFlight=w.statistics.grenades,unchanged=target.hp===hp;
  m.state.time=flight.impactAt+.01;m.updateProjectiles();w.update(m,new Set(),1/60);
  return{started,projectile:true,inFlight,unchanged,damage:hp-target.hp,after:w.statistics.grenades};
 });
 assert(combat.started&&combat.projectile&&combat.inFlight===1&&combat.unchanged&&combat.damage>0&&combat.after===0,JSON.stringify(combat));
 assert.deepEqual(errors,[]);console.log(JSON.stringify({models:true,tower:true,researchFilter:true,noMapHints:true,raisedTerrainRings:true,narrow:true,errors}));
}finally{await browser.close();}
