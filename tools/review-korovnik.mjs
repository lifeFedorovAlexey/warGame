import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const folder='campaign/previews/korovnik';fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1}),errors=[];
page.on('pageerror',e=>{errors.push(e.message);console.log(e.message);});
page.on('console',msg=>{if(msg.type()==='error')console.log('browser:',msg.text().slice(0,300));});
page.on('requestfailed',r=>console.log('request failed:',r.url(),r.failure()?.errorText));
try{
 await page.addInitScript(()=>{for(const k of ['fieldSound','fieldStoryVoice','fieldRadio'])localStorage.setItem('warGame.'+k,'off');});
 await page.goto('http://127.0.0.1:8772/campaign/?transport=1',{waitUntil:'domcontentloaded'});console.log('navigated');
 try{await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:30000});}
 catch(error){console.log('Retrying incomplete resource load');await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:120000});}
 console.log('ready');await page.locator('#begin').click();console.log('begun');
 const model=await page.evaluate(async()=>{
  const T=await import('three'),{createKorovnik}=await import('./korovnik-model.js'),m=createKorovnik(T);
  let invalid=0,vertices=0,rotorClearance=Infinity;const bounds=new T.Box3();
  for(let i=0;i<32;i++){
   m.pose({door:i/31,rotor:i*Math.PI/16});m.root.updateMatrixWorld(true);
   bounds.union(new T.Box3().setFromObject(m.root));
   const forward=new T.Box3().setFromObject(m.rotors[0]),aft=new T.Box3().setFromObject(m.rotors[1]);
   rotorClearance=Math.min(rotorClearance,aft.min.z-forward.max.z);
  }
  m.root.traverse(o=>{if(o.isMesh){vertices+=o.geometry.attributes.position.count;for(const p of o.geometry.attributes.position.array)if(!Number.isFinite(p))invalid++;}});
  return {rotors:m.rotors.length,wheels:m.landingGear.length,rotorClearance,vertices,invalid,min:bounds.min.toArray(),max:bounds.max.toArray()};
 });
 assert.equal(model.rotors,2);assert.equal(model.wheels,20);assert.equal(model.invalid,0);
 assert(model.rotorClearance>.1,'Counter-rotating assemblies retain at least 10 cm of vertical clearance');
 assert(model.min[0]>=-18&&model.max[0]<=18&&model.min[1]>=-32&&model.max[1]<=32,'Animated model fits reserved landing pad');
 console.log('model:',JSON.stringify(model));
 await page.locator('[data-dream=skip]').click();
 await page.evaluate(()=>{const m=campaign.mission,s=m.entity(m.state.openingScene.signId);s.completed=true;s.progress=1;});
 await page.waitForFunction(()=>campaign.state.active&&!campaign.state.openingPlaying,null,{timeout:120000});console.log('active');await page.locator('#pause').click();
 await page.evaluate(()=>{const c=campaign,m=c.mission,w=c.world;m.explored.fill(255);m.visible.fill(255);m.fogRevision++;c.radio.setEnabled(false);w.fixedRenderScale=1;w.renderer.setPixelRatio(1);c.select([]);w.centre(m.transportSite(),530);});
 await page.waitForTimeout(500);await page.screenshot({path:folder+'/01-pad.png'});
 await page.evaluate(()=>{campaign.mission.requestTransport();campaign.mission.advance(10);});
 await page.waitForTimeout(300);await page.screenshot({path:folder+'/02-approach.png'});
 await page.evaluate(()=>{campaign.mission.advance(18);const p=campaign.mission.transportSite(),w=campaign.world;w.controls.target.set(p.x,p.y,23);w.camera.position.set(p.x+220,p.y-240,175);w.controls.update();});
 await page.waitForTimeout(500);await page.screenshot({path:folder+'/03-open.png'});
 await page.evaluate(()=>{const p=campaign.mission.transportSite(),w=campaign.world;w.controls.target.set(p.x,p.y,28);w.camera.position.set(p.x-170,p.y-145,98);w.controls.update();});
 await page.waitForTimeout(400);await page.screenshot({path:folder+'/03-front.png'});
 await page.evaluate(()=>{const p=campaign.mission.transportSite(),w=campaign.world;w.controls.target.set(p.x+42,p.y,26);w.camera.position.set(p.x+220,p.y-175,125);w.controls.update();});
 await page.waitForTimeout(400);await page.screenshot({path:folder+'/03-rear.png'});
 if(process.env.KOROVNIK_FAST!=='1'){
  await page.evaluate(()=>{const m=campaign.mission,p=m.transportSite();m.state.units=m.state.units.filter(u=>u.owner==='rai');m.state.camps.forEach(c=>c.cleared=true);m.state.flags.raidWon=true;for(const spec of Object.values(m.config.buildings))spec.damage=0;const ids=[];for(let i=0;i<10;i++)ids.push(m.addUnit(i===9?'builder':'bukhanka','rai',{x:p.x-100+i%3*36,y:260+Math.floor(i/3)*36},{heading:p.heading,paint:i%2?'earth':'olive'}).id);campaign.select(ids);m.loadTransport(ids);});
  for(let i=0;i<360;i++){
   const n=await page.evaluate(()=>{campaign.mission.advance(1);return campaign.mission.state.transport.manifest.filter(c=>c.phase==='aboard').length;});
   if(n>=10)break;
  }
  assert.equal(await page.evaluate(()=>campaign.mission.state.transport.manifest.filter(c=>c.phase==='aboard').length),10);
  await page.waitForTimeout(400);await page.screenshot({path:folder+'/04-loaded.png'});
 }
 for(const viewport of [{width:844,height:390},{width:390,height:844}]){
  await page.setViewportSize(viewport);await page.evaluate(()=>{const p=campaign.mission.transportSite(),w=campaign.world;w.centre(p,innerWidth<500?770:550);});await page.waitForTimeout(400);await page.screenshot({path:folder+'/05-narrow-'+viewport.width+'.png'});
 }
 await page.setViewportSize({width:1440,height:900});
 if(process.env.KOROVNIK_FAST!=='1'){
  await page.evaluate(()=>{const m=campaign.mission,p=m.transportSite(),w=campaign.world;w.centre(p,500);m.departTransport();m.advance(5);});await page.waitForTimeout(400);await page.screenshot({path:folder+'/06-closed.png'});
  await page.evaluate(()=>campaign.mission.advance(6));await page.waitForTimeout(300);await page.screenshot({path:folder+'/07-takeoff.png'});
  await page.evaluate(()=>campaign.mission.advance(14));assert.equal(await page.evaluate(()=>campaign.mission.state.transport.phase),'departed');
 }
 const report=await page.evaluate(()=>({phase:campaign.mission.state.transport.phase,cargo:campaign.mission.state.transport.manifest.length,queue:campaign.mission.state.transport.queue.length,grade:campaign.world.field.korovnikGrading,statistics:campaign.world.statistics}));
 fs.writeFileSync(folder+'/report.json',JSON.stringify({errors,model,...report},null,2));console.log(JSON.stringify({errors,model,...report}));assert.equal(errors.length,0);
}catch(error){await page.screenshot({path:folder+'/error.png'});console.log(await page.evaluate(()=>({state:window.campaign?.state,body:document.body.innerText.slice(-1000)})));throw error;}finally{await browser.close();}
