import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const stage='after',dir='docs/playtest-evidence/m02-compounds';fs.mkdirSync(dir,{recursive:true});assert(['before','after'].includes(stage));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const errors=[],resources=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.error(m.text());}});
 page.on('response',r=>{if(r.status()>=400)resources.push({status:r.status(),url:r.url()});});
 await page.addInitScript(()=>{localStorage.setItem('warGame.fieldRadio','off');localStorage.setItem('warGame.fieldSound','off');});
 await page.goto('http://127.0.0.1:8766/campaign/?mission=m02');
 await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:120000});
 await page.locator('#begin').click();await page.waitForFunction(()=>campaign.state.active&&!campaign.state.openingPlaying,null,{timeout:120000});
 if(await page.locator('#pause').getAttribute('aria-label')!=='Продолжить')await page.locator('#pause').click();
 await page.evaluate(()=>{campaign.radio.dismiss();campaign.select([]);campaign.world.fixedRenderScale=1;campaign.world.renderer.setPixelRatio(1);const m=campaign.mission;m.explored.fill(255);m.visible.fill(255);m.visionSources=[{x:26,y:88,radius:200}];m.fogRevision++;});
 const data=await page.evaluate(()=>{
  const m=campaign.mission;
  return {terrain:Array.from(m.field.renderSamples),navigation:m.field.navigation,roads:m.field.localRoads,
   structures:m.state.buildings.filter(b=>b.m02Base).map(({id,kind,x,y,halfWidth,halfDepth,maxHp,rotation})=>({id,kind,x,y,halfWidth,halfDepth,maxHp,rotation})).sort((a,b)=>a.id.localeCompare(b.id)),
   combat:Object.fromEntries(['mg-tower','scav-flame-tower','scav-cannon-tower','bunker'].map(kind=>[kind,m.config.buildings[kind]]))};
 });
 const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
 const report={stage,hashes:Object.fromEntries(Object.entries(data).map(([key,value])=>[key,hash(value)])),errors,resources};
 for(const [name,grid,distance] of [['east',[34,77.3],470],['plateau',[15.5,71.8],580],['radar',[30.5,89],330],['energy',[26,108.3],720]]){
  await page.setViewportSize({width:1440,height:900});
  await page.evaluate(({grid,distance})=>campaign.world.centre(campaign.mission.field.gridToWorld(grid),distance),{grid,distance});
  await page.waitForTimeout(700);await page.screenshot({path:`${dir}/${name}-${stage}.png`});
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(({grid,distance})=>campaign.world.centre(campaign.mission.field.gridToWorld(grid),distance*1.6),{grid,distance});
  await page.waitForTimeout(700);await page.screenshot({path:`${dir}/${name}-narrow-${stage}.png`});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);console.log('CAPTURE',stage,name);
 }
 assert.deepEqual(errors,[]);assert.deepEqual(resources,[]);
 assert.equal(await page.evaluate(()=>campaign.mission.state.m02.fortificationVersion),3);
 fs.writeFileSync(`${dir}/${stage}.json`,JSON.stringify(report,null,2)+'\n');console.log('PASS',stage,report);
}finally{await browser.close();}
