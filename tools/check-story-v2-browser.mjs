import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base='assets/campaign/alpha/mission01/',story=JSON.parse(fs.readFileSync(base+'story-v2.json'));
const folder='campaign/previews/story-v4';fs.mkdirSync(folder,{recursive:true});
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
 await page.evaluate(()=>{const r=campaign.radio,signal=r.onSignal;r.onSignal=(s,c,keep,urgent,cue)=>signal(s,c,keep?until=>keep(r.testHeldCue===cue?.id?Infinity:until):keep,urgent,cue);});
 const waitCue=async id=>{
  try{await page.waitForFunction(id=>campaign.storyAudio.cueId===id,id,{timeout:15000});}
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
   if(!natural)await page.evaluate(id=>{campaign.radio.testHeldCue=id;campaign.radio.until=Infinity;},cueId);
   if(cue.speaker!=='past')await page.waitForFunction(s=>document.querySelector('.radio-portrait').dataset.speaker===s,cue.speaker);
   assert.equal(await page.evaluate(()=>campaign.unitVoice.playing),false);
   if(check)await check(i);
   if(snap&&i===scene.cues.length-1)await screenshot(snap);
   if(natural)await page.waitForFunction(id=>campaign.radio.entry?.id!==id,cueId);
   else await finishLine();
  }
 };
 const addBuilding=async(kind,dx,dy)=>page.evaluate(({kind,dx,dy})=>{
  const {mission}=campaign,p=kind==='derrick'?mission.field.gridToWorld(mission.config.oilFields[0]):mission.field.gridToWorld(mission.config.startGrid);
  const e=mission.addStructure(kind,'rai',{x:p.x+dx,y:p.y+dy},{completed:true,progress:1});
  mission.updateEconomy(0);mission.updateFog();campaign.advance(0);return e.id;
 },{kind,dx,dy});
 const unlocked=kind=>page.evaluate(k=>campaign.mission.constructionUnlocked(k),kind);
 await page.locator('#prologue').click();await waitCue('m01v2-p01-l001');assert.equal(await page.evaluate(()=>campaign.mission.state.time),0);
 await page.locator('#begin').click();await waitCue('m01v2-o01-l001');
 assert.equal(await page.evaluate(()=>campaign.state.paused),false);assert.equal(await page.locator('#field-tasks').isHidden(),true);
 await playScene('o01',{check:async i=>{if(i===0){await screenshot('coffee-desktop');await screenshot('coffee-narrow',true);}}});
 await page.waitForFunction(()=>document.querySelector('#field-objectives').textContent.includes('Построить электростанцию'));
 await screenshot('power-task-narrow',true);await screenshot('power-task-desktop');
 await page.locator('#pause').click();await page.locator('#build-toggle').click();
 assert.equal(await page.locator('#build-cards button').count(),1);assert.match(await page.locator('#build-cards button').getAttribute('aria-label'),/АЭС/);
 assert.equal(await page.locator('#production-toggle').isHidden(),true);assert.equal(await unlocked('derrick'),false);
 assert.equal(await page.evaluate(()=>campaign.mission.placement('factory',0,0).reason),'Строительство ещё не открыто');
 await screenshot('first-construction-desktop');await page.locator('#build-toggle').click();
 await addBuilding('generator',140,100);
 await playScene('o02',{natural:true,check:async()=>assert.equal(await unlocked('factory'),false),snap:'power-complete-desktop'});
 await playScene('o03',{check:async()=>assert.equal(await unlocked('derrick'),false),snap:'oil-order-desktop'});
 assert.equal(await unlocked('derrick'),true);assert.equal(await unlocked('factory'),false);
 await page.waitForFunction(()=>document.querySelector('#field-objectives').textContent.includes('нефтяную вышку'));
 await screenshot('oil-task-desktop');await screenshot('oil-task-narrow',true);await page.setViewportSize({width:1440,height:900});
 // Unit responses in a free channel are rate limited and yield to the next story line.
 const selected=await page.evaluate(()=>{const ids=campaign.mission.state.units.filter(e=>e.owner==='rai'&&e.kind==='bukhanka').map(e=>e.id);campaign.select(ids);return ids;});
 await page.waitForFunction(()=>campaign.unitVoice.playing);const bark=await page.evaluate(()=>campaign.unitVoice.cueId);
 await page.evaluate(ids=>{for(let n=0;n<15;n++)campaign.select(ids);},selected);assert.equal(await page.evaluate(()=>campaign.unitVoice.cueId),bark);
 await addBuilding('derrick',0,0);await playScene('o04');
 await playScene('o05',{check:async()=>assert.equal(await unlocked('factory'),false),snap:'factory-order-desktop'});
 assert.equal(await unlocked('factory'),true);assert.equal(await unlocked('lab'),false);
 await page.waitForFunction(()=>document.querySelector('#field-objectives').textContent.includes('Построить завод'));
 await screenshot('factory-task-desktop');
 await addBuilding('factory',-170,120);
 await playScene('o06',{check:async()=>assert.equal(await unlocked('lab'),false)});assert.equal(await unlocked('lab'),true);
 const lab=await addBuilding('lab',40,160);
 const beforeResearch=await page.evaluate(id=>{campaign.mission.state.artifactKeys.push('flamethrower');return campaign.mission.research(id,'flamethrower');},lab);
 assert.equal(beforeResearch.ok,false);assert.match(beforeResearch.reason,/не принят/);
 await playScene('o07',{check:async()=>assert.equal(await page.evaluate(()=>campaign.mission.researchUnlocked()),false),snap:'lab-report-desktop'});
 assert.equal(await page.evaluate(()=>campaign.mission.researchUnlocked()),true);
 // Actual economy/research code grants a technology before its result speech finishes.
 const result=await page.evaluate(id=>{const m=campaign.mission;m.state.energy=2400;const result=m.research(id,'flamethrower');m.entity(id).research.progress=.99999;m.updateEconomy(.2);campaign.advance(0);return{ok:result.ok,unlocked:m.state.research.flamethrower};},lab);
 assert.deepEqual(result,{ok:true,unlocked:true});await playScene('16-alt',{snap:'research-desktop'});
 // A visible raid is not falsely described as firing until a hostile shot is observed.
 const enemy=await page.evaluate(()=>{const m=campaign.mission,p=m.field.gridToWorld(m.config.startGrid),enemy=m.addUnit('raider','scavs',{x:p.x+25,y:p.y-40});m.state.flags.raidStarted=true;m.state.flags.raidIds=[enemy.id];m.updateFog();campaign.advance(0);return enemy.id;});
 assert.notEqual(await page.evaluate(()=>campaign.radio.entry?.storyScene),'o08');
 await page.evaluate(id=>{const m=campaign.mission,target=m.state.units.find(e=>e.owner==='rai'&&e.hp>0);m.effects.push({type:'shot',from:id,targetId:target.id,to:{x:target.x,y:target.y,z:m.field.heightAt(target.x,target.y)+1},weapon:'mg'});campaign.advance(0);},enemy);
 await playScene('o08',{snap:'attack-desktop'});
 await page.evaluate(id=>{const m=campaign.mission;m.damage(m.entity(id),99999);m.state.flags.raidWon=true;m.effects=[];campaign.radio.director.data.lastCombat=-30000;campaign.advance(0);},enemy);
 await playScene('o09');await playScene('o10',{check:async()=>assert.equal(await unlocked('bunker'),false),snap:'defense-order-desktop'});
 assert.equal(await unlocked('bunker'),true);
 await addBuilding('bunker',-100,-150);await playScene('o11');assert.notEqual(await page.evaluate(()=>campaign.radio.entry?.storyScene),'o12');
 await addBuilding('bunker',120,-150);await playScene('o12',{snap:'offensive-desktop'});
 await page.waitForFunction(()=>document.querySelector('#field-objectives').textContent.includes('четыре лагеря'));
 await screenshot('offensive-tasks-desktop');await screenshot('offensive-tasks-narrow',true);
 const saved=await page.evaluate(()=>campaign.mission.save());
 await page.evaluate(saved=>{campaign.radio.reset();campaign.mission.load(saved);campaign.advance(0);},saved);
 assert.equal(await page.evaluate(()=>campaign.mission.state.radioStory.scenes.o12.status),'done');assert.equal(await unlocked('bunker'),true);
 // Decode every record and render every portrait, including optional later scenes.
 const verification=await page.evaluate(async()=>{
  const {loadMissionStory}=await import('./story-director.js'),script=await loadMissionStory(),context=new AudioContext(),clips=[];
  for(const cue of [...script.dialogue,...script.barks]){const r=await fetch('../assets/campaign/alpha/mission01/'+cue.clip.file),b=await context.decodeAudioData(await r.arrayBuffer());clips.push({id:cue.id,duration:b.duration,expected:cue.clip.duration});}
  await context.close();const {portraitCatalog,setCharacterPortrait}=await import('./character-portraits.js'),catalog=await portraitCatalog(),canvas=document.createElement('canvas'),portraits=[];
  for(const id of Object.keys(catalog.characters))portraits.push([id,await setCharacterPortrait(canvas,id,'radio')]);
  const panel=document.querySelector('#field-tasks'),style=getComputedStyle(panel),box=panel.getBoundingClientRect();
  return{clips,portraits,layout:{left:box.left,right:box.right,width:innerWidth,border:style.borderTopWidth,background:style.backgroundColor}};
 });
 assert.equal(verification.clips.length,story.dialogue.length+story.barks.length);
 for(const clip of verification.clips)assert(Math.abs(clip.duration-clip.expected)<.14,JSON.stringify(clip));
 assert(verification.portraits.every(([,ok])=>ok));assert.equal(verification.portraits.length,12);
 assert(verification.layout.left>=0&&verification.layout.right<=verification.layout.width);assert.equal(verification.layout.border,'0px');assert.equal(verification.layout.background,'rgba(0, 0, 0, 0)');
 assert.deepEqual(errors,[]);fs.writeFileSync(folder+'/verification.json',JSON.stringify({...verification,errors},null,2));
 console.log('PASS: all 12 opening scenes, exact subtitles/audio, progressive construction, research gate and rewards, raid, two bunkers, offensive quest, saves, portraits and desktop/narrow layouts');
}finally{await browser.close();}
