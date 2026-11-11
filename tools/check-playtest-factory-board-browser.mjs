import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH??'C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const compare=process.argv.includes('--compare'),baseline=process.argv.includes('--baseline'),folder='campaign/previews/playtest-WG-043/'+(baseline?'before-captures':'after');fs.mkdirSync(folder,{recursive:true});
const report={baseline,errors:[],poses:[]},browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});page.on('pageerror',e=>report.errors.push(e.stack??e.message));
 page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 await page.addInitScript(()=>{for(const k of ['fieldSound','fieldStoryVoice','fieldRadio'])localStorage.setItem('warGame.'+k,'off');});
 await page.route('**/api/radio/published',r=>r.fulfill({json:{document:JSON.parse(fs.readFileSync('assets/radio/situations_catalog.json','utf8'))}}));
 if(baseline)await page.route('**/campaign/factory-status-board.js',r=>r.fulfill({body:fs.readFileSync('campaign/previews/playtest-WG-043/before/factory-status-board.js','utf8'),contentType:'text/javascript'}));
 await page.route('**/campaign/main.js',r=>r.fulfill({body:fs.readFileSync('campaign/main.js','utf8').replace('ready: true, mission, world, select, radio,',`ready: true, mission, world, select, radio,reviewRefreshUi(){flushUi();minimapView.render(performance.now());},`),contentType:'text/javascript'}));
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8768')+'/campaign/?damage=1');await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:120000});
 await page.locator('#begin').click();await page.locator('[data-dream=skip]').click();
 await page.evaluate(()=>{const m=campaign.mission,s=m.entity(m.state.openingScene.signId);s.completed=true;s.progress=1;campaign.radio.setEnabled(false);});
 await page.waitForFunction(()=>campaign.state.active,null,{timeout:30000});await page.locator('#pause').click();
 await page.evaluate(()=>{
  const c=campaign,m=c.mission,w=c.world;c.renderSuspended=true;c.damageDebug.panel.hidden=true;w.controls.enableDamping=false;w.fixedRenderScale=true;w.renderer.setPixelRatio(1);
  Object.assign(m.state,{units:[],buildings:[],camps:[],artifacts:[],raidReserve:[],pendingCinematics:[],energy:2400,bounds:[0,0,127,127],storyConstruction:{enabled:false}});m.state.flags.raidWon=true;
  m.visible.fill(255);m.explored.fill(255);m.visionSources=[{x:63.5,y:63.5,radius:200}];m.visibleAt=m.exploredAt=()=>true;m.fogRevision++;
  const f=m.addStructure('factory','rai',{x:-1656,y:472},{completed:true,progress:1,groundHeight:m.field.heightAt(-1656,472)});f.workPriority='repair';
  for(let i=0;i<2;i++){const u=m.addUnit('bukhanka','rai',{x:f.x,y:f.y});u.hp=u.maxHp*.4;u.factoryVisit={factoryId:f.id,phase:'inside',arrived:i,queued:0,repairStartHp:u.hp};u.combatRetreat={status:'servicing',home:{id:f.id}};f.queue.push({kind:'bukhanka',cost:130,progress:0,funding:{paid:130},orderSerial:i,autoFactory:true});}
  m.rebuildNavigation();m.updateEconomy(1);c.select([]);c.reviewRefreshUi();w.update(m,new Set(),0,false,true);
  window.boardReview={f,now:performance.now()+10000};performance.now=()=>boardReview.now;
 });
 for(const [width,height] of [[1440,900],[844,390],[667,375]]){
  await page.setViewportSize({width,height});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  let worst=null;
  for(const distance of (compare?[1000]:[300,600,1000,1600]))for(const elevation of (compare?[85]:[25,55,85]))for(const azimuth of (compare?[90]:[0,90,180,270])){
   const pose={distance,elevation,azimuth};
   const result=await page.evaluate(pose=>{
    const c=campaign,m=c.mission,w=c.world,r=boardReview,f=r.f,model=w.buildingObjects.get(f.id),board=model.getObjectByName('factory_status_board');r.now+=100;
    const target=board.getWorldPosition(w.controls.target.clone());w.controls.target.copy(target);const e=pose.elevation*Math.PI/180,a=pose.azimuth*Math.PI/180;
    w.camera.position.set(target.x+pose.distance*Math.cos(e)*Math.cos(a),target.y+pose.distance*Math.cos(e)*Math.sin(a),target.z+pose.distance*Math.sin(e));w.controls.update();w.update(m,new Set(),0,false,true);c.reviewRefreshUi();
    const gl=w.renderer.getContext(),width=gl.drawingBufferWidth,height=gl.drawingBufferHeight,before=new Uint8Array(width*height*4),reference=new Uint8Array(before.length);
    gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,before);
    const materials=new Set();board.traverse(o=>{for(const material of Array.isArray(o.material)?o.material:o.material?[o.material]:[])if(!material.map)materials.add(material);});
    for(const material of materials)material.visible=false;w.renderer.render(w.scene,w.camera);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,reference);for(const material of materials)material.visible=true;
    const face=board.children.find(o=>o.material?.map)||board.children[0],bw=face.geometry.parameters.width,bd=face.geometry.parameters.height??face.geometry.parameters.depth,z=face.geometry.type==='BoxGeometry'?face.geometry.parameters.depth/2:0;
    // Compare actual interior pixels, keeping a 1.5 px margin around the
    // polygon. Antialiasing at a real metal edge is not depth fighting.
    let conflicts=0,maxDelta=0,samples=0;const p=w.controls.target.clone();
    const points=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]].map(([x,y])=>{p.set(x*bw,y*bd,z).applyMatrix4(face.matrixWorld).project(w.camera);return [(p.x+1)*width/2,(1-p.y)*height/2];});
    const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),x=Math.max(0,Math.floor(Math.min(...xs))-5),y=Math.max(0,Math.floor(Math.min(...ys))-5);
    for(let py=Math.max(0,Math.floor(Math.min(...ys)));py<Math.min(height,Math.ceil(Math.max(...ys)));py++)for(let px=Math.max(0,Math.floor(Math.min(...xs)));px<Math.min(width,Math.ceil(Math.max(...xs)));px++){
     let sign=0,inside=true;
     for(let i=0;i<4;i++){const a=points[i],b=points[(i+1)%4],dx=b[0]-a[0],dy=b[1]-a[1],cross=dx*(py+.5-a[1])-dy*(px+.5-a[0]);if(Math.abs(cross)/Math.hypot(dx,dy)<1.5||sign&&Math.sign(cross)!==sign){inside=false;break;}sign=Math.sign(cross);}
     if(!inside)continue;samples++;const k=((height-1-py)*width+px)*4;
     const delta=Math.max(Math.abs(before[k]-reference[k]),Math.abs(before[k+1]-reference[k+1]),Math.abs(before[k+2]-reference[k+2]));if(delta>12)conflicts++;maxDelta=Math.max(maxDelta,delta);
    }
    w.renderer.render(w.scene,w.camera);
    let drawGroups=0;board.traverse(o=>{if(o.isMesh)drawGroups+=Array.isArray(o.material)?o.geometry.groups.length:1;});
    return {conflicts,maxDelta,samples,drawGroups,boardState:board.userData.status,clip:{x,y,width:Math.min(width-x,Math.ceil(Math.max(...xs))-x+5),height:Math.min(height-y,Math.ceil(Math.max(...ys))-y+5)},depthTest:(Array.isArray(face.material)?face.material.find(m=>m.map):face.material).depthTest};
   },pose);
   report.poses.push({width,height,...pose,...result});if(!worst||result.conflicts>worst.conflicts)worst={...result,...pose};
   if(!baseline)assert.equal(result.conflicts,0,JSON.stringify({width,height,...pose,...result}));
   assert(result.depthTest,'The sign must still be occluded by real world geometry');
   assert.equal(result.drawGroups,2,'Do not add render passes per factory');
   if(compare){await page.screenshot({path:`${folder}/board-compare-${width}x${height}.png`});await page.screenshot({path:`${folder}/board-compare-detail-${width}x${height}.png`,clip:result.clip});}
   if(distance===300&&elevation===85&&azimuth===90){await page.screenshot({path:`${folder}/board-close-${width}x${height}.png`});await page.screenshot({path:`${folder}/board-close-detail-${width}x${height}.png`,clip:result.clip});}
   if((baseline&&result.conflicts>0&&result.conflicts===worst.conflicts)||(!baseline&&distance===600&&elevation===55&&azimuth===270)){
    await page.screenshot({path:`${folder}/board-${width}x${height}.png`});await page.screenshot({path:`${folder}/board-detail-${width}x${height}.png`,clip:result.clip});
   }
  }
  console.log(JSON.stringify({width,height,worst}));
 }
 if(baseline)assert(report.poses.some(p=>p.conflicts>10),'Reproduce the metal plate covering its lettering');
 assert.deepEqual(report.errors,[]);report.passed=true;
}finally{fs.writeFileSync(folder+(compare?'/comparison.json':'/verification.json'),JSON.stringify(report,null,2));await browser.close();}
