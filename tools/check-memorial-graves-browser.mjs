import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const folder='campaign/previews/memorial-ranks';fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
 await page.addInitScript(()=>{for(const key of ['fieldRadio','fieldSound','fieldStoryVoice'])localStorage.setItem('warGame.'+key,'off');});
 await page.goto('http://127.0.0.1:8766/campaign/');await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:120000});
 await page.locator('#begin').click();await page.waitForFunction(()=>document.querySelector('#welcome').hidden,null,{timeout:120000});
 if(await page.evaluate(()=>campaign.state.dreamPlaying))await page.locator('[data-dream="skip"]').click();
 await page.evaluate(()=>campaign.advance(40));await page.waitForFunction(()=>campaign.state.active,null,{timeout:60000});await page.locator('#pause').click();
 const saved=await page.evaluate(async()=>{
  const c=campaign,m=c.mission,p=m.state.campaign.personnel,{MemorialScene}=await import('./memorial-scene.js'),{personnelRanks}=await import('./personnel-ranks.js');c.radio.setEnabled(false);
  const original=MemorialScene.prototype.setData;MemorialScene.prototype.setData=function(...args){window.rankMemorial=this;return original.apply(this,args);};
  // Deliberately create a death order different from rank order. Every rank
  // still gets exactly one casualty, no decorative graves.
  const first=['private','sergeant','senior-sergeant','warrant-officer','junior-lieutenant','colonel','army-general','marshal'];
  const ranks=[...first,...personnelRanks.map(r=>r.id).filter(id=>!first.includes(id))];
  for(const rank of ranks){const u=m.addUnit('bukhanka','rai',{x:800,y:800}),id=p.crews[u.id].memberIds[0];c.setPersonnelRank(id,rank);m.damage(u,1e6,{id:'fixture-enemy',kind:'raider',owner:'scavs',x:700,y:700});}
  m.state.time=1634;m.state.status='victory';c.getResults();const before=c.getMemorial?.()??m.state.campaign.personnel.graveOrder.slice();const save=m.save();m.load(save);c.showResults();return {before,graveCount:p.graveOrder.length};
 });
 await page.waitForFunction(()=>document.querySelector('.memorial-scene').dataset.memorialArtReady==='true',null,{timeout:60000});
 await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(350);
 const rendered=await page.evaluate(()=>({count:rankMemorial.hitAreas.length,ids:rankMemorial.hitAreas.map(g=>g.appearance.id),ready:rankMemorial.graveArt.status(rankMemorial.graves),cache:[...rankMemorial.graveArt.entries.values()].map(e=>[e.image?.width,e.image?.height]),privateUrl:rankMemorial.graveImage.src}));
 assert.equal(saved.graveCount,39);assert.equal(rendered.count,39);assert.equal(new Set(rendered.ids).size,39);assert(rendered.ready.ready);assert.deepEqual(rendered.ready.failed,[]);assert(rendered.cache.every(s=>s[0]<=512&&s[1]<=512));assert(rendered.privateUrl.endsWith('/grave-private-v2.png'));
 await page.screenshot({path:folder+'/in-game-wide.png'});
 const privatePoint=await page.evaluate(()=>rankMemorial.hitAreas.find(g=>g.appearance.id==='private'));await page.mouse.move(privatePoint.x,privatePoint.y-privatePoint.size*.55);await page.waitForFunction(()=>!document.querySelector('#result-person').hidden);
 await page.locator('.memorial-scene').focus();await page.keyboard.press('End');assert(await page.locator('#result-person').isVisible());
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(350);await page.screenshot({path:folder+'/in-game-narrow.png'});
 assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));
 // Comparison sheet uses the production sprites with scene colour grading;
 // labels are outside the game for art review only.
 await page.evaluate(async()=>{
  campaign.renderSuspended=true;rankMemorial.stop();const {graveAppearances}=await import('./memorial-graves.js'),{rankName}=await import('./personnel-ranks.js');
  const gallery=document.createElement('main');gallery.id='grave-gallery';gallery.style='position:fixed;inset:0;z-index:300;background:#202521;color:#c9c8b5;overflow:auto;font:13px Segoe UI;padding:22px;display:grid;grid-template-columns:repeat(5,1fr);gap:16px;align-content:start;';
  for(const a of graveAppearances){const figure=document.createElement('figure');figure.dataset.rank=a.id;figure.hidden=a.service==='navy';figure.style='margin:0;text-align:center;';const img=document.createElement('img');img.src=a.url;img.style='width:100%;height:230px;object-fit:contain;filter:saturate(.54) brightness(.83) contrast(.87);';const label=document.createElement('figcaption');label.textContent=rankName(a.id);figure.append(img,label);gallery.append(figure);}
  document.body.append(gallery);
 });
 await page.setViewportSize({width:1500,height:1200});await page.waitForFunction(()=>[...document.querySelectorAll('#grave-gallery img')].every(i=>i.complete&&i.naturalWidth));
 await page.screenshot({path:folder+'/army-catalogue.png'});
 await page.evaluate(()=>{const gallery=document.querySelector('#grave-gallery');for(const f of gallery.querySelectorAll('figure'))f.hidden=!f.dataset.rank.startsWith('navy-');});
 await page.screenshot({path:folder+'/navy-catalogue.png'});
 assert.deepEqual(errors,[]);fs.writeFileSync(folder+'/verification.json',JSON.stringify({passed:true,...rendered},null,2));console.log('PASS real game: 39 rank-specific graves after save/load, preserved private, bounded sprite cache, hover/keyboard inspection, wide/narrow, army/navy catalogues');
}finally{await browser.close();}
