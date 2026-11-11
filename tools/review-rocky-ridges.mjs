import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const stage=process.argv[2]??'after',dir='docs/playtest-evidence/wg032-rocks';
assert(['before','after'].includes(stage));
fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const report={stage,missions:{},errors:[],resources:[]};
try{
 for(const mission of ['m01','m02']){
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&!m.text().startsWith('Failed to load resource:'))report.errors.push(m.text());});
  page.on('response',r=>{if(r.status()>=400)report.resources.push({status:r.status(),url:r.url()});});
  console.log('LOAD',stage,mission);
  await page.addInitScript(()=>{localStorage.setItem('warGame.fieldRadio','off');localStorage.setItem('warGame.fieldSound','off');});
  await page.goto(`http://127.0.0.1:8766/campaign/${mission==='m02'?'?mission=m02':''}`);
  await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:120000});
  await page.locator('#begin').click();
  if(mission==='m01')await page.evaluate(()=>campaign.advance(40));
  await page.waitForFunction(()=>campaign.state.active&&!campaign.state.openingPlaying,null,{timeout:120000});
  if(await page.locator('#pause').getAttribute('aria-label')!=='Продолжить')await page.locator('#pause').click();
  await page.evaluate(()=>{campaign.radio.dismiss();campaign.select([]);campaign.world.fixedRenderScale=1;campaign.world.renderer.setPixelRatio(1);});
  const data=await page.evaluate(()=>{
   const f=campaign.mission.field;
   return{heights:Array.from(f.renderSamples),navigation:f.navigation,roads:f.localRoads,
    buildings:campaign.mission.state.buildings.filter(b=>b.campId||b.m02Base).map(({kind,x,y,halfWidth,halfDepth})=>({kind,x,y,halfWidth,halfDepth})),
    triangles:campaign.world.terrain.statistics.terrainTriangles};
  });
  const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
  report.missions[mission]=Object.fromEntries(Object.entries(data).map(([key,value])=>[key,key==='triangles'?value:hash(value)]));
  const views=mission==='m01'?[['overview',[25,31],1900],['ridge',[25,23],550]]:[['overview',[26,88],2150],['ridge',[16,87],580]];
  for(const [name,grid,distance] of views){
   await page.evaluate(({grid,distance})=>{const m=campaign.mission;m.explored.fill(255);m.visible.fill(255);m.visionSources=[{x:grid[0],y:grid[1],radius:100}];m.fogRevision++;campaign.world.centre(m.field.gridToWorld(grid),distance);},{grid,distance});
   await page.waitForTimeout(700);
   await page.screenshot({path:`${dir}/${mission}-${name}-${stage}.png`});
   console.log('CAPTURE',stage,mission,name);
  }
  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(700);
  await page.screenshot({path:`${dir}/${mission}-narrow-${stage}.png`});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(await page.evaluate(()=>document.querySelector('#world').getBoundingClientRect().height),844);
  if(stage==='after'&&mission==='m01'){
   await page.setViewportSize({width:1440,height:900});
   await page.evaluate(()=>{const m=campaign.mission;campaign.world.centre(m.field.gridToWorld([19,31.5]),440);});
   await page.waitForTimeout(700);await page.screenshot({path:`${dir}/camp-g3-wide.png`});
   await page.setViewportSize({width:390,height:844});
   await page.evaluate(()=>{const m=campaign.mission;campaign.world.centre(m.field.gridToWorld([16.9,32.3]),850);});
   await page.waitForTimeout(700);await page.screenshot({path:`${dir}/camp-g3-narrow.png`});
  }
  // Exercise the PBR path even on software WebGL; it uses different shader chunks.
  await page.evaluate(()=>{campaign.world.terrain.setViewMode('close');campaign.world.renderer.render(campaign.world.scene,campaign.world.camera);});
  await page.close();
  fs.writeFileSync(`${dir}/${stage}.json`,JSON.stringify(report,null,2)+'\n');
 }
 assert.deepEqual(report.errors,[]);
 if(stage==='after'&&fs.existsSync(`${dir}/before.json`)){
  const before=JSON.parse(fs.readFileSync(`${dir}/before.json`,'utf8'));
  for(const mission of ['m01','m02'])for(const key of ['heights','triangles'])assert.equal(report.missions[mission][key],before.missions[mission][key],mission+' '+key+' must stay unchanged');
 }
 fs.writeFileSync(`${dir}/${stage}.json`,JSON.stringify(report,null,2)+'\n');
 console.log('PASS',stage,'both missions, wide + narrow, overview + PBR shaders, terrain/navigation/camp signatures',JSON.stringify(report.missions));
}finally{await browser.close();}
