import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const url=process.env.WARGAME_URL??'http://127.0.0.1:8899',dir='campaign/reports/arrival-stand';fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.connectOverCDP(process.env.CDP_URL??'http://127.0.0.1:9337');
const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
try{
  await page.addInitScript(()=>{for(const key of ['fieldSound','fieldRadio','fieldStoryVoice'])localStorage.setItem('warGame.'+key,'off');});
  await page.goto(url+'/campaign/?mission=m02');await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:120000});
  const build=await (await page.request.get(url+'/api/build')).json();assert.equal(build.version,JSON.parse(fs.readFileSync('package.json','utf8')).version);
  await page.locator('#begin').click();await page.waitForFunction(()=>campaign.state.active&&!campaign.state.openingPlaying,null,{timeout:120000});
  await page.locator('#pause').click();
  const repair=await page.evaluate(async()=>{
    const {factoryPoint}=await import('/campaign/factory-garage.js'),c=campaign,m=c.mission;
    c.radio.setEnabled(false);c.radio.dismiss();m.updateMission=()=>{};m.state.energy=2000;
    m.state.units=m.state.units.filter(u=>u.owner==='rai'&&m.unitSpec(u).role==='builder').slice(0,1);
    for(const b of m.state.buildings)if(b.queue)b.queue=[];
    const f=m.state.buildings.find(b=>b.kind==='factory'&&b.owner==='rai'&&b.completed);if(!f)throw Error('No player factory');
    m.rebuildNavigation();m.visible.fill(255);m.explored.fill(255);const units=[];
    for(let row=0;row<10&&units.length<6;row++)for(const side of [0,-9,9]){
      if(units.length>=6)break;
      const p={...factoryPoint(m,f,side,-29-row*8),kind:'bukhanka',owner:'rai',heading:f.rotation??0};
      if(!m.vehicleMotionClear(p,p,p))continue;
      const u=m.addUnit('bukhanka','rai',p,{heading:p.heading});u.hp=100;units.push(u);
    }
    const ids=units.map(u=>u.id);if(!m.retreat(ids).ok)throw Error('Repair order rejected');
    for(let i=0;i<35;i++){m.advance(.1);m.finishPendingStep();m.drainEffects();m.drainEvents();}
    c.select(ids);c.world.centre(f,450);c.advance(0);
    return {count:ids.length,points:f.repairWaiting?.points.length??0,phases:units.map(u=>u.factoryVisit?.phase)};
  });
  assert.equal(repair.count,6);assert(repair.points>0);await page.waitForTimeout(150);await page.screenshot({path:dir+'/repair.png'});
  const save=fs.readFileSync('campaign/reports/dense-combat/frontage-before/initial.json','utf8');
  const battle=await page.evaluate(async saved=>{
    const {firingGroundAllowed}=await import('/campaign/firing-ground.js'),{firingPose}=await import('/campaign/firing-positions.js');
    const c=campaign,m=c.mission;m.load(saved);m.updateMission=()=>{};m.visible.fill(255);m.explored.fill(255);
    const target=m.entity(m.state.m02.bases.energy_hub.artifact.carrierId),cars=m.state.units.filter(u=>u.owner==='rai');
    let fills=0;const previous=m.recordTrafficDiagnostic;m.recordTrafficDiagnostic=e=>{if(e.event==='firing-frontage-filled')fills++;previous?.call(m,e);};
    if(!m.order(cars.map(u=>u.id),'attack',target).ok)throw Error('Attack rejected');
    let checkedGoals=0;const fired=new Set();
    for(let i=0;i<150;i++){
      m.advance(.1);m.finishPendingStep();
      for(const e of m.effects)if(e.type==='shot'&&cars.some(u=>u.id===e.from))fired.add(e.from);
      m.drainEffects();m.drainEvents();
      for(const u of cars){const d=u.combatDeployment,t=d&&m.entity(d.targetId);if(d?.goal&&t){
        checkedGoals++;if(!firingGroundAllowed(m,u,firingPose(u,d.goal,t)))throw Error('Sloping firing goal '+u.id);
      }}
    }
    c.select(cars.map(u=>u.id));c.world.centre(target,420);c.advance(0);
    return {cars:cars.length,fills,checkedGoals,fired:fired.size,deployed:cars.filter(u=>u.combatDeployment).length,targetHp:target.hp};
  },save);
  assert(battle.deployed>0);assert(battle.checkedGoals>0);assert(battle.fired>1);await page.waitForTimeout(150);await page.screenshot({path:dir+'/battle.png'});
  assert.deepEqual(errors,[]);const result={build,repair,battle,errors};fs.writeFileSync(dir+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await context.close();await browser.close();}
