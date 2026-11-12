import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {bridgeTrafficFixture} from './bridge-traffic-fixture.mjs';
const {chromium}=createRequire(import.meta.url)('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const bridgeIndex=Number(process.env.BRIDGE_INDEX??1),fixture=bridgeTrafficFixture(12,bridgeIndex),m=fixture.mission;
m.submitOrder(fixture.groups[0].map(u=>u.id),'attack-move',fixture.targets[0]);
m.submitOrder(fixture.groups[1].map(u=>u.id),'move',fixture.targets[1]);
for(let n=0;n<40;n++){m.advance(.1);m.finishPendingStep();m.drainEffects();m.drainEvents();}
const payload={saved:m.save(),ids:fixture.groups[0].map(u=>u.id),goal:fixture.targets[1],centre:fixture.centre};
const dir='campaign/reports/direct-bridge-browser-'+bridgeIndex;fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.connectOverCDP(process.env.CDP_URL??'http://127.0.0.1:9337');
const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
  await page.addInitScript(()=>{for(const key of ['fieldSound','fieldRadio','fieldStoryVoice'])localStorage.setItem('warGame.'+key,'off');});
  await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8899')+'/campaign/?mission=m02');
  await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:120000});await page.locator('#begin').click();
  await page.waitForFunction(()=>campaign.state.active&&!campaign.state.openingPlaying,null,{timeout:120000});await page.locator('#pause').click();
  await page.evaluate(p=>{
    const c=campaign,m=c.mission;c.radio.setEnabled(false);c.radio.dismiss();m.load(p.saved);m.updateMission=()=>{};
    // Match the traffic fixture: native terrain/collisions, no weapons.
    for(const spec of [...Object.values(m.config.units),...Object.values(m.config.buildings)])spec.damage=0;
    m.visible.fill(255);m.explored.fill(255);m.fogRevision++;c.select(p.ids);c.world.centre(p.centre,650);c.advance(0);
    window.lastMouseOrder=null;const submit=m.submitOrder.bind(m);m.submitOrder=(...args)=>{const result=submit(...args);window.lastMouseOrder={action:args[1],target:args[2],result};return result;};
  },payload);
  await page.waitForTimeout(250);
  const click=await page.evaluate(p=>{
    const m=campaign.mission,w=campaign.world;
    for(const dy of [0,24,-24,48,-48])for(const dx of [0,24,-24,48,-48]){
      const goal={x:p.goal.x+dx,y:p.goal.y+dy},s=w.screen(goal);
      if(!s.visible||s.x<40||s.x>innerWidth-40||s.y<50||s.y>innerHeight-110)continue;
      if(!m.nav.terrainAllowed(goal.x,goal.y)||document.elementFromPoint(s.x,s.y)!==w.renderer.domElement||w.pickEntity(m,s.x,s.y))continue;
      if(m.state.units.some(u=>Math.hypot(u.x-goal.x,u.y-goal.y)<24))continue;
      return {x:s.x,y:s.y};
    }throw Error('No empty bridge approach pixel');
  },payload);
  await page.screenshot({path:dir+'/before.png'});await page.mouse.click(click.x,click.y,{button:'left'});
  const response=await page.evaluate(()=>window.lastMouseOrder);assert.equal(response?.action,'move');assert.deepEqual(new Set(response.result.assignedIds),new Set(payload.ids));
  const result=await page.evaluate(p=>{
    const m=campaign.mission,cars=p.ids.map(id=>m.entity(id)),start=cars.map(u=>({x:u.x,y:u.y})),goal=window.lastMouseOrder.target;
    const accepted=cars.map(u=>({id:u.id,pending:u.pendingOrder?.type,proposed:u.proposedOrder?.type,revision:u.commandRevision}));
    const firstMotion=new Map();
    for(let n=0;n<600;n++){
      m.advance(.1);m.finishPendingStep();m.drainEffects();m.drainEvents();
      for(const [i,u] of cars.entries())if(!firstMotion.has(u.id)&&Math.hypot(u.x-start[i].x,u.y-start[i].y)>2)firstMotion.set(u.id,m.state.time);
    }
    campaign.advance(0);
    return {accepted,goal,units:cars.map((u,i)=>({id:u.id,displacement:Math.hypot(u.x-start[i].x,u.y-start[i].y),
      distanceBefore:Math.hypot(goal.x-start[i].x,goal.y-start[i].y),distanceAfter:Math.hypot(goal.x-u.x,goal.y-u.y),
      firstMotion:firstMotion.get(u.id),hp:u.hp,request:u.routeOrder?.request,destination:u.routeOrder?.destination,
      arrivalDistance:u.routeOrder?.destination?Math.hypot(u.x-u.routeOrder.destination.x,u.y-u.routeOrder.destination.y):null,
      retreat:!!u.combatRetreat,reason:u.navigation?.reason}))};
  },payload);
  fs.writeFileSync(dir+'/result.json',JSON.stringify({result,errors},null,2));
  assert(result.accepted.every(u=>u.pending==='move'&&!u.proposed));
  for(const u of result.units){assert(u.displacement>8,JSON.stringify(u));assert(u.distanceAfter<u.distanceBefore,JSON.stringify(u));assert(u.arrivalDistance<2.01,JSON.stringify(u));assert(!u.retreat);assert.deepEqual(u.request,{x:result.goal.x,y:result.goal.y});}
  for(const [width,height] of [[1440,900],[844,390],[667,375]]){
    await page.setViewportSize({width,height});await page.waitForTimeout(150);await page.screenshot({path:dir+'/after-'+width+'.png'});
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(dir+'/result.json',JSON.stringify({result,errors},null,2));console.log(JSON.stringify({result,errors}));
}finally{await context.close();await browser.close();}
