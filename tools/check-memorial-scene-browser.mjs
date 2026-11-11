import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const folder='campaign/previews/personnel';
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 await page.goto('http://127.0.0.1:8766/campaign/memorial-scene.js');
 await page.setContent('<style>body{margin:0}canvas{display:block;width:1440px;height:900px}</style><canvas id="stage"></canvas>');
 await page.evaluate(async()=>{const {MemorialScene}=await import('./memorial-scene.js');window.scene=new MemorialScene(document.querySelector('canvas'));scene.setData([]);});
 await page.waitForFunction(()=>scene.flagTexture&&scene.width);
 const check=await page.evaluate(()=>{
  scene.stop();scene.atmosphere=()=>{};scene.birds=()=>{};
  const ctx=scene.ctx,w=scene.canvas.width,h=scene.canvas.height,f=scene.flag;
  scene.time=0;scene.draw();const a=ctx.getImageData(0,0,w,h).data;
  scene.time=2;scene.draw();const b=ctx.getImageData(0,0,w,h).data;
  let fabricChanges=0,backgroundChanges=0,mastChanges=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const offset=(y*w+x)*4;if(a[offset]===b[offset]&&a[offset+1]===b[offset+1]&&a[offset+2]===b[offset+2])continue;
   if(x<f.x-f.w*.04||x>f.x+f.w*1.04||y<f.y-f.h*.2||y>f.y+f.h*1.2)backgroundChanges++;
   else fabricChanges++;
   if(Math.abs(x-f.pole)<.5)mastChanges++;
  }
  return {fabricChanges,backgroundChanges,mastChanges};
 });
 assert(check.fabricChanges>100,'Cloth actually moves');assert.equal(check.backgroundChanges,0,'Sky and ground remain identical');assert.equal(check.mastChanges,0,'Mast is rigid');
 await page.screenshot({path:folder+'/flag-in-wind.png',clip:{x:1080,y:35,width:350,height:265}});
 await page.evaluate(()=>{scene.time=0;scene.draw();});
 await page.screenshot({path:folder+'/flag-at-rest.png',clip:{x:1080,y:35,width:350,height:265}});
 await page.evaluate(()=>{const f=scene.flag;scene.ctx.drawImage(scene.cache,0,0);scene.ctx.drawImage(scene.flagTexture,f.x,f.y,f.w,f.h);});
 await page.screenshot({path:folder+'/flag-flat-reference.png',clip:{x:1080,y:35,width:350,height:265}});
 fs.writeFileSync(folder+'/flag-verification.json',JSON.stringify({passed:true,...check},null,2));
 console.log('PASS cloth moves while every pixel of sky and mast remains fixed',check);
}finally{await browser.close();}
