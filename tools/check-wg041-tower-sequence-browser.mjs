import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH??'C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const folder='campaign/previews/playtest-WG-041/revised';fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const report={errors:[],scenarios:[]};
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 page.on('pageerror',e=>{report.errors.push(e.message);console.log('PAGE ERROR',e.message);});
 page.on('response',r=>{if(r.status()>=400)console.log('HTTP',r.status(),r.url());});
 await page.addInitScript(()=>{for(const key of ['fieldRadio','fieldSound','fieldStoryVoice'])localStorage.setItem('warGame.'+key,'off');});
 await page.goto('http://127.0.0.1:8766/campaign/?damage=1');
 await page.waitForFunction(()=>window.campaign?.damageDebug,null,{timeout:120000});
 await page.locator('#begin').click();await page.locator('[data-dream=skip]').click({timeout:60000});
 await page.evaluate(()=>{const m=campaign.mission;campaign.radio.setEnabled(false);const sign=m.entity(m.state.openingScene.signId);sign.completed=true;sign.progress=1;});
 await page.waitForFunction(()=>campaign.state.active,null,{timeout:30000});await page.locator('#pause').click();
 await page.evaluate(()=>{const c=campaign,m=c.mission,w=c.world;c.renderSuspended=true;c.damageDebug.panel.hidden=true;m.state.bounds=m.config.finalMapBounds.slice();m.state.flags.lastRevealed=true;m.rebuildNavigation();m.visible.fill(255);m.explored.fill(255);m.visionSources.push({x:63.5,y:63.5,radius:200});m.fogRevision++;m.visibleAt=m.exploredAt=()=>true;w.fixedRenderScale=1;w.renderer.setPixelRatio(1);w.controls.enableDamping=false;window.review={tick(dt=0){m.state.time+=dt;w.update(m,new Set(),dt);}};});
 for(const [site,part] of [['nw-east','tank'],['nw-east','leg_lower_-2.2_-2.2'],['nw-east','weapon'],['nw-pocket','platform'],['nw-pocket','weapon']]){
  const initial=await page.evaluate(({site,part})=>{const c=campaign,m=c.mission,w=c.world;m.state.units=[];m.state.buildings=[];m.drainEffects();w.damage.reset();const p=m.field.gridToWorld(m.config.startGrid);const b=m.addStructure('mg-tower','scavs',{x:p.x+90,y:p.y+50},{completed:true,progress:1,campId:site});window.testTower=b;c.damageDebug.view(b.id,135);review.tick();const parts=w.damage.getTemplate(b).parts;return {hp:b.hp,parts:Object.entries(parts).map(([id,p])=>({id:Number(id),name:p.name})),part};},{site,part});
  const target=initial.parts.find(p=>p.name===part);assert(target,`${site}: ${part}`);
  const key=`${site}-${part.replaceAll('.','_')}`;await page.screenshot({path:`${folder}/${key}-intact.png`});
  const hit=await page.evaluate(({id,power})=>{const result=campaign.damageDebug.hit(testTower.id,{partId:id,power,type:'shell'});review.tick();for(let i=0;i<20;i++)review.tick(.05);const t=campaign.world.damage.getTemplate(testTower);return {hit:result,hp:testTower.hp,parts:Object.entries(testTower.damage.parts).filter(([,p])=>p.detached).map(([id])=>t.parts[id]?.name)};},{id:target.id,power:part==='weapon'?300:110});
  assert(hit.hit,`${site}: real impact on ${part}`);assert(hit.hp>0,`${site}: tower survives the impact`);
  assert.deepEqual(hit.parts,[],`${site}: the live tower remains intact`);
  const shot=await page.evaluate(()=>{const m=campaign.mission,b=testTower,spec=m.config.buildings['mg-tower'];let target=null;for(const [dx,dy] of [[45,0],[-45,0],[0,45],[0,-45],[30,30],[-30,-30]]){const unit=m.addUnit('bukhanka','rai',{x:b.x+dx,y:b.y+dy});if(m.lineOfSight(b,unit)){target=unit;break;}m.state.units=m.state.units.filter(u=>u!==unit);}if(!target)return {fired:false,reason:'no clear firing line'};const before=target.hp;b.cooldown=0;const fired=m.attack(b,target,spec);return {fired,before,after:target.hp,weaponDetached:!!b.damage.parts[9]?.detached};});
  assert(shot.fired&&!shot.weaponDetached&&shot.after<shot.before,`${site}: damaged tower must shoot and damage its target`);await page.evaluate(()=>review.tick());
  await page.screenshot({path:`${folder}/${key}-partial.png`});
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(400);await page.evaluate(()=>{campaign.world.renderer.setSize(innerWidth,innerHeight);review.tick();});await page.screenshot({path:`${folder}/${key}-partial-narrow.png`});await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(400);await page.evaluate(()=>{campaign.world.renderer.setSize(innerWidth,innerHeight);review.tick();});
  const destroyed=await page.evaluate(()=>{const m=campaign.mission,w=campaign.world,b=testTower;m.damage(b,b.hp,null);review.tick();for(let i=0;i<30;i++)review.tick(.05);const template=w.damage.getTemplate(b);return {hp:b.hp,remaining:Object.entries(template.parts).filter(([id,p])=>p.detachable&&!b.damage.parts[id]?.detached).map(([,p])=>p.name)};});
  assert.equal(destroyed.hp,0,`${site}: tower can be destroyed`);assert.deepEqual(destroyed.remaining,[],`${site}: full destruction detaches the remaining parts`);
  await page.screenshot({path:`${folder}/${key}-destroyed.png`});
  report.scenarios.push({site,part,initial,hit,shot,destroyed});console.log(JSON.stringify({site,part,hit,shot,destroyed}));
 }
 const legacy=await page.evaluate(()=>{
  const c=campaign,m=c.mission,w=c.world;m.state.units=[];m.state.buildings=[];w.damage.reset();
  const p=m.field.gridToWorld(m.config.startGrid),b=m.addStructure('mg-tower','scavs',{x:p.x+90,y:p.y+50},{completed:true,progress:1,campId:'nw-east'});
  c.damageDebug.view(b.id,135);review.tick();const parts=w.damage.getTemplate(b).parts,id=name=>Number(Object.keys(parts).find(key=>parts[key].name===name));
  c.damageDebug.hit(b.id,{partId:id('tank'),power:110,type:'shell'});
  // Simulate an old save with prematurely detached tank, cover and weapon.
  for(const name of ['tank','tank_roof','weapon_mount','weapon'])b.damage.parts[id(name)]={damage:1,detached:true};
  const saved=m.save(),entityId=b.id;m.load(saved);const restored=m.entity(entityId);
  return {found:!!restored,detached:['tank','tank_roof','weapon_mount','weapon'].map(name=>[name,!!restored?.damage?.parts[id(name)]?.detached])};
 });
 assert(legacy.found&&legacy.detached.every(([,detached])=>!detached),'loading an older live tower restores its detached parts');
 report.legacy=legacy;console.log('PASS legacy save live tower restoration');
 assert.deepEqual(report.errors,[]);
}finally{fs.writeFileSync(folder+'/verification.json',JSON.stringify(report,null,2));await browser.close();}
