import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {applyStoryEdits} from '../campaign/story-edits.js';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const edits=JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/reviewed-dialogue.json','utf8'));
const read=file=>JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/'+file,'utf8'));
const {story,audio}=applyStoryEdits(read('story-v2.json'),read('audio-v2.json'),edits);
const campOnly=process.argv.includes('--camp-approach');
const stageSeven=process.argv.includes('--stage-seven');
const stageEight=process.argv.includes('--stage-eight');
const towerApproach=process.argv.includes('--tower-approach');
const alternateApproach=process.argv.includes('--alternate-approach');
const standalone=process.argv.includes('--standalone-report');
const battleReview=campOnly||stageSeven||stageEight||towerApproach||alternateApproach||standalone;
const sceneIds=towerApproach?['r36']:stageEight?['r31','r32','r33','r35']:standalone?['r30-alt']:alternateApproach?['r24a']:stageSeven?['r24','r25','r26','r27','r29']:campOnly?['r24']:['p02','p04','r21','r22','r23'];
const scenes=sceneIds.map(id=>story.scenes.find(scene=>scene.id===id));
const folder='campaign/previews/'+(towerApproach?'stage-ix':stageEight?'stage-viii':standalone?'stage-vii-standalone':alternateApproach?'stage-vii-alternate':stageSeven?'stage-vii':campOnly?'camp-approach-voice':'stage-vi');fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.stack??e.message));
 page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8766/review/stage-vi-voice')+'/campaign/');
 try{await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});}
 catch(error){throw new Error(JSON.stringify({errors,loading:await page.locator('#loading-status').textContent(),body:await page.locator('body').innerText()}),{cause:error});}
 await page.waitForFunction(()=>!document.getElementById('begin').disabled||!document.getElementById('loading-sound').disabled);
 if(await page.locator('#begin').isDisabled())await page.locator('#loading-sound').click();
 await page.waitForFunction(()=>!document.getElementById('begin').disabled);
 console.log('Game ready');
 await page.evaluate(ids=>{
  const {mission:m,radio:r}=campaign,p=m.field.gridToWorld(m.config.startGrid);
  const battleReview=!ids.includes('p02');
  for(const [kind,dx,dy] of [['generator',140,100],['factory',-170,120],['lab',40,160]])m.addStructure(kind,'rai',{x:p.x+dx,y:p.y+dy},{completed:true,progress:1});
  m.addStructure('derrick','rai',m.field.gridToWorld(m.config.oilFields[0]),{completed:true,progress:1});
  const sign=m.addStructure('base-sign','rai',m.field.gridToWorld(m.config.openingSignGrid),{completed:true,progress:1});
  const builder=m.state.units.find(u=>u.owner==='rai'&&u.kind==='builder');
  m.state.openingScene={signId:sign.id,builderId:builder.id,builderStarted:true,handedOver:battleReview};
  m.state.storyConstruction={enabled:true,unlocked:['generator','derrick','factory','lab','bunker'],research:true,requiredBunkers:2};
  const d=r.director.bind(m);d.includeOpening=!battleReview;d.scriptRevision=5;d.facts.firstVan=true;d.facts.firstWin=true;m.state.statistics.produced=1;
  if(ids.includes('r24')||ids.includes('r24a'))d.facts.camps={[m.state.camps.find(c=>c.artifact==='flamethrower').id]:true};
  if(ids.includes('r31'))d.facts.camps={[m.state.camps.find(c=>c.artifact==='mg-ammo-1').id]:true};
  if(ids.includes('r36')){
   const tower=m.state.buildings.find(b=>b.kind==='mg-tower'&&b.campId===m.state.camps[2].id&&b.hp>0);
   if(!tower)throw new Error('Live tower missing');d.facts.tower=tower.id;
  }
  m.state.flags.raidStarted=true;m.state.flags.raidWon=true;m.state.flags.raidIds=[];
  for(const id of r.director.scenes.keys())if(!ids.includes(id))d.scenes[id]={status:'done',cursor:0,endedAt:0};
  if(ids.includes('r29'))delete d.scenes['r30-alt'];
  if(ids.includes('r30-alt')){
   delete d.scenes.r29;d.scenes.r27={status:'skipped',cursor:0,endedAt:0};
   m.state.artifactKeys.push('flamethrower');m.state.research.flamethrower=true;
  }
  if(ids.includes('r24a')){
   const other=m.state.camps.find(c=>c.artifact==='mg-ammo-1');other.cleared=true;
   d.scenes.r24={status:'skipped',cursor:0,endedAt:0};
  }
  m.updateEconomy(0);m.updateFog();
  localStorage.setItem('warGame.alpha.mission01.v1',m.save());document.getElementById('resume-save').disabled=false;
  const signal=r.onSignal;r.voiceReview=[];
  r.onSignal=(position,chapter,keep,urgent,cue)=>{
   const line=cue&&{id:cue.id,scene:cue.storyScene,file:cue.clip?.file,duration:cue.clip?.duration,presented:performance.now()};
   if(line)r.voiceReview.push(line);
   return signal(position,chapter,keep?until=>{
    if(line&&Number.isFinite(until)){line.finished=performance.now();line.releaseAt=until;}
    keep(line?Infinity:until);
   }:keep,urgent,cue);
  };
 },sceneIds);
 await page.locator('#resume-save').click();
 await page.waitForFunction(()=>!!(campaign.state.openingPlaying||campaign.state.active)&&document.getElementById('welcome').hidden,null,{timeout:60000});
 if(battleReview)await page.locator('#pause').click();
 const screenshot=async name=>{
  for(const [suffix,width,height] of [['desktop',1440,900],['mobile-landscape',844,390],['mobile-landscape-small',667,375]]){
   await page.setViewportSize({width,height});
   await page.screenshot({path:folder+'/'+name+'-'+suffix+'.png'});
   assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'No horizontal overflow');
  }
  await page.setViewportSize({width:1440,height:900});
 };
 const bunker=async x=>page.evaluate(x=>{
  const m=campaign.mission,p=m.field.gridToWorld(m.config.startGrid);
  m.addStructure('bunker','rai',{x:p.x+x,y:p.y-160},{completed:true,progress:1});
  m.updateEconomy(0);m.updateFog();campaign.advance(0);
 },x);
 for(const scene of scenes){
  console.log('Scene',scene.id);
  for(let i=0;i<scene.cues.length;i++){
   const id=scene.cues[i],cue=story.dialogue.find(line=>line.id===id);
   try{await page.waitForFunction(id=>campaign.storyAudio.cueId===id||campaign.radio.entry?.id===id&&campaign.radio.voiceReview.findLast(line=>line.id===id)?.finished,id,{timeout:scene.id==='r35'?45000:30000});}
   catch(error){throw new Error(JSON.stringify({expected:id,...await page.evaluate(()=>({audio:campaign.storyAudio,entry:campaign.radio.entry?.id,state:campaign.state,story:campaign.mission.state.radioStory}))}),{cause:error});}
   assert.equal(await page.locator('#radio p').textContent(),cue.text);
   await page.waitForFunction(s=>document.querySelector('.radio-portrait').dataset.speaker===s,cue.speaker);
   assert.equal(await page.evaluate(()=>campaign.unitVoice.playing),false);
   if(id==='m01-s02-l008'||scene.id==='p04'&&i===1||['r21','r23'].includes(scene.id)&&i===scene.cues.length-1||campOnly&&i===0||battleReview&&!campOnly&&i===scene.cues.length-1)await screenshot(scene.id);
   if(standalone&&i===0)await screenshot(scene.id+'-opening');
   if(scene.id==='r22'&&i===0){
    const before=await page.evaluate(()=>campaign.radio.entry.token);
    await page.evaluate(()=>{
     const m=campaign.mission;m.effects.push({type:'shot',from:'voice-review-attacker',to:{x:0,y:0,z:0},weapon:'mg'});
     campaign.radio.consume(m,performance.now());m.effects=[];
    });
    assert.equal(await page.evaluate(()=>campaign.radio.entry.token),before,'Combat cannot restart a spoken exchange');
   }
   await page.waitForFunction(id=>campaign.radio.voiceReview.findLast(line=>line.id===id)?.finished,id,{timeout:30000});
   await page.evaluate(id=>{const r=campaign.radio,line=r.voiceReview.findLast(line=>line.id===id);line.released=performance.now();r.until=line.releaseAt;},id);
   await page.waitForFunction(id=>campaign.radio.entry?.id!==id,id);
  }
  if(scene.id==='p04'){
   await page.waitForFunction(()=>campaign.state.active&&campaign.world.controls.enabled&&campaign.mission.state.openingScene.handedOver);
   await page.locator('#pause').click();
  }
  if(scene.id==='r21')await bunker(-110);
  if(scene.id==='r22'){
   const saved=await page.evaluate(()=>campaign.mission.save());
   await page.evaluate(saved=>{campaign.radio.reset();campaign.mission.load(saved);campaign.radio.consume(campaign.mission,performance.now());},saved);
   assert.equal(await page.evaluate(()=>campaign.mission.state.radioStory.scenes.r22.status),'done');
   await bunker(110);
  }
  if(stageSeven&&scene.id==='r24')await page.evaluate(()=>{
   const m=campaign.mission,camp=m.state.camps.find(c=>c.artifact==='flamethrower');
   for(const e of [...m.state.units,...m.state.buildings])if(e.campId===camp.id&&e.owner==='scavs')e.hp=0;
   m.updateMission();if(!camp.cleared)throw new Error('Camp not cleared');
   // The aftermath creates the artifact. Mark its location as explored in the fixture.
   const artifact=m.state.artifacts.find(a=>a.key==='flamethrower');
   if(!artifact)throw new Error('Artifact did not spawn');
   const [x,y]=m.field.worldToGrid(artifact.x,artifact.y);m.visible[Math.round(y)*128+Math.round(x)]=255;
   campaign.radio.consume(m,performance.now());
  });
  if(stageSeven&&scene.id==='r26'){
   const saved=await page.evaluate(()=>campaign.mission.save());
   await page.evaluate(saved=>{
    campaign.radio.reset();const m=campaign.mission;m.load(saved);
    const artifact=m.state.artifacts.find(a=>a.key==='flamethrower');
    const unit=m.state.units.find(u=>u.owner==='rai'&&u.kind==='builder'&&u.hp>0);
    unit.x=artifact.x;unit.y=artifact.y;unit.path=[];unit.task=null;
    m.updateMission();if(!m.state.artifactKeys.includes('flamethrower'))throw new Error('Artifact not collected');
    campaign.radio.consume(m,performance.now());
   },saved);
   assert.equal(await page.evaluate(()=>campaign.radio.director.record('r26').status),'done');
  }
  if(stageSeven&&scene.id==='r27'){
   const research=await page.evaluate(()=>{
    const m=campaign.mission,lab=m.state.buildings.find(b=>b.kind==='lab'&&b.owner==='rai'&&b.completed);
    m.state.energy=2400;const result=m.research(lab.id,'flamethrower');
    if(result.ok){
     lab.research.progress=.99999;
     m.updateEconomy(lab.research.cost/(m.config.oilTransferPerSecond??25)+.2);
     campaign.advance(0);
    }
    return {ok:result.ok,reason:result.reason,unlocked:m.state.research.flamethrower};
   });
   assert(research.ok&&research.unlocked,JSON.stringify(research));
  }
  if(stageEight&&scene.id==='r31')await page.evaluate(()=>{
   const m=campaign.mission,camp=m.state.camps.find(c=>c.artifact==='mg-ammo-1');
   for(const e of [...m.state.units,...m.state.buildings])if(e.campId===camp.id&&e.owner==='scavs')e.hp=0;
   m.updateMission();if(!camp.cleared)throw new Error('Ammunition camp not cleared');
   if(!m.state.artifacts.some(a=>a.key==='mg-ammo-1'))throw new Error('Ammunition artifact did not spawn');
   campaign.radio.consume(m,performance.now());
  });
  if(stageEight&&scene.id==='r32'){
   const saved=await page.evaluate(()=>campaign.mission.save());
   const research=await page.evaluate(saved=>{
    campaign.radio.reset();const m=campaign.mission;m.load(saved);
    const artifact=m.state.artifacts.find(a=>a.key==='mg-ammo-1');
    const unit=m.state.units.find(u=>u.owner==='rai'&&u.kind==='builder'&&u.hp>0);
    unit.x=artifact.x;unit.y=artifact.y;unit.path=[];unit.task=null;m.updateMission();
    if(!m.state.artifactKeys.includes('mg-ammo-1'))throw new Error('Ammunition artifact not collected');
    const lab=m.state.buildings.find(b=>b.kind==='lab'&&b.owner==='rai'&&b.completed);
    m.state.energy=2400;const result=m.research(lab.id,'mg-ammo-1');
    if(result.ok){lab.research.progress=.99999;m.updateEconomy(lab.research.cost/(m.config.oilTransferPerSecond??25)+.2);campaign.advance(0);}
    return {ok:result.ok,reason:result.reason,unlocked:m.state.research['mg-ammo-1']};
   },saved);
   assert(research.ok&&research.unlocked,JSON.stringify(research));
   assert.equal(await page.evaluate(()=>campaign.radio.director.record('r32').status),'done');
  }
  if(stageEight&&scene.id==='r33')await page.evaluate(()=>{
   const m=campaign.mission,camp=m.state.camps.find(c=>c.artifact==='mg-tower');
   const target=m.state.buildings.find(b=>b.campId===camp.id&&b.owner==='scavs'&&b.hp>0&&['mg-tower','bunker','camp-core'].includes(b.kind));
   if(!target)throw new Error('Next camp fortification missing');
   const [x,y]=m.field.worldToGrid(target.x,target.y);m.visible[Math.round(y)*128+Math.round(x)]=255;
   const unit=m.state.units.find(u=>u.owner==='rai'&&u.kind!=='builder'&&u.hp>0);
   unit.x=target.x-150;unit.y=target.y;unit.path=[{x:target.x,y:target.y}];unit.speed=10;
   campaign.radio.consume(m,performance.now());
  });
 }
 const timeline=await page.evaluate(()=>campaign.radio.voiceReview);
 assert.deepEqual(timeline.map(line=>line.id),scenes.flatMap(scene=>scene.cues),'Updated exchanges play once, in order; disabled sign reply stays absent');
 for(const line of timeline){
  assert.equal(line.file,audio.clips[line.id].file);
  assert(line.finished-line.presented>=(line.duration-.15)*1000,JSON.stringify(line));
 }
 for(let i=1;i<timeline.length;i++)if(timeline[i].scene!==timeline[i-1].scene){
  const previous=timeline[i-1],gap=timeline[i].presented-Math.max(previous.finished,previous.released);
  assert(gap>=1950,JSON.stringify({from:previous.scene,to:timeline[i].scene,gap}));
 }
 assert.deepEqual(errors,[]);
 fs.writeFileSync(folder+'/verification.json',JSON.stringify({pass:true,draftRevision:edits.draftRevision,timeline,errors},null,2));
 console.log(battleReview?'PASS: '+sceneIds.join(' → ')+'; '+timeline.length+' full recordings, correct files/subtitles/portraits, desktop/mobile landscape and scene gaps':'PASS: updated warrant line, two-line sign handoff, eight stage VI recordings, two real bunker milestones, audio completion, save/resume, no combat interruption, scene gaps and desktop/mobile landscape screenshots');
}finally{await browser.close();}
