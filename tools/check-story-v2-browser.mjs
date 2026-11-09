import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {applyStoryEdits} from '../campaign/story-edits.js';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base='assets/campaign/alpha/mission01/',read=file=>JSON.parse(fs.readFileSync(base+file));
const {story}=applyStoryEdits(read('story-v2.json'),read('audio-v2.json'),read('reviewed-dialogue.json'));
const stageThreeOnly=process.argv.includes('--through-stage-three');
const stageFourOnly=process.argv.includes('--stage-four');
const folder='campaign/previews/radio-flow-review';fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],pending=new Set();
 page.on('pageerror',e=>errors.push(e.stack??e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
 page.on('request',r=>pending.add(r.url()));page.on('requestfinished',r=>pending.delete(r.url()));page.on('requestfailed',r=>pending.delete(r.url()));
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8884')+'/campaign/');
 try{await page.waitForFunction(()=>window.campaign?.ready||document.querySelector('#loading-status').textContent.startsWith('Ошибка'),null,{timeout:90000});}
 catch(error){throw new Error(JSON.stringify({status:await page.locator('#loading-status').textContent(),errors,pending:[...pending]}),{cause:error});}
 assert(await page.evaluate(()=>!!window.campaign?.ready),JSON.stringify({status:await page.locator('#loading-status').textContent(),errors,pending:[...pending]}));
 const initial=await page.evaluate(()=>campaign.mission.save());
 // Screenshots may outlast a short line on a busy renderer. Hold only the test's
 // current caption; the real AudioBuffer still starts and finishes normally.
 await page.evaluate(()=>{
  const r=campaign.radio,signal=r.onSignal;r.testTransmissions=[];r.testAutoHold=true;
  r.onSignal=(s,c,keep,urgent,cue)=>{
   const entry=cue?{id:cue.id,scene:cue.storyScene,presented:performance.now(),duration:cue.clip.duration}:null;
   if(entry)r.testTransmissions.push(entry);
   return signal(s,c,keep?until=>{if(entry&&Number.isFinite(until)){entry.finished=performance.now();entry.releaseAt=until;}keep(cue&&r.testAutoHold?Infinity:until);}:keep,urgent,cue);
  };
 });
 const waitCue=async id=>{
  try{await page.waitForFunction(id=>campaign.storyAudio.cueId===id||campaign.radio.entry?.id===id&&campaign.radio.testTransmissions.some(line=>line.id===id&&line.finished),id,{timeout:id==='m01-s03-l001'?45000:15000});}
  catch(error){throw new Error(JSON.stringify({expected:id,...await page.evaluate(()=>({audio:campaign.storyAudio,entry:campaign.radio.entry,until:campaign.radio.until,now:performance.now(),state:campaign.state,radio:campaign.mission.state.radioStory}))}),{cause:error});}
 };
 const finishLine=()=>page.evaluate(()=>{campaign.radio.testHeldCue=null;campaign.radio.until=0;campaign.advance(0);});
 const screenshot=async(name,narrow=false)=>{
  await page.setViewportSize(narrow?{width:390,height:844}:{width:1440,height:900});
  await page.waitForFunction(()=>{const r=document.querySelector('#radio'),q=document.querySelector('#field-tasks');return r.hidden||q.hidden||q.getBoundingClientRect().top>=r.getBoundingClientRect().bottom+8;});
  await page.screenshot({path:folder+'/'+name+'.png'});
 };
 const playScene=async(id,{natural=false,check,snap}={})=>{
  console.log('Scene',id);
  const scene=story.scenes.find(s=>s.id===id);assert(scene,id);
  for(let i=0;i<scene.cues.length;i++){
   const cueId=scene.cues[i],cue=story.dialogue.find(c=>c.id===cueId);
   await waitCue(cueId);assert.equal(await page.locator('#radio p').textContent(),cue.text);
   if(cue.speaker!=='past')await page.waitForFunction(s=>document.querySelector('.radio-portrait').dataset.speaker===s,cue.speaker);
   assert.equal(await page.evaluate(()=>campaign.unitVoice.playing),false);
   if(check)await check(i);
   if(snap&&i===scene.cues.length-1)await screenshot(snap);
   if(natural){
     await page.waitForFunction(id=>campaign.radio.testTransmissions.findLast(line=>line.id===id)?.finished,cueId);
    await page.evaluate(id=>{
     const r=campaign.radio,line=r.testTransmissions.findLast(line=>line.id===id);
     line.inspectedUntil=performance.now();r.testHeldCue=null;r.until=line.releaseAt??Infinity;
    },cueId);
    await page.waitForFunction(id=>campaign.radio.entry?.id!==id,cueId);
   }
   else await finishLine();
  }
 };
 const addBuilding=async(kind,dx,dy)=>page.evaluate(({kind,dx,dy})=>{
  const {mission}=campaign,p=kind==='derrick'?mission.field.gridToWorld(mission.config.oilFields[0]):mission.field.gridToWorld(mission.config.startGrid);
  const e=mission.addStructure(kind,'rai',{x:p.x+dx,y:p.y+dy},{completed:true,progress:1});
  mission.updateEconomy(0);mission.updateFog();campaign.advance(0);return e.id;
 },{kind,dx,dy});
 const unlocked=kind=>page.evaluate(k=>campaign.mission.constructionUnlocked(k),kind);
 if(stageFourOnly){
  // Start a real saved mission at the factory milestone for focused voice QA.
  await page.evaluate(()=>{
   const m=campaign.mission,p=m.field.gridToWorld(m.config.startGrid);
   for(const [kind,dx,dy] of [['generator',140,100],['factory',-170,120]])m.addStructure(kind,'rai',{x:p.x+dx,y:p.y+dy},{completed:true,progress:1});
   m.addStructure('derrick','rai',m.field.gridToWorld(m.config.oilFields[0]),{completed:true,progress:1});
   m.state.storyConstruction={enabled:true,unlocked:['generator','derrick','factory','lab'],research:false,requiredBunkers:2};
   const d=campaign.radio.director.bind(m);d.includeOpening=false;d.facts.firstVan=true;m.state.statistics.produced=1;
   for(const id of ['p01','p02','p03','p04','r01','r01a','r01b','r02','r03','r04','r05','r06','r08','r09'])d.scenes[id]={status:'done',cursor:0,endedAt:0};
   m.updateEconomy(0);m.updateFog();localStorage.setItem('warGame.alpha.mission01.v1',m.save());
   document.getElementById('resume-save').disabled=false;
  });
  await page.locator('#resume-save').click();await waitCue('m01-s05-l002');await page.locator('#pause').click();
 }else{
 assert.equal(await page.locator('#prologue').count(),0);
 await screenshot('start-desktop');await screenshot('start-narrow',true);await page.setViewportSize({width:1440,height:900});
 await page.locator('#begin').click();
 // Natural playback of the supplied movie, cities and globe is covered by
 // check-opening-television. This suite continues through all spoken exchanges.
 await page.locator('[data-dream="skip"]').click();await waitCue('m01-s02-l003');
 assert.equal(await page.locator('#welcome').isHidden(),true);
 assert.equal(await page.evaluate(()=>!campaign.state.active&&campaign.state.openingPlaying&&!campaign.state.paused),true);
 assert.equal(await page.evaluate(()=>campaign.world.controls.enabled),false);
 // No second button, forced completion, pause or fixture injection through the opening.
 await playScene('p02',{natural:true,check:async i=>{
  if(i===0){await screenshot('opening-commander-desktop');await screenshot('opening-commander-narrow',true);}
 }});
 await playScene('p03',{natural:true});
 await playScene('p04',{natural:true,check:async i=>{
  assert(await page.evaluate(()=>campaign.mission.state.buildings.some(b=>b.kind==='base-sign'&&b.completed)));
  assert.equal(await page.evaluate(()=>campaign.state.active),false);
  if(i===0){await screenshot('sign-finished-desktop');await screenshot('sign-finished-narrow',true);}
 }});
 await waitCue('m01-v3-general-coffee');
 await page.evaluate(()=>{campaign.radio.testHeldCue=campaign.radio.entry.id;campaign.radio.until=Infinity;});
 // The camera finishes its return to the base before handing control over.
 await page.waitForFunction(()=>campaign.state.active&&campaign.world.controls.enabled&&campaign.mission.state.openingScene.handedOver);
 assert.equal(await page.evaluate(()=>campaign.state.paused),false);
 await playScene('r01',{natural:true,check:async i=>{
  if(i===1){await screenshot('original-commander-desktop');await screenshot('original-commander-narrow',true);}
  if(i===2)await page.waitForFunction(()=>!document.querySelector('#field-tasks').hidden);
 }});
 const opening=await page.evaluate(()=>({lines:campaign.radio.testTransmissions,time:campaign.mission.state.time,opening:campaign.mission.state.radioStory.includeOpening}));
 assert.equal(opening.lines.length,12);assert(opening.time>20);assert(opening.opening);
 for(const line of opening.lines)assert(line.finished-line.presented>=(line.duration-.12)*1000,JSON.stringify(line));
 for(let i=1;i<opening.lines.length;i++){
  // Between these scenes the player watches the actual builder finish the wall.
  if(opening.lines[i].id==='m01-s03-l001')continue;
  const previous=opening.lines[i-1];
  const gap=opening.lines[i].presented-Math.max(previous.finished,previous.inspectedUntil??0);
  if(previous.scene===opening.lines[i].scene)assert(gap<700,'Broken exchange: '+JSON.stringify(opening.lines.slice(i-1,i+1)));
  else assert(gap>=1950,'Scenes must have at least two seconds of silence: '+JSON.stringify(opening.lines.slice(i-1,i+1)));
 }
 fs.writeFileSync(folder+'/opening-timeline.json',JSON.stringify(opening,null,2));
 await page.waitForFunction(()=>document.querySelector('#field-objectives').textContent.includes('Построить электростанцию'));
 await screenshot('power-task-narrow',true);await screenshot('power-task-desktop');
 await page.locator('#pause').click();await page.locator('#build-toggle').click();
 await page.waitForFunction(()=>document.querySelectorAll('#build-cards button').length===1);
 assert.equal(await page.locator('#build-cards button').count(),1);
 assert.equal(await unlocked('factory'),false);await screenshot('first-construction-desktop');await page.locator('#build-toggle').click();
 const prematureRaid=await page.evaluate(()=>{
  const m=campaign.mission,p=m.field.gridToWorld(m.config.startGrid),e=m.addUnit('raider','scavs',{x:p.x+20,y:p.y});
  m.updateFog();m.updateMission();const started=!!m.state.flags.raidStarted;
  m.state.units=m.state.units.filter(u=>u.id!==e.id);m.updateFog();return started;
 });
 assert.equal(prematureRaid,false,'Early exploration does not launch the scripted raid before base development');
 await addBuilding('generator',140,100);
 await playScene('r02',{natural:true,check:async()=>{assert.equal(await unlocked('derrick'),true);assert.equal(await unlocked('factory'),false);},snap:'power-complete-desktop'});
 if(await page.evaluate(()=>campaign.radio.director.data.facts.oilKnown))await playScene('r03',{natural:true});
 await page.waitForFunction(()=>document.querySelector('#field-objectives').textContent.includes('нефтяную вышку'));
 await screenshot('oil-task-desktop');await screenshot('oil-task-narrow',true);await page.setViewportSize({width:1440,height:900});
 await addBuilding('derrick',0,0);await playScene('r04',{natural:true});await playScene('r05',{natural:true,check:async()=>assert.equal(await unlocked('factory'),true),snap:'factory-order-desktop'});
 await addBuilding('factory',-170,120);await playScene('r06',{natural:true,check:async i=>{
  if(i===1){await screenshot('constructor-dialogue-desktop');await screenshot('constructor-dialogue-narrow',true);}
 }});
 await playScene('r08',{natural:true,check:async()=>{await screenshot('factory-ready-desktop');await screenshot('factory-ready-narrow',true);}});
 assert.equal(await unlocked('lab'),true);
 await page.evaluate(()=>{const m=campaign.mission;m.state.statistics.produced++;campaign.radio.director.note({type:'unit-produced',kind:'bukhanka'},m);campaign.advance(0);});
 await playScene('r09',{natural:true,snap:'first-van-desktop'});
 }
 await page.evaluate(()=>{const d=campaign.radio.director.data;d.clock+=13000;campaign.advance(0);});
 assert.notEqual(await page.evaluate(()=>campaign.radio.entry?.storyScene),'r10','First van production does not announce an upgrade');
 const stageCue=await page.evaluate(()=>campaign.radio.entry?.id);
 assert.equal(stageCue,'m01-s05-l002','The next order is the NII, while no laboratory exists');
 const stageSave=await page.evaluate(()=>campaign.mission.save());
 await page.evaluate(saved=>{campaign.radio.reset();campaign.mission.load(saved);campaign.advance(0);},stageSave);
 assert.equal(await page.evaluate(()=>campaign.mission.state.radioStory.scenes.r09.status),'done');
 assert.equal(await page.evaluate(()=>campaign.radio.entry?.id),stageCue,'Loading resumes the NII order without replaying completed factory dialogue');
 if(!stageThreeOnly){
 await waitCue('m01-s05-l002');
 assert.equal(await page.evaluate(()=>campaign.mission.state.buildings.some(b=>b.kind==='lab'&&b.hp>0)),false,'The NII construction order starts before a laboratory exists');
 const lab=await addBuilding('lab',40,160);
 const raidDuringSpeech=await page.evaluate(()=>{const m=campaign.mission;m.updateMission();return{started:m.state.flags.raidStarted,scene:campaign.radio.entry.storyScene};});
 assert.deepEqual(raidDuringSpeech,{started:true,scene:'r11'},'The raid starts from the base state while the NII exchange is still running');
 await playScene('r11',{natural:true,check:async i=>{if(i===1){await screenshot('nii-order-desktop');await screenshot('nii-order-narrow',true);}}});
 await playScene('r13',{natural:true,check:async i=>{if(i===2){await screenshot('nii-ready-desktop');await screenshot('nii-ready-narrow',true);}}});
 const science=await page.evaluate(ids=>ids.map(id=>campaign.radio.testTransmissions.findLast(line=>line.id===id)),story.scenes.filter(s=>['r11','r13'].includes(s.id)).flatMap(s=>s.cues));
 for(const line of science)assert(line.finished-line.presented>=(line.duration-.12)*1000,JSON.stringify(line));
 assert(science[4].presented-Math.max(science[3].finished,science[3].inspectedUntil)>=1950,'The NII scenes keep two seconds of silence');
 fs.writeFileSync(folder+'/nii-timeline.json',JSON.stringify(science,null,2));
 assert.equal(await page.evaluate(()=>campaign.mission.researchUnlocked()),true);
 if(!stageFourOnly){
 const result=await page.evaluate(id=>{const m=campaign.mission;m.state.artifactKeys.push('flamethrower');m.state.energy=2400;const result=m.research(id,'flamethrower');m.entity(id).research.progress=.99999;m.updateEconomy(.2);campaign.advance(0);return{ok:result.ok,unlocked:m.state.research.flamethrower};},lab);
 assert.deepEqual(result,{ok:true,unlocked:true});await playScene('r30-alt',{snap:'research-desktop'});
 const ammo=await page.evaluate(id=>{const m=campaign.mission;m.state.artifactKeys.push('mg-ammo-1');m.state.energy=2400;const result=m.research(id,'mg-ammo-1');m.entity(id).research.progress=.99999;m.updateEconomy(.2);campaign.advance(0);return{ok:result.ok,unlocked:m.state.research['mg-ammo-1']};},lab);
 assert.deepEqual(ammo,{ok:true,unlocked:true});await playScene('r33');
 await page.evaluate(()=>{campaign.radio.director.data.clock+=3000;campaign.advance(0);});await playScene('r10',{snap:'original-bukhanka-monologue'});
 const enemy=await page.evaluate(()=>{const m=campaign.mission,p=m.field.gridToWorld(m.config.startGrid),enemy=m.addUnit('raider','scavs',{x:p.x+25,y:p.y-40});m.state.flags.raidStarted=true;m.state.flags.contact=true;m.state.flags.raidIds=[enemy.id];m.updateFog();campaign.advance(0);return enemy.id;});
 await playScene('r14',{snap:'original-first-contact'});
 await waitCue('m01-s07-l006');
 await page.evaluate(id=>{const m=campaign.mission,target=m.state.units.find(e=>e.owner==='rai'&&e.hp>0);m.effects.push({type:'shot',from:id,targetId:target.id,to:{x:target.x,y:target.y,z:m.field.heightAt(target.x,target.y)+1},weapon:'mg'});campaign.advance(0);},enemy);
 assert.equal(await page.evaluate(()=>campaign.radio.director.record('r16').status),'playing');
 await playScene('r16',{natural:true});
 await page.evaluate(id=>{const m=campaign.mission;m.damage(m.entity(id),99999);m.state.flags.raidWon=true;m.effects=[];campaign.radio.director.data.lastCombat=-30000;campaign.advance(0);},enemy);
 await playScene('r18',{check:async()=>assert.equal(await unlocked('bunker'),true)});
 await page.evaluate(()=>{campaign.radio.director.data.clock+=11000;campaign.advance(0);});await playScene('r19');await playScene('r21',{snap:'defense-order-desktop'});
 await addBuilding('bunker',-100,-150);await playScene('r22');await addBuilding('bunker',120,-150);await playScene('r23',{snap:'offensive-desktop'});
 await page.waitForFunction(()=>document.querySelector('#field-objectives').textContent.includes('четыре лагеря'));
 await screenshot('offensive-tasks-desktop');await screenshot('offensive-tasks-narrow',true);
 const saved=await page.evaluate(()=>campaign.mission.save());
 await page.evaluate(saved=>{campaign.radio.reset();campaign.mission.load(saved);campaign.advance(0);},saved);
 assert.equal(await page.evaluate(()=>campaign.mission.state.radioStory.scenes.r23.status),'done');assert.equal(await unlocked('bunker'),true);
 // Original stop recording in a free channel, including the shared 45-second limit.
 const ids=await page.evaluate(()=>campaign.mission.state.units.filter(e=>e.owner==='rai').map(e=>e.id));
 await page.evaluate(ids=>campaign.select(ids),ids);await page.locator('#stop').click();
 await page.waitForFunction(()=>campaign.unitVoice.cueId==='warrant:stop');
 await page.locator('#stop').click();assert.equal(await page.evaluate(()=>campaign.unitVoice.playing),false);
 }
 }
 // Decode every record and render every portrait, including optional later scenes.
 const verification=await page.evaluate(async()=>{
  const {loadMissionStory}=await import('./story-director.js'),script=await loadMissionStory(),context=new AudioContext(),clips=[];
  for(const cue of [...script.dialogue,...script.barks]){const r=await fetch('../assets/campaign/alpha/mission01/'+cue.clip.file),b=await context.decodeAudioData(await r.arrayBuffer());clips.push({id:cue.id,duration:b.duration,expected:cue.clip.duration});}
  await context.close();const {portraitCatalog,setCharacterPortrait}=await import('./character-portraits.js'),catalog=await portraitCatalog(),canvas=document.createElement('canvas'),portraits=[];
  for(const id of Object.keys(catalog.characters))portraits.push([id,await setCharacterPortrait(canvas,id,'radio')]);
  const panel=document.querySelector('#field-tasks'),style=getComputedStyle(panel),box=panel.getBoundingClientRect();
  return{clips,portraits,layout:{left:box.left,right:box.right,width:innerWidth,border:style.borderTopWidth,background:style.backgroundColor}};
 });
 assert.equal(verification.clips.length,story.dialogue.length+story.barks.length+read('factory-service-voice.json').barks.length);
 for(const clip of verification.clips)assert(Math.abs(clip.duration-clip.expected)<.14,JSON.stringify(clip));
 assert(verification.portraits.every(([,ok])=>ok));assert.equal(verification.portraits.length,12);
 assert(verification.layout.left>=0&&verification.layout.right<=verification.layout.width);assert.equal(verification.layout.border,'0px');assert.equal(verification.layout.background,'rgba(0, 0, 0, 0)');
 assert.deepEqual(errors,[]);fs.writeFileSync(folder+'/verification.json',JSON.stringify({...verification,errors},null,2));
 console.log('PASS: '+(stageFourOnly?'stage IV recordings from a factory save and NII progression':stageThreeOnly?'radio v3 prologue and stage III progression':'full base progression and uninterrupted combat dialogue')+', scene gaps, saves, '+verification.clips.length+' decoded clips, desktop and narrow screenshots');
}finally{await browser.close();}
