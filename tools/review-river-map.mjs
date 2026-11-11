import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dir='campaign/previews/river-map';fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const errors=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
 await page.addInitScript(()=>{for(const k of ['fieldRadio','fieldSound','fieldStoryVoice'])localStorage.setItem('warGame.'+k,'off');});
 await page.goto((process.env.REVIEW_URL??'http://127.0.0.1:9321')+'/campaign/?mission=m02');
 await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:180000});
 await page.locator('#begin').click();await page.waitForFunction(()=>campaign.state.active&&!campaign.state.openingPlaying,null,{timeout:120000});
 if(await page.locator('#pause').getAttribute('aria-label')!=='Продолжить')await page.locator('#pause').click();
 await page.evaluate(async()=>{
  const c=campaign,m=c.mission,w=c.world;c.radio.dismiss();c.select([]);c.renderSuspended=true;
  // Restore only the northern enemy entities for the map comparison shot.
  // This diagnostic page is isolated: no saves are written or loaded.
  const {Mission}=await import('./mission.js'),{selectMissionTerrain}=await import('./mission02-terrain.js');
  const fresh=new Mission(structuredClone(m.config),w.field);
  for(const b of fresh.state.buildings.filter(b=>b.campId)){b.id='review.north.'+b.id;m.state.buildings.push(b);}
  m.state.camps=fresh.state.camps;selectMissionTerrain(w.field,true);m.rebuildNavigation();
  m.visible.fill(255);m.explored.fill(255);m.visionSources=[{x:26,y:63,radius:200}];m.fogRevision++;
  m.state.time=9.7;
  w.fixedRenderScale=1;w.renderer.setPixelRatio(1);w.controls.enableDamping=false;
 });
 async function capture(name,grid,offset,viewport={width:1440,height:900},hide=false){
  await page.setViewportSize(viewport);
  await page.waitForTimeout(250);
  await page.evaluate(({grid,offset,hide})=>{
   const c=campaign,w=c.world,p=w.field.gridToWorld(grid);
   document.documentElement.classList.toggle('review-map-only',hide);
   if(!document.querySelector('#review-style')){const style=document.createElement('style');style.id='review-style';style.textContent='.review-map-only button,.review-map-only aside,.review-map-only header,.review-map-only #toast,.review-map-only #radio-dialogue{visibility:hidden!important}';document.head.append(style);}
   w.controls.target.set(p.x,p.y,w.field.heightAt(p.x,p.y));w.camera.position.copy(w.controls.target).add({x:offset[0],y:offset[1],z:offset[2]});w.controls.update();w.update(c.mission,new Set(),0);
  },{grid,offset,hide});
  await page.waitForTimeout(150);await page.evaluate(()=>campaign.world.update(campaign.mission,new Set(),0));await page.screenshot({path:`${dir}/${name}.png`});console.log('CAPTURE',name);
 }
 await capture('shared-map-north-up',[26.5,63.5],[0,-1800,5600],{width:1440,height:1800},true);
 await capture('gorge-and-bridges',[30,82],[110,-620,950]);
 await capture('east-junction',[37.5,78],[60,-250,320]);
 await capture('southern-exit',[40,108],[90,-350,520]);
 await capture('concrete-bridge-close',[25.8,80.5],[90,-165,145]);
 await capture('steel-bridge-close',[38.7,84.5],[160,-210,180]);
 await capture('dam-outfall',[8.5,57],[360,-450,550]);
 await capture('occupied-ruins',[15,72.5],[160,-340,310]);
 await capture('north-camp',[19,31.5],[100,-320,300]);
 for(const [width,height] of [[844,390],[667,375]])await capture(`landscape-${width}`,[26,80],[50,-490,580],{width,height});
 fs.writeFileSync(`${dir}/checks.json`,JSON.stringify({errors,view:'native north-up',captures:11},null,2));
 if(errors.length)throw Error(errors.join('\n'));
}finally{await browser.close();}
