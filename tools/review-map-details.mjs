import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const before=process.argv.includes('--before'),folder='campaign/previews/map-details'+(before?'-before':'');fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/navigation',r=>r.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*'},body:'{}'}));
 if(before)for(const file of ['campaign/scav-base-roads.js','campaign/dam-weathering.js',...['detail-selection.png','macro-albedo.jpg','minimap.jpg',...[0,1,2,3].map(i=>'surface-control-'+i+'.png')].map(f=>'assets/maps/alpha/'+f)]){
  const body=execFileSync('git',['show','HEAD:'+file],{maxBuffer:8*1024*1024});await page.route('**/'+file,r=>r.fulfill({contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.png')?'image/png':'image/jpeg',body}));
 }
 await page.addInitScript(()=>{for(const k of ['fieldSound','fieldRadio','fieldStoryVoice'])localStorage.setItem('warGame.'+k,'off');});
 await page.goto('http://127.0.0.1:8766/review/map-details-'+Date.now()+'/campaign/');
 await page.waitForFunction(()=>window.campaign?.ready&&!document.getElementById('begin').disabled,null,{timeout:90000});
 await page.evaluate(()=>{const m=campaign.mission;m.state.pendingCinematics=[];m.state.openingScene={...m.state.openingScene,handedOver:true};localStorage.setItem('warGame.alpha.mission01.v1',m.save());document.getElementById('load').click();});
 await page.waitForFunction(()=>campaign.state.active&&document.getElementById('welcome').hidden,null,{timeout:30000});await page.locator('#pause').click();
 await page.evaluate(async()=>{
  const c=campaign,m=c.mission,w=c.world;c.renderSuspended=true;c.radio.setEnabled(false);m.state.flags.lastRevealed=true;m.state.bounds=m.config.finalMapBounds.slice();m.rebuildNavigation();
  m.visible.fill(255);m.explored.fill(255);m.visionSources=[{x:63.5,y:63.5,radius:200}];m.fogRevision++;
  w.fixedRenderScale=1;w.renderer.setPixelRatio(1);w.controls.enableDamping=false;c.select([],false,false);document.querySelector('#toast').hidden=true;
  c.damModule=await import('./dam-layout.js');c.damLayout=c.damModule.damLayout(w.field,m.config);
 });
 async function shot(v){
  await page.evaluate(v=>{
   const c=campaign,w=c.world,m=c.mission,p=v.dam?c.damModule.damWorld(c.damLayout,...v.dam):{x:v.x,y:v.y,z:w.field.heightAt(v.x,v.y)};
   m.visible.fill(v.fog?0:255);m.visionSources=v.fog?[]:[{x:63.5,y:63.5,radius:200}];m.fogRevision++;
   w.controls.target.set(p.x,p.y,p.z);w.camera.position.set(p.x+(v.dx??0),p.y+(v.dy??-150),p.z+v.dz);w.controls.update();w.update(m,new Set(),0);
   if(v.detail){w.terrain.setViewMode('close');w.renderer.render(w.scene,w.camera);}
  },v);
  await page.screenshot({path:folder+'/'+v.id+'.png'});
 }
 for(const v of [
  {id:'pocket',x:-1000,y:710,dz:500},
  {id:'east',x:-790,y:1260,dz:470},
  {id:'depot',x:-1500,y:1040,dz:600},
  {id:'depot-entrance',x:-1500,y:925,dz:300,detail:true},
  {id:'question',dam:[9.1,-6.1,9.7],dx:95,dy:0,dz:38},
  {id:'question-fog',dam:[9.1,-6.1,9.7],dx:95,dy:0,dz:38,fog:true},
 ])await shot(v);
 await page.setViewportSize({width:390,height:844});
 await page.waitForTimeout(200); // Let ResizeObserver resize the canvas before rendering.
 await shot({id:'question-narrow',dam:[9.1,-6.1,9.7],dx:95,dy:0,dz:38});
 await shot({id:'roads-narrow',x:-790,y:1260,dz:850});
 assert.deepEqual(errors,[]);fs.writeFileSync(folder+'/result.json',JSON.stringify({pass:true,before,errors},null,2));
 console.log(JSON.stringify({pass:true,before,errors,folder}));
}finally{await browser.close();}
