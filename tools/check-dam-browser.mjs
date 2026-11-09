import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dir='campaign/previews/dam';fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];
 page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.error(m.text());}});
 await page.addInitScript(()=>{for(const k of ['fieldSound','fieldRadio','fieldStoryVoice'])localStorage.setItem('warGame.'+k,'off');});
 await page.goto('http://127.0.0.1:8766/review/dam/campaign/');await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});
 await page.locator('#begin').click();const skip=page.locator('[data-dream=skip]');if(await skip.isVisible())await skip.click();
 await page.evaluate(()=>{const c=campaign,m=c.mission;c.radio.setEnabled(false);const s=m.entity(m.state.openingScene.signId);s.completed=true;s.progress=1;});
 await page.waitForFunction(()=>campaign.state.active,null,{timeout:25000});await page.locator('#pause').click();
 const data=await page.evaluate(async()=>{
  const c=campaign,m=c.mission,w=c.world;const layout=await import('./dam-layout.js');c.damModule=layout;
  m.state.storyConstruction={enabled:false};m.updateMission=()=>{};m.state.time=8;c.renderSuspended=true;
  m.state.buildings=m.state.buildings.filter(b=>b.kind==='base-sign');
  for(const site of m.config.baseSites.slice(0,2))m.addStructure(site.kind,'rai',w.field.gridToWorld(site.grid),{completed:true,progress:1,rotation:(site.rotationDegrees??0)*Math.PI/180});
  m.addStructure('derrick','rai',w.field.gridToWorld(m.config.oilFields[0]),{completed:true,progress:1});
  m.rebuildNavigation();m.explored.fill(255);m.visible.fill(255);m.visionSources.push({x:63.5,y:63.5,radius:200});m.fogRevision++;
  c.select([],false,false);document.querySelector('#toast').hidden=true;w.fixedRenderScale=1;w.renderer.setPixelRatio(1);w.controls.enableDamping=false;
  const d=layout.damLayout(w.field,m.config);c.damLayout=d;w.controls.target.set(d.x+120,d.y,30);w.camera.position.copy(w.controls.target).add({x:650,y:-210,z:550});w.controls.update();w.update(m,new Set(),.1);
  const props=w.scene.getObjectByName('desert_dressing'),dam=w.scene.getObjectByName('western_dam');
  return {dam:!!dam,instances:props.children.reduce((sum,n)=>sum+n.count,0),navigationDam:m.nav.solids.some(s=>s.kind==='dam'),particles:w.scene.getObjectByName('dam_spray').geometry.drawRange.count,sections:w.scene.getObjectByName('western_dam_structure').children.map(n=>n.name),stats:w.statistics};
 });
 assert(data.dam&&data.instances>500&&!data.navigationDam&&data.particles>0,JSON.stringify(data));assert.equal(data.sections.filter(s=>s.startsWith('monolith_')).length,14);console.log(JSON.stringify(data));
 await page.waitForTimeout(800);await page.evaluate(()=>campaign.world.update(campaign.mission,new Set(),.1));await page.screenshot({path:dir+'/wide.png'});
 await page.evaluate(()=>{const c=campaign,w=c.world,d=c.damLayout;w.controls.target.set(d.x+20,d.y,46);w.camera.position.copy(w.controls.target).add({x:370,y:-120,z:240});w.controls.update();w.update(c.mission,new Set(),.1);});
 await page.screenshot({path:dir+'/close.png'});
 await page.evaluate(()=>{const c=campaign,w=c.world,d=c.damLayout;c.mission.state.time=9.7;w.controls.target.set(d.x,d.y,87);w.camera.position.copy(w.controls.target).add({x:200,y:-100,z:195});w.controls.update();w.update(c.mission,new Set(),0);});
 await page.screenshot({path:dir+'/crest.png'});
 const details=await page.evaluate(()=>{const c=campaign,w=c.world,m=c.mission,beacons=w.scene.getObjectByName('dam_red_beacons'),on=beacons.children[1].material.opacity; m.state.time=10.5;w.update(m,new Set(),0);return {on,off:beacons.children[1].material.opacity,lamps:w.scene.getObjectByName('dam_lamp_glows').children.length,graffiti:!!w.scene.getObjectByName('tsoi_graffiti'),largeRocks:!!w.scene.getObjectByName('weathered_outcrops')};});
 assert(details.on>0&&details.off===0&&details.lamps===16&&details.graffiti&&!details.largeRocks,JSON.stringify(details));
 const audio=await page.evaluate(async()=>{
  const {createDamAudio}=await import('./dam-audio.js'),context=new AudioContext();await context.resume();
  const output=context.createGain(),analyser=context.createAnalyser(),silent=context.createGain();silent.gain.value=0;output.connect(analyser).connect(silent).connect(context.destination);
  const sound={context,enabled:true,effectsOutput:output},audio=createDamAudio(sound),data=new Float32Array(analyser.fftSize),wait=ms=>new Promise(r=>setTimeout(r,ms));
  const rms=()=>{analyser.getFloatTimeDomainData(data);return Math.sqrt(data.reduce((s,v)=>s+v*v,0)/data.length);};
  audio.update(1,.25,true);await wait(600);const playing=rms();audio.update(1,.25,false);await wait(950);const paused=rms();
  audio.update(1,.25,true);await wait(400);sound.enabled=false;audio.update(1,.25,true);await wait(800);const muted=rms();await context.close();return {playing,paused,muted};
 });assert(audio.playing>.003&&audio.paused<audio.playing*.03&&audio.muted<audio.playing*.03,JSON.stringify(audio));console.log({audio});
 const states=await page.evaluate(()=>{
  const c=campaign,m=c.mission,w=c.world,api=c.damModule,s=api.damState(m),gate=w.scene.getObjectByName('spillway_gate');
  const obstacles=JSON.stringify(m.nav.solids.map(b=>b.id)),units=m.state.units.length;
  api.setDamSectionDamage(s,'spillway_gate',1);w.update(m,new Set(),0);const open=!gate.visible&&w.scene.getObjectByName('breach_outflow').visible;
  const saved=JSON.parse(m.save()).state.environment[api.DAM_ID];api.setDamSectionDamage(s,'spillway_gate',0);m.state.time=28;w.update(m,new Set(),0);
  const quiet=w.scene.getObjectByName('dam_spray').geometry.drawRange.count===0;
  m.state.time=8;m.explored.fill(255);m.visible.fill(255);m.fogRevision++;w.update(m,new Set(),0);
  return {open,saved:saved.sections.spillway_gate,quiet,unchanged:obstacles===JSON.stringify(m.nav.solids.map(b=>b.id))&&units===m.state.units.length};
 });assert.deepEqual(states,{open:true,saved:1,quiet:true,unchanged:true});
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{const c=campaign,w=c.world,d=c.damLayout;w.controls.target.set(d.x+90,d.y,25);w.camera.position.copy(w.controls.target).add({x:1100,y:-180,z:1000});w.controls.update();w.update(c.mission,new Set(),0);});
 await page.waitForTimeout(150);await page.evaluate(()=>campaign.world.update(campaign.mission,new Set(),0));await page.screenshot({path:dir+'/narrow.png'});
 assert.deepEqual(errors,[]);console.log('PASS: dam, scenery without navigation/entities, timed discharge, audio pause/mute, serializable section destruction, lamp glow/beacons, wide and narrow rendering');
}finally{await browser.close();}
