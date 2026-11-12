// Frame budget census: where the frame's draw calls and CPU milliseconds go.
//
// This is a read-only measuring tool. It does not change gameplay code, saves
// or assets; it pauses the game, renders the same scene once per scene child,
// and reports the draw-call and triangle difference each child is responsible
// for. Use it before and after a performance change on the same save.
//
// Usage:
//   node tools/measure-frame-budget.mjs                     (m01 + m02)
//   node tools/measure-frame-budget.mjs --missions m02
//   node tools/measure-frame-budget.mjs --url http://127.0.0.1:8766
//
// Requires the review server: python tools/serve.py
// PLAYWRIGHT_PATH may point at another Playwright installation.
import fs from 'node:fs';
import os from 'node:os';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH??'C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const option=(name,fallback)=>process.argv.find(value=>value.startsWith('--'+name+'='))?.slice(name.length+3)??fallback;
const url=option('url',process.env.WARGAME_URL??'http://127.0.0.1:8766');
const missions=option('missions',process.env.PERF_MISSIONS??'m01,m02').split(',').filter(Boolean);
const outDir=option('out',process.env.PERF_OUT??'campaign/reports/frame-budget');
const warmFrames=24,measureFrames=60;

fs.mkdirSync(outDir,{recursive:true});

const browser=await chromium.launch({executablePath:process.env.EDGE_PATH??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
const report={generatedAt:new Date().toISOString(),url,host:{cpu:os.cpus()[0].model,logicalCpus:os.cpus().length,node:process.version},runs:[],errors:[]};
try{
 report.browser=browser.version();
 for(const mission of missions){
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
  page.on('pageerror',error=>report.errors.push(String(error.stack??error)));
  await page.addInitScript(()=>{for(const key of ['fieldSound','fieldStoryVoice','fieldRadio'])localStorage.setItem('warGame.'+key,'off');});
  await page.route('**/api/radio/published',route=>route.fulfill({json:{document:JSON.parse(fs.readFileSync('assets/radio/situations_catalog.json','utf8'))}}));
  await page.goto(url+'/campaign/?perf=1'+(mission==='m02'?'&mission=m02':''));
  await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:180000});
  await page.locator('#begin').click();
  if(mission==='m01'){
   const skip=page.locator('[data-dream=skip]');
   if(await skip.count())await skip.first().click();
   await page.evaluate(()=>{const m=campaign.mission,entity=m.entity(m.state.openingScene.signId);entity.completed=true;entity.progress=1;});
  }
  await page.waitForFunction(()=>campaign.state.active&&!campaign.state.openingPlaying,null,{timeout:180000});
  await page.locator('#pause').click();
  await page.waitForTimeout(500);
  const run=await page.evaluate(({warmFrames,measureFrames})=>{
   const world=campaign.world,scene=world.scene,renderer=world.renderer,camera=world.camera,mission=campaign.mission;
   // Same conditions as the existing benchmark harness: fixed scale, hidden overlay.
   world.fixedRenderScale=true;renderer.setPixelRatio(1);
   const overlay=document.querySelector('#performance-overlay');if(overlay)overlay.hidden=true;
   const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
   const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
   const quantile=(values,p)=>values.slice().sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*p))]??0;
   const stats=values=>({count:values.length,p50:quantile(values,.5),p95:quantile(values,.95),p99:quantile(values,.99),max:values.at(-1)??0});
   const render=()=>renderer.render(scene,camera);
   const draws=()=>({calls:renderer.info.render.calls,triangles:renderer.info.render.triangles});
   // Warm up shader variants and driver caches outside the measured window.
   renderer.shadowMap.needsUpdate=false;
   for(let i=0;i<warmFrames;i++)render();
   const mainFrames=[];
   for(let i=0;i<measureFrames;i++){const start=performance.now();render();mainFrames.push(performance.now()-start);}
   const mainPass=draws();
   // Shadow pass: one extra render with a forced shadow refresh.
   renderer.shadowMap.needsUpdate=true;
   render();
   const withShadow=draws();
   renderer.shadowMap.needsUpdate=false;
   render();
   // Per-category census: hide one direct scene child, measure the difference.
   const categories=[];
   for(const child of scene.children){
    if(!child.visible)continue;
    const before=draws();
    child.visible=false;
    render();
    const after=draws();
    child.visible=true;
    let meshes=0,materials=new Set(),casters=0;
    child.traverse(object=>{
     if(object.isMesh||object.isPoints||object.isLine){
      meshes++;
      const list=Array.isArray(object.material)?object.material:[object.material];
      for(const material of list)if(material)materials.add(material);
      if(object.castShadow&&object.visible)casters++;
     }
    });
    render();
    categories.push({name:child.name||child.type,type:child.type,calls:before.calls-after.calls,triangles:before.triangles-after.triangles,meshes,materials:materials.size,casters});
   }
   render();
   // Scene census: object, material and program counts.
   let meshes=0,instanced=0,points=0,lines=0,visibleMeshes=0,casters=0,objects=0;
   const materials=new Set(),geometries=new Set();
   scene.traverse(object=>{
    objects++;
    if(object.castShadow&&object.visible)casters++;
    if(!(object.isMesh||object.isPoints||object.isLine))return;
    if(object.isInstancedMesh)instanced++;else if(object.isMesh)meshes++;else if(object.isPoints)points++;else lines++;
    if(!object.visible)return;
    visibleMeshes++;
    const list=Array.isArray(object.material)?object.material:[object.material];
    for(const material of list)if(material)materials.add(material);
    if(object.geometry)geometries.add(object.geometry);
   });
   // Simulation cost: fixed steps at the game's own budget, measured last so
   // earlier readings describe the scene the player sees on load.
   const simulateMs=[];
   for(let i=0;i<measureFrames;i++){const start=performance.now();mission.advance(1/60,{budgetMs:5});simulateMs.push(performance.now()-start);}
   // Whole-frame cost: world.update renders once per call.
   const worldMs=[];
   for(let i=0;i<measureFrames;i++){const start=performance.now();world.update(mission,new Set(),1/60,false,true);worldMs.push(performance.now()-start);}
   const unitKinds={},buildingKinds={};
   for(const unit of mission.state.units)unitKinds[unit.kind]=(unitKinds[unit.kind]??0)+1;
   for(const building of mission.state.buildings)buildingKinds[building.kind]=(buildingKinds[building.kind]??0)+1;
   return{
    mission:mission.state.mission??null,
    gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):null,
    viewport:[innerWidth,innerHeight],
    renderScale:renderer.getPixelRatio(),
    entities:{units:mission.state.units.length,livingUnits:mission.state.units.filter(unit=>unit.hp>0).length,buildings:mission.state.buildings.length,unitKinds,buildingKinds},
    frame:{render:stats(mainFrames),world:stats(worldMs),simulation:stats(simulateMs)},
    draws:{main:mainPass,withShadow,shadow:{calls:withShadow.calls-mainPass.calls,triangles:withShadow.triangles-mainPass.triangles}},
    census:{objects,meshes,instanced,points,lines,visibleMeshes,casters,materials:materials.size,geometries:geometries.size,programs:renderer.info.programs?.length??0,buffers:renderer.info.memory.geometries,textures:renderer.info.memory.textures},
    categories:categories.sort((a,b)=>b.calls-a.calls),
    statistics:world.statistics,
   };
  },{warmFrames,measureFrames});
  run.missionId=mission;
  report.runs.push(run);
  const file=outDir+'/frame-budget-'+mission+'.json';
  fs.writeFileSync(file,JSON.stringify(run,null,2));
  console.log('\n=== '+mission+' ('+(run.mission??'?')+') ===');
  console.log('GPU '+run.gpu+'  viewport '+run.viewport.join('×')+'  scale '+run.renderScale);
  console.log('draw calls: main '+run.draws.main.calls+' + shadow '+run.draws.shadow.calls+' = frame '+run.draws.withShadow.calls);
  console.log('triangles: main '+run.draws.main.triangles+' + shadow '+run.draws.shadow.triangles);
  console.log('frame: render p50/p95 '+run.frame.render.p50.toFixed(2)+'/'+run.frame.render.p95.toFixed(2)+' ms, world p50/p95 '+run.frame.world.p50.toFixed(2)+'/'+run.frame.world.p95.toFixed(2)+' ms, simulation p50/p95 '+run.frame.simulation.p50.toFixed(2)+'/'+run.frame.simulation.p95.toFixed(2)+' ms');
  console.log('census: materials '+run.census.materials+', programs '+run.census.programs+', geometries '+run.census.geometries+', casters '+run.census.casters+', objects '+run.census.objects);
  console.log('entities: units '+run.entities.units+' ('+run.entities.livingUnits+' alive), buildings '+run.entities.buildings);
  console.log('categories by draw calls:');
  for(const row of run.categories)if(row.calls>0)console.log('  '+String(row.calls).padStart(5)+'  '+String(row.triangles).padStart(9)+'  '+String(row.materials).padStart(4)+'  '+String(row.meshes).padStart(5)+'  '+String(row.casters).padStart(5)+'  '+row.name);
  console.log('written '+file);
  await page.close();
 }
}finally{
 fs.writeFileSync(outDir+'/frame-budget-summary.json',JSON.stringify(report,null,2));
 await browser.close();
}
if(report.errors.length){console.error('Page errors:\n'+report.errors.join('\n'));process.exitCode=1;}
