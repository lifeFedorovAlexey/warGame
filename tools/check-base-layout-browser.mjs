import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const before=process.argv.includes('--before'),folder='campaign/previews/base-layout';fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/navigation',r=>r.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*'},body:'{}'}));
 if(before)for(const path of ['demo/road-grading.js','assets/maps/alpha/heightfield.json']){
  const body=execFileSync('git',['show','HEAD:'+path],{encoding:'utf8'});
  await page.route('**/'+path,r=>r.fulfill({contentType:path.endsWith('json')?'application/json':'application/javascript',body}));
 }
 await page.addInitScript(()=>{for(const k of ['fieldSound','fieldRadio','fieldStoryVoice'])localStorage.setItem('warGame.'+k,'off');});
 await page.goto('http://127.0.0.1:8766/review/base-layout-'+Date.now()+'/campaign/');
 await page.waitForFunction(()=>window.campaign?.ready&&!document.getElementById('begin').disabled,null,{timeout:90000}).catch(async error=>{
  console.error(JSON.stringify({errors,page:await page.locator('body').innerText()}));await page.screenshot({path:folder+'/startup-error.png'});throw error;
 });
 await page.evaluate(()=>{const m=campaign.mission;m.state.pendingCinematics=[];m.state.openingScene={...m.state.openingScene,handedOver:true};localStorage.setItem('warGame.alpha.mission01.v1',m.save());document.getElementById('load').click();});
 await page.waitForFunction(()=>campaign.state.active&&document.getElementById('welcome').hidden,null,{timeout:30000});
 await page.locator('#pause').click();
 await page.waitForTimeout(250);
 const margin=await page.locator('#minimap').evaluate(canvas=>Array.from(canvas.getContext('2d').getImageData(1,1,1,1).data));
 assert.deepEqual(margin,[11,14,15,255],'Map margins use the same colour as unexplored fog');
 if(!before)await page.locator('#minimap').screenshot({path:folder+'/minimap.png'});
 await page.evaluate(()=>{
  const c=campaign,m=c.mission,w=c.world;c.renderSuspended=true;c.radio.setEnabled(false);
  Object.assign(m.state,{units:[],buildings:[],camps:[],artifacts:[],raidReserve:[],energy:2400,openingScene:null,storyConstruction:{enabled:false}});
  m.updateMission=()=>{};m.constructionUnlocked=()=>true;m.explored.fill(255);m.visible.fill(255);m.visionSources=[{x:63.5,y:63.5,radius:200}];m.fogRevision++;m.rebuildNavigation();
  w.fixedRenderScale=1;w.renderer.setPixelRatio(1);w.controls.enableDamping=false;
  w.controls.target.set(-1580,340,w.field.heightAt(-1580,340));w.camera.position.copy(w.controls.target).add({x:0,y:-210,z:580});w.controls.update();w.update(m,new Set(),0);
 });
 if(!before)await page.screenshot({path:folder+'/plots.png'});
 const result=await page.evaluate(()=>{
  const {mission:m,world:w}=campaign,pines=w.scene.getObjectByName('small_pines'),treeBefore=Array.from(pines.instanceMatrix.array);
  const add=(kind,p,rotation=0)=>m.addStructure(kind,'rai',p,{completed:true,progress:1,rotation,groundHeight:p.height??w.field.heightAt(p.x,p.y),accessRoads:p.accessRoads});
  const sites=[];for(const site of m.config.baseSites){
   const p=w.field.gridToWorld(site.grid),rotation=(site.rotationDegrees??0)*Math.PI/180,place=m.placement(site.kind,p.x,p.y,rotation,{checkMoney:false});
   if(!place.ok)throw Error(site.kind+': '+place.reason);const b=add(site.kind,place,rotation);sites.push({kind:b.kind,x:b.x,y:b.y});m.rebuildNavigation();
  }
  for(const grid of m.config.oilFields.slice(0,2))add('derrick',w.field.gridToWorld(grid));m.rebuildNavigation();w.update(m,new Set(),0);
  const roads=m.state.buildings.flatMap(b=>b.accessRoads??[]),a=pines.instanceMatrix.array,trunks=w.scene.getObjectByName('pine_trunks'),conflicts=[];let moved=0;
  for(let i=0;i<pines.count;i++){
   const index=i*16,x=a[index+12],y=a[index+13],radius=2.13*Math.hypot(a[index],a[index+1],a[index+2]);
   if(Math.hypot(x-treeBefore[index+12],y-treeBefore[index+13])>.01)moved++;
   if(Math.hypot(x-trunks.instanceMatrix.array[index+12],y-trunks.instanceMatrix.array[index+13])>.001)throw Error('Separated trunk and crown');
   for(const r of roads)for(let j=1;j<r.points.length;j++){
    const u=r.points[j-1],v=r.points[j],dx=v.x-u.x,dy=v.y-u.y,t=Math.max(0,Math.min(1,((x-u.x)*dx+(y-u.y)*dy)/(dx*dx+dy*dy||1)));
    if(Math.hypot(x-u.x-dx*t,y-u.y-dy*t)<r.width/2+radius+2.99)conflicts.push(i);
   }
  }
  const version=pines.instanceMatrix.version;for(let i=0;i<10;i++)w.update(m,new Set(),0);
  return {sites,treesMoved:moved,treeRoadConflicts:[...new Set(conflicts)],idleTreeUploads:pines.instanceMatrix.version-version,plotVertices:w.scene.getObjectByName('building_plot_markings').geometry.attributes.position.count};
 });
 assert.deepEqual(result.treeRoadConflicts,[]);assert.equal(result.idleTreeUploads,0);assert.equal(result.plotVertices,0);
 if(!before)await page.screenshot({path:folder+'/base.png'});
 await page.evaluate(()=>{const w=campaign.world;w.controls.target.set(-1580,120,w.field.heightAt(-1580,120));w.camera.position.copy(w.controls.target).add({x:0,y:-130,z:480});w.controls.update();w.update(campaign.mission,new Set(),0);});
 await page.screenshot({path:folder+(before?'/slope-before.png':'/slope.png')});
 if(!before){
  await page.evaluate(()=>{
   const c=campaign,m=c.mission,w=c.world,f=m.state.buildings.find(b=>b.kind==='factory');f.hp=f.maxHp*.4;
   const worker=m.addUnit('builder','rai',{x:f.x+f.halfWidth+26,y:f.y});c.select([worker.id],false,false);c.advance(0);
   w.controls.target.set(f.x,f.y,w.field.heightAt(f.x,f.y));w.camera.position.copy(w.controls.target).add({x:0,y:-110,z:350});w.controls.update();w.update(m,new Set(),0);
  });
  await page.locator('#combat-modes').click();await page.locator('[data-auto-repair]').click();
  assert.equal(await page.locator('[data-auto-repair]').getAttribute('aria-pressed'),'true');
  const repair=await page.evaluate(async()=>{
   const T=await import('three'),c=campaign,m=c.mission,w=c.world,f=m.state.buildings.find(b=>b.kind==='factory'),hp=f.hp;
   for(let i=0;i<35;i++)m.tick(.1);c.advance(0);m.visible.fill(255);m.visionSources=[{x:63.5,y:63.5,radius:200}];m.fogRevision++;w.update(m,new Set(),0);
   const beam=w.vehicles.workBeams.find(b=>b.targetId===f.id),direction=beam.to.clone().sub(beam.from).normalize(),ray=new T.Raycaster(beam.from,direction);
   const hits=ray.intersectObject(w.buildingObjects.get(f.id),true),surfaceGap=Math.min(...hits.map(h=>h.point.distanceTo(beam.to)));
   return {before:hp,after:f.hp,working:m.state.units.some(u=>u.builderWorking),surfaceGap};
  });
  assert(repair.after>repair.before&&repair.working,'The UI switch starts real repairs');result.repair=repair;
  assert(repair.surfaceGap<.1,'Repair beam ends on rendered building geometry');
  await page.mouse.move(50,80);await page.screenshot({path:folder+'/autorepair.png'});
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);await page.evaluate(()=>campaign.world.update(campaign.mission,new Set(),0));
  const menu=await page.locator('#combat-menu').boundingBox();assert(menu.x>=0&&menu.x+menu.width<=390&&menu.y>=0);
  await page.screenshot({path:folder+'/autorepair-narrow.png'});
  await page.locator('[data-auto-repair]').click();assert.equal(await page.locator('[data-auto-repair]').getAttribute('aria-pressed'),'false');
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(folder+(before?'/before.json':'/result.json'),JSON.stringify({...result,errors},null,2));console.log(JSON.stringify({before,...result,errors}));
}finally{await browser.close();}
