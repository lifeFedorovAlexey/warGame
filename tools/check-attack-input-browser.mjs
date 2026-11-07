import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const folder='campaign/previews/attack-input';fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[],sources={},jobs=[];
page.on('pageerror',e=>errors.push(e.stack));
page.on('response',r=>{if(/\/campaign\/[^/]+\.js(?:\?|$)/.test(r.url()))jobs.push(r.body().then(b=>sources[new URL(r.url()).pathname]=createHash('sha256').update(b).digest('hex')));});
const report={at:new Date().toISOString(),cases:[]};
try{
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8893')+'/campaign/');
 await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});
 await page.evaluate(()=>campaign.radio.setEnabled(false));await page.locator('#begin').click();await page.locator('#pause').click();
 await page.evaluate(()=>{
  const c=campaign,m=c.mission;c.select(m.state.units.filter(u=>u.owner==='rai'&&u.kind==='bukhanka').map(u=>u.id));
  c.inputCheck={calls:[],events:[],atomicClicks:[],shots:[]};
  const attack=m.attack.bind(m);m.attack=(u,...args)=>{const result=attack(u,...args);if(result&&u.owner==='rai')c.inputCheck.shots.push(u.id);return result;};
  const unitState=()=>JSON.stringify(m.state.units);
  let clickBefore;
  document.addEventListener('click',e=>{if(e.target.closest?.('#attack-order'))clickBefore=unitState();},true);
  document.addEventListener('click',e=>{if(e.target.closest?.('#attack-order'))c.inputCheck.atomicClicks.push({running:!c.state.paused,unchanged:clickBefore===unitState()});});
  for(const key of ['submitOrder','order','stop','setCombatPolicy','build']){
   const fn=m[key].bind(m);m[key]=(...args)=>{c.inputCheck.calls.push({method:key,args:structuredClone(args),stack:new Error().stack});return fn(...args);};
  }
  for(const type of ['pointerdown','pointerup','click','gotpointercapture','lostpointercapture'])document.addEventListener(type,e=>{
   c.inputCheck.events.push({type,target:e.target.id||e.target.tagName,pointerId:e.pointerId,button:e.button,x:e.clientX,y:e.clientY,mode:c.state.orderMode});
  },true);
 });
 const snapshot=()=>page.evaluate(()=>({units:structuredClone(campaign.mission.state.units),selected:campaign.selected,calls:campaign.inputCheck.calls.length}));
 const run=async(name,action,{mustBeInert=true}={})=>{
  const before=await snapshot();await action();const after=await snapshot();
  const result={name,unchanged:JSON.stringify(before)===JSON.stringify(after),calls:await page.evaluate(n=>campaign.inputCheck.calls.slice(n),before.calls),mode:await page.evaluate(()=>campaign.state.orderMode)};
  result.pass=!mustBeInert||result.unchanged;report.cases.push(result);
 };
 await run('idle: Attack on, no map click',()=>page.locator('#attack-order').click());
 await run('idle: Attack off',()=>page.locator('#attack-order').click());
 await run('idle: right-click settings',()=>page.locator('#attack-order').click({button:'right'}));
 await run('idle: close settings and enable',()=>page.locator('#attack-order').click());
 // Pointer capture must not turn a map-to-HUD gesture into a ground command.
 const box=await page.locator('#attack-order').boundingBox();
 await run('short map gesture released on edge of Attack',async()=>{
  await page.mouse.move(box.x-1,box.y+box.height/2);await page.mouse.down();
  await page.mouse.move(box.x+2,box.y+box.height/2);await page.mouse.up();
 });
 await run('map drag released over Attack',async()=>{
  await page.mouse.move(box.x+box.width/2,box.y-80);await page.mouse.down();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2,{steps:5});await page.mouse.up();
 });
 await run('changing mode while map pointer held cancels old gesture',async()=>{
  await page.mouse.move(900,500);await page.mouse.down();await page.keyboard.press('KeyF');await page.mouse.up();
 });
 await run('capture lost before release cancels map gesture',async()=>{
  await page.mouse.move(900,500);await page.mouse.down();await page.mouse.move(901,500);
  await page.evaluate(()=>{const canvas=campaign.world.renderer.domElement,e=campaign.inputCheck.events.findLast(e=>e.type==='gotpointercapture');canvas.releasePointerCapture(e.pointerId);});
  await page.mouse.up();
 });
 const selected=await page.evaluate(()=>campaign.selected);
 const own=await page.evaluate(id=>campaign.world.screen(campaign.mission.entity(id)),selected[0]);
 await page.mouse.dblclick(own.x,own.y);
 assert.deepEqual((await page.evaluate(()=>campaign.selected)).sort(),selected.slice().sort(),'Double-click selection survives normal capture release');
 await run('attack remains selectable after cancelled gestures',()=>page.locator('#attack-order').click());
 const callsBefore=await page.evaluate(()=>campaign.inputCheck.calls.length);
 await page.mouse.click(box.x-2,box.y+box.height/2);
 const gapOrders=await page.evaluate(n=>campaign.inputCheck.calls.slice(n).filter(c=>c.method==='submitOrder'),callsBefore);
 assert.equal(gapOrders.length,1,'Empty HUD gap still issues exactly one ground order');assert.equal(gapOrders[0].args[1],'attack-move');
 report.cases.push({name:'empty HUD gap remains interactive map',pass:true,orders:gapOrders.length});
 await page.screenshot({path:folder+'/wide.png'});
 await page.setViewportSize({width:390,height:844});
 await run('narrow: Attack toggle',()=>page.locator('#attack-order').click());
 await page.screenshot({path:folder+'/narrow.png'});
 await page.setViewportSize({width:1920,height:1080});
 const origins=await page.evaluate(ids=>ids.map(id=>{const u=campaign.mission.entity(id);return{id,x:u.x,y:u.y};}),selected);
 await page.locator('#pause').click();
 await page.waitForFunction(origins=>origins.some(p=>{const u=campaign.mission.entity(p.id);return Math.hypot(u.x-p.x,u.y-p.y)>1;}),origins,{timeout:10000});
 await page.locator('#attack-order').click();await page.locator('#attack-order').click();
 await page.locator('#pause').click();
 const target=await page.evaluate(()=>{
  const m=campaign.mission,units=campaign.selected.map(id=>m.entity(id)),u=units[0];
  const t=m.addStructure('camp-core','scavs',{x:u.x,y:u.y+70},{completed:true,progress:1,hp:100000,maxHp:100000});
  m.rebuildNavigation();m.updateFog();m.explored.fill(1);campaign.world.centre(u,400);return t.id;
 });
 await page.locator('#attack-order').click();
 const enemy=await page.evaluate(id=>campaign.world.screen(campaign.mission.entity(id)),target);await page.mouse.click(enemy.x,enemy.y);
 await page.locator('#pause').click();
 await page.waitForFunction(()=>campaign.inputCheck.shots.length>0,null,{timeout:15000});
 await page.locator('#attack-order').click();await page.locator('#attack-order').click();
 await page.locator('#pause').click();
 const atomic=await page.evaluate(()=>campaign.inputCheck.atomicClicks);
 assert(atomic.every(c=>c.unchanged),'Button event itself must not mutate any unit during movement or combat');
 assert.equal(atomic.filter(c=>c.running).length,4);
 report.cases.push({name:'four live clicks during movement and firing',pass:true,atomic});
 await page.screenshot({path:folder+'/combat.png'});
 report.exported=await page.evaluate(async()=>typeof(await import('./vehicle-collision.js')).vehicleRadiusBound);
 assert.equal(report.exported,'function');
 report.passed=report.cases.every(c=>c.pass)&&!errors.length;
}catch(error){report.passed=false;report.failure=error.stack;await page.screenshot({path:folder+'/failure.png'}).catch(()=>{});}
finally{
 report.events=await page.evaluate(()=>campaign.inputCheck?.events).catch(()=>[]);report.errors=errors;
 await Promise.allSettled(jobs);report.sources=sources;
 fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/attack-input-browser.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({...report,sources:undefined,events:undefined},null,2));await browser.close();
}
assert(report.passed,'Attack button must not change unit orders before a map click');
