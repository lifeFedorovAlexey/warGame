import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const before=process.argv.includes('--before'),staged=process.argv.includes('--staged'),dir='campaign/previews/construction-beam'+(staged?'/staged':'');fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 if(staged){const body=execFileSync('git',['show',':campaign/construction-effects.js'],{encoding:'utf8'});await page.route('**/campaign/construction-effects.js',route=>route.fulfill({contentType:'text/javascript',body}));}
 await page.addInitScript(()=>{for(const k of ['fieldSound','fieldRadio','fieldStoryVoice'])localStorage.setItem('warGame.'+k,'off');});
 await page.goto('http://127.0.0.1:8766/review/work-links/campaign/');await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});
 await page.locator('#begin').click();const skip=page.locator('[data-dream=skip]');if(await skip.isVisible())await skip.click();
 await page.waitForFunction(()=>campaign.mission.state.openingScene?.signId||campaign.state.active,null,{timeout:60000});
 await page.evaluate(()=>{const c=campaign,m=c.mission;c.radio.setEnabled(false);const s=m.entity(m.state.openingScene?.signId);if(s){s.completed=true;s.progress=1;}});
 await page.waitForFunction(()=>campaign.state.active,null,{timeout:25000});await page.locator('#pause').click();
 const result=await page.evaluate(async()=>{
  const T=await import('../demo/vendor/three.module.js'),{createConstructionEffects}=await import('./construction-effects.js'),scene=new T.Scene(),fx=createConstructionEffects(T,scene,4.5);
  const target={id:'site',kind:'factory',x:0,y:0,rotation:0,groundHeight:0},mission={entity:()=>target,config:{buildings:{factory:{realSizeMetres:[20,20,8]}}}};
  const make=(mode,x)=>({from:new T.Vector3(x,-30,10),to:new T.Vector3(x,-20,20),mode,targetId:'site'}),beams=[make('build',-5),make('build',5),make('repair',20)];
  fx.update(beams,1,mission);const beam=scene.children.find(n=>n.isMesh),grains=scene.children.find(n=>n.isPoints),p=beam.geometry.attributes.position;
  const geometry=beams.every((b,i)=>['x','y','z'].every((axis,k)=>Math.abs((p.array[(i*12)*3+k]+p.array[(i*12+1)*3+k])/2-b.from[axis])<1e-5&&Math.abs((p.array[(i*12+2)*3+k]+p.array[(i*12+4)*3+k])/2-b.to[axis])<1e-5));
  const vertices=beam.geometry.drawRange.count;fx.update([],2,mission);const stopped=beam.geometry.drawRange.count===0&&grains.geometry.drawRange.count===0;
  fx.update(Array.from({length:60},(_,i)=>make('build',i)),3,mission);const bounded=beam.geometry.drawRange.count===48*12&&grains.geometry.drawRange.count<=grains.geometry.attributes.position.count;
  const c=campaign,m=c.mission,w=c.world;c.renderSuspended=true;m.updateMission=()=>{};m.state.storyConstruction={enabled:false};m.state.time=15;m.state.energy=10000;
  m.explored.fill(255);m.visible.fill(255);m.visionSources=[{x:63.5,y:63.5,radius:200}];m.fogRevision++;
  m.state.buildings=m.state.buildings.filter(b=>b.kind==='base-sign');
  const site=m.config.baseSites.find(s=>s.kind==='factory'),at=w.field.gridToWorld(site.grid),factory=m.addStructure('factory','rai',at,{completed:false,progress:.68,rotation:0,groundHeight:w.field.heightAt(at.x,at.y)});
  const builders=m.state.units.filter(u=>u.kind==='builder'&&u.owner==='rai').slice(0,2);m.state.units=builders;
  for(const [i,u] of builders.entries()){
   u.x=at.x+(i?22:-22);u.y=at.y-factory.halfDepth-25;u.previousX=u.x;u.previousY=u.y;u.heading=u.previousHeading=0;u.path=[];u.task={type:'build',targetId:factory.id};
   const aim=m.projectorAim(u,factory);if(!aim)throw new Error('Fixture builder cannot reach factory');u.projector={yaw:aim.yaw,pitch:aim.pitch};u.builderContact=aim.world;u.builderWorking=true;
  }
  c.select(builders.map(u=>u.id),false,false);document.querySelector('#toast').hidden=true;w.fixedRenderScale=1;w.renderer.setPixelRatio(1);w.controls.enableDamping=false;
  w.controls.target.set(at.x,at.y-20,15);w.camera.position.copy(w.controls.target).add({x:105,y:-190,z:165});w.controls.update();w.update(m,new Set(),0);
  const projection=w.scene.getObjectByName('service_projection')??w.scene.getObjectByName('construction_projection');
  return {geometry,vertices,stopped,bounded,worldBeams:w.vehicles.workBeams.length,worldVertices:projection.geometry.drawRange.count};
 });
 assert.deepEqual(result,{geometry:true,vertices:36,stopped:true,bounded:true,worldBeams:2,worldVertices:24});
 await page.waitForTimeout(200);await page.screenshot({path:dir+'/builders.png'});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);await page.evaluate(()=>{const w=campaign.world;w.camera.position.copy(w.controls.target).add({x:190,y:-350,z:300});w.controls.update();w.update(campaign.mission,new Set(),0);});await page.screenshot({path:dir+'/builders-narrow.png'});
 await page.setViewportSize({width:1440,height:960});await page.waitForTimeout(150);await page.evaluate(()=>{const c=campaign,w=c.world,m=c.mission,p=w.field.gridToWorld(m.config.startGrid);w.controls.target.set(p.x+190,p.y+18,w.field.heightAt(p.x+190,p.y+18));w.camera.position.copy(w.controls.target).add({x:12,y:-105,z:270});w.controls.update();w.update(m,new Set(),0);});await page.screenshot({path:dir+(before?'/road-before.png':'/road.png')});
 assert.deepEqual(errors,[]);console.log(JSON.stringify(result));console.log('PASS: separate builder links, repair, stop, bounded shared-target dust, actual wide/narrow game');
}finally{await browser.close();}
