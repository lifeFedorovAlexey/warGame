import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const folder='campaign/previews/results-fit';fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1837,height:884}}),errors=[];
 page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
 await page.addInitScript(()=>{for(const key of ['fieldRadio','fieldSound','fieldStoryVoice'])localStorage.setItem('warGame.'+key,'off');});
 await page.goto('http://127.0.0.1:8766/campaign/');await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:120000});
 await page.locator('#begin').click();await page.evaluate(()=>campaign.advance(40));await page.waitForFunction(()=>campaign.state.active);await page.locator('#pause').click();console.log('Game ready');
 await page.locator('#design-toggle').click();await page.locator('[data-design-slot="paint"]').click();await page.waitForTimeout(400);await page.screenshot({path:folder+'/new-paint-icon.png'});await page.locator('[data-close-designer]').click();
 await page.evaluate(async()=>{
  const c=campaign,m=c.mission,p=m.state.campaign.personnel,{personnelRanks}=await import('./personnel-ranks.js');c.radio.setEnabled(false);
  for(const r of personnelRanks)for(const dead of [false,true]){
   const u=m.addUnit('bukhanka','rai',{x:800,y:800}),id=p.crews[u.id].memberIds[0];c.setPersonnelRank(id,r.id);
   p.soldiers[id].missions.m01={kills:dead?7:9,structuresDestroyed:3,awards:['participant','breacher','hero']};
   if(dead)m.damage(u,1e6,{id:'fixture-enemy',owner:'scavs',kind:'raider',x:700,y:700});
  }
  m.state.time=1634;m.state.status='victory';c.getResults();c.advance(0);
 });
 await page.waitForFunction(()=>!document.querySelector('#result').hidden);await page.evaluate(()=>document.fonts.ready);
 await page.waitForFunction(()=>document.querySelector('.memorial-scene').dataset.memorialFlag==='ready');
 const audits=[];
 for(const [width,height] of [[1837,884],[1366,768],[1000,600],[390,844],[320,740]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(400);
  const audit=await page.evaluate(()=>{
   const root=document.querySelector('#result'),copy=document.querySelector('.result-copy').getBoundingClientRect(),actions=document.querySelector('.result-actions').getBoundingClientRect();
   const ranks=[...root.querySelectorAll('.result-rank')],bad=ranks.filter(n=>{const r=n.getBoundingClientRect(),s=n.closest('.result-section').getBoundingClientRect();return r.left<0||r.right>innerWidth||r.bottom>Math.min(copy.bottom,actions.top,s.bottom)+1;}).map(n=>n.getAttribute('aria-label'));
   const blocks=[...root.querySelectorAll('.result-section')].map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};});
   return {width:innerWidth,height:innerHeight,count:ranks.length,bad,blocks,rootScroll:root.scrollHeight>root.clientHeight+1,overflowX:document.documentElement.scrollWidth>innerWidth,copyBottom:copy.bottom,actionsTop:actions.top};
  });
  await page.screenshot({path:folder+'/all-ranks-'+width+'.png'});assert.equal(audit.count,78);assert.deepEqual(audit.bad,[],JSON.stringify(audit));assert(!audit.rootScroll);assert(!audit.overflowX);audits.push(audit);
 }
 await page.setViewportSize({width:1837,height:884});await page.locator('.memorial-scene').focus();await page.keyboard.press('Home');await page.waitForTimeout(200);
 const person=await page.locator('#result-person').boundingBox(),copy=await page.locator('.result-copy').boundingBox();assert(person.x>copy.x+copy.width,'Grave details stay outside statistics');await page.screenshot({path:folder+'/inspect-wide.png'});
 await page.evaluate(()=>{
  const r=campaign.mission.state.campaign.personnel.missions.m01.report;
  r.survivors=r.survivors.slice(0,27).map((s,i)=>({...s,rank:['private','lance-corporal','junior-sergeant','sergeant'][i%4]}));
  r.casualties=r.casualties.slice(0,2);r.memorial=r.casualties;r.statistics.personnelLost=2;r.statistics.enemyUnitsDestroyed=152;r.statistics.enemyStructuresDestroyed=34;r.durationSeconds=1408;campaign.showResults();
 });
 await page.waitForTimeout(300);await page.screenshot({path:folder+'/ordinary-wide.png'});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);await page.screenshot({path:folder+'/ordinary-narrow.png'});
 assert.deepEqual(errors,[]);fs.writeFileSync(folder+'/audit.json',JSON.stringify(audits,null,2));console.log(JSON.stringify({passed:true,rankGroups:78,viewports:audits.map(a=>[a.width,a.height])}));
}finally{await browser.close();}
