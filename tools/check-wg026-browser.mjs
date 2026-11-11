import fs from 'node:fs';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import http from 'node:http';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const folder='docs/playtest-evidence/wg026-demolition';fs.mkdirSync(folder,{recursive:true});
const server=spawn('python',['-c',"import sys;sys.path.insert(0,'tools');from serve import ReviewServer,ReviewHandler;ReviewServer(('127.0.0.1',8773),ReviewHandler).serve_forever()"],{cwd:process.cwd(),windowsHide:true,stdio:'ignore'});
let browser;const report={errors:[],scenes:[]};
try{
 for(let i=0;i<40;i++){try{await new Promise((resolve,reject)=>http.get('http://127.0.0.1:8773/campaign/',r=>{r.resume();r.on('end',resolve);}).on('error',reject));break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});page.on('pageerror',e=>report.errors.push(e.message));
 await page.addInitScript(()=>{for(const key of ['fieldRadio','fieldSound','fieldStoryVoice'])localStorage.setItem('warGame.'+key,'off');});
 await page.goto('http://127.0.0.1:8773/campaign/?mission=m02');await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:120000});await page.locator('#begin').click();await page.waitForFunction(()=>campaign.state.active&&!campaign.state.openingPlaying,null,{timeout:120000});await page.locator('#pause').click();
 const setup=await page.evaluate(()=>{
  const c=campaign,m=c.mission,base=m.state.m02.bases.east_factory;
  const members=m.state.buildings.filter(b=>b.m02Base==='east_factory'&&b.hp>0),walls=members.filter(b=>['scav-fence','scav-gate'].includes(b.kind)),buildings=members.filter(b=>!walls.includes(b));
  const last=buildings.find(b=>b.kind==='scav-store')??buildings.at(-1);
  for(const b of buildings)if(b!==last)m.damage(b,b.hp);
  for(const u of m.state.units)u.cooldown=100;
  m.updateMission();m.drainEffects();m.explored.fill(255);m.visible.fill(255);m.fogTimer=-100;
  const centre={x:members.reduce((s,b)=>s+b.x,0)/members.length,y:members.reduce((s,b)=>s+b.y,0)/members.length};
  c.select([]);c.world.fixedRenderScale=1;c.world.renderer.setPixelRatio(1);c.world.centre(centre,380);c.world.update(m,new Set(),0);
  return {last:last.id,walls:walls.map(b=>b.id),centre,save:m.save()};
 });
 for(const [name,width,height] of [['desktop',1440,900],['narrow',844,390]]){
  await page.setViewportSize({width,height});
  await page.evaluate(({save,centre})=>{const c=campaign,m=c.mission;m.load(save);m.explored.fill(255);m.visible.fill(255);m.fogTimer=-100;c.world.centre(centre,380);c.world.update(m,new Set(),0);},setup);
  await page.waitForTimeout(250);await page.screenshot({path:folder+'/last-building-'+name+'.png'});
  await page.evaluate(({last,walls})=>{
   const m=campaign.mission;m.wg026Events=[];const explode=window.wg026Explode??=m.explodeWreck.bind(m);m.explodeWreck=function(target){if(walls.includes(target.id))this.wg026Events.push(target.id);return explode(target);};
   const b=m.entity(last);m.damage(b,b.hp);m.updateMission();campaign.world.update(m,new Set(),0);
  },setup);
  await page.locator('#pause').click();
  await page.waitForFunction(ids=>ids.filter(id=>!campaign.mission.entity(id)).length>=8,setup.walls,{timeout:15000});
  await page.locator('#pause').click();await page.screenshot({path:folder+'/explosions-'+name+'.png'});
  await page.locator('#pause').click();await page.waitForFunction(ids=>ids.every(id=>!campaign.mission.entity(id)),setup.walls,{timeout:15000});await page.locator('#pause').click();
  const result=await page.evaluate(ids=>{const m=campaign.mission;return {segments:ids.length,explosions:m.wg026Events,remaining:ids.filter(id=>m.entity(id)),time:m.state.time,base:m.state.m02.bases.east_factory.state};},setup.walls);
  assert.equal(result.remaining.length,0);assert.equal(result.explosions.length,setup.walls.length);assert.equal(new Set(result.explosions).size,setup.walls.length);
  await page.screenshot({path:folder+'/after-'+name+'.png'});report.scenes.push({name,width,height,...result});
 }
 assert.deepEqual(report.errors,[]);console.log(JSON.stringify({passed:true,scenes:report.scenes.map(s=>({name:s.name,segments:s.segments,explosions:s.explosions.length}))}));
}catch(error){report.failure=String(error.stack);throw error;}
finally{fs.writeFileSync(folder+'/browser-verification.json',JSON.stringify(report,null,2));await browser?.close();server.kill();}
