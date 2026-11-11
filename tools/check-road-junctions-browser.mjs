import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dir='campaign/previews/road-junctions/'+(process.argv.includes('--before')?'before':'after');fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1}),errors=[];
 page.on('pageerror',e=>errors.push(e.stack??e.message));await page.addInitScript(()=>localStorage.setItem('warGame.fieldRadio','off'));
 await page.goto('http://127.0.0.1:8766/campaign/');await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});
 await page.locator('#begin').click();await page.evaluate(()=>campaign.advance(40));await page.waitForFunction(()=>campaign.state.active,null,{timeout:60000});await page.locator('#pause').click();
 await page.evaluate(()=>{const m=campaign.mission;m.state.bounds=[0,0,53,82];m.explored.fill(255);m.fogRevision++;campaign.select([]);campaign.world.fixedRenderScale=1;campaign.world.renderer.setPixelRatio(1);});
 for(const [name,grid,distance] of [['south-junction',[35.7,78.4],440],['water-tower',[38.7,28.3],420],['north-fork',[40,38],420],['central-fork',[37.5,54],420],['western-base',[15,72],500],['home-exit',[27,53],500]]){
  await page.evaluate(({grid,distance})=>{const m=campaign.mission;m.visionSources=[{x:grid[0],y:grid[1],radius:30}];m.fogRevision++;campaign.world.centre(m.field.gridToWorld(grid),distance);},{grid,distance});
  await page.waitForTimeout(350);await page.screenshot({path:dir+'/'+name+'.png'});console.log('SCREEN '+name);
 }
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{const m=campaign.mission;m.visionSources=[{x:35.7,y:78.4,radius:30}];m.fogRevision++;campaign.world.centre(m.field.gridToWorld([35.7,78.4]),440);});await page.waitForTimeout(350);await page.screenshot({path:dir+'/south-junction-narrow.png'});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 fs.writeFileSync(dir+'/checks.json',JSON.stringify({passed:true,errors},null,2));
}finally{await browser.close();}
