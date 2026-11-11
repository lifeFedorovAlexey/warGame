import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const folder='campaign/previews/personnel-progression';fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1}),errors=[];
 page.on('pageerror',e=>{errors.push(e.stack??e.message);console.error(e.stack??e.message);});page.on('response',r=>{if(r.status()>=400){errors.push(r.status()+' '+r.url());console.error(r.status()+' '+r.url());}});
 await page.addInitScript(()=>localStorage.setItem('warGame.fieldRadio','off'));
 await page.goto('http://127.0.0.1:8766/campaign/');
 await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:120000}).catch(async error=>{console.error((await page.locator('body').innerText()).slice(-3000));await page.screenshot({path:folder+'/startup-failure.png'});throw error;});console.log('Game ready');
 await page.locator('#begin').click();await page.evaluate(()=>campaign.advance(40));await page.waitForFunction(()=>campaign.state.active,null,{timeout:60000});await page.locator('#pause').click();
 await page.evaluate(()=>{
  const c=campaign,m=c.mission,p=m.state.campaign.personnel;c.radio.setEnabled(false);c.world.fixedRenderScale=1;c.world.renderer.setPixelRatio(1);
  const u=m.state.units.find(u=>u.kind==='bukhanka'&&u.owner==='rai'&&u.hp>0)??m.addUnit('bukhanka','rai',{x:0,y:0});
  window.rankReviewUnit=u.id;const soldier=p.soldiers[p.crews[u.id].memberIds[0]];
  // Saved career just before captain; promotion itself goes through real damage.
  soldier.kills=186;for(let i=0;i<6;i++){const e=m.addUnit('raider','scavs',{x:800,y:800});m.damage(e,1e6,u);}
  for(let i=0;i<3;i++){const b=m.addStructure('mg-tower','scavs',{x:850,y:850});m.damage(b,1e6,u);}
  c.select([u.id]);
 });
 await page.waitForFunction(()=>document.querySelector('#selection').textContent.includes('Капитан'));
 assert.equal(await page.locator('#selection .rank-insignia polygon').count(),4);
 assert((await page.locator('#selection').getAttribute('title')).includes('До звания «Майор»: 61'));
 await page.screenshot({path:folder+'/rank-desktop.png'});
 // One more officer dies in the mission; inspect his existing rank field too.
 await page.evaluate(()=>{
  const m=campaign.mission,p=m.state.campaign.personnel,u=m.addUnit('bukhanka','rai',{x:100,y:100});
  const s=p.soldiers[p.crews[u.id].memberIds[0]];s.kills=122;
  for(let i=0;i<6;i++){const e=m.addUnit('raider','scavs',{x:900,y:900});m.damage(e,1e6,u);}
  m.damage(u,1e6,{id:'review-enemy',kind:'raider',owner:'scavs',x:200,y:200});m.state.status='victory';
 });
 await page.waitForFunction(()=>!document.querySelector('#result').hidden);
 await page.evaluate(()=>document.fonts.ready);
 assert((await page.locator('#result-survivor-ranks').innerText()).includes('Капитан'));
 assert(await page.locator('#result-survivor-ranks .personnel-award-icon').count()>=3);
 await page.screenshot({path:folder+'/awards-results-desktop.png'});
 await page.locator('.memorial-scene').focus();await page.keyboard.press('Home');
 assert((await page.locator('.result-person-service').innerText()).includes('Герой операции'));
 assert((await page.locator('.result-person-service').innerText()).includes('Освоение целины'));
 assert.equal(await page.locator('.result-person-rank polygon').count(),2);
 await page.screenshot({path:folder+'/memorial-rank-desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.locator('.memorial-scene').scrollIntoViewIfNeeded();
 await page.locator('.memorial-scene').focus();await page.keyboard.press('Home');
 await page.screenshot({path:folder+'/memorial-rank-narrow.png'});
 assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));
 await page.locator('#result-close').click();await page.evaluate(()=>campaign.select([window.rankReviewUnit]));
 await page.waitForFunction(()=>document.querySelector('#selection .personnel-award-icon'));
 await page.waitForFunction(()=>document.querySelector('#result').hidden);
 await page.screenshot({path:folder+'/rank-awards-narrow.png'});
 assert.equal(await page.locator('#selection .personnel-award-icon').count(),3);
 for(const width of [320,390,1440]){
  await page.setViewportSize({width,height:width===1440?900:844});
  const ui=await page.evaluate(()=>{
   const n=document.querySelector('#selection'),b=n.getBoundingClientRect(),deck=document.querySelector('.command-deck'),canvas=document.querySelector('#world');
   const bounds=canvas.getBoundingClientRect(),s=getComputedStyle(deck);
   const mark=n.querySelector('.personnel-rank-mark').getBoundingClientRect();
   return {hover:n.contains(document.elementFromPoint(mark.x+mark.width/2,mark.y+mark.height/2)),gapPasses:!document.elementFromPoint(innerWidth/2,innerHeight-50).closest('.command-deck'),overflow:document.documentElement.scrollWidth>innerWidth,left:b.left,right:b.right,width:innerWidth,canvasWidth:bounds.width,canvasHeight:bounds.height,height:innerHeight,bg:s.backgroundColor,border:s.borderWidth};
  });
  assert(!ui.overflow&&ui.left>=0&&ui.right<=ui.width);assert.equal(ui.canvasWidth,width);assert.equal(ui.canvasHeight,ui.height);assert.equal(ui.bg,'rgba(0, 0, 0, 0)');assert(ui.hover,'Rank tooltip is reachable');if(width===1440)assert(ui.gapPasses,'Empty HUD space passes clicks to map');
 }
 await page.screenshot({path:folder+'/rank-awards-desktop.png'});
 await page.locator('.squad').screenshot({path:folder+'/rank-awards-detail.png'});
 await page.evaluate(()=>campaign.select(campaign.mission.state.units.filter(u=>u.owner==='rai'&&u.hp>0).slice(0,2).map(u=>u.id)));
 await page.waitForFunction(()=>document.querySelector('#selection').textContent.startsWith('Группа'));
 assert.equal(await page.locator('#selection .rank-insignia').count(),0,'Group selection clears previous individual insignia');
 assert.equal(await page.locator('#selection .personnel-award-icon').count(),0);
 await page.evaluate(()=>{const p=campaign.mission.state.campaign.personnel;campaign.setPersonnelRank(p.crews[window.rankReviewUnit].memberIds[0],'marshal');campaign.select([window.rankReviewUnit]);});
 await page.waitForFunction(()=>document.querySelector('#selection').textContent.includes('Маршал'));
 await page.setViewportSize({width:320,height:844});await page.screenshot({path:folder+'/marshal-320.png'});
 assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));
 assert.deepEqual(errors,[]);
 fs.writeFileSync(folder+'/verification.json',JSON.stringify({passed:true,viewports:[320,390,1440],errors},null,2));
 console.log('PASS actual game promotion, captain/lieutenant stars, awards, memorial, 320/390/1440 layouts, full-screen map and group selection reset');
}finally{await browser.close();}
