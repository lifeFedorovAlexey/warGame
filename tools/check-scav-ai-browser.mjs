import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const folder='campaign/previews/scav-ai';fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
try{
  const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8884')+'/campaign/');
  await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});await page.locator('#begin').click();await page.locator('#pause').click();
  await page.evaluate(()=>{
    const c=window.campaign,m=c.mission,w=c.world,p=w.field.gridToWorld(m.config.startGrid);
    c.radio.setEnabled(false);c.renderSuspended=true;w.fixedRenderScale=true;w.renderer.setPixelRatio(1.5);w.controls.enableDamping=false;
    m.state.units=[];m.state.buildings=[];m.state.camps=[];m.state.pendingCinematics=[];m.updateMission=()=>{};c.select([]);
    const enemies=[],targets=[];
    for(const [i,kind] of ['scav-grenadier','scav-firetruck'].entries()){
      const x=p.x+(i-.5)*80,en=m.addUnit(kind,'scavs',{x,y:p.y});enemies.push({id:en.id,x:en.x,y:en.y});
      targets.push(m.addUnit('builder','rai',{x,y:p.y+140}).id);
    }
    m.rebuildNavigation();m.updateFog();
    w.controls.target.set(p.x,p.y+70,w.field.heightAt(p.x,p.y+70)+5);w.camera.position.set(p.x+140,p.y+240,w.field.heightAt(p.x,p.y)+200);w.controls.update();
    w.scene.getObjectByName('unit_health_bars').layers.disableAll();document.querySelector('#mission-hud').hidden=true;
    w.update(m,new Set(),1/60);window.aiReview={enemies,targets};
  });
  await page.screenshot({path:folder+'/before.png'});
  const result=await page.evaluate(()=>{
    const c=window.campaign,m=c.mission,w=c.world,review=window.aiReview;
    const fired=new Set();
    for(let i=0;i<120;i++){
      m.tick(.1);for(const e of m.effects)if(e.type==='shot')fired.add(e.from);
      // Draw regularly to exercise the real hit geometry and weapon effects.
      if(i%10===0||i===119)w.update(m,new Set(),1/60);
    }
    return{enemies:review.enemies.map(start=>{const u=m.entity(start.id);return{kind:u.kind,moved:Math.hypot(u.x-start.x,u.y-start.y),fired:fired.has(u.id)};}),targets:review.targets.map(id=>{const u=m.entity(id);return{hp:u?.hp??0,maxHp:u?.maxHp??280};})};
  });
  await page.screenshot({path:folder+'/engaged.png'});
  assert(result.enemies.every(u=>u.moved>25&&u.fired),JSON.stringify(result));
  assert(result.targets.some(u=>u.hp<u.maxHp),JSON.stringify(result));
  assert.deepEqual(errors,[]);console.log(JSON.stringify({...result,errors}));
}finally{await browser.close();}
