import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH??'C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const baseline=process.argv.includes('--baseline');
const folder='campaign/previews/playtest-WG-003/save-reload/'+(baseline?'before':'after');fs.mkdirSync(folder,{recursive:true});
const report={baseline,errors:[],cases:[]};
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
try{
 for(const [width,height] of baseline?[[1440,900]]:[[1440,900],[844,390],[667,375]]){
  console.log('Saved game '+width+'x'+height);
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
  page.on('pageerror',e=>report.errors.push(e.stack??e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.addInitScript(()=>{localStorage.setItem('warGame.fieldSound','off');localStorage.setItem('warGame.fieldStoryVoice','off');localStorage.setItem('warGame.fieldRadio','off');});
  await page.route('**/api/radio/published',r=>r.fulfill({json:{document:JSON.parse(fs.readFileSync('assets/radio/situations_catalog.json','utf8'))}}));
  if(baseline)await page.route('**/campaign/main.js',r=>r.fulfill({body:fs.readFileSync('campaign/previews/playtest-WG-003/save-reload/before-source/main.js','utf8'),contentType:'text/javascript'}));
  await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8766')+'/campaign/');await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:120000});
  await page.locator('#begin').click();await page.waitForFunction(()=>campaign.state.dreamPlaying);await page.keyboard.press('Escape');
  await page.waitForFunction(()=>campaign.mission.state.time>.5);
  // Save a playable operation with its introductory dream already finished.
  // Handoff is a fixture setting; all serialization and loading use real code.
  await page.evaluate(()=>{
   campaign.renderSuspended=true;campaign.mission.state.openingScene.handedOver=true;
   localStorage.setItem('warGame.alpha.mission01.v1',campaign.mission.save());
   localStorage.setItem('warGame.alpha.latest-save.v1','warGame.alpha.mission01.v1');
  });
  await page.reload();await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:120000});
  await page.evaluate(()=>{
   const c=campaign,w=c.world,m=c.mission,update=w.update,load=m.load;
   window.saveTransitionReview={updates:0};
   w.update=function(...args){const result=update.apply(this,args);saveTransitionReview.updates++;return result;};
   m.load=function(...args){const result=load.apply(this,args);saveTransitionReview={updates:0,savedClock:m.state.time};return result;};
   const root=document.querySelector('#welcome');let covered=!root.hidden;
   new MutationObserver(()=>{
    if(!root.hidden)covered=true;
    if(root.hidden&&covered&&!saveTransitionReview.end){
     const unit=m.state.units.filter(u=>u.owner==='rai'&&u.kind==='bukhanka')[1],pose=w.vehicles.transforms.get(unit.id);
     saveTransitionReview.end={updates:saveTransitionReview.updates,clock:m.state.time,savedClock:saveTransitionReview.savedClock,
      units:w.vehicles.transforms.size,models:w.buildingObjects.size,dream:c.state.dreamPlaying,
      poseError:pose?Math.hypot(pose.position.x-unit.x,pose.position.y-unit.y):null};
     // Freeze exactly the first exposed canvas, before the next game frame.
     c.renderSuspended=true;covered=false;
    }
   }).observe(root,{attributes:true,attributeFilter:['hidden']});
  });
  for(const mode of ['continue','reload']){
   if(mode==='continue')await page.locator('#resume-save').click();
   else{
    // The current picture deliberately differs from the save being loaded.
    await page.evaluate(()=>{
     const c=campaign,u=c.mission.state.units.filter(u=>u.owner==='rai'&&u.kind==='bukhanka')[1];u.x+=100;u.previousX=u.x;u.previousY=u.y;
     c.world.centre(u,360);c.world.update(c.mission,new Set(),0,false,true);
    });
    await page.locator('.settings > summary').click();await page.locator('[aria-controls=operation-actions]').click();await page.locator('#load').click();
   }
   await page.waitForFunction(()=>saveTransitionReview.end,null,{timeout:120000});
   const end=await page.evaluate(()=>saveTransitionReview.end);report.cases.push({mode,width,height,...end});
   const shot=await page.screenshot({path:folder+'/'+mode+'-first-'+width+'x'+height+'.png'});
   assert.equal(end.dream,false,'Completed intro must not replay when loading an operation');
   assert.equal(end.clock,end.savedClock,'Preparing the scene must not advance the saved mission');
   if(baseline){assert.equal(end.updates,0);assert(mode==='continue'?end.units===0:end.poseError>90);}
   else{assert(end.updates>=1);assert(end.units>0&&end.models>0);assert(end.poseError<.01);assert(shot.length>10000);}
   await page.evaluate(()=>campaign.renderSuspended=false);await page.waitForFunction(()=>campaign.mission.state.time>saveTransitionReview.end.clock+.2);
   await page.screenshot({path:folder+'/'+mode+'-running-'+width+'x'+height+'.png'});
   await page.evaluate(()=>campaign.renderSuspended=true);
   console.log('PASS '+mode+' '+JSON.stringify(end));
  }
  await page.close();
 }
 assert.deepEqual(report.errors,[]);report.passed=true;
}finally{fs.writeFileSync(folder+'/verification.json',JSON.stringify(report,null,2));await browser.close();}
