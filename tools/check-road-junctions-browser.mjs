import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dir='campaign/previews/road-junctions';fs.mkdirSync(dir,{recursive:true});
const url=process.argv.find(a=>a.startsWith('--url='))?.slice(6)??'http://127.0.0.1:8766/review/road-junctions/campaign/';
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/navigation',r=>r.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*'},body:'{}'}));
 await page.addInitScript(()=>{for(const k of ['fieldSound','fieldRadio','fieldStoryVoice'])localStorage.setItem('warGame.'+k,'off');});
 await page.goto(url);await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});
 const result=await page.evaluate(async()=>{
  const T=await import('three'),c=campaign,m=c.mission,w=c.world;c.renderSuspended=true;c.radio.setEnabled(false);document.querySelector('#welcome').hidden=true;
  Object.assign(m.state,{units:[],buildings:[],camps:[],artifacts:[],raidReserve:[],energy:2400,storyConstruction:{enabled:false}});m.updateMission=()=>{};m.constructionUnlocked=()=>true;m.visible.fill(255);m.explored.fill(255);m.visionSources=[{x:63.5,y:63.5,radius:200}];m.fogRevision++;
  const add=(kind,p,rotation=0)=>m.addStructure(kind,'rai',p,{completed:true,progress:1,rotation});
  add('generator',{x:-1728,y:272},Math.PI);for(const grid of m.config.oilFields.slice(0,2))add('derrick',w.field.gridToWorld(grid));add('lab',{x:-1440,y:432});m.rebuildNavigation();
  const factories=[];for(const [x,y] of [[-1648,464],[-1600,224],[-1304,256]]){
   const p=m.placement('factory',x,y,0,{snap:false});if(!p.ok)throw Error(p.reason);const f=add('factory',p);f.accessRoads=p.accessRoads;factories.push(f);m.rebuildNavigation();
  }
  w.fixedRenderScale=1;w.renderer.setPixelRatio(1);w.controls.enableDamping=false;w.controls.target.set(-1550,320,w.field.heightAt(-1550,320));w.camera.position.copy(w.controls.target).add({x:0,y:-180,z:470});w.controls.update();w.update(m,new Set(),0);
  const concrete=w.scene.getObjectByName('old_concrete_sites'),paint=w.scene.getObjectByName('street_markings'),geometry=concrete.geometry.uuid;
  const pixelCamera=new T.OrthographicCamera(-.1,.1,.1,-.1,.1,200),target=new T.WebGLRenderTarget(1,1),bytes=new Uint8Array(4);
  function pixel(p,hide=false){
   pixelCamera.position.set(p.x,p.y,w.field.heightAt(p.x,p.y)+100);pixelCamera.lookAt(p.x,p.y,w.field.heightAt(p.x,p.y));pixelCamera.updateMatrixWorld();
   concrete.visible=paint.visible=!hide;w.renderer.setRenderTarget(target);w.renderer.render(w.scene,pixelCamera);w.renderer.readRenderTargetPixels(target,0,0,1,1,bytes);w.renderer.setRenderTarget(null);concrete.visible=paint.visible=true;return Array.from(bytes);
  }
  const distance=(a,b)=>Math.max(...a.slice(0,3).map((v,i)=>Math.abs(v-b[i])));
  const allRoads=factories.flatMap(f=>f.accessRoads);
  const inRoad=p=>allRoads.some(r=>r.points.slice(1).some((b,i)=>{const a=r.points[i],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy)));return Math.hypot(p.x-a.x-dx*t,p.y-a.y-dy*t)<r.width/2-3;}));
  function points(mesh,cuttable){
   const a=mesh.geometry.attributes.position,cuts=mesh.geometry.attributes.roadCuttable,result=[];
   for(let i=0;i<a.count;i+=3){if((cuts?.getX(i)>.5)!==cuttable)continue;const p={x:(a.getX(i)+a.getX(i+1)+a.getX(i+2))/3,y:(a.getY(i)+a.getY(i+1)+a.getY(i+2))/3};if(inRoad(p))result.push(p);}
   return result;
  }
  const probes=points(concrete,true).filter(p=>Math.abs(p.y-320)<26).filter((_,i)=>i%2===0).slice(0,24);
  const edges=points(paint,true).slice(0,24),protectedPaint=points(paint,false).slice(0,24);
  const check=points=>points.map(p=>({p,gap:distance(pixel(p),pixel(p,true))}));
  const cutConcrete=check(probes),cutEdges=check(edges),protectedResults=check(protectedPaint);
  const programs=w.renderer.info.programs.length;
  c.junctionFixture={factories,geometry,probes,pixel,check,target};
  w.renderer.render(w.scene,w.camera);
  return {cutConcrete,cutEdges,protectedResults,programs};
 });
 assert(result.cutConcrete.length>3&&result.cutEdges.length>3,'Probe actual slabs and edge stripes at multiple mouths');
 assert(result.cutConcrete.every(p=>p.gap<=2),JSON.stringify(result.cutConcrete));assert(result.cutEdges.every(p=>p.gap<=2),JSON.stringify(result.cutEdges));
 assert(result.protectedResults.some(p=>p.gap>8),'Crosswalks and centre markings remain visible');
 await page.screenshot({path:dir+'/wide.png'});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);await page.evaluate(()=>{const w=campaign.world;w.controls.target.set(-1600,320,w.field.heightAt(-1600,320));w.camera.position.copy(w.controls.target).add({x:0,y:-190,z:440});w.controls.update();w.update(campaign.mission,new Set(),0);});await page.screenshot({path:dir+'/narrow.png'});
 const restored=await page.evaluate(()=>{
  const c=campaign,w=c.world,t=c.junctionFixture;
  for(const f of t.factories)for(const road of f.accessRoads)road.width=14;w.update(c.mission,new Set(),0);
  const narrowed=t.check(t.probes);
  for(const f of t.factories)f.hp=0;w.update(c.mission,new Set(),0);
  const result={narrowed,probes:t.check(t.probes),geometryUnchanged:w.scene.getObjectByName('old_concrete_sites').geometry.uuid===t.geometry,programs:w.renderer.info.programs.length};t.target.dispose();return result;
 });
 assert(restored.narrowed.some(p=>p.gap>8),'Changing only road width refreshes the junction footprint');
 assert(restored.geometryUnchanged);assert(restored.probes.some(p=>p.gap>8),'Deleting roads restores the original paving');assert.deepEqual(errors,[]);
 fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/road-junctions.json',JSON.stringify({url,result,restored,errors},null,2));
 console.log(JSON.stringify({pass:true,concreteProbes:result.cutConcrete.length,edgeProbes:result.cutEdges.length,protectedPaint:result.protectedResults.filter(p=>p.gap>8).length,restored:restored.probes.filter(p=>p.gap>8).length,geometryUnchanged:restored.geometryUnchanged,programs:[result.programs,restored.programs]}));
}finally{await browser.close();}
