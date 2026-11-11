import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH??'C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const baseline=process.argv.includes('--baseline'),folder='campaign/previews/playtest-WG-023/'+(baseline?'before-captures':'after');fs.mkdirSync(folder,{recursive:true});
const report={baseline,errors:[],cases:[]},browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});page.on('pageerror',e=>report.errors.push(e.stack??e.message));
 page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 await page.addInitScript(()=>{for(const k of ['fieldSound','fieldStoryVoice','fieldRadio'])localStorage.setItem('warGame.'+k,'off');});
 await page.route('**/api/radio/published',r=>r.fulfill({json:{document:JSON.parse(fs.readFileSync('assets/radio/situations_catalog.json','utf8'))}}));
 if(baseline)for(const name of ['world.js','shadow-casters.js'])await page.route('**/campaign/'+name,r=>r.fulfill({body:fs.readFileSync('campaign/previews/playtest-WG-023/before/'+name,'utf8'),contentType:'text/javascript'}));
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8768')+'/campaign/?damage=1');await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:120000});
 await page.locator('#begin').click();await page.locator('[data-dream=skip]').click();
 await page.evaluate(()=>{const m=campaign.mission,s=m.entity(m.state.openingScene.signId);s.completed=true;s.progress=1;campaign.radio.setEnabled(false);});
 await page.waitForFunction(()=>campaign.state.active,null,{timeout:30000});await page.locator('#pause').click();
 await page.evaluate(()=>{
  const c=campaign,m=c.mission,w=c.world;c.renderSuspended=true;c.damageDebug.panel.hidden=true;w.controls.enableDamping=false;w.fixedRenderScale=true;w.renderer.setPixelRatio(1);
  window.review={initial:JSON.parse(JSON.stringify(m.state.units.find(u=>u.kind==='bukhanka'))),now:performance.now()+1000,visible:true};performance.now=()=>review.now;
  m.state.buildings=[];m.state.artifacts=[];m.state.camps=[];m.state.raidReserve=[];m.visible.fill(255);m.explored.fill(255);m.visibleAt=()=>review.visible;m.exploredAt=()=>true;m.fogRevision++;
 });
 report.sensorSupported=await page.evaluate(()=>!!campaign.mission.config.units.sensor);
 for(const [width,height] of [[1440,900],[844,390],[667,375]]){
  await page.setViewportSize({width,height});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  await page.evaluate(()=>{
   const c=campaign,m=c.mission,w=c.world,u=structuredClone(review.initial);review.unit=u;review.visible=true;review.now+=100;
   m.state.units=[u];u.owner='scavs';u.path=[];u.previousX=u.x;u.previousY=u.y;u.previousHeading=u.heading;u.steering=u.previousSteering=0;u.wheelDistance=u.previousWheelDistance=0;
   c.damageDebug.view(u.id,140);m.drainEffects();w.update(m,new Set(),0,false,true);w.renderer.render(w.scene,w.camera);
  });
  const actions=['idle','move','hide','return','hide-again','return-again','remove','restore','zoom-out','zoom-in','offscreen','onscreen','wreck','fade-mid','fade-end','expire',...(report.sensorSupported?['sensor','scan','pause-scan']:[])];
  for(const action of actions){
   const result=await page.evaluate(action=>{
    const c=campaign,m=c.mission,w=c.world,u=review.unit;
    review.now+=['hide','return','hide-again','return-again','remove','restore'].includes(action)?16:100;
    if(action==='move'){u.x+=24;u.previousX=u.x;}
    if(action==='hide'||action==='hide-again')review.visible=false;
    if(action==='return'||action==='return-again'){u.x+=20;u.previousX=u.x;review.visible=true;}
    if(action==='remove'||action==='expire')m.state.units=[];
    if(action==='restore')m.state.units=[u];
    if(action==='zoom-out')c.damageDebug.view(u.id,1200);
    if(action==='zoom-in')c.damageDebug.view(u.id,140);
    if(action==='offscreen'){w.camera.setViewOffset(innerWidth,innerHeight,innerWidth*3,0,innerWidth,innerHeight);}
    if(action==='onscreen')w.camera.clearViewOffset();
    if(action==='wreck'){m.damage(u,10000,null);delete u.contactRock;m.drainEffects();}
    if(action==='fade-mid')m.state.time=u.removeAt-1;
    if(action==='fade-end')m.state.time=u.removeAt-.01;
    if(action==='sensor'){review.unit=m.addUnit('sensor','rai',{x:u.x,y:u.y});c.damageDebug.view(review.unit.id,140);}
    if(action==='scan')m.state.time+=1;
    const start=w.statistics.shadowUpdates;w.update(m,new Set(),0,false,true);
    // A normal second draw settles instance uploads without refreshing the
    // cached shadow map. Compare that map with an unconditional reference pass.
    w.renderer.render(w.scene,w.camera);
    const gl=w.renderer.getContext(),width=gl.drawingBufferWidth,height=gl.drawingBufferHeight,a=new Uint8Array(width*height*4),b=new Uint8Array(a.length);
    gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,a);const before=w.renderer.domElement.toDataURL();
    w.renderer.shadowMap.needsUpdate=true;w.renderer.render(w.scene,w.camera);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,b);
    let wrongPixels=0,maxDelta=0;for(let i=0;i<a.length;i+=4){const d=Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]));if(d>8)wrongPixels++;maxDelta=Math.max(maxDelta,d);}
    const record=w.damage.records.get(review.unit.id);
    return {action,updates:w.statistics.shadowUpdates-start,wrongPixels,maxDelta,hp:u.hp,wreck:!!u.damage?.wreck,visible:record?.visible,contacts:w.scene.getObjectByName('vehicle_tyre_contacts').count,before};
   },action);
   if(['hide','return','fade-end','scan'].includes(action)){
    fs.writeFileSync(`${folder}/${action}-${width}x${height}-map.png`,Buffer.from(result.before.split(',')[1],'base64'));
    if(!baseline)await page.screenshot({path:`${folder}/${action}-${width}x${height}.png`});
   }
   delete result.before;report.cases.push({width,height,...result});console.log(JSON.stringify({width,height,...result}));
   if(!baseline)assert.equal(result.wrongPixels,0,JSON.stringify(result));
   if(['idle','pause-scan'].includes(action))assert.equal(result.updates,0,'Static poses keep their cached shadows');
   if(['hide','hide-again','remove','expire','offscreen'].includes(action))assert.equal(result.contacts,0,'Hidden/removed vehicles leave no tyre contact patches');
   if(action==='wreck')assert(result.wreck&&result.hp===0);
   if(action==='offscreen')assert.equal(result.visible,false);
   if(action==='onscreen')assert.equal(result.visible,true);
  }
 }
 if(baseline){assert(report.cases.some(c=>c.action==='hide'&&c.wrongPixels>100));assert(report.cases.some(c=>c.action==='fade-end'&&c.wrongPixels>100));}
 assert.deepEqual(report.errors,[]);report.passed=true;
}finally{fs.writeFileSync(folder+'/verification.json',JSON.stringify(report,null,2));await browser.close();}
