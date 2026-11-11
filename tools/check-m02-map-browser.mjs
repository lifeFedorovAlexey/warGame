import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {makeMission} from './m02-fixture.mjs';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const dir='docs/campaign/alpha/m02/map-v2';fs.mkdirSync(dir,{recursive:true});const errors=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});page.setDefaultTimeout(60000);page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR '+e.message);});page.on('console',msg=>{if(msg.type()==='error')console.log('BROWSER ERROR '+msg.text());});
 await page.goto('http://127.0.0.1:8766/campaign/?mission=m02');try{await page.waitForFunction(()=>window.campaign?.ready,{},{timeout:120000});}catch(e){console.log(await page.locator('body').innerText());throw e;}console.log('READY');
 await page.locator('#begin').click();await page.waitForFunction(()=>campaign.state.active&&!campaign.state.openingPlaying,{},{timeout:120000});
 await page.locator('#pause').click();await page.evaluate(()=>campaign.radio.dismiss());
 assert.deepEqual(await page.evaluate(()=>campaign.mission.state.bounds),[0,0,53,127]);
 assert.equal(await page.evaluate(()=>campaign.mission.explored.some((v,i)=>v&&i%128>53)),false);
 await page.screenshot({path:dir+'/start-fog.png'});
 // Survey-only rendering: reveal this mission's bounds, never the locked east.
 await page.evaluate(()=>{const m=campaign.mission;for(let y=0;y<128;y++)for(let x=0;x<=53;x++)m.explored[y*128+x]=255;m.fogRevision++;});
 for(const [name,grid,distance] of [['south-overview',[27,89],2100],['radar',[30.5,88.5],550],['energy',[25,108],680],['western-approaches',[19,79],1150]]){
  await page.evaluate(({grid,distance})=>{const m=campaign.mission;m.visionSources=[{x:grid[0],y:grid[1],radius:45}];m.fogRevision++;campaign.world.centre(m.field.gridToWorld(grid),distance);},{grid,distance});
  await page.waitForTimeout(450);await page.screenshot({path:dir+'/'+name+'.png'});
 }
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);await page.screenshot({path:dir+'/narrow.png'});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await page.evaluate(()=>document.querySelector('#world').getBoundingClientRect().height),844);
 const checkpoint=makeMission();checkpoint.state.status='victory';checkpoint.state.camps.forEach(c=>c.cleared=true);checkpoint.state.units=checkpoint.state.units.filter(u=>u.owner==='rai');checkpoint.state.buildings=checkpoint.state.buildings.filter(b=>b.owner==='rai');checkpoint.state.units[0].experience=731;
 const legacy=JSON.parse(fs.readFileSync('docs/campaign/alpha/m02/playthrough-20.json','utf8')).state;
 assert.equal(legacy.state.m02.version,1);
 await page.setViewportSize({width:1440,height:900});
 await page.evaluate(({checkpoint,legacy})=>{localStorage.setItem('warGame.alpha.before-m02.v1',checkpoint);campaign.mission.load(legacy);campaign.radio.dismiss();campaign.select([]);},{checkpoint:checkpoint.save(),legacy});
 await page.locator('.settings summary').click();await page.locator('[aria-controls="operation-actions"]').click();
 await page.locator('#m02-checkpoint').click();
 console.log('CHECKPOINT CLICKED');
 await page.waitForFunction(()=>campaign.mission.state.mission==='alpha-m01');
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('warGame.alpha.before-map-v2.v1')).state.m02.version),1);
 await page.locator('#result-continue').click();await page.waitForFunction(()=>campaign.mission.state.m02?.version===2);
 console.log('ENTERED MAP V2');
 assert.deepEqual(await page.evaluate(()=>campaign.mission.state.bounds),[0,0,53,127]);
 assert.equal(await page.evaluate(()=>campaign.mission.state.units[0].experience),731);
 await page.locator('.settings summary').click();
 if(!await page.locator('#m02-checkpoint').isVisible())await page.locator('[aria-controls="operation-actions"]').click();
 await page.locator('#m02-checkpoint').click();await page.waitForFunction(()=>campaign.mission.state.m02?.version===1);
 console.log('RESTORED BACKUP');
 assert.equal(await page.evaluate(()=>campaign.mission.state.time),legacy.state.time);
 assert.deepEqual(errors,[]);fs.writeFileSync(dir+'/browser.json',JSON.stringify({passed:true,bounds:[0,0,53,127],errors,screenshots:6,checkpointRestart:true,legacyBackupRestored:true},null,2));console.log('PASS map bounds, initial fog, radar, approaches, energy hub, narrow viewport, checkpoint restart and backup restore');
}finally{await browser.close();}
