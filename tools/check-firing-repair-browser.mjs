import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {makeMission} from './m02-fixture.mjs';
import {prepareM02Diagnostic} from '../campaign/mission02-diagnostic.js';
const {chromium}=createRequire(import.meta.url)('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const url=process.env.WARGAME_URL??'http://127.0.0.1:8899',dir='campaign/reports/firing-repair-browser';fs.mkdirSync(dir,{recursive:true});
const fixture=prepareM02Diagnostic(makeMission());fixture.state.units=[];fixture.unitIndex.rebuild([]);fixture.addUnit('builder','rai',{x:-1800,y:400});
const cars=Array.from({length:7},(_,i)=>fixture.addUnit('bukhanka','rai',{x:-1216-i*32,y:-848},{heading:-Math.PI/2})),ids=cars.map(u=>u.id);
fixture.setCombatPolicy(ids,{retreat:'never'});const saved=fixture.save();
const browser=await chromium.connectOverCDP(process.env.CDP_URL??'http://127.0.0.1:9337'),context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
async function clickGround(goal,button){
  const p=await page.evaluate(goal=>{const c=campaign;
    for(const dx of [0,-8,8,-16,16])for(const dy of [0,-8,8,-16,16]){
      const point={x:goal.x+dx,y:goal.y+dy},p=c.world.screen(point,0);
      const near=[...c.mission.state.units,...c.mission.state.buildings].some(e=>e.hp>0&&!c.mission.config.buildings[e.kind]?.storyOnly&&(()=>{const s=c.world.screen(e);return s.visible&&Math.hypot(s.x-p.x,s.y-p.y)<25;})());
      if(!near&&p.visible&&document.elementFromPoint(p.x,p.y)===c.world.renderer.domElement&&!c.world.pickEntity(c.mission,p.x,p.y))return p;
    }throw Error('No unobstructed ground pixel near '+JSON.stringify(goal));
  },goal);
  await page.mouse.click(p.x,p.y,{button});return page.evaluate(()=>window.lastMouseOrder);
}
try{
  await page.addInitScript(()=>{for(const key of ['fieldSound','fieldRadio','fieldStoryVoice'])localStorage.setItem('warGame.'+key,'off');});
  await page.goto(url+'/campaign/?mission=m02&navigation');await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:120000});
  await page.locator('#begin').click();await page.waitForFunction(()=>campaign.state.active&&!campaign.state.openingPlaying,null,{timeout:120000});await page.locator('#pause').click();
  const build=await(await page.request.get(url+'/api/build')).json();
  await page.evaluate(({saved,ids})=>{
    const c=campaign,m=c.mission;c.radio.setEnabled(false);c.radio.dismiss();m.load(saved);m.updateMission=()=>{};
    m.visible.fill(255);m.explored.fill(255);m.fogRevision++;c.select(ids);c.world.centre({x:-1140,y:-832},640);c.advance(0);
    window.lastMouseOrder=null;const submit=m.submitOrder.bind(m);m.submitOrder=(...args)=>{const result=submit(...args);window.lastMouseOrder={action:args[1],target:args[2],result};return result;};
  },{saved,ids});
  await page.waitForTimeout(200);const reply=await clickGround({x:-1168,y:-848},'right');assert.equal(reply?.action,'attack-move');assert.equal(reply.result.assigned,7);
  const battle=await page.evaluate(async ids=>{
    const {firingGroundAllowed}=await import('/campaign/firing-ground.js'),{firingPose}=await import('/campaign/firing-positions.js');
    const m=campaign.mission,cars=ids.map(id=>m.entity(id)),fired=new Set(),positions=new Map(),arrived=new Set();let checked=0;
    const start=performance.now();
    for(let i=0;i<180;i++){
      m.advance(.1);m.finishPendingStep();for(const e of m.drainEffects())if(e.type==='shot'&&ids.includes(e.from))fired.add(e.from);m.drainEvents();
      for(const u of cars){const d=u.combatDeployment,t=d&&m.entity(d.targetId);if(u.hp>0&&d?.goal&&t){
        checked++;if(!firingGroundAllowed(m,u,firingPose(u,d.goal,t)))throw Error('Invalid firing support '+u.id);
        positions.set(u.id,{...d.goal});if(d.status==='arrived')arrived.add(u.id);
      }}
    }
    campaign.advance(0);return {cpuMs:performance.now()-start,seconds:18,fired:[...fired],positions:[...positions],arrived:[...arrived],checked,alive:cars.filter(u=>u.hp>0).length};
  },ids);
  fs.writeFileSync(dir+'/battle.json',JSON.stringify(battle,null,2));assert.equal(battle.fired.length,7);assert(battle.positions.length>1);assert(battle.checked>0);
  for(const [width,height] of [[1440,900],[844,390],[667,375]]){await page.setViewportSize({width,height});await page.waitForTimeout(150);await page.screenshot({path:dir+'/battle-'+width+'.png'});}
  await page.setViewportSize({width:1440,height:900});
  const repairSetup=await page.evaluate(async saved=>{
    const c=campaign,m=c.mission,{factoryPoint}=await import('/campaign/factory-garage.js');m.load(saved);m.updateMission=()=>{};m.state.energy=2000;
    m.state.units=m.state.units.filter(u=>m.unitSpec(u).role==='builder'&&u.owner==='rai');m.rebuildNavigation();m.visible.fill(255);m.explored.fill(255);m.fogRevision++;
    const f=m.state.buildings.find(b=>b.kind==='factory'&&b.owner==='rai'&&b.completed);if(!f)throw Error('Missing allied factory');
    let start,goal;
    for(const side of [0,-10,10,-20,20]){const a={...factoryPoint(m,f,side,-55),kind:'bukhanka',owner:'rai',heading:f.rotation??0},b={...factoryPoint(m,f,side,-40),kind:'bukhanka',owner:'rai',heading:f.rotation??0};
      if(m.vehicleMotionClear(a,a,a)&&m.vehicleMotionClear(a,b,b)&&m.vehiclePath(a,b)?.length){start=a;goal=b;break;}}
    if(!start)throw Error('No clear factory approach');
    const u=m.addUnit('bukhanka','rai',start,{heading:start.heading});u.hp=100;m.setCombatPolicy([u.id],{retreat:'light'});c.select([u.id]);c.world.centre(goal,500);c.advance(0);
    return {id:u.id,goal,factory:f.id};
  },saved);
  await page.waitForTimeout(200);const direct=await clickGround(repairSetup.goal,'left');assert.equal(direct?.action,'move');assert.equal(direct.result.assigned,1);
  const repair=await page.evaluate(async p=>{
    const {completedDirectMove}=await import('/campaign/combat-retreat-state.js'),m=campaign.mission,u=m.entity(p.id);let arrivedAt=null,retreatedAt=null,repairedAt=null;
    for(let i=0;i<1600;i++){
      m.advance(.1);m.finishPendingStep();m.drainEffects();m.drainEvents();
      if(completedDirectMove(u)&&arrivedAt===null)arrivedAt=m.state.time;
      if(u.combatRetreat&&retreatedAt===null)retreatedAt=m.state.time;
      if(u.hp===u.maxHp){repairedAt=m.state.time;break;}
    }campaign.advance(0);return {arrivedAt,retreatedAt,repairedAt,hp:u.hp,maxHp:u.maxHp,factory:u.factoryVisit?.factoryId,retreat:u.combatRetreat};
  },repairSetup);
  fs.writeFileSync(dir+'/repair.json',JSON.stringify(repair,null,2));assert(repair.arrivedAt!==null);assert(repair.retreatedAt>repair.arrivedAt);assert.equal(repair.hp,repair.maxHp);
  await page.screenshot({path:dir+'/repair-1440.png'});assert.deepEqual(errors,[]);
  const result={build,battle,repair,errors};fs.writeFileSync(dir+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await context.close();await browser.close();}
