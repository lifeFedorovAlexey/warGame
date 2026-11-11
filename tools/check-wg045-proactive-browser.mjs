import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const dir='campaign/previews/playtest-WG-045/proactive-browser';fs.mkdirSync(dir,{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{for(const key of ['fieldRadio','fieldSound','fieldStoryVoice'])localStorage.setItem('warGame.'+key,'off');});
 await page.goto('http://127.0.0.1:8766/campaign/?mission=m02');
 await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:120000});
 await page.locator('#begin').click();
 await page.waitForFunction(()=>campaign.state.active&&!campaign.state.openingPlaying,null,{timeout:120000});
 await page.locator('#pause').click();
 const save=JSON.parse(fs.readFileSync('campaign/previews/playtest-WG-045/m02-proactive-12.json','utf8'));
 const initial=await page.evaluate(data=>{
  const c=campaign,m=c.mission;m.load(data);c.radio.setEnabled(false);
  for(const spec of Object.values(m.config.buildings))spec.damage=0;
  const u=m.state.units.find(v=>v.owner==='rai'&&v.hp>0);window.proactiveCar=u.id;c.select([u.id]);c.world.centre(u,240);
  const road=m.nav.roads.nearest(u,m.config.worldScale*8);
  return {id:u.id,x:u.x,y:u.y,retreat:!!u.combatRetreat,near:road?.distance,width:road?.width,
   activeOthers:m.state.units.filter(v=>v.owner==='rai'&&v.id!==u.id&&v.hp>0).length};
 },save);
 assert(initial.retreat&&initial.activeOthers===0&&initial.near>initial.width/2,JSON.stringify(initial));
 await page.screenshot({path:dir+'/desktop.png'});
 await page.setViewportSize({width:844,height:390});await page.screenshot({path:dir+'/landscape.png'});
 await page.setViewportSize({width:667,height:375});await page.screenshot({path:dir+'/landscape-small.png'});
 for(let i=0;i<60;i++)await page.evaluate(()=>campaign.advance(.1));
 const after=await page.evaluate(()=>{const u=campaign.mission.entity(window.proactiveCar);return {x:u.x,y:u.y,hp:u.hp,retreat:!!u.combatRetreat}});
 const moved=Math.hypot(after.x-initial.x,after.y-initial.y);
 assert(moved>25&&after.retreat,'The vehicle must continue moving: '+JSON.stringify({initial,after,moved}));
 assert.deepEqual(errors,[]);
 fs.writeFileSync(dir+'/result.json',JSON.stringify({initial,after,moved,errors},null,2));
 console.log('PASS: lone retreat left the road before meeting traffic and moved',moved.toFixed(1),'m');
}finally{await browser.close()}
