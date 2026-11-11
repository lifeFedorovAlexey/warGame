import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const folder='campaign/previews/minimap';fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1}),errors=[];
 page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
 await page.addInitScript(()=>localStorage.setItem('warGame.fieldRadio','off'));
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8766')+'/review/minimap-'+Date.now()+'/campaign/');
 await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});await page.locator('#begin').click();
 await page.evaluate(()=>campaign.advance(40));await page.waitForFunction(()=>campaign.state.active,null,{timeout:60000});await page.locator('#pause').click();
 const setup=await page.evaluate(()=>{
  const c=campaign,m=c.mission,f=m.field;
  m.visible.fill(255);m.explored.fill(255);m.visionSources=[{x:26,y:43,radius:38}];m.fogRevision++;
  const own=m.addUnit('bukhanka','rai',f.gridToWorld([45,55]));
  const building=m.addStructure('generator','rai',f.gridToWorld([45,46]),{completed:true,progress:1});
  const enemy=m.addUnit('raider','scavs',f.gridToWorld([35,55]));
  window.miniFixture={own:own.id,building:building.id,enemy:enemy.id};
  c.select([]);c.advance(0);return miniFixture;
 });
 await page.waitForTimeout(3300);
 await page.evaluate(async()=>{
  const {minimapPosition}=await import('./minimap.js'),m=campaign.mission,canvas=document.getElementById('minimap'),p=m.field.gridToWorld([49,20]),[x,y]=minimapPosition(m.field,p,canvas.width,canvas.height,m.state.bounds);
  window.miniBaseBackground=Array.from(canvas.getContext('2d').getImageData(Math.floor(x),Math.floor(y),1,1).data);
  miniFixture.base=m.addStructure('camp-core','scavs',p,{completed:true,progress:1}).id;
 });await page.waitForTimeout(250);
 const colors=await page.evaluate(async()=>{
  const {MINIMAP_COLORS}=await import('./minimap-alerts.js'),{minimapPosition}=await import('./minimap.js'),canvas=document.getElementById('minimap'),ctx=canvas.getContext('2d');
  const result={};for(const [key,id] of Object.entries(miniFixture)){
   const e=campaign.mission.entity(id),[x,y]=minimapPosition(campaign.world.field,e,canvas.width,canvas.height,campaign.mission.state.bounds),p=ctx.getImageData(Math.floor(x),Math.floor(y),1,1).data;
   result[key]='#'+Array.from(p).slice(0,3).map(v=>v.toString(16).padStart(2,'0')).join('');
  }
  const sample=document.createElement('canvas');sample.width=sample.height=1;const blend=sample.getContext('2d');
  blend.fillStyle='rgb('+miniBaseBackground.slice(0,3).join(',')+')';blend.fillRect(0,0,1,1);blend.fillStyle=MINIMAP_COLORS.enemyBuilding;blend.fillRect(0,0,1,1);
  const base='#'+Array.from(blend.getImageData(0,0,1,1).data).slice(0,3).map(v=>v.toString(16).padStart(2,'0')).join('');
  return {actual:result,expected:{own:MINIMAP_COLORS.friendlyUnit,building:MINIMAP_COLORS.friendlyBuilding,enemy:MINIMAP_COLORS.enemyUnit,base},enemyBuildingOpacity:parseInt(MINIMAP_COLORS.enemyBuilding.slice(7),16)/255};
 });await page.screenshot({path:folder+'/01-colors-desktop.png'});assert.deepEqual(colors.actual,colors.expected);
 const artifact=await page.evaluate(()=>{const c=campaign,m=c.mission,a={id:m.id('a'),key:'flamethrower',...m.field.gridToWorld([30,60]),collected:false};m.state.artifacts.push(a);c.advance(0);return a;});
 await page.waitForTimeout(350);assert.match(await page.locator('#toast').textContent(),/Обнаружен артефакт/);await page.screenshot({path:folder+'/02-artifact-desktop.png'});await page.locator('#minimap').screenshot({path:folder+'/artifact-closeup.png'});
 const blueOutside=()=>page.evaluate(async({x,y})=>{const {minimapPosition}=await import('./minimap.js'),canvas=document.getElementById('minimap'),rect=canvas.getBoundingClientRect(),scale=canvas.width/rect.width,[cx,cy]=minimapPosition(campaign.world.field,{x,y},canvas.width,canvas.height,campaign.mission.state.bounds),ctx=canvas.getContext('2d'),p=ctx.getImageData(0,0,canvas.width,canvas.height).data;let count=0;
  for(let yy=0;yy<canvas.height;yy++)for(let xx=0;xx<canvas.width;xx++){const d=Math.hypot(xx-cx,yy-cy)/scale,i=(yy*canvas.width+xx)*4;if(d>4&&d<12&&p[i+2]>p[i]*1.4&&p[i+2]>p[i+1]*1.15)count++;}return count;
 },artifact);
 assert(await blueOutside()>0,'Artifact cross is visible beyond the permanent diamond');await page.waitForTimeout(3100);assert.equal(await blueOutside(),0,'Blue cross expires after three seconds');
 await page.evaluate(()=>{const c=campaign,m=c.mission;m.state.oilLinked=1;m.state.powered=true;c.advance(0);});await page.waitForTimeout(350);
 assert.match(await page.locator('#toast').textContent(),/Новая цель/);await page.screenshot({path:folder+'/03-objective-desktop.png'});
 await page.evaluate(()=>{const c=campaign,m=c.mission;m.damage(m.entity(miniFixture.building),1,m.entity(miniFixture.enemy));c.advance(0);});await page.waitForTimeout(350);
 assert(!/под огнём/.test(await page.locator('#toast').textContent()));await page.screenshot({path:folder+'/04-attack-desktop.png'});
 const at=async grid=>page.evaluate(async grid=>{const {minimapPosition}=await import('./minimap.js'),r=document.getElementById('minimap').getBoundingClientRect(),[x,y]=minimapPosition(campaign.world.field,campaign.world.field.gridToWorld(grid),r.width,r.height,campaign.mission.state.bounds);return {x:r.left+x,y:r.top+y};},grid);
 const click=async(grid,button='right')=>{const p=await at(grid);await page.mouse.click(p.x,p.y,{button});};
 await page.evaluate(()=>{const c=campaign,u=c.mission.state.units.find(u=>u.owner==='rai'&&u.kind==='bukhanka');c.select([u.id]);});
 const camera=()=>page.evaluate(()=>campaign.world.controls.target.toArray());
 const before=await camera();await click([22,52]);
 let order=await page.evaluate(()=>campaign.mission.state.commandOrders.at(-1));assert.equal(order.action,'move');assert.deepEqual(await camera(),before,'Right-click issues an order without moving the camera');
 const movement=await page.evaluate(()=>{const c=campaign,u=c.mission.entity(c.selected[0]),start={x:u.x,y:u.y};for(let i=0;i<20;i++)c.advance(.1);return Math.hypot(u.x-start.x,u.y-start.y);});
 assert(movement>2,'The vehicle actually starts driving after a minimap order');
 const revision=order.revision;await click([26,46],'left');assert.notDeepEqual(await camera(),before);assert.equal(await page.evaluate(()=>campaign.mission.state.commandOrders.at(-1).revision),revision,'Left-click pans without a command');
 await page.locator('#attack-order').click();await click([24,48],'right');order=await page.evaluate(()=>campaign.mission.state.commandOrders.at(-1));assert.equal(order.action,'attack-move');assert.equal(await page.evaluate(()=>campaign.state.orderMode),'attack');
 const targetGrid=await page.evaluate(()=>{const m=campaign.mission;m.visible.fill(255);m.explored.fill(255);m.visionSources=[{x:26,y:43,radius:38}];m.fogRevision++;const e=m.entity(miniFixture.enemy);return m.field.worldToGrid(e.x,e.y);});
 await click(targetGrid);order=await page.evaluate(()=>campaign.mission.state.commandOrders.at(-1));assert.equal(order.action,'attack');assert.equal(order.target.id,setup.enemy);
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);await click([23,50]);assert.equal(await page.evaluate(()=>campaign.mission.state.commandOrders.at(-1).action),'attack-move');
 await page.evaluate(()=>{const c=campaign,m=c.mission;m.state.time+=7;m.damage(m.entity(miniFixture.own),1,m.entity(miniFixture.enemy));c.advance(0);});await page.waitForTimeout(350);await page.screenshot({path:folder+'/05-narrow.png'});await page.locator('#minimap').screenshot({path:folder+'/minimap-narrow.png'});
 const layout=await page.evaluate(()=>{const map=document.getElementById('minimap').getBoundingClientRect(),game=document.querySelector('#world canvas').getBoundingClientRect(),toast=getComputedStyle(document.getElementById('toast'));
  return {inside:map.left>=0&&map.right<=innerWidth&&map.bottom<=innerHeight,fullMap:game.width===innerWidth&&game.height===innerHeight,toastBackground:toast.backgroundColor,toastBorder:toast.borderTopWidth};});
 assert(layout.inside&&layout.fullMap);assert.equal(layout.toastBackground,'rgba(0, 0, 0, 0)');assert.equal(layout.toastBorder,'0px');assert.deepEqual(errors,[]);
 fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/minimap.json',JSON.stringify({colors,layout,movementAfterTwoSeconds:movement,errors,checks:['real discovery and notification','three-second cross expiration','new objective','hostile building/unit damage','right-click move without camera pan','actual vehicle movement','left-click camera without order','persistent attack-move and direct target attack','narrow-screen orders']},null,2));console.log('PASS: minimap colors, real alerts, three-second pulse, actual movement/attack orders, 1920x1080 and 390x844');
}finally{await browser.close();}
