import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const folder='campaign/previews/story-v2';fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],pending=new Set();
 page.on('request',r=>pending.add(r.url()));page.on('requestfinished',r=>pending.delete(r.url()));page.on('requestfailed',r=>pending.delete(r.url()));
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8884')+'/campaign/');
 try{await page.waitForFunction(()=>window.campaign?.ready||document.querySelector('#loading-status').textContent.startsWith('Ошибка'),null,{timeout:90000});}
 catch(error){throw new Error(JSON.stringify({status:await page.locator('#loading-status').textContent(),errors,pending:[...pending]}),{cause:error});}
 assert(await page.evaluate(()=>!!window.campaign?.ready),await page.locator('#loading-status').textContent());
 const initial=await page.evaluate(()=>campaign.mission.save());
 await page.locator('#prologue').click();
 await page.waitForFunction(()=>campaign.storyAudio.cueId==='m01v2-p01-l001');
 assert.equal(await page.evaluate(()=>campaign.mission.state.time),0);
 await page.locator('#begin').click();
 await page.waitForFunction(()=>campaign.storyAudio.cueId==='m01v2-01-l001'&&document.querySelector('.radio-portrait').dataset.speaker==='general');
 assert.equal(await page.evaluate(()=>campaign.state.paused),false);
 assert.equal(await page.locator('#radio p').textContent(),'А кофе почему нет?');
 assert.equal(await page.locator('#field-tasks').isHidden(),true,'No assignment before the order');
 assert.equal(await page.evaluate(()=>campaign.radio.director.mode),'mission');
 await page.screenshot({path:folder+'/coffee-desktop.png'});
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:folder+'/coffee-narrow.png'});
 await page.waitForFunction(()=>campaign.storyAudio.cueId==='m01v2-01-l002');
 assert.equal(await page.locator('#radio p').textContent(),'Потому что электричества нет.');
 assert.equal(await page.evaluate(()=>campaign.unitVoice.playing),false);
 await page.waitForFunction(()=>campaign.storyAudio.cueId==='m01v2-01-l003');
 await page.screenshot({path:folder+'/order-narrow.png'});
 await page.waitForFunction(()=>campaign.mission.state.radioStory.scenes['01'].status==='done');
 await page.waitForFunction(()=>document.querySelector('#field-objectives').textContent.includes('Построить электростанцию'));
 await page.screenshot({path:folder+'/tasks-narrow.png'});
 await page.setViewportSize({width:1440,height:900});
 await page.screenshot({path:folder+'/tasks-desktop.png'});
 await page.locator('#pause').click();
 // Only the power station is initially buildable. The factory is gated by all four lines.
 await page.locator('#build-toggle').click();
 assert.equal(await page.locator('#build-cards button').count(),1);
 assert.match(await page.locator('#build-cards button').getAttribute('aria-label'),/АЭС/);
 assert.equal(await page.locator('#production-toggle').isHidden(),true);
 assert.equal(await page.evaluate(()=>campaign.mission.placement('factory',0,0).reason),'Строительство ещё не открыто');
 await page.screenshot({path:folder+'/first-construction-desktop.png'});
 await page.evaluate(()=>{
  const {mission}=campaign,point=mission.field.gridToWorld(mission.config.startGrid);
  mission.addStructure('generator','rai',{x:point.x+140,y:point.y+100},{completed:true,progress:1});campaign.advance(0);
 });
 const factoryExchange=['Электростанция готова?','Так точно!','А почему завод без электричества?','Так мы его ещё не построили, товарищ командир.'];
 for(let i=0;i<4;i++){
  await page.waitForFunction(id=>campaign.storyAudio.cueId===id,'m01v2-03-l00'+(i+1));
  assert.equal(await page.locator('#radio p').textContent(),factoryExchange[i]);
  assert.equal(await page.evaluate(()=>campaign.mission.constructionUnlocked('factory')),false);
  if(i===3)await page.screenshot({path:folder+'/factory-dialogue-desktop.png'});
 }
 await page.waitForFunction(()=>campaign.mission.constructionUnlocked('factory')&&document.querySelector('#field-objectives').textContent.includes('Построить завод'));
 assert.equal(await page.locator('#build-cards button').count(),2);
 assert.equal(await page.evaluate(()=>campaign.mission.constructionUnlocked('derrick')),false);
 await page.screenshot({path:folder+'/factory-quest-desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:folder+'/factory-quest-narrow.png'});
 await page.setViewportSize({width:1440,height:900});await page.locator('#build-toggle').click();
 const loaded=await page.evaluate(async()=>{
  const {loadMissionStory}=await import('./story-director.js');const story=await loadMissionStory(),context=new AudioContext();
  const result=[];
  for(const cue of [...story.dialogue,...story.barks]){
   const response=await fetch('../assets/campaign/alpha/mission01/'+cue.clip.file);
   const buffer=await context.decodeAudioData(await response.arrayBuffer());
   result.push({id:cue.id,duration:buffer.duration,expected:cue.clip.duration});
  }
  await context.close();return result;
 });
 assert.equal(loaded.length,127);for(const clip of loaded)assert(Math.abs(clip.duration-clip.expected)<.14,JSON.stringify(clip));
 // Selecting and ordering repeatedly cannot overlap or queue a backlog of unit voices.
 const bark=await page.evaluate(()=>{
  const ids=campaign.mission.state.units.filter(e=>e.owner==='rai'&&e.kind==='bukhanka').map(e=>e.id);
  campaign.select(ids);return ids;
 });
 await page.waitForFunction(()=>campaign.unitVoice.playing);
 const voice=await page.evaluate(()=>campaign.unitVoice.cueId);
 await page.evaluate(ids=>{for(let n=0;n<15;n++)campaign.select(ids);},bark);
 assert.equal(await page.evaluate(()=>campaign.unitVoice.cueId),voice);
 // Real research completion grants the technology immediately and cancels stale discovery speech.
 await page.evaluate(()=>{
  const {mission,radio}=campaign,point=mission.field.gridToWorld(mission.config.startGrid);
  const lab=mission.addStructure('lab','rai',{x:point.x+70,y:point.y+150},{completed:true,progress:1});
  mission.state.artifactKeys.push('flamethrower');campaign.advance(0);
  window.storyTestLab=lab.id;
 });
 await page.waitForFunction(()=>campaign.storyAudio.cueId==='m01v2-14-l001');
 assert.equal(await page.evaluate(()=>campaign.unitVoice.playing),false,'Main dialogue preempts a bark');
 const researched=await page.evaluate(()=>{
  const {mission}=campaign;mission.state.energy=10000;
  const point=mission.field.gridToWorld(mission.config.startGrid);
  if(!mission.state.buildings.some(e=>e.kind==='generator'))mission.addStructure('generator','rai',{x:point.x+140,y:point.y+100},{completed:true,progress:1});
  mission.addStructure('derrick','rai',mission.field.gridToWorld(mission.config.oilFields[0]),{completed:true,progress:1});
  const result=mission.research(window.storyTestLab,'flamethrower');
  mission.entity(window.storyTestLab).research.progress=.9999;
  campaign.advance(.5);
  return {ok:result.ok,unlocked:mission.state.research.flamethrower};
 });
 assert.deepEqual(researched,{ok:true,unlocked:true});
 await page.waitForFunction(()=>campaign.storyAudio.cueId==='m01v2-16-alt-l001'&&document.querySelector('.radio-portrait').dataset.speaker==='scientist');
 await page.waitForFunction(()=>document.querySelector('#field-tasks').getBoundingClientRect().top>=document.querySelector('#radio').getBoundingClientRect().bottom+8);
 await page.screenshot({path:folder+'/research-desktop.png'});
 // Save/load retains the current line and completed scenes.
 const saved=await page.evaluate(()=>campaign.mission.save());
 await page.evaluate(saved=>{campaign.radio.reset();campaign.mission.load(saved);campaign.advance(0);},saved);
 await page.waitForFunction(()=>campaign.storyAudio.cueId==='m01v2-16-alt-l001');
 assert.equal(await page.evaluate(()=>campaign.mission.state.radioStory.scenes['01'].status),'done');
 // A close enemy interrupts inside one frame; a destroyed chief cannot finish his threat.
 await page.evaluate(initial=>{
  campaign.radio.reset();campaign.mission.load(initial);
  const {mission,radio}=campaign;radio.director.bind(mission);radio.director.data.scenes['01']={status:'done',endedAt:0,cursor:0};
  const point=mission.field.gridToWorld(mission.config.startGrid);
  mission.addStructure('generator','rai',{x:point.x+100,y:point.y+100},{completed:false});
  radio.director.data.scenes['04']={status:'done',endedAt:0,cursor:0};
  radio.director.data.clock=20000;campaign.advance(0);radio.until=0;campaign.advance(0);
  const enemy=mission.addUnit('raider','scavs',{x:point.x+25,y:point.y-45});
  window.storyTestEnemy=enemy.id;mission.updateFog();campaign.advance(0);
 },initial);
 await page.waitForFunction(()=>campaign.storyAudio.chapter==='first-contact'&&campaign.storyAudio.urgent);
 assert.equal(await page.evaluate(()=>campaign.radio.director.record('02').cursor),0);
 await page.screenshot({path:folder+'/contact-desktop.png'});
 // All supplied and temporary portraits decode and render, without adding UI borders.
 const portraits=await page.evaluate(async()=>{
  const {portraitCatalog,setCharacterPortrait}=await import('./character-portraits.js');const catalog=await portraitCatalog(),canvas=document.createElement('canvas'),result=[];
  for(const id of Object.keys(catalog.characters))result.push([id,await setCharacterPortrait(canvas,id,'radio')]);
  return result;
 });
 assert(portraits.every(([,ok])=>ok));assert.equal(portraits.length,12);
 const layout=await page.evaluate(()=>{
  const panel=document.querySelector('#radio'),p=panel.getBoundingClientRect(),css=getComputedStyle(panel);
  return {left:p.left,right:p.right,width:innerWidth,border:css.borderTopWidth,background:css.backgroundColor};
 });
 assert(layout.left>=0&&layout.right<=layout.width);assert.equal(layout.border,'0px');assert.equal(layout.background,'rgba(0, 0, 0, 0)');
 await page.evaluate(()=>{
  const d=campaign.radio.director;d.data.journal=[{id:'outcasts',title:'Отбросы',text:'Местные вооружённые формирования.'}];campaign.advance(0);
 });
 await page.locator('.settings summary').click();await page.locator('[aria-controls="operation-journal"]').click();
 assert.match(await page.locator('#journal-entries').textContent(),/Отбросы/);
 assert.deepEqual(errors,[]);
 fs.writeFileSync(folder+'/verification.json',JSON.stringify({audio:loaded,portraits,layout,errors},null,2));
 console.log('PASS: prologue, coffee, 4-line factory exchange, construction gates, narrow/desktop screenshots, 127 decoded clips, research, saves, interruption, voice arbitration, 12 portraits and journal');
}finally{await browser.close();}
