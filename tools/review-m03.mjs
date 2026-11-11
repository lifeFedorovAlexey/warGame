import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const folder='campaign/previews/m03',snapshot=JSON.parse(fs.readFileSync(folder+'/travel.json','utf8'));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
page.on('pageerror',e=>{errors.push(e.message);console.log('pageerror',e.message);});
page.on('console',m=>{if(m.type()==='error')console.log(m.text().slice(0,350));});
try{
 await page.addInitScript(data=>{localStorage.setItem('warGame.alpha.autosave.v1',JSON.stringify(data));localStorage.setItem('warGame.alpha.latest-save.v1','warGame.alpha.autosave.v1');sessionStorage.setItem('warGame.alpha.map-transition.v1','resume');for(const k of ['fieldSound','fieldStoryVoice','fieldRadio'])localStorage.setItem('warGame.'+k,'off');},snapshot);
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8772')+'/campaign/?map=m03',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.campaign?.ready&&campaign.state.active,null,{timeout:90000});
 await page.locator('#pause').click();
 await page.evaluate(()=>{const c=campaign,m=c.mission;m.explored.fill(255);m.visible.fill(255);m.fogRevision++;c.world.fixedRenderScale=1;c.world.renderer.setPixelRatio(1);c.world.centre(m.transportSite(),680);m.advance(23);m.visible.fill(255);m.fogRevision++;});
 await page.waitForTimeout(600);await page.screenshot({path:folder+'/01-landing.png'});
 await page.evaluate(()=>{campaign.mission.advance(170);campaign.select([]);campaign.mission.visible.fill(255);campaign.mission.fogRevision++;campaign.world.centre(campaign.mission.transportSite(),570);});
 await page.waitForTimeout(600);await page.screenshot({path:folder+'/08-helipad-empty.png'});
 await page.evaluate(()=>{const w=campaign.world;w.controls.target.set(0,0,45);w.camera.position.set(2500,-450,2400);w.controls.update();});
 await page.waitForTimeout(600);await page.screenshot({path:folder+'/02-map.png'});
 await page.evaluate(()=>{const w=campaign.world,p=campaign.mission.state.m03.artifact;w.controls.target.set(p.x,p.y-28,w.field.heightAt(p.x,p.y));w.camera.position.copy(w.controls.target).add({x:210,y:-290,z:300});w.controls.update();});await page.waitForTimeout(400);await page.screenshot({path:folder+'/03-warehouse.png'});
 for(const [name,grid,distance] of [['11-eastern-stores',[37,61],460],['12-valley',[19,43],660]]){
  await page.evaluate(({grid,distance})=>{const w=campaign.world,p=w.field.gridToWorld([grid[0]+42,grid[1]+17]);w.centre(p,distance);},{grid,distance});await page.waitForTimeout(500);await page.screenshot({path:folder+'/'+name+'.png'});
 }
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>campaign.world.centre(campaign.mission.state.m03.artifact,650));await page.waitForTimeout(500);await page.screenshot({path:folder+'/13-warehouse-narrow.png'});
 for(const viewport of [{width:844,height:390},{width:667,height:375},{width:390,height:844}]){await page.setViewportSize(viewport);await page.evaluate(()=>campaign.world.centre(campaign.mission.transportSite(),innerWidth<500?850:650));await page.waitForTimeout(400);await page.screenshot({path:folder+'/04-narrow-'+viewport.width+'.png'});}
 const state=await page.evaluate(()=>({phase:campaign.mission.state.m03.phase,remaining:campaign.mission.state.m03.remaining,units:campaign.mission.state.units.length,statistics:campaign.world.statistics}));
 assert.deepEqual(errors,[]);fs.writeFileSync(folder+'/browser.json',JSON.stringify({errors,...state},null,2));console.log(JSON.stringify({errors,...state}));
}catch(error){await page.screenshot({path:folder+'/error.png'});console.log(await page.locator('body').innerText());throw error;}finally{await browser.close();}
