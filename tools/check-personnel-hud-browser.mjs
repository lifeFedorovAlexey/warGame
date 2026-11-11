import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const folder='campaign/previews/personnel-hud';fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>{for(const key of ['fieldRadio','fieldSound','fieldStoryVoice'])localStorage.setItem('warGame.'+key,'off');});
 await page.goto('http://127.0.0.1:8766/campaign/');await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:120000});
 await page.locator('#begin').click();await page.evaluate(()=>campaign.advance(40));await page.waitForFunction(()=>campaign.state.active,null,{timeout:60000});await page.locator('#pause').click();
 console.log('Game ready');
 await page.evaluate(async()=>{
  const c=campaign,m=c.mission,w=c.world,p=m.state.campaign.personnel;
  await w.healthBars.ready;c.radio.setEnabled(false);w.fixedRenderScale=1;w.renderer.setPixelRatio(1);w.controls.enableDamping=false;
  const u=m.state.units.find(u=>u.kind==='bukhanka'&&u.owner==='rai');window.honourUnit=u.id;
  w.controls.target.set(u.x,u.y,w.field.heightAt(u.x,u.y));w.camera.position.copy(w.controls.target).add({x:35,y:-140,z:190});w.controls.update();
  window.honourCamera=w.camera.position.toArray();window.honourTarget=w.controls.target.toArray();
  c.select([u.id],false,false);
  for(let i=0;i<4;i++){const e=m.addUnit('raider','scavs',{x:800,y:800});m.damage(e,1e6,u);}
  c.advance(0);
 });
 await page.waitForFunction(()=>!document.querySelector('#personnel-notice').hidden&&document.querySelector('#personnel-notice').textContent.includes('Ефрейтор'));
 const notice=await page.locator('#personnel-notice').textContent();assert(notice.includes('Присвоено звание'));
 const audit=await page.evaluate(()=>{
  const c=campaign,w=c.world,m=c.mission;w.update(m,new Set(c.selected),0);
  const h=w.healthBars.hitAreas.find(h=>h.id===window.honourUnit),r=document.querySelector('#personnel-notice').getBoundingClientRect();
  return {h,camera:w.camera.position.toArray(),target:w.controls.target.toArray(),oldCamera:window.honourCamera,oldTarget:window.honourTarget,passThrough:!!document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('#world')};
 });
 assert.equal(audit.h.rank,'lance-corporal');assert(Math.hypot(...audit.camera.map((v,i)=>v-audit.oldCamera[i]))<1e-6);assert(Math.hypot(...audit.target.map((v,i)=>v-audit.oldTarget[i]))<1e-6);assert(audit.passThrough);
 await page.screenshot({path:folder+'/promotion-wide.png'});
 await page.locator('#personnel-notice').screenshot({path:folder+'/promotion-detail.png'});
 await page.mouse.click(1100,450);await page.waitForFunction(()=>!campaign.selected.length);
 await page.mouse.move(audit.h.x+12,audit.h.y+16);assert((await page.locator('#world canvas').getAttribute('title')).includes('Ефрейтор'));
 await page.mouse.click(audit.h.x+12,audit.h.y+16);await page.waitForFunction(()=>campaign.selected.includes(window.honourUnit));
 await page.waitForFunction(()=>document.querySelector('#selection').textContent.includes('Личный счёт: 4'));
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>{
  const c=campaign,w=c.world,u=c.mission.entity(window.honourUnit);w.controls.target.set(u.x,u.y,w.field.heightAt(u.x,u.y));w.camera.position.copy(w.controls.target).add({x:20,y:-120,z:165});w.controls.update();
  for(let i=0;i<4;i++){const e=c.mission.addUnit('raider','scavs',{x:800,y:800});c.mission.damage(e,1e6,u);}c.advance(0);
 });
 await page.waitForFunction(()=>!document.querySelector('#personnel-notice').hidden&&document.querySelector('#personnel-notice').textContent.includes('Младший сержант'));
 await page.screenshot({path:folder+'/promotion-narrow.png'});
 const narrow=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,h:campaign.world.healthBars.hitAreas.find(h=>h.id===window.honourUnit)}));
 assert(!narrow.overflow);assert(narrow.h.x>0&&narrow.h.x+narrow.h.width<390);
 await page.setViewportSize({width:320,height:844});await page.screenshot({path:folder+'/promotion-320.png'});assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));
 // Exercise all distinct small layouts over actual machines, including marks
 // at full health without selection and a same-pose rank change.
 await page.setViewportSize({width:1440,height:900});
 const markerCount=await page.evaluate(async()=>{
  const c=campaign,m=c.mission,w=c.world,p=m.state.campaign.personnel,u=m.entity(window.honourUnit);
  const ranks=['lance-corporal','junior-sergeant','sergeant','senior-sergeant','starshina','warrant-officer','senior-warrant-officer','lieutenant','captain','major','colonel','colonel-general'];
  window.honourReviewIds=ranks.map((rank,i)=>{const v=m.addUnit('bukhanka','rai',{x:u.x+(i%4-1.5)*25,y:u.y+(Math.floor(i/4)-1)*32});p.soldiers[p.crews[v.id].memberIds[0]].rank=rank;return v.id;});
  c.select([window.honourReviewIds[8]],false,false);
  w.controls.target.set(u.x,u.y,w.field.heightAt(u.x,u.y));w.camera.position.copy(w.controls.target).add({x:20,y:-150,z:220});w.controls.update();w.update(m,new Set(c.selected),0);
  return w.healthBars.hitAreas.length;
 });
 assert(markerCount>=12);
 await page.screenshot({path:folder+'/ranks-wide.png'});
 const pixelAudit=await page.evaluate(()=>{
  const c=campaign,w=c.world,m=c.mission,gl=w.renderer.getContext(),mesh=w.healthBars.root,h=w.healthBars.hitAreas.find(h=>h.id===window.honourReviewIds[8]);
  const read=()=>{const data=new Uint8Array(24*32*4);gl.readPixels(Math.floor(h.x),gl.drawingBufferHeight-Math.floor(h.y)-32,24,32,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;};
  w.update(m,new Set(c.selected),0);const visible=read();mesh.visible=false;w.renderer.render(w.scene,w.camera);const absent=read();mesh.visible=true;
  let changed=0;for(let i=0;i<visible.length;i+=4)if(Math.abs(visible[i]-absent[i])+Math.abs(visible[i+1]-absent[i+1])+Math.abs(visible[i+2]-absent[i+2])>35)changed++;
  return {changed,error:gl.getError()};
 });assert(pixelAudit.changed>18,JSON.stringify(pixelAudit));assert.equal(pixelAudit.error,0);
 // Notice queue: rapid promotions coalesce, two recipients stay distinct.
 const queue=await page.evaluate(async()=>{
  const {PersonnelNotices}=await import('./personnel-notices.js'),n=new PersonnelNotices(document.createElement('aside')),p=campaign.mission.state.campaign.personnel;
  const a=p.crews[window.honourReviewIds[8]].memberIds[0],b=p.crews[window.honourReviewIds[7]].memberIds[0];
  const ev=(soldierId,rank)=>({type:'personnel-promoted',soldierId,rank});
  n.consume([ev(a,'lieutenant'),ev(a,'captain'),ev(b,'major')],campaign.mission,0);n.update(0);
  const first=n.root.textContent;n.update(7000);const second=n.root.textContent;n.update(14000);
  return {first,second,done:n.root.hidden};
 });assert(queue.first.includes('Капитан'));assert(!queue.first.includes('Лейтенант'));assert(queue.second.includes('Майор'));assert(queue.done);
 // Awards actually granted by completing the mission, then made explicit in results.
 await page.evaluate(()=>{
  const c=campaign,m=c.mission,u=m.entity(window.honourUnit);
  for(let i=0;i<3;i++){const e=m.addUnit('raider','scavs',{x:800,y:800});m.damage(e,1e6,u);}
  for(let i=0;i<3;i++){const b=m.addStructure('mg-tower','scavs',{x:850,y:850});m.damage(b,1e6,u);}
  m.state.status='victory';c.getResults();c.advance(0);
 });
 await page.waitForFunction(()=>!document.querySelector('#result').hidden);
 assert((await page.locator('#result-honours').innerText()).includes('Герой операции'));
 const honoursBounds=await page.locator('#result-honours').boundingBox();assert(honoursBounds.y+honoursBounds.height<820,'Honours stay above actions even with many ranks');
 await page.screenshot({path:folder+'/honours-wide.png'});
 await page.setViewportSize({width:390,height:844});await page.locator('#result-honours').scrollIntoViewIfNeeded();await page.screenshot({path:folder+'/honours-narrow.png'});
 assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));
 // Catalog of the same production SVGs, for visual inspection of every rank.
 await page.evaluate(async()=>{
  campaign.renderSuspended=true;
  const {rankInsignia,personnelRanks}=await import('./personnel-ranks.js');
  const sheet=document.createElement('div');sheet.id='rank-review-sheet';sheet.style='position:fixed;inset:0;z-index:200;background:#20261c;padding:28px;color:#c9b47b;overflow:auto;display:grid;grid-template-columns:repeat(10,1fr);gap:22px 14px;';
  for(const r of personnelRanks){const n=document.createElement('div');n.style='text-align:center;font:12px Segoe UI;';n.innerHTML=rankInsignia(r.id)+rankInsignia(r.id,{compact:true});const name=document.createElement('div');name.textContent=r.name;n.append(name);n.querySelector('.rank-insignia').style='height:140px;width:50px;';n.querySelector('.rank-symbol').style='height:28px;width:20px;vertical-align:bottom;margin:0 0 10px 7px;';sheet.append(n);}
  document.body.append(sheet);
 });
 await page.setViewportSize({width:1500,height:950});await page.screenshot({path:folder+'/rank-catalog.png'});
 assert.deepEqual(errors,[]);fs.writeFileSync(folder+'/verification.json',JSON.stringify({passed:true,notice,narrow,pixelAudit,queue,viewports:[390,1440],errors},null,2));
 console.log('PASS live promotion notice, unchanged camera, real rank marks in framebuffer, full HP, rank click, queue/coalescing, details, awards, wide/narrow and rank catalog');
}finally{await browser.close();}
