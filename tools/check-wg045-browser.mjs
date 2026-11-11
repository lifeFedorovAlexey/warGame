import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const dir='campaign/previews/playtest-WG-045/browser';fs.mkdirSync(dir,{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{for(const key of ['fieldRadio','fieldSound','fieldStoryVoice'])localStorage.setItem('warGame.'+key,'off');});
 await page.goto('http://127.0.0.1:8766/campaign/?mission=m02&navigation=1');
 await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:120000});
 await page.locator('#begin').click();
 await page.waitForFunction(()=>campaign.state.active&&!campaign.state.openingPlaying,null,{timeout:120000});
 await page.locator('#pause').click();
 const save=JSON.parse(fs.readFileSync('campaign/previews/playtest-WG-045/m02-split-hit.json','utf8'));
 await page.evaluate(data=>{
  const c=window.campaign;c.mission.load(data);c.radio.setEnabled(false);
  c.world.centre({x:-880,y:-480},550);
 },save);
 for(let i=0;i<50;i++)await page.evaluate(()=>campaign.advance(.1));
 const state=await page.evaluate(async()=>{
  const {roadDrivingLane}=await import('./road-merge.js');const m=campaign.mission;
  const rs=m.state.units.filter(u=>u.owner==='rai'&&u.combatRetreat&&u.path?.length);
  return {time:m.state.time,retreaters:rs.length,shoulder:rs.filter(u=>roadDrivingLane(m,u,u.path[0],m.config.worldScale)?.retreatShoulder).length,
   units:m.state.units.filter(u=>u.owner==='rai').map(u=>({id:u.id,x:u.x,y:u.y,hp:u.hp}))};
 });
 assert(state.retreaters>0&&state.shoulder>0,JSON.stringify(state));
 await page.evaluate(()=>{
  const c=campaign,units=c.mission.state.units.filter(u=>u.owner==='rai'&&u.hp>0);
  const centre={x:units.reduce((n,u)=>n+u.x,0)/units.length,y:units.reduce((n,u)=>n+u.y,0)/units.length};
  c.navigationDebug.setEnabled(false);c.world.centre(centre,550);
 });
 await page.screenshot({path:dir+'/desktop.png'});
 await page.setViewportSize({width:844,height:390});await page.screenshot({path:dir+'/landscape.png'});
 await page.setViewportSize({width:667,height:375});await page.screenshot({path:dir+'/landscape-small.png'});
 for(let i=0;i<80;i++)await page.evaluate(()=>campaign.advance(.1));
 const after=await page.evaluate(()=>campaign.mission.state.units.filter(u=>u.owner==='rai').map(u=>({id:u.id,x:u.x,y:u.y,hp:u.hp})));
 const moved=after.filter(u=>{const v=state.units.find(v=>v.id===u.id);return v&&Math.hypot(u.x-v.x,u.y-v.y)>10}).length;
 assert(moved>=15,'At least 15 cars must physically move: '+moved);
 assert.deepEqual(errors,[]);
 fs.writeFileSync(dir+'/result.json',JSON.stringify({time:state.time,retreaters:state.retreaters,shoulder:state.shoulder,moved,errors},null,2));
 console.log('PASS rendered m02: retreaters',state.retreaters,'shoulder',state.shoulder,'moved',moved);
}finally{await browser.close();}
