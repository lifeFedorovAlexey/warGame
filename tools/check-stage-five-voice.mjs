import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const edits=JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/reviewed-dialogue.json','utf8'));
const sceneIds=['r14','r16','r18','r19'],scenes=sceneIds.map(id=>edits.scenes.find(s=>s.id===id));
const folder='campaign/previews/stage-v';fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
 await page.route('**/navigation',r=>r.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*'},body:'{}'}));
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8766/review/stage-v-voice')+'/campaign/');
 await page.waitForFunction(()=>window.campaign?.ready&&!document.getElementById('begin').disabled,null,{timeout:90000});
 const enemy=await page.evaluate(()=>{
  const {mission:m,radio:r}=campaign,p=m.field.gridToWorld(m.config.startGrid);
  for(const [kind,dx,dy] of [['generator',140,100],['factory',-170,120],['lab',40,160]])m.addStructure(kind,'rai',{x:p.x+dx,y:p.y+dy},{completed:true,progress:1});
  m.addStructure('derrick','rai',m.field.gridToWorld(m.config.oilFields[0]),{completed:true,progress:1});
  m.state.storyConstruction={enabled:true,unlocked:['generator','derrick','factory','lab'],research:true,requiredBunkers:2};
  const d=r.director.bind(m);d.includeOpening=false;d.facts.firstVan=true;m.state.statistics.produced=1;
  const enemy=m.addUnit('raider','scavs',{x:p.x+25,y:p.y-40});m.state.flags.raidStarted=true;m.state.flags.contact=true;m.state.flags.raidIds=[enemy.id];
  for(const id of ['p01','p02','p03','p04','r01','r01a','r01b','r02','r03','r04','r05','r06','r08','r09','r11','r13'])d.scenes[id]={status:'done',cursor:0,endedAt:0};
  m.updateEconomy(0);m.updateFog();localStorage.setItem('warGame.alpha.mission01.v1',m.save());document.getElementById('resume-save').disabled=false;
  const signal=r.onSignal;r.voiceReview=[];
  r.onSignal=(position,chapter,keep,urgent,cue)=>{
   const line=cue&&{id:cue.id,scene:cue.storyScene,file:cue.clip?.file,duration:cue.clip?.duration,presented:performance.now()};
   if(line)r.voiceReview.push(line);
   return signal(position,chapter,keep?until=>{if(line&&Number.isFinite(until)){line.finished=performance.now();line.releaseAt=until;}keep(line?Infinity:until);}:keep,urgent,cue);
  };
  return enemy.id;
 });
 await page.locator('#resume-save').click();await page.waitForFunction(()=>campaign.state.active&&document.getElementById('welcome').hidden);await page.locator('#pause').click();
 // The save represents an approaching patrol. Clear any shot from the single
 // render frame before the test pauses; combat is introduced explicitly below.
 await page.evaluate(()=>{const m=campaign.mission,d=campaign.radio.director.data;if(d.facts.contact)d.facts.contact.fired=false;d.lastCombat=-30000;m.effects=[];m.state.projectiles=[];});
 const screenshot=async name=>{
  for(const [suffix,width,height] of [['desktop',1440,900],['narrow',390,844]]){
   await page.setViewportSize({width,height});await page.screenshot({path:folder+'/'+name+'-'+suffix+'.png'});
  }
 };
 for(const scene of scenes){
  console.log('Scene',scene.id);
  for(let i=0;i<scene.cues.length;i++){
   const id=scene.cues[i],cue=edits.dialogue.find(l=>l.id===id);
   try{await page.waitForFunction(id=>campaign.storyAudio.cueId===id||campaign.radio.entry?.id===id&&campaign.radio.voiceReview.findLast(l=>l.id===id)?.finished,id,{timeout:30000});}
   catch(error){throw new Error(JSON.stringify({expected:id,...await page.evaluate(()=>({audio:campaign.storyAudio,entry:campaign.radio.entry?.id,state:campaign.state,radio:campaign.mission.state.radioStory,flags:campaign.mission.state.flags}))}),{cause:error});}
   assert.equal(await page.locator('#radio p').textContent(),cue.text);
   await page.waitForFunction(s=>document.querySelector('.radio-portrait').dataset.speaker===s,cue.speaker);
   if(scene.id==='r14'&&i===2||scene.id==='r19'&&i===5)await screenshot(scene.id);
   if(scene.id==='r16'&&i===0){
    const before=await page.evaluate(()=>campaign.radio.entry.token);
    await page.evaluate(id=>{const m=campaign.mission,target=m.state.units.find(u=>u.owner==='rai'&&u.hp>0);m.effects.push({type:'shot',from:id,targetId:target.id,to:{x:target.x,y:target.y,z:m.field.heightAt(target.x,target.y)+1},weapon:'mg'});campaign.advance(0);m.effects=[];},enemy);
    assert.equal(await page.evaluate(()=>campaign.radio.entry.token),before,'An attack cannot interrupt or rewind a started exchange');
   }
   await page.waitForFunction(id=>campaign.radio.voiceReview.findLast(l=>l.id===id)?.finished,id,{timeout:30000});
   await page.evaluate(id=>{const r=campaign.radio,line=r.voiceReview.findLast(l=>l.id===id);line.released=performance.now();r.until=line.releaseAt;},id);
   await page.waitForFunction(id=>campaign.radio.entry?.id!==id,id);
  }
  if(scene.id==='r14'){
   const saved=await page.evaluate(()=>campaign.mission.save());
   await page.evaluate(saved=>{campaign.radio.reset();campaign.mission.load(saved);campaign.radio.consume(campaign.mission,performance.now());},saved);
   assert.equal(await page.evaluate(()=>campaign.mission.state.radioStory.scenes.r14.status),'done');
  }
  if(scene.id==='r16')await page.evaluate(id=>{const m=campaign.mission;m.damage(m.entity(id),99999);m.state.flags.raidWon=true;m.effects=[];campaign.advance(0);},enemy);
 }
 const timeline=await page.evaluate(ids=>campaign.radio.voiceReview.filter(l=>ids.includes(l.scene)),sceneIds);
 assert.deepEqual(timeline.map(l=>l.id),scenes.flatMap(s=>s.cues),'All sixteen lines play once in order, including after loading');
 for(const line of timeline){assert.equal(line.file,edits.clips[line.id].file);assert(line.finished-line.presented>=(line.duration-.15)*1000,JSON.stringify(line));}
 for(let i=1;i<timeline.length;i++)if(timeline[i].scene!==timeline[i-1].scene){
  const previous=timeline[i-1],gap=timeline[i].presented-Math.max(previous.finished,previous.released);
  assert(gap>=1950,JSON.stringify({gap,from:previous.scene,to:timeline[i].scene}));
  if(timeline[i].scene==='r19')assert(gap>=9950,'The explanation waits ten seconds after victory');
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(folder+'/verification.json',JSON.stringify({pass:true,timeline,errors},null,2));
 console.log('PASS: 16 stage V lines, actual audio completion, correct speakers and subtitles, attack does not interrupt, save does not replay, two-second gaps and ten-second aftermath, desktop/narrow');
}finally{await browser.close();}
