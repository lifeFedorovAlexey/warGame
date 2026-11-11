import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dir=(process.env.STABILITY_REVIEW_DIR??'campaign/previews/playtest-WG-054').replace(/[\\/]+$/, '')+'/';fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  for(const key of ['fieldRadio','fieldSound','fieldStoryVoice'])localStorage.setItem('warGame.'+key,'off');
  window.graphReview=[];const original=CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText=function(s,...args){if(this.canvas.id==='stability-graph'){window.graphReview.push(String(s));if(window.graphReview.length>200)window.graphReview.shift();}return original.call(this,s,...args);};
 });
 if(process.argv.includes('--preview'))await page.route('**/campaign/**',route=>{
  const p=new URL(route.request().url()).pathname;
  const file=p==='/campaign/main.js'?'main.js':p==='/campaign/stability-graph.js'?'stability-graph.js':null;
  return file?route.fulfill({body:fs.readFileSync(dir+file),contentType:'text/javascript'}):route.continue();
 });
 await page.goto('http://127.0.0.1:8766/campaign/?mission=m02');
 await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:120000});await page.locator('#begin').click();
 await page.waitForFunction(()=>campaign.state.active&&!campaign.state.openingPlaying,null,{timeout:120000});
 await page.keyboard.press('F7');const graph=page.locator('#stability-graph');await graph.waitFor({state:'visible'});
 await page.waitForFunction(()=>window.graphReview.some(s=>s.startsWith('CPU 15с:')),null,{timeout:30000});
 const running=await page.evaluate(()=>window.graphReview.slice(-4));
 await page.evaluate(()=>{window.graphReview=[];window.realAdvance=campaign.mission.advance;campaign.mission.advance=()=>0;});
 await page.waitForFunction(()=>window.graphReview.some(s=>s.includes('Игра 0.0×')),null,{timeout:40000});
 const stalled=await page.evaluate(()=>window.graphReview.slice(-4));assert(stalled.some(s=>s.includes('FPS')));assert(stalled.some(s=>s.includes('Игра 0.0×')));
 for(const [width,height,name] of [[1440,900,'desktop'],[844,390,'landscape'],[667,375,'small']]){
  await page.setViewportSize({width,height});await page.waitForTimeout(500);
  const b=await graph.boundingBox();assert(b.x>=0&&b.x+b.width<=width&&b.y+b.height<height,JSON.stringify(b));
  assert.equal(await graph.evaluate(c=>getComputedStyle(c).pointerEvents),'none');
  await page.screenshot({path:dir+name+'.png'});
 }
 await page.evaluate(()=>{campaign.mission.advance=window.realAdvance;window.graphReview=[];});
 await page.locator('#pause').click();
 await page.waitForFunction(()=>window.graphReview.some(s=>s.includes('Игра: пауза')),null,{timeout:30000});
 await page.keyboard.press('F7');assert(await graph.isHidden());assert.deepEqual(errors,[]);
 const report={passed:true,running,stalled,simulatedStall:true,tests:['frame intervals','simulation halt','CPU stages','pause','toggle','click-through'],sizes:['1440x900','844x390','667x375'],errors};
 fs.writeFileSync(dir+'verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
