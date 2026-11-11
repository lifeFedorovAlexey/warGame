import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const baseline=process.argv.includes('--baseline'),folder='docs/playtest-evidence/wg002-wg030/'+(baseline?'before':'after');
fs.mkdirSync(folder,{recursive:true});
const report={baseline,errors:[],networkFailures:[],views:[]};
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
let page;
try{
 page=await browser.newPage({viewport:{width:1440,height:900},hasTouch:true,deviceScaleFactor:1});
 page.on('pageerror',e=>report.errors.push(e.message));
 page.on('requestfailed',r=>{if(r.failure()?.errorText!=='net::ERR_ABORTED')report.networkFailures.push({url:r.url(),error:r.failure()});});
 await page.addInitScript(()=>{for(const key of ['fieldRadio','fieldSound','fieldStoryVoice'])localStorage.setItem('warGame.'+key,'off');});
 await page.goto((process.env.WARGAME_URL??(baseline?'http://127.0.0.1:8766':'http://127.0.0.1:8777'))+'/campaign/?mission=m02');
 for(let attempt=0;attempt<2;attempt++){
  const count=report.networkFailures.length;
  try{await page.waitForFunction(()=>window.campaign?.ready||document.querySelector('#loading')?.dataset.phase==='error',null,{timeout:90000});}
  catch(error){if(attempt===1)throw error;await page.reload();continue;}
  if(await page.evaluate(()=>!!window.campaign?.ready))break;
  if(attempt===1||report.networkFailures.length===count)throw Error(await page.locator('#loading-status').innerText());
  await page.reload();
 }
 console.log('Game ready');await page.locator('#begin').click();
 await page.waitForFunction(()=>campaign.state.active&&!campaign.state.openingPlaying,null,{timeout:90000});
 await page.locator('#pause').click();
 await page.evaluate(()=>{const c=campaign,w=c.world,m=c.mission;w.fixedRenderScale=1;w.renderer.setPixelRatio(1);window.review={car:m.state.units.find(u=>u.owner==='rai'&&u.kind==='bukhanka')};c.select([review.car.id]);w.centre(review.car,360);});
 const cameraState=()=>page.evaluate(()=>{const w=campaign.world;return {distance:w.camera.position.distanceTo(w.controls.target),min:w.controls.minDistance,max:w.controls.maxDistance,clearance:w.camera.position.z-w.field.heightAt(w.camera.position.x,w.camera.position.y),target:w.controls.target.toArray(),position:w.camera.position.toArray()};});
 const capture=async name=>{
  for(const [width,height] of (baseline?[[1440,900]]:[[1440,900],[844,390],[667,375]])){
   await page.setViewportSize({width,height});await page.waitForTimeout(250);
   const dimensions=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scroll:document.documentElement.scrollWidth}));
   assert.equal(dimensions.width,dimensions.scroll);report.views.push({name,...dimensions});
   if(name==='choices'){
    const layout=await page.evaluate(()=>{
     const panel=document.querySelector('#mission-ending'),r=panel.getBoundingClientRect(),css=getComputedStyle(panel);
     return {x:r.x+r.width/2,y:r.y+r.height/2,background:css.backgroundColor,shadow:css.boxShadow,
      resultHidden:document.querySelector('#result').hidden,icons:panel.querySelectorAll('svg,img').length,
      buttons:[...panel.querySelectorAll('button')].filter(b=>!b.hidden).map(b=>{const s=getComputedStyle(b),r=b.getBoundingClientRect();return {text:b.textContent,label:b.getAttribute('aria-label'),title:b.title,icon:b.querySelector('use')?.getAttribute('href'),background:s.backgroundColor,border:s.borderTopWidth,shadow:s.boxShadow,x:r.x,y:r.y,width:r.width,height:r.height};})};
    });
    assert(Math.abs(layout.x-width/2)<1&&Math.abs(layout.y-height/2)<1);assert.equal(layout.background,'rgba(0, 0, 0, 0)');assert.equal(layout.shadow,'none');assert(layout.resultHidden);assert.equal(layout.icons,3);
    assert.deepEqual(layout.buttons.map(b=>b.label),['Продолжить','Заново','В меню']);
    assert.deepEqual(layout.buttons.map(b=>b.icon?.split('/').at(-1)),['controls.svg#play','controls.svg#restart','controls.svg#menu']);
    for(const b of layout.buttons){assert.equal(b.text,'');assert(b.title);assert.equal(b.background,'rgba(0, 0, 0, 0)');assert.equal(b.border,'0px');assert.equal(b.shadow,'none');assert(b.x>=0&&b.y>=0&&b.x+b.width<=width&&b.y+b.height<=height&&b.height>=44);}
    (report.choiceLayouts??=[]).push({width,height,...layout});
   }
   await page.screenshot({path:folder+'/'+name+'-'+width+'.png'});
  }
  await page.setViewportSize({width:1440,height:900});
 };
 await page.mouse.move(720,450);await page.mouse.wheel(0,-14000);await page.waitForTimeout(600);
 report.near=await cameraState();await capture('near');
 if(!baseline){assert(report.near.distance<90);assert(report.near.distance>=65-.01);assert(report.near.clearance>=39.9);}
 const picked=await page.evaluate(()=>{campaign.select([]);return campaign.world.screen(review.car);});
 await page.mouse.click(picked.x,picked.y);report.picked=await page.evaluate(()=>campaign.selected.includes(review.car.id));assert(report.picked);
 await page.mouse.move(720,450);await page.mouse.wheel(0,18000);await page.waitForTimeout(600);
 report.far=await cameraState();await capture('far');
 if(!baseline){assert(report.far.distance<=1600.01);assert(report.far.distance>=1599);}
 // Actual two-finger zoom uses the same limits as the wheel.
 if(!baseline){
  const cdp=await page.context().newCDPSession(page);
  await page.evaluate(()=>campaign.world.centre(review.car,300));
  for(const [start,end] of [[10,500],[500,2]]){
   const touches=offset=>[{x:720-offset,y:450,id:1},{x:720+offset,y:450,id:2}];
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:touches(start)});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:touches(end)});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(400);
   const state=await cameraState();assert(state.distance>=64.99&&state.distance<=1600.01);(report.pinch??=[]).push(state);
  }
 }
 console.log('Camera and picking checked');
 // Use the real map and mission rules; arrange the last surviving objective.
 report.finale=await page.evaluate(async()=>{
  const {Mission}=await import('/campaign/mission.js'),{isCampPerimeter}=await import('/campaign/camp-demolition.js');
  const c=campaign,m=c.mission,w=c.world,cfg=await (await fetch('/assets/campaign/alpha/mission01/gameplay.json')).json();
  c.radio.reset();m.load(new Mission(cfg,w.field).save());m.state.storyConstruction={enabled:false};m.state.bounds=m.config.finalMapBounds.slice();m.state.units=m.state.units.filter(u=>u.owner==='rai');
  const home=w.field.gridToWorld(m.config.startGrid);
  for(const [i,kind] of ['generator','derrick','factory','lab','bunker','bunker'].entries())m.addStructure(kind,'rai',{x:home.x+(i%3)*100,y:home.y+Math.floor(i/3)*100},{completed:true,progress:1});
  m.state.statistics.produced=1;m.state.flags.raidWon=true;m.state.flags.lastRevealed=true;
  for(const key of Object.keys(m.config.research))m.state.research[key]=true;
  const last=m.state.buildings.find(b=>b.campId===m.state.camps[3].id&&b.kind==='camp-core');
  for(const b of m.state.buildings)if(b.owner==='scavs'&&!isCampPerimeter(b)&&b!==last)m.damage(b,b.hp);
  m.rebuildNavigation();m.updateMission();m.drainEffects();m.drainEvents();m.visible.fill(255);m.explored.fill(255);
  const d=c.radio.director.bind(m);d.includeOpening=false;d.active=null;d.lastEnd=d.clock-30000;
  for(const scene of c.radio.director.script.scenes)if(!['r48','r49','r50','r54'].includes(scene.id))d.scenes[scene.id]={status:'done',cursor:scene.cues.length,endedAt:d.clock-30000};
  c.radio.setEnabled(true);c.select([m.state.units[0].id]);w.centre(m.state.units[0],360);
  review.ordinary={enabled:w.controls.enabled,target:w.controls.target.toArray()};
  // This is a valid in-flight grenade at the instant a different hit wins.
  m.state.projectiles.push({id:'final-in-flight-shell',owner:'rai',sourceId:m.state.units[0].id,sourceKind:'grenadier',from:{x:last.x-50,y:last.y,z:w.field.heightAt(last.x,last.y)+15},to:{x:last.x,y:last.y,z:w.field.heightAt(last.x,last.y)},born:m.state.time,impactAt:m.state.time+1,damage:1,radius:0});
  m.state.time+=.1;m.damage(last,last.hp);m.updateMission();
  review.frozen=m.state.units.map(u=>({id:u.id,x:u.x,y:u.y,hp:u.hp}));review.money=m.state.energy;review.last={x:last.x,y:last.y};
  return {status:m.state.status,remainingProjectiles:m.state.projectiles.length,ordinary:review.ordinary,lastObjective:review.last};
 });
 assert.equal(report.finale.status,'victory');
 await page.waitForTimeout(3300);
 report.presentation=await page.evaluate(()=>({controls:campaign.world.controls.enabled,choicesHidden:document.querySelector('#mission-ending')?.hidden,cornerHeading:!!document.querySelector('#mission-ending strong'),commands:getComputedStyle(document.querySelector('#commands')).display,target:campaign.world.controls.target.toArray(),story:campaign.radio.entry?.storyScene??null}));
 if(!baseline){assert.equal(report.presentation.controls,false);assert.equal(report.presentation.commands,'none');assert(report.presentation.choicesHidden&&!report.presentation.cornerHeading);assert(Math.hypot(report.presentation.target[0]-report.finale.lastObjective.x,report.presentation.target[1]-report.finale.lastObjective.y)<1,'Camera focuses the last destroyed objective');}
 await capture('finale');
 if(!baseline){
  await page.keyboard.press('KeyB');await page.keyboard.press('KeyM');await page.keyboard.press('Alt+KeyR');
  await page.mouse.click(1000,500,{button:'right'});await page.mouse.wheel(0,-2000);
  const blocked=await page.evaluate(()=>({buildKind:campaign.state.buildKind,orderMode:campaign.state.orderMode,units:campaign.mission.state.units.map(u=>({id:u.id,x:u.x,y:u.y,hp:u.hp})),original:review.frozen,money:campaign.mission.state.energy,originalMoney:review.money}));
  assert.equal(blocked.buildKind,null);assert.equal(blocked.orderMode,null);assert.deepEqual(blocked.units,blocked.original);assert.equal(blocked.money,blocked.originalMoney);report.blockedCommands=true;
  // Exercise the normal save/load handlers in this isolated browser profile.
  await page.evaluate(()=>document.querySelector('#save').click());await page.waitForTimeout(300);
  await page.evaluate(()=>document.querySelector('#load').click());
  await page.waitForFunction(()=>document.querySelector('#welcome').hidden&&!campaign.world.controls.enabled&&document.querySelector('#mission-hud').classList.contains('mission-ended'),null,{timeout:30000});
  report.loadedEnding=true;
  // Shorten subtitle waiting for the test, preserving the real director,
  // sequence, final signal and results transition. Audio is disabled here.
  report.dialogues=[];let capturedSignal=false;
  for(let i=0;i<140;i++){
   const state=await page.evaluate(()=>({result:!document.querySelector('#mission-ending').hidden,scene:campaign.radio.entry?.storyScene??null}));
   if(state.scene&&!report.dialogues.includes(state.scene))report.dialogues.push(state.scene);
   if(state.result)break;
   if(state.scene==='r50'&&!capturedSignal){await page.waitForTimeout(2800);await capture('final-signal');capturedSignal=true;}
   await page.evaluate(()=>{campaign.radio.director.data.clock+=2000;if(campaign.radio.entry?.story)campaign.radio.until=performance.now()-1;});
   await page.waitForTimeout(100);
  }
  await page.waitForFunction(()=>!document.querySelector('#mission-ending').hidden,null,{timeout:15000});
  assert(report.dialogues.includes('r54'));report.autoChoices=true;await capture('choices');
  const m01Save=await page.evaluate(()=>localStorage.getItem('warGame.alpha.mission01.v1'));
  await page.keyboard.press('Escape');
  report.review=await page.evaluate(()=>({controls:campaign.world.controls.enabled,commands:getComputedStyle(document.querySelector('#commands')).display,ending:!document.querySelector('#mission-ending').hidden}));
  assert(report.review.controls&&!report.review.ending&&report.review.commands==='none');
  await page.locator('.settings > summary').click();await page.locator('[aria-controls="operation-actions"]').click();
  await page.locator('#results-open').click();await page.waitForFunction(()=>!document.querySelector('#result').hidden);
  report.manualReport=true;await page.locator('#result-close').click();await page.keyboard.press('Escape');
  await page.locator('#ending-continue').click();
  // M02 state appears before its navigation mesh is ready. Wait for the
  // transition handler to finish before checking restored game controls.
  await page.waitForFunction(()=>campaign.mission.state.m02&&campaign.mission.state.status==='running'&&!document.querySelector('#ending-continue').disabled&&document.querySelector('#result').hidden,null,{timeout:30000});
  report.nextMission=await page.evaluate(()=>({controls:campaign.world.controls.enabled,ending:document.querySelector('#mission-ending').hidden,commands:getComputedStyle(document.querySelector('#commands')).display}));
  assert(report.nextMission.controls&&report.nextMission.ending&&report.nextMission.commands!=='none');
  // An ordinary M02 radio exchange must retain camera control.
  await page.evaluate(()=>{const c=campaign,d=c.radio.director.bind(c.mission);for(const id of Object.keys(d.scenes))if(id.startsWith('m02-'))delete d.scenes[id];d.active=null;d.lastEnd=d.clock-30000;c.radio.reset();});
  await page.waitForFunction(()=>campaign.radio.entry?.storyScene==='m02-radio-start',null,{timeout:15000});
  report.ordinaryDialogue=await page.evaluate(()=>({scene:campaign.radio.entry.storyScene,controls:campaign.world.controls.enabled}));assert(report.ordinaryDialogue.controls);
  await page.evaluate(()=>document.querySelector('#save').click());await page.waitForTimeout(250);
  await page.evaluate(()=>{const m=campaign.mission;for(const u of m.state.units)if(u.owner==='rai'&&m.unitSpec(u).role==='builder')m.damage(u,u.hp);for(const b of m.state.buildings)if(b.owner==='rai'&&b.kind==='factory')m.damage(b,b.hp);m.updateMission();});
  await page.waitForFunction(()=>!document.querySelector('#mission-ending').hidden,null,{timeout:15000});
  report.defeat=await page.evaluate(()=>({status:campaign.mission.state.status,continueHidden:document.querySelector('#ending-continue').hidden,restartEnabled:!document.querySelector('#ending-restart').disabled,resultHidden:document.querySelector('#result').hidden}));
  assert.equal(report.defeat.status,'defeat');assert(report.defeat.continueHidden&&report.defeat.restartEnabled&&report.defeat.resultHidden);
  const beforeRestart=await page.evaluate(()=>localStorage.getItem('warGame.alpha.mission01.v1'));
  await page.locator('#ending-restart').click();
  await page.waitForFunction(()=>document.querySelector('#welcome').hidden&&campaign.mission.state.status==='running'&&campaign.mission.state.m02,null,{timeout:30000});
  report.restartM02=await page.evaluate(()=>({backup:JSON.parse(localStorage.getItem('warGame.alpha.before-restart.v1')).state.status,manual:localStorage.getItem('warGame.alpha.mission01.v1'),builders:campaign.mission.state.units.filter(u=>u.owner==='rai'&&u.hp>0&&campaign.mission.unitSpec(u).role==='builder').length,controls:campaign.world.controls.enabled}));
  assert.equal(report.restartM02.backup,'defeat');assert.equal(report.restartM02.manual,beforeRestart);delete report.restartM02.manual;assert(report.restartM02.builders>0&&report.restartM02.controls);
  await page.evaluate(async()=>{const m=campaign.mission,{finalizeMissionResults}=await import('/campaign/personnel.js');campaign.radio.setEnabled(false);m.state.status='victory';finalizeMissionResults(m);});
  await page.waitForFunction(()=>!document.querySelector('#mission-ending').hidden,null,{timeout:15000});
  report.radioOff=await page.evaluate(()=>({status:campaign.mission.state.status,radio:campaign.radio.enabled,continueHidden:document.querySelector('#ending-continue').hidden,resultHidden:document.querySelector('#result').hidden}));assert.equal(report.radioOff.status,'victory');assert.equal(report.radioOff.radio,false);assert(report.radioOff.continueHidden&&report.radioOff.resultHidden);
  await Promise.all([page.waitForNavigation(),page.locator('#ending-menu').click()]);
  await page.waitForFunction(()=>window.campaign?.ready&&!document.querySelector('#welcome').hidden,null,{timeout:90000});
  report.menu=await page.evaluate(()=>({welcome:!document.querySelector('#welcome').hidden,savedStatus:JSON.parse(localStorage.getItem('warGame.alpha.mission01.v1')).state.status}));assert(report.menu.welcome);assert.equal(report.menu.savedStatus,'victory');
  await page.evaluate(data=>{localStorage.setItem('warGame.alpha.mission01.v1',data);localStorage.setItem('warGame.alpha.latest-save.v1','warGame.alpha.mission01.v1');},m01Save);
  await page.locator('#resume-save').click();
  await page.waitForFunction(()=>document.querySelector('#welcome').hidden&&!document.querySelector('#mission-ending').hidden,null,{timeout:30000});
  await page.locator('#ending-restart').click();
  await page.waitForFunction(()=>document.querySelector('#welcome').hidden&&campaign.mission.state.status==='running'&&!campaign.mission.state.m02,null,{timeout:30000});
  report.restartM01=await page.evaluate(()=>({backup:JSON.parse(localStorage.getItem('warGame.alpha.before-restart.v1')).state.status,manual:localStorage.getItem('warGame.alpha.mission01.v1'),opening:campaign.state.openingPlaying,buildings:campaign.mission.state.buildings.filter(b=>b.owner==='rai').map(b=>({kind:b.kind,completed:!!b.completed}))}));
  assert.equal(report.restartM01.backup,'victory');assert.equal(report.restartM01.manual,m01Save);delete report.restartM01.manual;assert(report.restartM01.opening);assert.deepEqual(report.restartM01.buildings,[{kind:'base-sign',completed:false}]);
 }
 assert.deepEqual(report.errors,[]);console.log(JSON.stringify({near:report.near,far:report.far,presentation:report.presentation,dialogues:report.dialogues,autoChoices:report.autoChoices,nextMission:report.nextMission,restartM01:report.restartM01,restartM02:report.restartM02,menu:report.menu,errors:report.errors}));
}catch(error){report.failure=error.stack;if(page){report.pageText=await page.locator('body').innerText({timeout:5000}).catch(()=>null);await page.screenshot({path:folder+'/failure.png',timeout:10000}).catch(()=>{});}throw error;}
finally{fs.writeFileSync(folder+'/verification.json',JSON.stringify(report,null,2));await browser.close();}
