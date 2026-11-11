import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH??'C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const baseline=process.argv.includes('--baseline'),folder='campaign/previews/playtest-WG-012/'+(baseline?'before-captures':'after');fs.mkdirSync(folder,{recursive:true});
const base=process.env.WARGAME_URL??'http://127.0.0.1:8766',report={baseline,errors:[],compositing:[],game:[]};
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
const observe=async page=>{
 page.on('pageerror',e=>report.errors.push(e.stack??e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 if(baseline)await page.route('**/campaign/minimap.js',r=>r.fulfill({body:fs.readFileSync('campaign/previews/playtest-WG-012/before/minimap.js','utf8'),contentType:'text/javascript'}));
};
try{
 // A fully hidden map must have the same colour on either side of its edge.
 // Fractional map offsets exercise the browser's real canvas antialiasing.
 for(const dpr of [1,1.25,2]){
  const page=await browser.newPage({viewport:{width:800,height:500},deviceScaleFactor:dpr});await observe(page);
  await page.route('**/review-wg012',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><body></body>'}));await page.goto(base+'/review-wg012');
  const result=await page.evaluate(async()=>{
   const {createMinimap,minimapPosition}=await import(new URL('./campaign/minimap.js',location.href)),results=[];
   const background=document.createElement('canvas');background.width=background.height=32;background.complete=true;background.naturalWidth=32;
   background.getContext('2d').fillStyle='#ffffff';background.getContext('2d').fillRect(0,0,32,32);
   const fog=document.createElement('canvas');fog.width=fog.height=256;fog.getContext('2d').fillStyle='#0b0e0f';fog.getContext('2d').fillRect(0,0,256,256);
   const field={worldToGrid:(x,y)=>[x,y],gridToWorld:([x,y])=>({x,y})};
   for(const size of [88,112,132])for(const bounds of [[0,0,53,66],[0,0,53,83]]){
    const canvas=document.createElement('canvas');canvas.style.width=canvas.style.height=size+'px';document.body.append(canvas);
    const mission={state:{bounds,units:[],buildings:[],artifacts:[],camps:[],flags:{}},config:{oilFields:[],buildings:{}},exploredAt:()=>false};
    const world={field,controls:{target:{x:9999,y:9999}},drawMinimapFog:(ctx,width)=>ctx.drawImage(fog,0,0,width,width)};
    const map=createMinimap(canvas,{world,mission,selected:new Set(),background,notify:()=>{}});map.render(0);
    const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let badPixels=0,maxDelta=0;
    for(let i=0;i<data.length;i+=4){const delta=Math.max(Math.abs(data[i]-11),Math.abs(data[i+1]-14),Math.abs(data[i+2]-15));if(delta>1)badPixels++;maxDelta=Math.max(maxDelta,delta);}
    // Revealed terrain must remain visible; removing the seam cannot hide it.
    fog.getContext('2d').clearRect(32,64,32,64);map.invalidate();map.render(201);
    const [px,py]=minimapPosition(field,{x:24,y:48},canvas.width,canvas.height,bounds);
    const revealed=Array.from(canvas.getContext('2d').getImageData(Math.floor(px),Math.floor(py),1,1).data);
    fog.getContext('2d').fillRect(0,0,256,256);
    results.push({size,pixels:canvas.width,bounds,badPixels,maxDelta,revealed});canvas.remove();
   }
   return results;
  });report.compositing.push(...result.map(r=>({dpr,...r})));await page.close();
 }
 if(baseline)assert(report.compositing.some(r=>r.badPixels>50),'The original compositing leaks the background through fully opaque fog');
 else assert(report.compositing.every(r=>r.badPixels===0),JSON.stringify(report.compositing));
 assert(report.compositing.every(r=>r.revealed.every(channel=>channel===255)),'Revealed background is retained at every size and pixel ratio');
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});await observe(page);
 await page.addInitScript(()=>{for(const k of ['fieldSound','fieldStoryVoice','fieldRadio'])localStorage.setItem('warGame.'+k,'off');});
 await page.route('**/api/radio/published',r=>r.fulfill({json:{document:JSON.parse(fs.readFileSync('assets/radio/situations_catalog.json','utf8'))}}));
 await page.route('**/campaign/main.js',r=>r.fulfill({body:fs.readFileSync('campaign/main.js','utf8').replace('ready: true, mission, world, select, radio,',`ready: true, mission, world, select, radio,
 reviewRefresh(){flushUi();world.update(mission,selected,0,false,true);minimapView.reset(true);minimapView.render(performance.now());},`),contentType:'text/javascript'}));
 await page.goto(base+'/campaign/');await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:120000});
 await page.locator('#begin').click();await page.locator('[data-dream=skip]').click();
 await page.evaluate(()=>{const m=campaign.mission,s=m.entity(m.state.openingScene.signId);s.completed=true;s.progress=1;campaign.radio.setEnabled(false);});
 await page.waitForFunction(()=>campaign.state.active,null,{timeout:30000});await page.locator('#pause').click();await page.evaluate(()=>campaign.renderSuspended=true);
 for(const [width,height] of [[1440,900],[844,390],[667,375]]){
  await page.setViewportSize({width,height});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.evaluate(()=>campaign.reviewRefresh());
  const sample=await page.evaluate(()=>{
   const canvas=document.querySelector('#minimap'),data=canvas.getContext('2d').getImageData(0,4,canvas.width,1).data,bright=[];
   for(let x=0;x<canvas.width;x++){const i=x*4,delta=Math.max(Math.abs(data[i]-11),Math.abs(data[i+1]-14),Math.abs(data[i+2]-15));if(delta>1)bright.push({x,rgb:Array.from(data.slice(i,i+3))});}
   const rect=canvas.getBoundingClientRect();return {pixels:canvas.width,bright,rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},fullMap:document.querySelector('#world').getBoundingClientRect().width===innerWidth};
  });report.game.push({width,height,...sample});if(!baseline)assert.equal(sample.bright.length,0,JSON.stringify(sample));assert(sample.fullMap);
  await page.screenshot({path:folder+'/minimap-'+width+'x'+height+'.png'});await page.locator('#minimap').screenshot({path:folder+'/minimap-detail-'+width+'x'+height+'.png'});
  console.log((baseline?'REPRO':'PASS')+' '+width+'x'+height+' '+JSON.stringify(sample.bright));
 }
 assert.deepEqual(report.errors,[]);report.passed=true;
}finally{fs.writeFileSync(folder+'/verification.json',JSON.stringify(report,null,2));await browser.close();}
