import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH??'C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const folder='campaign/previews/pickup';fs.mkdirSync(folder,{recursive:true});fs.mkdirSync('campaign/reports',{recursive:true});
const browser=await chromium.launch({executablePath:process.env.EDGE_PATH??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8893')+'/campaign/');
 await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});
 await page.locator('#begin').click();await page.locator('#pause').click();
 const fixture=await page.evaluate(()=>{
  const c=campaign,m=c.mission,p=m.field.gridToWorld(m.config.startGrid);c.radio.setEnabled(false);
  m.state.units=[];m.state.buildings=[];m.state.camps=[];m.state.artifacts=[];m.state.salvage.items=[];m.state.pendingCinematics=[];
  const units=Array.from({length:9},(_,i)=>m.addUnit('bukhanka','rai',{x:p.x+(i%3-1)*55,y:p.y-Math.floor(i/3)*45}));
  m.addUnit('builder','rai',{x:p.x-180,y:p.y-100});
  const item={id:'test-artifact',key:'mg-tower',x:p.x,y:p.y+140,collected:false};m.state.artifacts.push(item);
  m.rebuildNavigation();m.updateFog();m.explored.fill(1);c.select(units.map(u=>u.id));c.world.centre({x:p.x,y:p.y+30},580);c.advance(0);
  window.pickupCheck={ids:units.map(u=>u.id),positions:units.map(u=>({x:u.x,y:u.y})),p};
  return {ids:pickupCheck.ids,nearest:units[1].id,item};
 });
 await page.locator('#attack-order').click();
 const clickItem=async item=>{
  const p=await page.evaluate(item=>campaign.world.screen(item,0),item);await page.mouse.click(p.x,p.y);
 };
 await clickItem(fixture.item);
 const assigned=await page.evaluate(()=>pickupCheck.ids.filter(id=>campaign.mission.entity(id).task?.artifactId));
 assert.deepEqual(assigned,[fixture.nearest]);assert.equal(await page.evaluate(()=>campaign.state.orderMode),'attack','Picking up does not disable the persistent attack mode');
 const path=await page.evaluate(id=>JSON.stringify(campaign.mission.entity(id).path),fixture.nearest);
 for(let i=0;i<4;i++)await clickItem(fixture.item);
 assert.equal(await page.evaluate(id=>JSON.stringify(campaign.mission.entity(id).path),fixture.nearest),path);
 await page.screenshot({path:folder+'/artifact-order.png'});
 await page.locator('#pause').click();
 await page.waitForFunction(()=>campaign.mission.state.artifacts[0].collected&&!campaign.mission.entity(pickupCheck.ids[1]).task,null,{timeout:60000});
 await page.locator('#pause').click();
 const artifact=await page.evaluate(()=>({time:campaign.mission.state.time,collected:campaign.mission.state.artifacts[0].collected,
  distances:pickupCheck.ids.map((id,i)=>{const u=campaign.mission.entity(id),p=pickupCheck.positions[i];return Math.hypot(u.x-p.x,u.y-p.y);})}));
 assert(artifact.distances[1]>50);assert(artifact.distances.every((d,i)=>i===1||d<.01),'Only the collector moves');
 await page.screenshot({path:folder+'/artifact-collected.png'});
 const stock=await page.evaluate(async()=>{
  const {createDamageState}=await import('./damage-state.js'),{syncFieldHp}=await import('./vehicle-salvage.js');
  const c=campaign,m=c.mission,p=pickupCheck.p;m.stop(pickupCheck.ids);
  pickupCheck.ids.forEach((id,i)=>{const u=m.entity(id),start=pickupCheck.positions[i];Object.assign(u,start,{previousX:start.x,previousY:start.y,heading:0,previousHeading:0,driveSpeed:0});});
  const equipped=m.entity(pickupCheck.ids[1]);equipped.damage=createDamageState();equipped.damage.parts[22]={installed:true,detached:false,damage:0};syncFieldHp(m,equipped);
  Object.assign(m.state.salvage,{enabled:true,wanted:['hood-guard'],recipes:['hood-guard']});
  const item={id:'test-stock',stock:'guard-stock',sourceKind:'bukhanka',sourcePart:7,sourceUnit:'test-donor',x:p.x,y:p.y+140,heading:0,bornAt:m.state.time-3,readyAt:m.state.time-1,expiresAt:m.state.time+240};
  m.state.salvage.items=[item];m.unitIndex.rebuild(m.state.units);m.rebuildNavigation();c.select(pickupCheck.ids);c.advance(0);c.world.update(m,new Set(pickupCheck.ids),1/60);return item;
 });
 await clickItem(stock);
 const moduleAssigned=await page.evaluate(()=>pickupCheck.ids.filter(id=>campaign.mission.entity(id).task?.salvageId));
 if(!moduleAssigned.length){
  await page.screenshot({path:folder+'/module-failure.png'});
  console.log(JSON.stringify(await page.evaluate(async item=>{const {pickupTarget}=await import('./pickup-orders.js'),p=campaign.world.screen(item,0);return{state:campaign.state,selected:campaign.selected,toast:document.querySelector('#toast').textContent,ground:campaign.world.ground(p.x,p.y),target:pickupTarget(campaign.mission,item),units:pickupCheck.ids.map(id=>{const u=campaign.mission.entity(id);return{id,task:u.task,path:campaign.mission.salvagePath(u,item)};})};},stock)));
 }
 assert.deepEqual(moduleAssigned,[fixture.ids[0]],'Skip the closer equipped car and choose the nearest eligible one');
 const modulePath=await page.evaluate(id=>JSON.stringify(campaign.mission.entity(id).path),moduleAssigned[0]);
 for(let i=0;i<4;i++)await clickItem(stock);
 assert.equal(await page.evaluate(id=>JSON.stringify(campaign.mission.entity(id).path),moduleAssigned[0]),modulePath);
 await page.screenshot({path:folder+'/module-order.png'});await page.locator('#pause').click();
 await page.waitForFunction(id=>!campaign.mission.state.salvage.items.length&&campaign.mission.entity(id).damage?.parts[22]?.installed&&!campaign.mission.entity(id).task,moduleAssigned[0],{timeout:60000});
 const completedAt=await page.evaluate(()=>campaign.mission.state.time);
 await page.waitForFunction(time=>campaign.mission.state.time>time+5,completedAt,{timeout:15000});
 await page.locator('#pause').click();
 const module=await page.evaluate(()=>({time:campaign.mission.state.time,remaining:campaign.mission.state.salvage.items.length,
  units:pickupCheck.ids.map((id,i)=>{const u=campaign.mission.entity(id),p=pickupCheck.positions[i];return{id,travel:Math.hypot(u.x-p.x,u.y-p.y),installed:!!u.damage?.parts[22]?.installed,hp:u.hp,task:u.task,path:u.path,detour:u.detour};})}));
 assert(module.units[0].travel>50);assert(module.units.every((u,i)=>i===0||u.travel<.01),'Eight non-collectors keep their positions');
 assert(module.units.every(u=>!u.task&&!u.path.length&&!u.detour),'No empty-item routes or repeated parking remain');
 assert.equal(module.units.filter(u=>u.installed).length,2);assert.equal(module.units[0].hp,440);
 await page.screenshot({path:folder+'/module-installed.png'});
 await page.setViewportSize({width:800,height:900});await page.screenshot({path:folder+'/narrow.png'});
 assert.deepEqual(errors,[]);
 const result={passed:true,artifact,module,collector:moduleAssigned[0],errors};
 fs.writeFileSync('campaign/reports/pickup-browser.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
