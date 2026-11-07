import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const folder='campaign/previews/infantry-death';fs.mkdirSync(folder,{recursive:true});
try{
  const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8884')+'/campaign/');
  await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});
  await page.locator('#begin').click();await page.locator('#pause').click();
  const result=await page.evaluate(()=>{
    const c=window.campaign,m=c.mission,w=c.world;
    c.radio.setEnabled(false);c.renderSuspended=true;w.fixedRenderScale=true;w.renderer.setPixelRatio(1.5);w.minimumCameraHeight=2;w.controls.minDistance=5;w.controls.enableDamping=false;
    m.state.units=[];m.state.buildings=[];m.visible.fill(1);m.explored.fill(1);c.select([]);
    const start=w.field.gridToWorld(m.config.startGrid);
    // Pick a naturally level patch of the actual terrain for close inspection.
    let p=start,best=Infinity;
    for(let x=start.x-60;x<=start.x+60;x+=10)for(let y=start.y-60;y<=start.y+60;y+=10){
      const heights=[[-12,-8],[12,-8],[-12,8],[12,8],[0,0]].map(([dx,dy])=>w.field.heightAt(x+dx,y+dy));
      const slope=Math.max(...heights)-Math.min(...heights);if(slope<best){best=slope;p={x,y};}
    }
    const dead=[];
    for(const [i,kind] of ['scav-rifleman','scav-grenadier'].entries()){
      const unit=m.addUnit(kind,'scavs',{x:p.x+(i-.5)*12,y:p.y},{raidReserve:true});
      unit.aimTarget={x:unit.x+30,y:unit.y-20,z:w.field.heightAt(unit.x,unit.y)+5};
      unit.lastThrowAt=m.state.time;dead.push(unit);
      m.addUnit(kind,'scavs',{x:unit.x,y:p.y+13},{raidReserve:true});
    }
    m.addUnit('builder','rai',{x:p.x+70,y:p.y});m.updateFog();
    m.rebuildNavigation();w.controls.target.set(p.x,p.y+2,w.field.heightAt(p.x,p.y)+2);
    w.camera.position.set(p.x+22,p.y+34,w.field.heightAt(p.x,p.y)+30);w.controls.update();w.update(m,new Set(),1/60);
    for(const unit of dead)m.damage(unit,unit.hp+10,{id:'review-attacker',kind:'bukhanka',owner:'rai',x:unit.x,y:unit.y-30});
    w.update(m,new Set(),1/60);
    document.querySelector('#labels').hidden=true;document.querySelector('#mission-hud').hidden=true;
    window.deathReview={p,ids:dead.map(u=>u.id)};
    return{dead:dead.map(u=>({kind:u.kind,hp:u.hp,wreck:u.damage.wreck})),alive:m.state.units.filter(u=>u.owner==='scavs'&&u.hp>0).length};
  });
  assert.equal(result.alive,2);assert(result.dead.every(u=>u.hp===0&&u.wreck));
  await page.screenshot({path:folder+'/field.png'});
  await page.evaluate(()=>{const c=window.campaign,s=c.mission.save();c.mission.load(s);c.mission.visible.fill(1);c.mission.explored.fill(1);c.world.update(c.mission,new Set(),1/60);});
  await page.screenshot({path:folder+'/reloaded.png'});
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);
  await page.evaluate(()=>{const c=window.campaign,w=c.world,{p}=window.deathReview;w.camera.position.set(p.x+50,p.y+80,w.field.heightAt(p.x,p.y)+70);w.controls.update();w.update(c.mission,new Set(),1/60);});
  await page.screenshot({path:folder+'/narrow.png'});
  assert.deepEqual(errors,[]);console.log(JSON.stringify({...result,saveReload:true,narrow:true,errors}));
}finally{await browser.close();}
