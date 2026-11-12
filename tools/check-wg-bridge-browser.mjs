import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH??'C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dir='campaign/previews/wg-bridge';fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.BROWSER_PATH??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--mute-audio','--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{for(const key of ['fieldRadio','fieldSound','fieldStoryVoice'])localStorage.setItem('warGame.'+key,'off');});
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8798')+'/campaign/?mission=m02');
 await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:120000});await page.locator('#begin').click();
 await page.waitForFunction(()=>campaign.state.active&&!campaign.state.openingPlaying,null,{timeout:120000});await page.locator('#pause').click();
 await page.evaluate(()=>{const {mission:m}=campaign;campaign.radio.dismiss();campaign.select([]);campaign.renderSuspended=true;m.visible.fill(255);m.explored.fill(255);m.visionSources=[{x:26,y:80,radius:200}];m.fogRevision++;});
 for(const [index,width,height] of [[0,1440,900],[1,1440,900],[1,844,390],[1,667,375]]){
  await page.setViewportSize({width,height});
  const info=await page.evaluate(index=>{
   const {mission:m,world:w}=campaign,b=m.field.river.bridges[index],p=b.points[Math.floor(b.points.length/2)],a=b.points[0],z=b.points.at(-1),len=Math.hypot(z.x-a.x,z.y-a.y),nx=-(z.y-a.y)/len,ny=(z.x-a.x)/len;
   w.controls.enableDamping=false;w.controls.target.set(p.x,p.y,p.z);w.camera.position.copy(w.controls.target).add({x:120,y:-300,z:330});w.controls.update();w.update(m,new Set(),0);
   return {width:b.width,covered:[-19,19].map(side=>!!m.field.river.deckAt(p.x+nx*side,p.y+ny*side)),outside:m.field.river.forbidden(p.x+nx*40,p.y+ny*40)};
  },index);
  assert.equal(info.width,56);assert(info.covered.every(Boolean));assert(info.outside);assert(await page.locator('#pause').isVisible());
  await page.screenshot({path:`${dir}/bridge-${index}-${width}x${height}.png`});console.log('PASS bridge',index,width+'x'+height,JSON.stringify(info));
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
