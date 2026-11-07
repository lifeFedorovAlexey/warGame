import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {Mission} from '../campaign/mission.js';
import {createHeightfield} from '../demo/map-route.js';
import {shapeMesaRims} from '../demo/mesa-shaping.js';
import {refineRoadHeightfield} from '../demo/road-heightfield.js';
import {applyRoadGrades} from '../demo/road-grading.js';

const json=path=>JSON.parse(fs.readFileSync(path,'utf8'));
const config=json('assets/campaign/alpha/mission01/gameplay.json');
const original=createHeightfield(json('assets/maps/alpha/heightfield.json'));
shapeMesaRims(original);
const field=refineRoadHeightfield(original);
applyRoadGrades(field,json('assets/maps/alpha/roads.json'));
const start=field.gridToWorld(config.startGrid),results=[];

function fixture(kind,rotation=0) {
  const mission=new Mission(config,field);
  const worker=mission.state.units.find(u=>u.owner==='rai'&&u.kind==='builder');
  mission.state.units=[worker];
  const point={x:start.x+120,y:start.y+80};
  const target=mission.addStructure(kind,'rai',point,{completed:true,progress:1,rotation,groundHeight:field.heightAt(point.x,point.y)});
  if(rotation===Math.PI/2)[target.halfWidth,target.halfDepth]=[target.halfDepth,target.halfWidth];
  target.hp=Math.floor(target.maxHp/2);
  mission.rebuildNavigation();
  return {mission,worker,target};
}
function tick(mission,worker,target) {
  const hp=target.hp,energy=mission.state.energy;
  mission.advance(.1);
  if(target.hp>hp){
    assert(worker.builderWorking&&worker.task?.type==='repair','Health needs an active repair beam');
    assert(worker.builderContact?.every(Number.isFinite),'Repair beam has a real contact');
    assert(Math.hypot(worker.x-worker.previousX,worker.y-worker.previousY)<1e-8,'Builder is stationary while repairing');
    assert(mission.state.energy<energy,'Repair consumes energy');
  }
}
for(const kind of Object.keys(config.buildings)) {
  const {mission,worker,target}=fixture(kind,kind==='lab'?Math.PI/2:0);
  const initialHp=target.hp;
  assert(mission.order([worker.id],'repair',target).ok,kind+' accepts repair');
  assert(worker.path.length>0,kind+' requires an approach');
  for(let i=0;i<1200&&target.hp<target.maxHp;i++)tick(mission,worker,target);
  assert.equal(target.hp,target.maxHp,kind+' repairs completely '+JSON.stringify({worker:{x:worker.x,y:worker.y,heading:worker.heading,path:worker.path,task:worker.task,projector:worker.projector},target:{x:target.x,y:target.y,groundHeight:target.groundHeight},aim:mission.projectorAim(worker,target),canWork:mission.canWorkHere(worker,target)}));
  mission.advance(.1);
  assert.equal(worker.task,null,'Completed repair clears the order');
  results.push({kind,from:initialHp,to:target.hp,seconds:mission.state.time});
}
{
  const {mission,worker,target}=fixture('factory');
  assert(mission.order([worker.id],'repair',target).ok);
  mission.state.energy=0;
  for(let i=0;i<400&&!worker.builderContact;i++)tick(mission,worker,target);
  assert(worker.builderContact,'Builder arrives even without repair energy');
  const hp=target.hp;
  mission.advance(2);assert.equal(target.hp,hp,'No free healing without energy');
  mission.state.energy=300;
  mission.load(mission.save());
  const restoredWorker=mission.entity(worker.id),restoredTarget=mission.entity(target.id);
  for(let i=0;i<30&&restoredTarget.hp===hp;i++)tick(mission,restoredWorker,restoredTarget);
  assert(restoredTarget.hp>hp,'Saved building repair resumes');
  mission.stop([worker.id]);const stoppedHp=restoredTarget.hp;
  mission.advance(2);assert.equal(restoredTarget.hp,stoppedHp,'Stop interrupts repair');
  assert(!mission.order([worker.id],'repair',mission.state.buildings.find(b=>b.owner==='scavs')).ok,'Enemy buildings cannot be repaired');
}
console.log(JSON.stringify({buildings:results,energyGate:true,saveLoad:true,stop:true}));

if(process.argv.includes('--browser')) {
  const require=createRequire(import.meta.url);
  const {chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
  console.log('browser started');
  const folder='campaign/previews/building-repair';fs.mkdirSync(folder,{recursive:true});
  try {
    const page=await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:1}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
    await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8884')+'/campaign/');
    await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});
    console.log('campaign ready');
    await page.locator('#begin').click();
    await page.locator('#pause').click();
    const click=await page.evaluate(()=>{
      const c=window.campaign,m=c.mission,w=c.world,p=w.field.gridToWorld(m.config.startGrid);
      c.renderSuspended=true;c.radio.setEnabled(false);
      const worker=m.state.units.find(u=>u.owner==='rai'&&u.kind==='builder');m.state.units=[worker];
      const point={x:p.x+120,y:p.y+80};
      const target=m.addStructure('factory','rai',point,{completed:true,progress:1,groundHeight:w.field.heightAt(point.x,point.y)});target.hp=700;
      m.rebuildNavigation();m.updateFog();c.select([worker.id]);
      w.controls.enableDamping=false;w.fixedRenderScale=true;w.renderer.setPixelRatio(1);
      w.controls.target.set(target.x-15,target.y-30,target.groundHeight+10);
      w.camera.position.set(target.x+200,target.y-300,target.groundHeight+280);w.controls.update();
      w.update(m,new Set(c.selected),1/60);
      window.repairReview={worker:worker.id,target:target.id};
      return w.screen(target,22);
    });
    await page.mouse.click(click.x,click.y,{button:'right'});
    assert.equal(await page.evaluate(()=>window.campaign.mission.entity(repairReview.worker).task?.type),'repair','Right click on a damaged building issues repair');
    assert.match(await page.locator('#hint').textContent(),/зданию/);
    const working=await page.evaluate(()=>{
      const c=window.campaign,m=c.mission,worker=m.entity(repairReview.worker),target=m.entity(repairReview.target);
      for(let i=0;i<900&&target.hp===700;i++)m.advance(.1);
      c.advance(0);c.world.update(m,new Set(c.selected),1/60);
      return {hp:target.hp,working:worker.builderWorking,contact:worker.builderContact};
    });
    assert(working.hp>700&&working.working&&working.contact,'Actual click leads to repair on the map');
    await page.evaluate(()=>{window.campaign.renderSuspended=false;});
    await page.waitForTimeout(200);
    await page.screenshot({path:folder+'/repair-desktop.png'});
    await page.setViewportSize({width:768,height:900});
    await page.waitForTimeout(150);
    await page.evaluate(()=>{const c=window.campaign;c.advance(0);c.world.update(c.mission,new Set(c.selected),1/60);});
    await page.screenshot({path:folder+'/repair-narrow.png'});
    await page.setViewportSize({width:1280,height:900});
    await page.waitForTimeout(150);
    const full=await page.evaluate(()=>{
      const c=window.campaign,m=c.mission,target=m.entity(repairReview.target);
      for(let i=0;i<400&&target.hp<target.maxHp;i++)m.advance(.1);
      c.select([target.id]);c.advance(0);c.world.update(m,new Set(c.selected),1/60);
      return {hp:target.hp,maxHp:target.maxHp};
    });
    assert.equal(full.hp,full.maxHp);
    await page.screenshot({path:folder+'/repair-complete.png'});
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({rightClick:true,working,full,errors}));
  } finally {await browser.close();}
}
