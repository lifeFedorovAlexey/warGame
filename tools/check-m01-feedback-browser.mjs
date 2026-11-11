import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const folder='campaign/previews/m01-feedback';fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const errors=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 page.on('pageerror',e=>{errors.push(e.stack??e.message);console.log(e.stack??e.message);});page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
 await page.addInitScript(()=>localStorage.setItem('warGame.fieldRadio','off'));
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8766')+'/campaign/');
 await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});await page.locator('#begin').click();
 await page.evaluate(()=>campaign.advance(40));await page.waitForFunction(()=>campaign.state.active,null,{timeout:60000});await page.locator('#pause').click();
 await page.evaluate(()=>{
  const c=campaign,m=c.mission,r=c.radio,d=r.director;m.drainEvents();m.drainEffects();
  c.world.fixedRenderScale=1;c.world.renderer.setPixelRatio(1);
  window.feedback={lines:[],stage:'',prepare(stage,ids){
   r.reset();d.bind(m);this.stage=stage;
   for(const id of d.scenes.keys())d.data.scenes[id]={status:'done',cursor:0,endedAt:d.data.clock-20000};
   for(const id of ids)delete d.data.scenes[id];
   d.data.active=null;d.data.lastScene=null;d.data.lastEnd=d.data.clock-20000;d.data.lastCombat=d.data.clock-30000;d.data.facts={};
   m.effects=[];m.state.research={};m.state.artifactKeys=[];m.state.flags.raidIds=[];m.state.flags.contact=false;m.state.flags.raidWon=false;
   for(const camp of m.state.camps)camp.cleared=false;
  }};
  const signal=r.onSignal;
  r.onSignal=(s,chapter,keep,urgent,cue)=>{
   const line=cue?{id:cue.id,scene:cue.storyScene,text:cue.text,stage:feedback.stage,started:performance.now(),duration:cue.clip?.duration}:null;
   if(line)feedback.lines.push(line);
   return signal(s,chapter,keep?until=>{if(line&&Number.isFinite(until))line.ended=performance.now();keep(until);}:keep,urgent,cue);
  };
  feedback.prepare('nii',['r06','r08','r09','r11']);
  const p=m.field.gridToWorld(m.config.startGrid);m.addStructure('factory','rai',{x:p.x-160,y:p.y+100},{completed:true,progress:1});
  r.setEnabled(true);c.advance(0);
 });
 const waitCue=id=>page.waitForFunction(id=>campaign.storyAudio.cueId===id,id,{timeout:60000});
 const waitDone=id=>page.waitForFunction(id=>campaign.radio.director.record(id).status==='done',id,{timeout:60000});
 await waitCue('m01-s05-l002');assert.equal(await page.evaluate(()=>feedback.lines[0].scene),'r11');
 await waitDone('r11');console.log('PASS immediate NII order, original audio completes');
 await page.evaluate(()=>{
  const c=campaign,m=c.mission;feedback.prepare('election',['r14','r16']);
  const enemy=m.addUnit('raider','scavs',m.field.gridToWorld([29.5,52.125]),{hp:1000});feedback.enemy=enemy.id;
  m.state.flags.contact=true;m.state.flags.raidIds=[enemy.id];m.visibleAt=()=>false;c.advance(0);
 });
 await waitCue('m01-s07-l005');
 await page.evaluate(()=>{const m=campaign.mission,target=m.state.units.find(u=>u.owner==='rai'&&u.hp>0);m.damage(target,1,m.entity(feedback.enemy));m.effects.push({type:'shot',from:feedback.enemy,targetId:target.id,to:{x:target.x,y:target.y,z:m.field.heightAt(target.x,target.y)+2},weapon:'mg'});campaign.advance(0);});
 await waitCue('m01-s07-l007');await page.screenshot({path:folder+'/elections-desktop.png'});await waitDone('r16');
 assert(await page.evaluate(()=>feedback.lines.some(l=>l.stage==='election'&&l.text.includes('выборы'))));
 console.log('PASS approach warning before visibility, election after shooting');
 await page.evaluate(()=>{
  const c=campaign,m=c.mission;feedback.prepare('warehouse',['r32','r33']);
  m.state.camps[1].cleared=true;m.state.artifactKeys.push('mg-ammo-1');
  m.emit('camp-cleared',{camp:m.state.camps[1].id});m.emit('artifact-collected',{key:'mg-ammo-1'});c.advance(0);
 });
 await waitCue('m01-s09-l001');
 const notice=await page.locator('#toast').textContent();assert(notice.includes('зачищен')&&notice.includes('патронов'));
 await page.screenshot({path:folder+'/warehouse-desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:folder+'/warehouse-narrow.png'});
 const layout=await page.evaluate(()=>{
  const n=document.querySelector('#toast'),s=getComputedStyle(n),r=n.getBoundingClientRect();
  return {border:s.borderTopWidth,background:s.backgroundColor,left:r.left,right:r.right,overflow:document.documentElement.scrollWidth>innerWidth,mapHeight:document.querySelector('#world').getBoundingClientRect().height};
 });
 assert.equal(layout.border,'0px');assert.equal(layout.background,'rgba(0, 0, 0, 0)');assert(layout.left>=0&&layout.right<=390);assert(!layout.overflow);assert.equal(layout.mapHeight,844);
 await waitDone('r32');
 await page.evaluate(()=>{campaign.mission.state.research['mg-ammo-1']=true;campaign.mission.emit('research-complete',{key:'mg-ammo-1'});campaign.advance(0);});
 await waitDone('r33');console.log('PASS warehouse praise, combined notice and named research');
 await page.setViewportSize({width:1440,height:900});
 await page.evaluate(()=>{
  const c=campaign,m=c.mission;feedback.prepare('flame',['r25','r26','r27','r29','r30-alt','r32']);
  m.state.camps[0].cleared=true;m.state.camps[1].cleared=true;m.state.artifactKeys.push('flamethrower');m.state.research.flamethrower=true;
  c.advance(0);
 });
 await waitDone('r25');await waitDone('r26');await waitDone('r27');await waitCue('m01-s08-l013');
 await page.screenshot({path:folder+'/flamethrower-desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:folder+'/flamethrower-narrow.png'});await waitDone('r29');
 const result=await page.evaluate(()=>({lines:feedback.lines,paused:campaign.state.paused,controls:campaign.world.controls.enabled}));
 const flame=result.lines.filter(l=>l.stage==='flame'&&l.ended),scenes=[...new Set(flame.map(l=>l.scene))];
 assert.deepEqual(scenes,['r25','r26','r27','r29']);
 assert(flame.some(l=>l.text.includes('синей и жёлтой')));assert(flame.some(l=>l.text.includes('Чтобы жёлтая не разматывалась')));
 for(const line of result.lines.filter(l=>l.ended))assert(line.duration&&line.ended-line.started>=(line.duration-.15)*1000,JSON.stringify(line));
 assert.deepEqual(errors,[]);assert(result.paused&&result.controls);
 fs.writeFileSync(folder+'/verification.json',JSON.stringify({passed:true,notice,layout,...result,errors},null,2));
 console.log('PASS natural voice completion, continuous artifact sequence, joke context, wide and narrow UI');
}finally{await browser.close();}
