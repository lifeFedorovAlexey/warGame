import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH??'C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const baseline=process.argv.includes('--baseline'),quick=process.argv.includes('--quick');
const only=process.argv.find(arg=>arg.startsWith('--case='))?.slice(7);
const folder='campaign/previews/playtest-WG-003/'+(baseline?'before-captures':'after');fs.mkdirSync(folder,{recursive:true});
const report={baseline,quick,errors:[],cases:[]},browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
try{
 for(const [mode,width,height] of baseline?[['natural',1440,900]]:[['natural',1440,900],['skip',844,390],['restore',667,375]]){
  if(only&&mode!==only)continue;
  console.log('Opening '+mode+' '+width+'x'+height);
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
  page.on('pageerror',e=>report.errors.push({mode,error:e.stack??e.message}));page.on('console',m=>{if(m.type()==='error')report.errors.push({mode,error:m.text()});});
  await page.addInitScript(()=>{localStorage.setItem('warGame.fieldSound','off');localStorage.setItem('warGame.fieldStoryVoice','off');localStorage.setItem('warGame.fieldRadio','on');});
  await page.route('**/api/radio/published',r=>r.fulfill({json:{document:JSON.parse(fs.readFileSync('assets/radio/situations_catalog.json','utf8'))}}));
  if(baseline)await page.route('**/campaign/opening-television.js',r=>r.fulfill({body:fs.readFileSync('campaign/previews/playtest-WG-003/before/opening-television.js','utf8'),contentType:'text/javascript'}));
  await page.route('**/campaign/main.js',r=>r.fulfill({body:fs.readFileSync(baseline?'campaign/previews/playtest-WG-003/before/main.js':'campaign/main.js','utf8').replace('ready: true, mission, world, select, radio,','ready: true, mission, world, select, radio, reviewOpening:openingTelevision,'),contentType:'text/javascript'}));
  await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8766')+'/campaign/');await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:120000});
  const instrument=()=>page.evaluate(()=>{
   const c=campaign,w=c.world;window.transitionReview={updates:0};const update=w.update;
   w.update=function(...args){const result=update.apply(this,args);transitionReview.updates++;return result;};
   const root=c.reviewOpening.root;let seen=false;
   new MutationObserver(()=>{if(!root.hidden)seen=true;if(seen&&root.hidden&&!transitionReview.end){
    transitionReview.end={updates:transitionReview.updates,phase:c.reviewOpening.record.phase,status:c.radio.director.record('p01').status,
     units:w.vehicles.transforms.size,models:w.buildingObjects.size,clock:c.mission.state.time,width:innerWidth,height:innerHeight};
    // Freeze the exact first exposed frame after the real close operation,
    // before the following animation frame can replace an incorrect canvas.
    c.renderSuspended=true;
   }}).observe(root,{attributes:true,attributeFilter:['hidden']});
  });
  await instrument();await page.locator('#begin').click();await page.waitForFunction(()=>campaign.state.dreamPlaying);
  await page.waitForFunction(()=>document.querySelector('.dream-video-source').readyState>=2,null,{timeout:30000});
  if(mode==='restore'){
   const save=await page.evaluate(()=>{const o=campaign.reviewOpening;o.startBlasts();o.record.elapsed=17.3;return campaign.mission.save();});
   await page.evaluate(save=>localStorage.setItem('warGame.alpha.mission01.v1',save),save);await page.reload();await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:120000});await instrument();await page.locator('#resume-save').click();
  }else if(mode==='skip'){
   await page.locator('[data-dream=pause]').click();await page.setViewportSize({width:667,height:375});await page.setViewportSize({width,height});
   // Wait for the browser's resize events before freezing the first reveal;
   // an artificial render suspension must not leave a later resize unpainted.
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   await page.keyboard.press('Escape');
  }else if(quick){await page.evaluate(()=>{const o=campaign.reviewOpening;o.startBlasts();o.record.elapsed=17.5;});}
  await page.waitForFunction(()=>transitionReview.end,null,{timeout:120000});
  const end=await page.evaluate(()=>transitionReview.end);report.cases.push({mode,...end});
  const screenshot=await page.screenshot({path:folder+'/'+mode+'-first-'+width+'x'+height+'.png'});
  assert.equal(end.phase,'finished');assert.equal(end.status,mode==='skip'?'skipped':'done');
  if(baseline)assert.equal(end.updates,0,'Original finish exposes the shader warm-up canvas before a game update');
  else{assert(end.updates>=1,'A complete world update precedes the reveal');assert(end.models>0&&end.units>0,'Real game entities exist in the first exposed frame');assert(screenshot.length>10000,'The exposed screenshot contains the map, not a cleared canvas');assert.equal(end.clock,0,'Preparing the first frame does not advance the mission');}
  await page.evaluate(()=>campaign.renderSuspended=false);await page.waitForFunction(()=>campaign.mission.state.time>.5);
  await page.screenshot({path:folder+'/'+mode+'-running-'+width+'x'+height+'.png'});
  const resumed=await page.evaluate(()=>({updates:transitionReview.updates,dream:campaign.state.dreamPlaying,videoReleased:!campaign.reviewOpening.video.getAttribute('src'),opening:campaign.state.openingPlaying,radio:campaign.radio.entry?.id??null}));
  assert(!resumed.dream&&resumed.videoReleased&&resumed.updates>end.updates);Object.assign(report.cases.at(-1),{resumed});console.log('PASS '+mode+' '+JSON.stringify(end));await page.close();
 }
 assert.deepEqual(report.errors,[]);
}finally{fs.writeFileSync(folder+'/verification.json',JSON.stringify(report,null,2));await browser.close();}
