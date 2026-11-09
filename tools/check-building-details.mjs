import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire,registerHooks} from 'node:module';
import * as T from '../demo/vendor/three.module.js';
registerHooks({resolve(specifier,context,next){return next(specifier==='three'?new URL('../demo/vendor/three.module.js',import.meta.url).href:specifier,context);}});
const {createBuildingPrefab}=await import('../campaign/prefabs.js');

const before=process.argv.includes('--before');
const config=JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/gameplay.json','utf8'));
const lab=createBuildingPrefab(T,'lab',config.buildings.lab),dishBounds=new T.Box3();
lab.updateMatrixWorld(true);
lab.traverse(node=>{
  if(!node.isMesh)return;
  const positions=node.geometry.getAttribute('position'),parts=node.geometry.getAttribute('damagePart');
  for(let i=0;i<positions.count;i++)if(node.userData.damageParts[parts.getX(i)]?.name==='radar_dish')dishBounds.expandByPoint(new T.Vector3().fromBufferAttribute(positions,i).applyMatrix4(node.matrixWorld));
});
const roofTop=.35+config.buildings.lab.realSizeMetres[2]*.615+.23;
const geometry={roofTop,dishBottom:dishBounds.min.z,dishTop:dishBounds.max.z,clearance:dishBounds.min.z-roofTop};
console.log(JSON.stringify({geometry}));
if(!before){assert(geometry.clearance>.15,'Dish must clear the finished roof');assert(geometry.dishTop<=config.buildings.lab.realSizeMetres[2],'Dish stays inside the building height');}

const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const folder='campaign/previews/building-details';fs.mkdirSync(folder,{recursive:true});
try {
  const page=await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:1}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
  await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8884')+'/campaign/');
  await page.waitForFunction(()=>window.campaign?.ready,{}, {timeout:90000});
  await page.evaluate(()=>{
    const c=window.campaign,m=c.mission,w=c.world,p=w.field.gridToWorld(m.config.startGrid);
    c.renderSuspended=true;w.fixedRenderScale=true;w.renderer.setPixelRatio(1);w.minimumCameraHeight=3;w.controls.minDistance=10;w.controls.enableDamping=false;
    document.querySelector('#welcome').hidden=true;w.scene.getObjectByName('unit_health_bars').layers.disableAll();
    m.state.units=[];
    const lab=m.addStructure('lab','rai',{x:p.x+130,y:p.y+80},{completed:true,progress:1});
    m.updateFog();window.detailsReview={labId:lab.id};
  });
  for(const [name,offset] of [['roof',[0,-45,125]],['front',[90,-110,70]],['rear',[-75,95,65]]]) {
    await page.evaluate(offset=>{
      const {mission:m,world:w}=window.campaign,e=m.entity(window.detailsReview.labId),z=e.groundHeight??w.field.heightAt(e.x,e.y);
      w.controls.target.set(e.x,e.y,z+18);w.camera.position.set(e.x+offset[0],e.y+offset[1],z+offset[2]);w.controls.update();w.update(m,new Set(),1/60);
    },offset);
    await page.screenshot({path:`${folder}/lab-${before?'before-':''}${name}.png`});
  }
  if(!before) {
    await (await import('./check-rally-flag.mjs')).checkRallyFlag(page,folder);
  }
  if(process.argv.includes('--export-lab')) {
    const result=await page.evaluate(async config=>{
      const T=await import('three'),{createBuildingPrefab}=await import('./prefabs.js'),{createProductionExporter}=await import('../demo/production-kit.js');
      const root=createBuildingPrefab(T,'lab',config.buildings.lab);root.updateMatrixWorld(true);
      const bounds=new T.Box3().setFromObject(root);
      return {bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},exported:await createProductionExporter({lab:root},0)()};
    },config);
    const bytes=Buffer.from(result.exported.files[0].base64,'base64');
    const validation=await require('gltf-validator').validateBytes(new Uint8Array(bytes),{uri:'lab.glb'});
    assert.equal(validation.issues.numErrors,0,JSON.stringify(validation.issues));
    assert.equal(validation.issues.numWarnings,0,JSON.stringify(validation.issues));
    const directory='assets/blueprints/buildings/lab',module=JSON.parse(fs.readFileSync(directory+'/module.json','utf8'));
    module.measuredBounds=result.bounds;module.geometry=result.exported.report[0];module.validation={errors:0,warnings:0};
    fs.writeFileSync(directory+'/prototype.glb',bytes);
    fs.writeFileSync(directory+'/module.json',JSON.stringify(module,null,2)+'\n');
    const manifestPath='assets/blueprints/buildings/manifest.json',manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
    Object.assign(manifest.buildings.find(b=>b.id==='lab'),{triangles:module.geometry.triangles,bytes:bytes.length});
    fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
    console.log(JSON.stringify({labExport:{bytes:bytes.length,triangles:module.geometry.triangles,errors:0,warnings:0}}));
  }
  assert.deepEqual(errors,[]);
  fs.mkdirSync('campaign/reports',{recursive:true});
  fs.writeFileSync(`campaign/reports/building-details${before?'-before':''}.json`,JSON.stringify({geometry,errors},null,2));
} finally {await browser.close();}
