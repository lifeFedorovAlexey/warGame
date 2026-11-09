import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),folder='campaign/previews/opening-salvage';fs.mkdirSync(folder,{recursive:true});
if(fs.existsSync('tools/.runtime-media/playwright'))process.env.PLAYWRIGHT_BROWSERS_PATH=fs.realpathSync('tools/.runtime-media/playwright');
const {chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
const results=[];
try{
 for(const [name,viewport] of [['desktop',{width:1920,height:1080}],['narrow',{width:390,height:844}]]){
  const context=await browser.newContext({viewport,...(name==='desktop'?{recordVideo:{dir:folder,size:{width:1280,height:720}}}:{})});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
  await page.addInitScript(()=>localStorage.setItem('warGame.fieldRadio','off'));
  await page.goto('http://127.0.0.1:8766/review/opening-salvage-'+Date.now()+'/campaign/');
  await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});
  await page.evaluate(()=>{campaign.renderSuspended=true;});await page.locator('#begin').click();
  const initial=await page.evaluate(()=>{
   const {mission:m,world:w}=campaign,units=m.state.units.filter(u=>u.owner==='rai');
   window.openingReview={position:w.camera.position.clone(),target:w.controls.target.clone()};
   const x=units.reduce((sum,u)=>sum+u.x,0)/units.length,y=units[0].y,z=w.field.heightAt(x,y);
   w.controls.target.set(x,y,z);w.camera.position.set(x+15,y-160,z+(innerWidth<600?350:220));w.controls.update();w.update(m,new Set(),0);
   return units.map(u=>({id:u.id,x:u.x,y:u.y,hp:u.hp}));
  });
  assert.equal(new Set(initial.map(u=>u.y)).size,1);assert.equal(initial.length,5);
  await page.screenshot({path:folder+'/initial-row-'+name+'.png'});
  await page.evaluate(()=>{const w=campaign.world;w.camera.position.copy(openingReview.position);w.controls.target.copy(openingReview.target);w.controls.update();campaign.renderSuspended=false;});
  // No movement command is injected: the new-game opening runs on its own.
  await page.waitForFunction(()=>{const m=campaign.mission,d=m.state.openingScene.salvageDemo,b=m.state.streetFurniture?.[d.lampId];return b&&m.state.time-b.brokenAt>.3;});
  await page.screenshot({path:folder+'/pole-falling-'+name+'.png'});
  await page.waitForFunction(()=>{const m=campaign.mission,d=m.state.openingScene.salvageDemo;return campaign.state.openingCamera==='bumper'&&m.state.time-d.installedAt>.6;});
  await page.screenshot({path:folder+'/bumper-installed-'+name+'.png'});
  const demo=await page.evaluate(()=>{
   const m=campaign.mission,d=m.state.openingScene.salvageDemo,u=m.entity(d.vehicleId),p=campaign.world.screen(u,6);
   return {vehicle:u.id,hp:u.hp,maxHp:u.maxHp,installed:!!u.damage?.parts?.[26]?.installed,screen:p,width:innerWidth,height:innerHeight,broken:Object.keys(m.state.streetFurniture)};
  });
  assert.equal(demo.vehicle,initial[0].id);assert(demo.installed);assert.equal(demo.maxHp,400);assert.equal(demo.broken.length,1);
  assert(demo.screen.x>30&&demo.screen.x<demo.width-30&&demo.screen.y>70&&demo.screen.y<demo.height-150,'First vehicle is visible during the upgrade');
  await page.waitForFunction(()=>campaign.state.openingCamera==='drive');
  await page.screenshot({path:folder+'/builder-drive-'+name+'.png'});
  await page.waitForFunction(()=>campaign.state.active,null,{timeout:60000});await page.locator('#pause').click();
  const final=await page.evaluate(()=>{
   const m=campaign.mission,s=m.state.openingScene,u=m.entity(s.salvageDemo.vehicleId);
   return {signCompleted:m.entity(s.signId).completed,handedOver:s.handedOver,status:s.salvageDemo.status,car:{x:u.x,y:u.y},park:s.salvageDemo.park,broken:Object.keys(m.state.streetFurniture),stock:m.state.salvage.items.length};
  });
  assert(final.signCompleted&&final.handedOver);assert.equal(final.status,'done');assert.equal(final.broken.length,1);assert.equal(final.stock,0);
  assert(Math.hypot(final.car.x-final.park.x,final.car.y-final.park.y)<4);
  await page.screenshot({path:folder+'/handoff-'+name+'.png'});
  const crossings=await page.evaluate(()=>{
   const {mission:m,world:w}=campaign,start=w.field.gridToWorld(m.config.startGrid),vertices=w.scene.getObjectByName('street_markings').geometry.attributes.position,rects=[];
   for(let i=0;i<vertices.count;i+=6){let xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity;for(let k=0;k<6;k++){const x=vertices.getX(i+k),y=vertices.getY(i+k);xmin=Math.min(xmin,x);xmax=Math.max(xmax,x);ymin=Math.min(ymin,y);ymax=Math.max(ymax,y);}rects.push({x:(xmin+xmax)/2,y:(ymin+ymax)/2,w:xmax-xmin,d:ymax-ymin});}
   const main=rects.filter(r=>Math.abs(r.x-(start.x-28))<.1&&Math.abs(r.y-start.y)<13);
   const factory=w.field.gridToWorld(m.config.baseSites.find(s=>s.kind==='factory').grid),branch=rects.filter(r=>Math.abs(r.y-(start.y+26))<.1&&Math.abs(r.x-factory.x)<13);
   w.controls.target.set(start.x-50,start.y+20,w.field.heightAt(start.x-50,start.y+20));w.camera.position.set(start.x-50,start.y-100,w.controls.target.z+(innerWidth<600?260:150));w.controls.update();
   return {main,branch};
  });
  assert.equal(crossings.main.length,6);assert.equal(crossings.branch.length,5);
  assert(crossings.main.every(r=>r.w>r.d*5),'Main street bars follow traffic');assert(crossings.branch.every(r=>r.d>r.w*5),'Branch street bars follow traffic');
  await page.screenshot({path:folder+'/crosswalks-'+name+'.png'});
  await page.evaluate(()=>localStorage.setItem('warGame.alpha.mission01.v1',campaign.mission.save()));
  await page.reload();await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});await page.locator('#resume-save').click();await page.waitForFunction(()=>campaign.state.active);
  assert.equal(await page.evaluate(()=>campaign.state.openingCamera),null,'Loading a completed opening never drives the first car again');
  assert.deepEqual(errors,[]);results.push({viewport,initial,demo,final,crossings,errors});
  const video=page.video();await page.close();await context.close();if(video)await video.saveAs(folder+'/automatic-opening.webm');
 }
 fs.writeFileSync(folder+'/checks.json',JSON.stringify(results,null,2));
 console.log('PASS: one initial row, automatic first-car impact/pickup/bumper, builder continuation, clear crossing, correct zebra orientations, save restore, desktop and narrow');
}finally{await browser.close();}
