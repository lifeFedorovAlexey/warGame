import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH??'C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dir=process.env.STABILITY_REVIEW_DIR??'campaign/previews/playtest-WG-050';fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.BROWSER_PATH??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{for(const key of ['fieldRadio','fieldSound','fieldStoryVoice'])localStorage.setItem('warGame.'+key,'off');});
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8766')+'/campaign/?mission=m02');
 await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:120000});await page.locator('#begin').click();
 await page.waitForFunction(()=>campaign.state.active&&!campaign.state.openingPlaying,null,{timeout:120000});
 assert.match(await page.locator('#control-hints').textContent(),/F7[\s\S]*График стабильности/);
 assert.equal(await page.locator('#stability-graph').count(),0);
 await page.keyboard.press('F7');
 const graph=page.locator('#stability-graph');await graph.waitFor({state:'visible'});
 await page.waitForFunction(()=>{const c=document.querySelector('#stability-graph');return c&&c.width!==300;},null,{timeout:30000});
 const sample=await graph.evaluate(canvas=>({pointer:getComputedStyle(canvas).pointerEvents,width:canvas.width,height:canvas.height,pixels:[...canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data].filter((v,i)=>i%4===3&&v>0).length}));
 assert.equal(sample.pointer,'none');assert(sample.pixels>100,JSON.stringify(sample));
 for(const [width,height,name] of [[1440,900,'desktop'],[844,390,'landscape'],[667,375,'small']]){
  await page.setViewportSize({width,height});await page.waitForTimeout(500);
  const bounds=await graph.boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=width&&bounds.y+bounds.height<height,JSON.stringify(bounds));
  assert(await page.locator('#pause').isVisible());await page.screenshot({path:dir+'/'+name+'.png'});
 }
 await page.keyboard.press('F7');assert(await graph.isHidden());
 await page.keyboard.press('F7');assert(await graph.isVisible());
 await page.evaluate(()=>document.body.dispatchEvent(new KeyboardEvent('keydown',{code:'F7',repeat:true,bubbles:true,cancelable:true})));
 assert(await graph.isVisible(),'Key repeat must not toggle the graph');
 await page.keyboard.press('F7');assert(await graph.isHidden());assert.deepEqual(errors,[]);
 const report={passed:true,sample,screenSizes:['1440x900','844x390','667x375'],toggle:true,repeat:true,clickThrough:true,errors};
 fs.writeFileSync(dir+'/verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
