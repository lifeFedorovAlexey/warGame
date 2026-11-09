import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const before=process.argv.includes('--before'),folder='campaign/previews/camp-roads';fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/navigation',r=>r.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*'},body:'{}'}));
 await page.addInitScript(()=>{for(const k of ['fieldSound','fieldRadio','fieldStoryVoice'])localStorage.setItem('warGame.'+k,'off');});
 await page.goto('http://127.0.0.1:8766/review/camp-roads-'+Date.now()+'/campaign/');
 await page.waitForFunction(()=>window.campaign?.ready&&!document.getElementById('begin').disabled,null,{timeout:90000});
 await page.evaluate(()=>{const m=campaign.mission;m.state.pendingCinematics=[];m.state.openingScene={...m.state.openingScene,handedOver:true};localStorage.setItem('warGame.alpha.mission01.v1',m.save());document.getElementById('load').click();});
 await page.waitForFunction(()=>campaign.state.active&&document.getElementById('welcome').hidden,null,{timeout:30000});await page.locator('#pause').click();
 await page.evaluate(()=>{
  const c=campaign,m=c.mission,w=c.world;c.renderSuspended=true;c.radio.setEnabled(false);m.state.flags.lastRevealed=true;m.state.bounds=m.config.finalMapBounds.slice();m.rebuildNavigation();
  m.visible.fill(255);m.explored.fill(255);m.visionSources=[{x:63.5,y:63.5,radius:200}];m.fogRevision++;w.fixedRenderScale=1;w.renderer.setPixelRatio(1);w.controls.enableDamping=false;
 });
 const views=[['junction-1',-832,304,400],['junction-6',-736,848,430],['nw-pocket',-1000,710,600],['nw-west',-1500,1060,650],['nw-east',-750,1190,650],['west-south',-1600,-264,720]];
 async function view([id,x,y,height],suffix=''){
  await page.evaluate(({x,y,height})=>{const w=campaign.world,z=w.field.heightAt(x,y);w.controls.target.set(x,y,z);w.camera.position.set(x,y-150,z+height);w.controls.update();w.update(campaign.mission,new Set(),0);},{x,y,height});
  await page.screenshot({path:folder+'/'+id+(before?'-before':'')+suffix+'.png'});
 }
 for(const v of views)await view(v);
 if(!before){
  const result=await page.evaluate(()=>{
   const m=campaign.mission,well=m.state.buildings.find(b=>b.kind==='derrick'&&b.owner==='scavs');
   if(!well)throw Error('No defended camp well');const id=well.id,owner=well.owner;
   for(const e of [...m.state.units,...m.state.buildings])if(e.campId===well.campId&&!e.campResource)m.damage(e,e.hp);
   m.updateMission();m.updateFog();m.visible.fill(255);m.explored.fill(255);m.visionSources=[{x:63.5,y:63.5,radius:200}];m.fogRevision++;
   return {id,before:owner,after:well.owner,hp:well.hp,cleared:m.state.camps.find(c=>c.id===well.campId).cleared};
  });
  assert.equal(result.after,'rai');assert(result.cleared&&result.hp>0);await view(views[2],'-captured');
  await page.evaluate(async()=>{const {updateWrecks}=await import('./wreck-lifecycle.js'),m=campaign.mission;m.state.time=Math.max(m.state.time,...m.state.buildings.filter(b=>b.hp<=0).map(b=>b.removeAt??0))+1;updateWrecks(m);});await view(views[2],'-cleared');
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);await view(['narrow',-1000,710,1000]);
  fs.writeFileSync(folder+'/result.json',JSON.stringify({result,errors},null,2));
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({pass:true,before,views:views.length,errors}));
}finally{await browser.close();}
