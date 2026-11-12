import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {makeMission} from './m02-fixture.mjs';
import {createM03Field} from '../campaign/mission03-terrain.js';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH??'C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dir='campaign/reports/perf-general';fs.mkdirSync(dir,{recursive:true});
const first=makeMission();first.state.pendingCinematics=[];
const expedition=makeMission(createM03Field());expedition.load(JSON.parse(fs.readFileSync('campaign/previews/m03/travel.json','utf8')));expedition.advance(185);
const snapshots=[['m01',JSON.parse(first.save())],['m03',JSON.parse(expedition.save())]],results=[];
const browser=await chromium.connectOverCDP(process.env.CDP_URL??'http://127.0.0.1:9337');
try{for(const [map,snapshot] of snapshots){
 const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.addInitScript(data=>{localStorage.setItem('warGame.alpha.autosave.v1',JSON.stringify(data));localStorage.setItem('warGame.alpha.latest-save.v1','warGame.alpha.autosave.v1');sessionStorage.setItem('warGame.alpha.map-transition.v1','resume');for(const key of ['fieldSound','fieldStoryVoice','fieldRadio'])localStorage.setItem('warGame.'+key,'off');},snapshot);
  await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8899')+'/campaign/'+(map==='m03'?'?map=m03':''));
  await page.waitForFunction(()=>window.campaign?.ready&&campaign.state.active,null,{timeout:120000});
  await page.locator('#pause').click();
  const order=await page.evaluate(()=>{
   const m=campaign.mission,w=campaign.world;
   campaign.radio.setEnabled(false);campaign.radio.dismiss();
   const unit=m.state.units.find(u=>u.owner==='rai'&&u.hp>0&&u.kind==='bukhanka'&&u.factoryVisit?.phase!=='inside');
   if(!unit)throw Error('No field vehicle');
   let goal;
   for(let i=0;i<16;i++){
    const heading=unit.heading+i*Math.PI/8,p={x:unit.x-Math.sin(heading)*90,y:unit.y+Math.cos(heading)*90};
    if(m.inBounds(p.x,p.y)&&m.vehicleMotionClear(unit,{...unit,...p},{...unit,...p})&&m.nav.findPath(unit,p)?.length){goal=p;break;}
   }
   if(!goal)throw Error('No nearby reachable destination');
   w.centre(unit,360);campaign.select([unit.id]);
   const result=m.submitOrder([unit.id],'move',goal);if(!result.ok)throw Error(result.reason);
   window.drivingSmoke={id:unit.id,goal,start:{x:unit.x,y:unit.y},time:m.state.time,wall:performance.now()};return window.drivingSmoke;
  });
  await page.locator('#pause').click();
  await page.waitForFunction(()=>{const t=window.drivingSmoke,u=campaign.mission.entity(t.id);return u&&Math.hypot(u.x-t.goal.x,u.y-t.goal.y)<5;},null,{timeout:30000});
  const movement=await page.evaluate(()=>{const t=window.drivingSmoke,u=campaign.mission.entity(t.id);return {distance:Math.hypot(u.x-t.start.x,u.y-t.start.y),remaining:Math.hypot(u.x-t.goal.x,u.y-t.goal.y),wallSeconds:(performance.now()-t.wall)/1000,simulationSeconds:campaign.mission.state.time-t.time};});
  assert(movement.distance>80);await page.locator('#pause').click();
  await page.screenshot({path:dir+'/'+map+'-wide.png'});
  await page.setViewportSize({width:844,height:390});await page.screenshot({path:dir+'/'+map+'-landscape.png'});
  const fits=await page.evaluate(()=>document.documentElement.scrollWidth===innerWidth&&document.querySelector('#world').getBoundingClientRect().height===innerHeight);
  assert(fits);assert.deepEqual(errors,[]);results.push({map,movement,viewports:[[1440,900],[844,390]],errors});
 }finally{await context.close();}
}}finally{await browser.close();}
fs.writeFileSync(dir+'/other-maps-browser.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
