import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const folder='campaign/previews/roster-ui';fs.mkdirSync(folder,{recursive:true});
try {
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8884')+'/campaign/');
  await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});
  await page.locator('#begin').click();await page.locator('#pause').click();
  const ids=await page.evaluate(()=>{
    const c=window.campaign,m=c.mission,p=m.field.gridToWorld(m.config.startGrid);
    c.radio.setEnabled(false);
    const group=m.state.units.filter(u=>u.owner==='rai'&&u.kind==='bukhanka');
    while(group.length<10)group.push(m.addUnit('bukhanka','rai',{x:p.x+(group.length%5-2)*32,y:p.y-100-Math.floor(group.length/5)*32}));
    c.select([]);c.advance(0);return group.map(u=>u.id);
  });
  assert(await page.locator('.selection-title').isHidden());
  assert.equal(await page.locator('#selection').textContent(),'');
  assert.equal(await page.locator('#details').textContent(),'');
  const select=async selected=>page.evaluate(ids=>{const c=window.campaign;c.select(ids);c.advance(0);},selected);
  const groups=()=>page.locator('#roster [data-icon="bukhanka"]').evaluateAll(buttons=>buttons.map(b=>({ids:b.dataset.units.split('/'),active:b.classList.contains('active'),count:b.querySelector('.stack-count')?.textContent,outline:getComputedStyle(b).outlineStyle,bg:getComputedStyle(b).backgroundColor})));
  await select(ids.slice(0,7));
  let tiles=await groups();
  assert.deepEqual(tiles.map(t=>[t.ids.length,t.active,t.count]),[[7,true,'×7'],[3,false,'×3']]);
  assert(await page.locator('#roster [data-icon="bukhanka"]').first().evaluate(b=>b.nextElementSibling.dataset.icon==='bukhanka'),'Selected and unselected stacks of the same type stay adjacent');
  assert.equal(tiles[0].outline,'solid');assert.equal(tiles[1].outline,'none');
  assert(tiles.every(t=>t.bg==='rgba(0, 0, 0, 0)'));
  await page.mouse.move(700,300);await page.waitForTimeout(200);
  await page.screenshot({path:folder+'/selected-seven-desktop.png'});
  await page.locator('#commands').screenshot({path:folder+'/selected-seven-controls.png'});
  await page.locator('#roster [data-icon="bukhanka"]:not(.active)').click();
  assert.deepEqual(await page.evaluate(()=>window.campaign.selected),ids.slice(7));
  await page.locator('#roster [data-icon="bukhanka"]:not(.active)').click({modifiers:['Shift']});
  assert.deepEqual(new Set(await page.evaluate(()=>window.campaign.selected)),new Set(ids));
  await page.waitForFunction(()=>document.querySelectorAll('#roster [data-icon="bukhanka"]').length===1);
  assert.equal((await groups())[0].count,'×10');
  // The first click must preserve the node so the browser can deliver dblclick.
  await select([]);
  const before=await page.evaluate(()=>window.campaign.world.controls.target.toArray());
  await page.locator('#roster [data-icon="bukhanka"]').click();
  assert.deepEqual(await page.evaluate(()=>window.campaign.world.controls.target.toArray()),before);
  await select([]);await page.locator('#roster [data-icon="bukhanka"]').dblclick({delay:160});
  assert(await page.evaluate(()=>{
    const c=window.campaign,units=c.selected.map(id=>c.mission.entity(id)),p=c.world.controls.target;
    return Math.hypot(p.x-units.reduce((s,u)=>s+u.x,0)/units.length,p.y-units.reduce((s,u)=>s+u.y,0)/units.length)<.01;
  }),'Double click centres the selected stack');
  await select(ids.slice(0,7));
  for(const [name,width,height] of [['selected-seven-narrow',390,844],['selected-seven-landscape',844,390]]){
    await page.setViewportSize({width,height});await page.waitForTimeout(250);
    assert.deepEqual((await groups()).map(t=>[t.ids.length,t.active]),[[7,true],[3,false]]);
    assert.deepEqual(await page.locator('#roster button').evaluateAll(buttons=>buttons.filter(b=>{const r=b.getBoundingClientRect();return r.left<0||r.right>innerWidth||r.bottom>innerHeight;}).map(b=>b.ariaLabel)),[]);
    await page.screenshot({path:folder+'/'+name+'.png'});
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({emptyTextRemoved:true,splitSevenThree:true,selectionOutline:true,click:true,shift:true,doubleClick:true,narrow:true,errors}));
}finally{await browser.close();}
