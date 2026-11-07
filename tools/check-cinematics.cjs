const {chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),crypto=require('node:crypto');
(async()=>{
 const story=JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/story.json','utf8')),audio=JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/audio.json','utf8')),{buildTimeline}=await import('../campaign/cinematics.js');
 const source=fs.readFileSync(story.source.path,'utf8'),hash=crypto.createHash('sha256').update(fs.readFileSync(story.source.path)).digest('hex');if(hash!==story.source.sha256||hash!==audio.source.sha256)throw new Error('Story/audio source mismatch');
 const sourceLines=source.split(/\r?\n/),spoken=sourceLines.filter(line=>line.startsWith('— ')),extracted=[...story.dialogue,...story.barks].filter(c=>sourceLines[c.sourceLine-1].startsWith('— '));if(extracted.length!==spoken.length||new Set(extracted.map(c=>c.sourceLine)).size!==spoken.length||extracted.some(c=>c.text!==sourceLines[c.sourceLine-1].slice(2)))throw new Error('Spoken screenplay lines missing or altered');
 for(const cue of story.barks.filter(c=>c.sourceText)){const row=sourceLines[cue.sourceLine-1].split('|').map(x=>x.trim());if(row[2]!==cue.sourceText||cue.text!==cue.sourceText.replace(/[«»]/g,''))throw new Error('Gameplay bark differs from screenplay table: '+cue.id);}
 for(const cue of [...story.dialogue,...story.barks]){const clip=audio.clips[cue.id];if(!clip||!(clip.duration>.15))throw new Error('Recording missing '+cue.id);const data=fs.readFileSync('assets/campaign/alpha/mission01/'+clip.file);if(crypto.createHash('sha256').update(data).digest('hex')!==clip.sha256)throw new Error('Recording changed '+cue.id);}
 const all=buildTimeline(story,audio,story.scenes.map(s=>s.id));if(all.segments.length!==14||all.duration<450)throw new Error('Incomplete full screenplay timeline');
 const art=JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/stills/manifest.json','utf8'));
 if(art.assets.length!==14||new Set(art.assets.map(item=>item.scene)).size!==14)throw new Error('Incomplete illustration set');
 for(const item of art.assets){const data=fs.readFileSync('assets/campaign/alpha/mission01/'+item.file);if(crypto.createHash('sha256').update(data).digest('hex')!==item.sha256)throw new Error('Illustration changed '+item.scene);}
 const gameplay=Object.entries(story.gameplayCinematics).flatMap(([chapter,entries])=>buildTimeline(story,audio,entries).segments.flatMap(segment=>segment.lines.map(cue=>({chapter,id:cue.id,phase:cue.phase}))));
 if(gameplay.length!==story.dialogue.length||new Set(gameplay.map(cue=>cue.id)).size!==story.dialogue.length)throw new Error('Gameplay cinematics lose or duplicate dialogue');
 for(const cue of gameplay)if((cue.phase==='research-complete')!==cue.chapter.startsWith('research-'))throw new Error('Research dialogue plays at wrong event: '+cue.id);
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{
  const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().startsWith('Failed to load resource'))errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
  await page.goto('http://127.0.0.1:8766/campaign/cinematics.html?scene=2');await page.waitForFunction(()=>window.cinematicPreview?.ready.includes('m01-s02'));await page.locator('#start').click();await page.waitForFunction(()=>window.cinematicPreview.player.source?.buffer.duration>0&&window.cinematicPreview.player.playing,{},{timeout:30000});
  const playing=await page.evaluate(()=>({...window.cinematicPreview.player.state(),audioState:window.cinematicPreview.player.audioContext.state}));if(playing.audioState!=='running')throw new Error('Audio is not running');
  await page.locator('#play').click();const pauseA=await page.evaluate(()=>window.cinematicPreview.player.clock());await page.waitForTimeout(600);const pauseB=await page.evaluate(()=>window.cinematicPreview.player.clock());if(Math.abs(pauseA-pauseB)>.01)throw new Error('Pause drifts');
  await page.evaluate(async()=>{const p=window.cinematicPreview.player;await p.seek(p.timeline.segments[0].lines[1].start+.1);});await page.locator('#play').click();await page.waitForFunction(()=>window.cinematicPreview.player.activeCue==='m01-s02-l002');
  fs.mkdirSync('campaign/previews',{recursive:true});await page.screenshot({path:'campaign/previews/barracks-dialogue.png'});await page.locator('#motion').click();if(await page.evaluate(()=>window.cinematicPreview.player.motion))throw new Error('Reduced motion toggle failed');
  await page.locator('#skip').click();if(!await page.evaluate(()=>window.cinematicPreview.player.finished&&!window.cinematicPreview.player.playing))throw new Error('Skip does not finish');await page.setViewportSize({width:390,height:844});await page.screenshot({path:'campaign/previews/cinematics-mobile.png'});
  const asyncSafety=await page.evaluate(async()=>{
   const p=window.cinematicPreview.player;p.finished=false;let finishes=0;p.onFinish=()=>finishes++;p.skip();p.skip();
   await p.load([window.cinematicPreview.story.scenes[1].id]);
   const preload=p.preload.bind(p);let release,entered;const enteredPromise=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);p.preload=async segment=>{entered();await gate;return preload(segment);};
   const play=p.play();await enteredPromise;p.pause();release();await play;p.preload=preload;
   return{finishes,pausedAfterPendingPlay:!p.playing,loadingCleared:!p.loading};
  });if(asyncSafety.finishes!==1||!asyncSafety.pausedAfterPendingPlay||!asyncSafety.loadingCleared)throw new Error('Unsafe asynchronous playback: '+JSON.stringify(asyncSafety));
  await page.setViewportSize({width:1440,height:1100});await page.selectOption('#chapter','all');await page.locator('#start').click();
  const sceneChecks=[];
  for(let index=0;index<14;index++){
   await page.evaluate(async index=>{const p=window.cinematicPreview.player;p.pause();await p.seek(p.timeline.segments[index].lines[0].start+.1);p.motion=true;p.draw(p.clock());await p.play();},index);
   await page.waitForFunction(index=>{const p=window.cinematicPreview.player;return p.activeCue===p.timeline.segments[index].lines[0].id&&p.source?.buffer.duration>0;},index);
   sceneChecks.push(await page.evaluate(()=>{const p=window.cinematicPreview.player,segment=p.segmentAt(p.clock());p.pause();p.draw(p.clock());return{scene:segment.scene.id,image:!!segment.image?.naturalWidth,voice:!!p.buffers.get(segment.lines[0].clip.file),seconds:segment.end-segment.start};}));
   await page.locator('#film').screenshot({path:`campaign/previews/cinematic-${String(index+1).padStart(2,'0')}.png`});
  }
  for(const index of [4,13]){await page.evaluate(async index=>{const p=window.cinematicPreview.player;p.pause();const s=p.timeline.segments[index];if(!s.card)throw new Error('Missing scripted title card');await p.seek(s.cardStart+1);p.draw(p.clock());},index);await page.locator('#film').screenshot({path:`campaign/previews/title-card-${index+1}.png`});}
  if(sceneChecks.some(scene=>!scene.image||!scene.voice))throw new Error('Missing playable scene');
  await page.goto('http://127.0.0.1:8766/campaign/cinematics.html');await page.waitForFunction(()=>window.cinematicPreview?.ready.length===14);
  await page.evaluate(async()=>{const {story}=window.cinematicPreview;document.body.innerHTML='<main id="contact" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;background:#111;padding:12px;color:white;font:16px Arial"></main>';const root=document.getElementById('contact');await Promise.all(story.scenes.map(async scene=>{const figure=document.createElement('figure');figure.style.margin='0';const image=document.createElement('img');image.style.width='100%';image.src='../assets/campaign/alpha/mission01/'+scene.art;const label=document.createElement('figcaption');label.textContent=scene.number+'. '+scene.title;figure.append(image,label);root.append(figure);await image.decode();}));});
  await page.screenshot({path:'campaign/previews/cinematics-contact.png',fullPage:true});
  if(errors.length)throw new Error(errors.join('\n'));const report={sceneCount:story.scenes.length,recordings:Object.keys(audio.clips).length,fullTimelineSeconds:all.duration,playedRealAudio:true,playing,pauseDrift:pauseB-pauseA,seek:true,skip:true,reducedMotion:true,asyncSafety,sceneChecks,gameplayDialogue:gameplay.length,errors};fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/cinematics.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
