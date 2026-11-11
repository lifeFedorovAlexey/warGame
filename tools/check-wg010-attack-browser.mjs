import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH??'C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dir='campaign/previews/wg010';fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.BROWSER_PATH??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--mute-audio',...(process.env.WARGAME_HARDWARE?['--use-angle=d3d11']:['--enable-unsafe-swiftshader','--use-angle=swiftshader'])]});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{for(const key of ['fieldRadio','fieldStoryVoice'])localStorage.setItem('warGame.'+key,'off');localStorage.setItem('warGame.fieldSound','on');window.__attackSoundStarts=0;const start=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args){if(this.buffer&&Math.abs(this.buffer.duration-1.8)<.02)window.__attackSoundStarts++;return start.apply(this,args);};});
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8798')+'/campaign/?mission=m02');
 await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:120000});await page.locator('#begin').click();
 await page.waitForFunction(()=>campaign.state.active&&!campaign.state.openingPlaying,null,{timeout:120000});
 await page.locator('#pause').click();
 await page.waitForFunction(()=>campaign.drivingAudio.running,null,{timeout:10000});
 await page.waitForTimeout(1500);
 assert.equal(await page.locator('#attack-overlay').count(),0,'No overlay is allocated before an attack');
 for(const [index,[width,height,name]] of [[1440,900,'desktop'],[844,390,'landscape'],[667,375,'small']].entries()){
  await page.setViewportSize({width,height});
  const points=await page.evaluate(i=>{
   const {mission:m,world}=campaign,base=m.state.units.find(u=>u.owner==='rai'&&u.hp>0),enemy=m.state.units.find(u=>u.owner==='scavs'&&u.hp>0);
   const center={x:base.x+i*300,y:base.y},a=m.addUnit('bukhanka','rai',{x:center.x-60,y:center.y}),b=m.addUnit('bukhanka','rai',{x:center.x+60,y:center.y});
   world.centre(center,700);m.damage(a,1,enemy);m.damage(b,1,enemy);campaign.advance(0);return [a,b].map(({x,y})=>({x,y}));
  },index);
  if(index===0)assert.equal(await page.evaluate(()=>window.__attackSoundStarts),1,'Concurrent attacks produce one siren');
  await page.waitForFunction(()=>{const c=document.querySelector('#attack-overlay');return c&&getComputedStyle(c).display!=='none';},null,{timeout:15000});
  await page.waitForFunction(points=>{const c=document.querySelector('#attack-overlay'),r=c.getBoundingClientRect(),ctx=c.getContext('2d'),scale=c.width/r.width;return points.every(p=>{const s=campaign.world.screen(p,0),x=Math.round((s.x-r.left)*scale),y=Math.round((s.y-r.top)*scale),area=ctx.getImageData(Math.max(0,x-40),Math.max(0,y-40),80,80).data;let red=0;for(let i=0;i<area.length;i+=4)if(area[i]>180&&area[i+1]<120&&area[i+2]<120&&area[i+3]>40)red++;return red>10;});},points,{timeout:15000});
  const sample=await page.evaluate(points=>{
   const c=document.querySelector('#attack-overlay'),r=c.getBoundingClientRect(),ctx=c.getContext('2d'),scale=c.width/r.width;
   return {pointer:getComputedStyle(c).pointerEvents,marks:points.map(p=>{const s=campaign.world.screen(p,0),x=Math.round((s.x-r.left)*scale),y=Math.round((s.y-r.top)*scale),size=40,area=ctx.getImageData(Math.max(0,x-size),Math.max(0,y-size),size*2,size*2).data;let red=0;for(let i=0;i<area.length;i+=4)if(area[i]>180&&area[i+1]<120&&area[i+2]<120&&area[i+3]>40)red++;return {red,screen:s};})};
  },points);
  assert.equal(sample.pointer,'none');assert(sample.marks.every(m=>m.red>10),JSON.stringify(sample));
  assert(await page.locator('#pause').isVisible());await page.screenshot({path:`${dir}/${name}.png`});console.log(name,JSON.stringify(sample));
 }
 await page.waitForTimeout(5500);await page.waitForFunction(()=>getComputedStyle(document.querySelector('#attack-overlay')).display==='none',null,{timeout:15000});
 assert.deepEqual(errors,[]);console.log('PASS: real mission attack events, one siren, simultaneous markers, desktop and mobile landscape, expiry, click-through');
}finally{await browser.close();}
