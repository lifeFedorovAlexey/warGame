import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const before=process.argv.includes('--before'),dir='campaign/previews/yard-markings';fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/navigation',r=>r.fulfill({status:200,body:'{}'}));
 if(before)for(const name of ['base-yard.js','base-site-markings.js']){
  const body=execFileSync('git',['show','HEAD:campaign/'+name],{encoding:'utf8'});
  await page.route('**/campaign/'+name,r=>r.fulfill({contentType:'application/javascript',body}));
 }
 await page.addInitScript(()=>{for(const k of ['fieldSound','fieldRadio','fieldStoryVoice'])localStorage.setItem('warGame.'+k,'off');});
 await page.goto('http://127.0.0.1:8766/review/yard-markings-'+Date.now()+'/campaign/');
 await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});
 const result=await page.evaluate(async()=>{
  const {roadIntersectsSite}=await import('./factory-access.js'),c=campaign,m=c.mission,w=c.world;
  c.renderSuspended=true;c.radio.setEnabled(false);document.querySelector('#welcome').hidden=true;
  Object.assign(m.state,{units:[],buildings:[],camps:[],artifacts:[],raidReserve:[],energy:2400,storyConstruction:{enabled:false}});
  m.updateMission=()=>{};m.constructionUnlocked=()=>true;m.visible.fill(255);m.explored.fill(255);m.visionSources=[{x:63.5,y:63.5,radius:200}];m.fogRevision++;
  w.update(m,new Set(),0);const plots=w.scene.getObjectByName('building_plot_markings'),emptyCount=plots.geometry.attributes.position.count;
  const add=(kind,p,rotation=0)=>m.addStructure(kind,'rai',p,{completed:true,progress:1,rotation});
  add('generator',{x:-1728,y:272},Math.PI);for(const grid of m.config.oilFields.slice(0,2))add('derrick',w.field.gridToWorld(grid));add('lab',{x:-1440,y:432});m.rebuildNavigation();
  const factories=[];for(const [x,y] of [[-1648,464],[-1600,224],[-1304,256]]){
   const p=m.placement('factory',x,y,0,{snap:false});if(!p.ok)throw Error(p.reason);const f=add('factory',p);f.accessRoads=p.accessRoads;factories.push(f);m.rebuildNavigation();
  }
  w.fixedRenderScale=1;w.renderer.setPixelRatio(1);w.controls.enableDamping=false;w.controls.target.set(-1560,340,w.field.heightAt(-1560,340));w.camera.position.copy(w.controls.target).add({x:0,y:-160,z:480});w.controls.update();w.update(m,new Set(),0);
  function inspect(){
   const a=w.scene.getObjectByName('street_markings').geometry.attributes.position,groups=new Map();
   for(let i=0;i<a.count;i+=6){
    const xs=Array.from({length:6},(_,j)=>a.getX(i+j)),ys=Array.from({length:6},(_,j)=>a.getY(i+j));
    const l=Math.min(...xs),r=Math.max(...xs),b=Math.min(...ys),t=Math.max(...ys),width=r-l,depth=t-b;
    const horizontal=Math.abs(width-18.9)<.01&&Math.abs(depth-2.1)<.01,vertical=Math.abs(depth-18.9)<.01&&Math.abs(width-2.1)<.01;
    if(!horizontal&&!vertical)continue;
    const key=(horizontal?'x':'y')+((horizontal?(l+r):(b+t))/2).toFixed(2),g=groups.get(key)??{horizontal,left:Infinity,right:-Infinity,bottom:Infinity,top:-Infinity,count:0};
    g.left=Math.min(g.left,l);g.right=Math.max(g.right,r);g.bottom=Math.min(g.bottom,b);g.top=Math.max(g.top,t);g.count++;groups.set(key,g);
   }
   const roads=[...w.field.localRoads,...m.state.buildings.filter(f=>f.hp>0).flatMap(f=>f.accessRoads??[])];
   const crossings=[...groups.values()].map(g=>{
    const box={x:(g.left+g.right)/2,y:(g.bottom+g.top)/2,halfWidth:(g.right-g.left)/2,halfDepth:(g.top-g.bottom)/2};
    const conflicts=roads.filter(r=>g.horizontal?r.kind!=='street':Math.abs(r.points[0].x-box.x)>.1||r.kind==='street')
     .filter(r=>roadIntersectsSite(r,box,5)).map(r=>r.kind+':'+(r.direction??''));
    return {...box,stripes:g.count,conflicts};
   });
   return {crossings,plotVertices:plots.geometry.attributes.position.count};
  }
  c.markingFixture={factories,inspect,emptyCount};
  return {...inspect(),emptyCount};
 });
 await page.screenshot({path:dir+(before?'/before.png':'/after.png')});
 if(!before){
  assert.equal(result.plotVertices,0,'Occupied plots leave no survey corners across buildings or their roads');
  assert(result.crossings.length>=2);assert(result.crossings.every(c=>c.conflicts.length===0),JSON.stringify(result.crossings));
  await page.evaluate(()=>{const w=campaign.world;w.controls.target.set(-1600,336,w.field.heightAt(-1600,336));w.camera.position.copy(w.controls.target).add({x:0,y:-55,z:220});w.controls.update();w.update(campaign.mission,new Set(),0);});
  await page.screenshot({path:dir+'/junction.png'});
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);await page.evaluate(()=>{const w=campaign.world;w.camera.position.copy(w.controls.target).add({x:0,y:-120,z:350});w.controls.update();w.update(campaign.mission,new Set(),0);});await page.screenshot({path:dir+'/narrow.png'});
  const changed=await page.evaluate(()=>{
   const c=campaign,t=c.markingFixture,w=c.world,m=c.mission;
   for(const f of t.factories)for(const r of f.accessRoads)r.width+=14;w.update(m,new Set(),0);const widened=t.inspect();
   m.state.buildings=[];w.update(m,new Set(),0);const cleared=t.inspect();
   const plots=w.scene.getObjectByName('building_plot_markings'),centre=w.field.gridToWorld(m.config.baseSites[0].grid);
   plots.userData.setRoads([{width:24,points:[{x:centre.x-80,y:centre.y},{x:centre.x+80,y:centre.y}]}]);plots.userData.update([]);const roadBlocked=plots.geometry.attributes.position.count;
   plots.userData.setRoads([]);plots.userData.update([]);const restored=plots.geometry.attributes.position.count;
   return {widened,cleared,roadBlocked,restored};
  });
  assert(changed.widened.crossings.every(c=>c.conflicts.length===0),'Road-width changes relocate whole crossings');
  assert(changed.cleared.crossings.every(c=>c.conflicts.length===0));
  assert.equal(changed.cleared.plotVertices,result.emptyCount);assert(changed.roadBlocked<result.emptyCount);assert.equal(changed.restored,result.emptyCount);
  result.changed=changed;
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(dir+(before?'/before.json':'/result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({before,...result,errors}));
}finally{await browser.close();}
