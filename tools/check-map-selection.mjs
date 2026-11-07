import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const folder='campaign/previews/map-selection';fs.mkdirSync(folder,{recursive:true});
try {
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8884')+'/campaign/');
  await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});
  await page.locator('#begin').click();await page.locator('#pause').click();
  const fixture=await page.evaluate(()=>{
    const c=window.campaign,m=c.mission,p=m.field.gridToWorld(m.config.startGrid);
    c.radio.setEnabled(false);
    const group=m.state.units.filter(u=>u.owner==='rai'&&u.kind==='bukhanka');
    while(group.length<10)group.push(m.addUnit('bukhanka','rai',p));
    for(const [i,u] of group.entries()){
      u.x=u.previousX=p.x+(i<7?(i%4-1.5)*48:1200+(i-7)*48);
      u.y=u.previousY=p.y+(i<7?Math.floor(i/4)*48:1200);
    }
    group[1].projectId='renamed-project';group[1].components=[...m.config.units.bukhanka.components];
    const enemy=m.addUnit('bukhanka','scavs',{x:p.x+100,y:p.y+120});
    const dead=m.addUnit('bukhanka','rai',{x:p.x-100,y:p.y+120},{hp:0});
    const worker=m.state.units.find(u=>u.kind==='builder'&&u.owner==='rai');
    c.select([group[0].id]);m.updateFog();c.advance(0);c.world.centre(p,360);
    return {ids:group.map(u=>u.id),worker:worker.id,excluded:[enemy.id,dead.id,...group.slice(7).map(u=>u.id)]};
  });
  await page.keyboard.press('KeyF');
  assert.equal(await page.evaluate(()=>window.campaign.state.orderMode),'attack');
  assert.match(await page.locator('#attack-order').getAttribute('title'),/F/);
  await page.keyboard.press('Escape');await page.keyboard.press('KeyT');
  assert.equal(await page.evaluate(()=>window.campaign.state.orderMode),null);
  // Physical F also works with the Russian keyboard layout.
  await page.evaluate(()=>document.body.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyF',key:'а',bubbles:true})));
  assert.equal(await page.evaluate(()=>window.campaign.state.orderMode),'attack');
  await page.keyboard.press('Escape');
  await page.locator('#design-toggle').click();
  const input=page.locator('#project-name');
  await input.focus();await page.keyboard.press('KeyF');
  assert.equal(await page.evaluate(()=>window.campaign.state.orderMode),null,'Typing in the designer does not issue an attack');
  await page.locator('[data-close-designer]').click();
  await page.waitForTimeout(250);
  const location=async id=>page.evaluate(id=>window.campaign.world.screen(window.campaign.mission.entity(id)),id);
  const target=await location(fixture.ids[0]);
  const camera=await page.evaluate(()=>window.campaign.world.controls.target.toArray());
  await page.mouse.click(target.x,target.y);
  assert.deepEqual(await page.evaluate(()=>window.campaign.selected),[fixture.ids[0]]);
  await page.mouse.dblclick(target.x,target.y,{delay:120});
  assert.deepEqual(new Set(await page.evaluate(()=>window.campaign.selected)),new Set(fixture.ids.slice(0,7)),'Double click selects exactly seven visible friendly machines, excluding three offscreen');
  assert.deepEqual(await page.evaluate(()=>window.campaign.world.controls.target.toArray()),camera,'Map double click leaves the camera in place');
  await page.waitForTimeout(200);await page.screenshot({path:folder+'/desktop.png'});
  await page.evaluate(id=>window.campaign.select([id]),fixture.worker);
  await page.keyboard.down('Shift');await page.mouse.dblclick(target.x,target.y,{delay:120});await page.keyboard.up('Shift');
  assert.deepEqual(new Set(await page.evaluate(()=>window.campaign.selected)),new Set([fixture.worker,...fixture.ids.slice(0,7)]),'Shift adds this type to the existing selection');
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);
  const narrow=await page.evaluate(ids=>{
    const c=window.campaign;
    return ids.flatMap(id=>{const p=c.world.screen(c.mission.entity(id));return p.visible&&p.x>=0&&p.x<=innerWidth&&p.y>=0&&p.y<=innerHeight?[{id,...p}]:[];});
  },fixture.ids);
  assert(narrow.length>0&&narrow.length<7,'Narrow viewport excludes additional machines');
  const point=narrow.reduce((a,b)=>Math.abs(a.x-195)<Math.abs(b.x-195)?a:b);
  await page.mouse.dblclick(point.x,point.y,{delay:120});
  assert.deepEqual(new Set(await page.evaluate(()=>window.campaign.selected)),new Set(narrow.map(u=>u.id)));
  await page.waitForTimeout(200);await page.screenshot({path:folder+'/narrow.png'});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({attackF:true,russianLayout:true,typingGuard:true,singleSelect:true,doubleSelectVisibleType:true,offscreenExcluded:true,enemyAndWreckExcluded:true,shiftAdds:true,cameraUnchanged:true,narrow:true,errors}));
}finally{await browser.close();}
