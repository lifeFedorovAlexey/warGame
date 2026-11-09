import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const folder='campaign/previews/radio-combat';fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
 await page.addInitScript(()=>localStorage.setItem('warGame.fieldRadio','off'));
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8766')+'/campaign/');
 try{await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});}
 catch(error){throw new Error(JSON.stringify({errors,status:await page.locator('#loading-status').textContent()}),{cause:error});}
 console.log('Game ready');await page.locator('#begin').click();
 await page.evaluate(()=>campaign.advance(40));await page.waitForFunction(()=>campaign.state.active,null,{timeout:60000});await page.locator('#pause').click();console.log('Control handed over');
 await page.evaluate(()=>{
  const c=campaign,m=c.mission,r=c.radio,d=r.director;
  m.addStructure('factory','rai',m.field.gridToWorld(m.config.startGrid),{completed:true,progress:1});
  d.bind(m);for(const id of d.scenes.keys())d.data.scenes[id]={status:'done',cursor:0,endedAt:d.data.clock-20000};
  delete d.data.scenes.r06;delete d.data.scenes.r14;d.data.active=null;d.data.lastEnd=d.data.clock-20000;d.data.lastCombat=d.data.clock-30000;
  m.visible.fill(255);m.explored.fill(255);m.visionSources=[{x:26,y:43,radius:38}];m.fogRevision++;
  m.visibleAt=()=>true;
  const target=m.addUnit('bukhanka','rai',m.field.gridToWorld([45,55])),enemy=m.addUnit('raider','scavs',m.field.gridToWorld([35,55]));
  window.combatFixture={target:target.id,enemy:enemy.id,hp:target.hp,lines:[]};
  const signal=r.onSignal;
  r.onSignal=(s,chapter,keep,urgent,cue)=>{
   const line=cue?{id:cue.id,scene:cue.storyScene,started:performance.now(),duration:cue.clip.duration}:null;
   if(line)combatFixture.lines.push(line);
   return signal(s,chapter,keep?until=>{if(line&&Number.isFinite(until))line.ended=performance.now();keep(until);}:keep,urgent,cue);
  };
  r.setEnabled(true);c.advance(0);
 });
 await page.waitForFunction(()=>campaign.storyAudio.cueId==='m01-s05-l012',null,{timeout:20000});
 const injectAttack=()=>page.evaluate(()=>{
  const c=campaign,m=c.mission,{target,enemy}=combatFixture;
  m.state.flags.raidIds=[enemy];m.state.flags.contact=true;m.state.time+=1;
  m.damage(m.entity(target),1,m.entity(enemy));
  m.effects.push({type:'shot',from:enemy,targetId:target,to:{...m.entity(target),z:5},weapon:'mg'});
  c.advance(0);return {id:c.storyAudio.cueId,cursor:c.radio.director.record('r06').cursor,hp:m.entity(target).hp};
 });
 const hit=await injectAttack();assert.equal(hit.id,'m01-s05-l012');assert.equal(hit.cursor,1);
 const countAttackPixels=()=>page.evaluate(async()=>{
  const {minimapPosition}=await import('./minimap.js'),canvas=document.querySelector('#minimap'),scale=canvas.width/canvas.clientWidth;
  const [cx,cy]=minimapPosition(campaign.mission.field,campaign.mission.entity(combatFixture.target),canvas.width,canvas.height,campaign.mission.state.bounds);
  const p=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let count=0;
  for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
   const radius=Math.hypot(x-cx,y-cy)/scale,i=(y*canvas.width+x)*4;
   if(radius>4&&radius<13&&p[i]>130&&p[i]>p[i+1]*1.65&&p[i]>p[i+2]*1.65)count++;
  }
  return count;
 });
 let pixels=0;
 for(let i=0;i<20&&!pixels;i++){pixels=await countAttackPixels();if(!pixels)await page.waitForTimeout(50);}
 assert(pixels>0,'The existing red attack pulse is visible while the dialogue continues');
 await page.screenshot({path:folder+'/dialogue-attack-desktop.png'});
 await page.locator('#minimap').screenshot({path:folder+'/attack-minimap.png'});
 assert.equal((await injectAttack()).id,'m01-s05-l012','A second hit does not restart the reply');
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:folder+'/dialogue-attack-narrow.png'});
 await page.evaluate(()=>{campaign.mission.effects=[];});
 await page.waitForFunction(()=>campaign.radio.director.record('r06').status==='done',null,{timeout:30000});
 await page.waitForFunction(()=>combatFixture.lines.some(line=>line.scene==='r14'),null,{timeout:15000});
 const result=await page.evaluate(()=>({lines:combatFixture.lines,hp:campaign.mission.entity(combatFixture.target).hp,initialHp:combatFixture.hp,
  cursor:campaign.radio.director.record('r06').cursor,toast:document.querySelector('#toast').textContent,
  layout:{map:document.querySelector('#minimap').getBoundingClientRect().toJSON(),width:innerWidth,height:innerHeight}}));
 const spoken=result.lines.filter(line=>line.scene==='r06');
 assert.deepEqual(spoken.map(line=>line.id),['m01-s05-l011','m01-s05-l012','m01-s05-l013']);
 for(const line of spoken)assert(line.ended-line.started>=(line.duration-.12)*1000,JSON.stringify(line));
 const report=result.lines.find(line=>line.scene==='r14'),gap=report.started-spoken.at(-1).ended;
 assert(gap>=1950,'The queued combat report observes the two-second gap');
 assert(result.hp<result.initialHp);assert.equal(result.cursor,3);assert(!/под огнём/.test(result.toast));
 assert(result.layout.map.right<=result.layout.width&&result.layout.map.bottom<=result.layout.height);
 assert.deepEqual(errors,[]);
 fs.writeFileSync(folder+'/verification.json',JSON.stringify({...result,gap,pixels,errors},null,2));
 console.log('PASS: real damage and minimap pulse during uncut audio, no replay, queued report after '+Math.round(gap)+' ms, desktop and narrow screenshots');
}finally{await browser.close();}
