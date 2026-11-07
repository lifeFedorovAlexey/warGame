import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const folder='campaign/previews/combat-deployment';fs.mkdirSync(folder,{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8893')+'/campaign/');
 await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});
 await page.locator('#begin').click();await page.locator('#pause').click();
 const setup=await page.evaluate(()=>{
  const c=campaign,m=c.mission,p=m.field.gridToWorld(m.config.startGrid);c.radio.setEnabled(false);
  // Use the production field, vehicles, navigation, weapon and damage code.
  m.state.units=[];m.state.buildings=[];m.state.camps=[];m.state.pendingCinematics=[];m.updateMission=()=>{};
  const units=Array.from({length:6},(_,i)=>m.addUnit('bukhanka','rai',{x:p.x,y:p.y-20-i*30}));
  const target=m.addStructure('generator','scavs',{x:p.x,y:p.y+170},{hp:100000,maxHp:100000,completed:true,progress:1});
  m.rebuildNavigation();m.updateFog();m.explored.fill(1);c.select(units.map(u=>u.id));c.world.centre({x:p.x,y:p.y+20},600);c.advance(0);
  return {ids:units.map(u=>u.id),target:target.id,goal:{x:p.x,y:p.y+230}};
 });
 await page.screenshot({path:folder+'/column.png'});
 await page.locator('#attack-order').click();await page.locator('[data-policy=retreat][data-value=light]').click();
 const point=await page.evaluate(goal=>campaign.world.screen(goal,0),setup.goal);
 await page.mouse.click(point.x,point.y);
 const accepted=await page.evaluate(id=>({task:campaign.mission.entity(id).task,mode:campaign.state.orderMode,toast:document.getElementById('toast').textContent}),setup.ids[0]);
 assert.equal(accepted.task?.type,'attack-move',JSON.stringify({point,accepted}));
 const deployed=await page.evaluate(({ids})=>{
  const c=campaign,m=c.mission,units=ids.map(id=>m.entity(id)),shots=new Set();
  for(let i=0;i<450;i++){m.advance(.1);for(const e of m.effects)if(e.type==='shot'&&ids.includes(e.from))shots.add(e.from);m.effects=[];}
  c.advance(0);return {shots:shots.size,spread:Math.max(...units.map(u=>u.x))-Math.min(...units.map(u=>u.x)),units:units.map(u=>({id:u.id,x:u.x,y:u.y,hp:u.hp,status:u.combatDeployment?.status}))};
 },setup);
 console.log(JSON.stringify({deployed}));assert.equal(deployed.shots,6);assert(deployed.spread>60);assert(deployed.units.every(u=>u.hp===320));
 await page.screenshot({path:folder+'/deployed.png'});
 const retreat=await page.evaluate(({ids,target})=>{
  const c=campaign,m=c.mission,u=m.entity(ids[0]),enemy=m.entity(target),start={x:u.x,y:u.y};
  // Incoming weapon damage crosses the threshold chosen through the real menu.
  for(let i=0;i<8;i++){enemy.cooldown=0;m.attack(enemy,u,{range:145,damage:9,cooldown:.55});}
  for(let i=0;i<600&&u.combatRetreat?.status!=='arrived';i++){m.advance(.1);m.effects=[];}
  c.advance(0);return {status:u.combatRetreat?.status,moved:Math.hypot(u.x-start.x,u.y-start.y),hp:u.hp,distance:Math.hypot(u.x-enemy.x,u.y-enemy.y),rules:u.combatPolicy};
 },setup);
 console.log(JSON.stringify({retreat}));assert.equal(retreat.status,'arrived');assert(retreat.moved>100);assert(retreat.hp>0);
 await page.screenshot({path:folder+'/withdrawn.png'});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,errors}));
}finally{await browser.close();}
