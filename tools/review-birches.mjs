import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const mapReview=process.argv.includes('--map'),dir='docs/playtest-evidence/'+(mapReview?'birches-map':'birches');fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const errors=[],report={};
try{
 for(const mission of ['m01','m02']){
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
  page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
  page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.error(m.text());}});
  await page.addInitScript(()=>{localStorage.setItem('warGame.fieldRadio','off');localStorage.setItem('warGame.fieldSound','off');});
  console.log('LOAD',mission);
  await page.goto(`http://127.0.0.1:8766/campaign/${mission==='m02'?'?mission=m02':''}`);
  await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:120000});
  await page.locator('#begin').click();
  if(mission==='m01')await page.evaluate(()=>campaign.advance(40));
  await page.waitForFunction(()=>campaign.state.active&&!campaign.state.openingPlaying,null,{timeout:120000});
  if(await page.locator('#pause').getAttribute('aria-label')!=='Продолжить')await page.locator('#pause').click();
  report[mission]=await page.evaluate(async({mapReview,mission})=>{
   const {mission:m,world:w}=campaign,T=await import('../demo/vendor/three.module.js');
   campaign.radio.dismiss();campaign.select([]);w.fixedRenderScale=1;w.renderer.setPixelRatio(1);
   m.explored.fill(255);m.visible.fill(255);m.visionSources=[{x:25,y:60,radius:200}];m.fogRevision++;
   const root=w.scene.getObjectByName('desert_dressing'),birches=root.getObjectByName('birch_trunks'),pine=root.getObjectByName('small_pines');
   const matrix=new T.Matrix4(),positions=[];
   for(let i=0;i<birches.count;i++){birches.getMatrixAt(i,matrix);const p=new T.Vector3().setFromMatrixPosition(matrix);positions.push({x:p.x,y:p.y,z:p.z});}
   const start=m.field.gridToWorld(mapReview?(mission==='m02'?[21,95]:[40,22]):m.config.startGrid);
   positions.sort((a,b)=>Math.hypot(a.x-start.x,a.y-start.y)-Math.hypot(b.x-start.x,b.y-start.y));
   const bins=Array.from({length:8},()=>[0,0,0]);let groundingError=0;
   for(const p of positions){const [x,y]=m.field.worldToGrid(p.x,p.y);bins[Math.floor(y/(127/8))][Math.floor(x/(53/3))]++;groundingError=Math.max(groundingError,Math.abs(p.z-m.field.heightAt(p.x,p.y)));}
   window.birchReview={point:positions[0]};w.centre(positions[0],mapReview?480:250);
   return{birches:birches.count,pines:pine.count,point:positions[0],birchesPerRegion:bins,groundingError,decorative:root.userData.decorative,triangles:birches.geometry.attributes.position.count/3+root.getObjectByName('small_birches').geometry.attributes.position.count/3};
  },{mapReview,mission});
  assert(report[mission].birches>0);assert(report[mission].pines>0);assert(report[mission].decorative);
  assert(report[mission].groundingError<.001);
  if(mapReview)assert(report[mission].birchesPerRegion.every(row=>row.every(n=>n>=2)));
  if(mission==='m01'&&!mapReview){
   await page.evaluate(()=>{for(const name of ['birch_trunks','small_birches'])campaign.world.scene.getObjectByName(name).visible=false;campaign.world.renderer.shadowMap.needsUpdate=true;});
   await page.waitForTimeout(700);await page.screenshot({path:`${dir}/before.png`});
   await page.evaluate(()=>{for(const name of ['birch_trunks','small_birches'])campaign.world.scene.getObjectByName(name).visible=true;campaign.world.renderer.shadowMap.needsUpdate=true;});
  }
  await page.waitForTimeout(700);await page.screenshot({path:`${dir}/${mission}-wide.png`});
  if(mapReview){
   await page.evaluate(mission=>{const w=campaign.world;w.centre(w.field.gridToWorld(mission==='m02'?[26,96]:[26,30]),2100);},mission);
   await page.waitForTimeout(700);await page.screenshot({path:`${dir}/${mission}-overview.png`});
  }else{
   await page.evaluate(()=>{const w=campaign.world,p=birchReview.point;w.controls.target.set(p.x,p.y,p.z+10);w.camera.position.set(p.x+58,p.y-80,p.z+61);w.controls.update();});
   await page.waitForTimeout(700);await page.screenshot({path:`${dir}/${mission}-close.png`});
  }
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(mapReview=>campaign.world.centre(birchReview.point,mapReview?350:230),mapReview);
  await page.waitForTimeout(700);await page.screenshot({path:`${dir}/${mission}-narrow.png`});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  console.log('CAPTURE',mission,JSON.stringify(report[mission]));await page.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(`${dir}/report.json`,JSON.stringify({missions:report,errors},null,2)+'\n');console.log('PASS real game, both missions, wide and narrow',report);
}finally{await browser.close();}
