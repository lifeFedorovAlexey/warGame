import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const baseUrl = process.env.WARGAME_URL ?? 'http://127.0.0.1:8766';
const {chromium} = require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser = await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
fs.mkdirSync('campaign/previews/icons', {recursive:true});
const errors = [], checks = [];
const page = await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
if(process.argv.includes('--measure-atlases')) {
  try { await (await import('./measure-ui-atlases.mjs')).measureUiAtlases(page); }
  finally { await browser.close(); }
  process.exit(0);
}
if(process.argv.includes('--layout-review')) {
  try { await (await import('./check-hud-layout.mjs')).checkHudLayout(page); }
  finally { await browser.close(); }
  process.exit(0);
}
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => {if(response.status() >= 400) errors.push(response.status() + ' ' + response.url());});
async function audit(label) {
  await page.waitForFunction(() => [...document.querySelectorAll('svg.game-icon')].filter(icon=>icon.getClientRects().length).every(icon=>icon.getBBox().width > 0));
  await page.evaluate(() => Promise.all([...new Set([...document.querySelectorAll('.atlas-cell')].map(icon=>icon.style.backgroundImage.slice(5,-2)))].map(src=>{const img=new Image();img.src=src;return img.decode();})));
  const failures = await page.evaluate(() => [...document.querySelectorAll('button,summary')].filter(b => b.getClientRects().length).flatMap(b => {
    const issues = [], style = getComputedStyle(b), label = b.getAttribute('aria-label');
    if (!label) issues.push('missing accessible name');
    const icon=b.querySelector('.game-icon');
    if (!icon) issues.push('missing icon');
    // Numeric fleet and production counts are status, never action captions.
    const copy = b.cloneNode(true); copy.querySelectorAll('.stack-count,.production-count').forEach(n => n.remove());
    if (copy.textContent.trim()) issues.push('visible caption: '+copy.textContent);
    if (parseFloat(style.borderTopWidth)) issues.push('button frame');
    const r=b.getBoundingClientRect();
    if(r.left < -1 || r.right > innerWidth+1) issues.push('outside viewport');
    if(icon){
      const ir=icon.getBoundingClientRect();
      const iconArea=r.width-(b.dataset.production?22:0);
      if(Math.abs(ir.left+ir.width/2-r.left-iconArea/2)>.75||Math.abs(ir.top+ir.height/2-r.top-r.height/2)>.75) issues.push('icon not centered in its area');
      const sprite=icon.querySelector('.atlas-cell');
      if(sprite){const sr=sprite.getBoundingClientRect();if(Math.abs(sr.left+sr.width/2-ir.left-ir.width/2)>.75||Math.abs(sr.top+sr.height/2-ir.top-ir.height/2)>.75)issues.push('sprite not centered in icon');}
    }
    return issues.map(issue => `${b.id || label}: ${issue}`);
  }));
  assert.deepEqual(failures, [], label);
  const frames=await page.evaluate(()=>[...document.querySelectorAll('.panel,.top,#radio,#toast,#queue,#designer,.designer-heading,.designer-stats,.design-salvage,.modes,.minimap,.readout,.tag,.selection,#live,#parts .part')].filter(e=>e.getClientRects().length).filter(e=>{const s=getComputedStyle(e);return ['Top','Right','Bottom','Left'].some(side=>parseFloat(s['border'+side+'Width'])>0)||s.boxShadow!=='none';}).map(e=>e.id||e.className));
  assert.deepEqual(frames, [], label+' has framed menus');
  checks.push(label);
}
try {
  await page.goto(baseUrl+'/campaign/');
  await page.waitForFunction(() => window.campaign?.ready, {}, {timeout:90000});
  await audit('Welcome');
  await page.locator('#begin').click();
  await page.locator('#pause').click();
  await page.locator('#build-toggle').click();
  await page.waitForFunction(() => document.querySelectorAll('#build-cards .game-icon').length >= 5);
  await audit('Build palette');
  await page.screenshot({path:'campaign/previews/icons/01-battle-build.png'});
  await page.locator('.settings summary').click();
  await page.locator('#sound-toggle').click();
  assert.equal(await page.locator('#sound-toggle').getAttribute('data-icon'), 'muted');
  await page.locator('#story-voice-toggle').click();
  assert.equal(await page.locator('#story-voice-toggle').getAttribute('data-icon'), 'voice-off');
  await audit('Settings toggles');
  await page.screenshot({path:'campaign/previews/icons/02-settings.png'});
  await page.locator('.settings summary').click();
  await page.locator('#design-toggle').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-design-component]').length >= 2);
  await audit('Vehicle designer');
  await page.locator('[data-design-component="U25"]').click();
  await page.locator('[data-design-explode]').click();
  assert.equal(await page.locator('[data-design-explode]').getAttribute('data-icon'), 'assemble');
  await audit('Designer assembly toggle');
  await page.screenshot({path:'campaign/previews/icons/03-designer.png'});
  await page.locator('.design-salvage summary').click();
  await audit('Field modification options');
  await page.locator('.design-salvage summary').click();
  for(const [name,width,height] of [['10-designer-narrow',390,844],['11-designer-landscape',844,390]]) {
    await page.setViewportSize({width,height});
    await audit(name);
    const outside=await page.locator('#designer button,#designer summary,#designer input:not([type=checkbox])').evaluateAll(elements=>elements.filter(e=>e.checkVisibility()).filter(e=>{const r=e.getBoundingClientRect();return r.top<0||r.bottom>innerHeight+1;}).map(e=>e.ariaLabel||e.id));
    assert.deepEqual(outside,[],name+' clipped controls');
    await page.screenshot({path:'campaign/previews/icons/'+name+'.png'});
  }
  await page.setViewportSize({width:1440,height:900});
  await page.locator('[data-close-designer]').click();
  await page.locator('#build-toggle').click();
  await page.setViewportSize({width:800,height:600});
  await audit('Compact campaign 800 × 600');
  await page.screenshot({path:'campaign/previews/icons/04-compact.png'});
  await page.setViewportSize({width:390,height:844});
  await audit('Narrow campaign 390 × 844');
  await page.screenshot({path:'campaign/previews/icons/05-narrow.png'});
  await page.setViewportSize({width:1440,height:900});
  // Isolated UI fixture for context actions; real construction is covered by check-campaign.
  await page.evaluate(() => {
    const c=window.campaign, m=c.mission, p=m.field.gridToWorld(m.config.startGrid);
    c.radio.setEnabled(false);
    m.state.energy=2000;
    const factory=m.addStructure('factory','rai',{x:p.x+170,y:p.y+100},{completed:true,progress:1});
    m.addStructure('lab','rai',{x:p.x-170,y:p.y+100},{completed:true,progress:1});
    m.state.artifactKeys=Object.keys(m.config.research);
    c.select([factory.id]);
  });
  await page.waitForFunction(()=>document.querySelectorAll('#actions button').length>=2);
  await audit('Factory projects');
  await page.screenshot({path:'campaign/previews/icons/07-factory.png'});
  await page.locator('#actions [data-icon="builder"]').click();
  assert.equal(await page.evaluate(()=>window.campaign.mission.state.buildings.find(b=>b.kind==='factory'&&b.owner==='rai').queue.length),1);
  await page.evaluate(()=>{const c=window.campaign;c.select([c.mission.state.buildings.find(b=>b.kind==='lab'&&b.owner==='rai').id]);});
  await page.waitForFunction(()=>document.querySelector('#actions [data-research]'));
  assert.equal(await page.locator('#actions [data-research]').evaluateAll(buttons=>new Set(buttons.map(b=>b.dataset.icon)).size),3);
  await audit('Research samples');
  await page.screenshot({path:'campaign/previews/icons/08-research.png'});
  await page.locator('#actions [data-research]').first().click();
  assert(await page.evaluate(()=>window.campaign.mission.state.buildings.find(b=>b.kind==='lab'&&b.owner==='rai').research));
  await page.goto(baseUrl+'/campaign/cinematics.html?scene=2');
  await page.waitForFunction(()=>window.cinematicPreview?.ready.includes('m01-s02'));
  await audit('Cinematic start');
  await page.locator('#start').click();
  await page.waitForFunction(()=>window.cinematicPreview.player.playing);
  await page.locator('#play').click();
  assert.equal(await page.locator('#play').getAttribute('data-icon'), 'play');
  await page.locator('#motion').click();
  await audit('Cinematic playback toggles');
  // Atlas overview verifies every supplied cell on the actual game panel color.
  await page.goto(baseUrl+'/campaign/command-review.html');
  await page.waitForFunction(() => [...document.querySelectorAll('button')].every(b=>b.querySelector('.game-icon')));
  await audit('Command review');
  await page.goto(baseUrl+'/campaign/builder.html');
  await page.waitForFunction(() => window.builderPreview?.ready, {}, {timeout:30000});
  await audit('Builder preview');
  await page.locator('#explode').click();
  await audit('Builder toggle');
  await page.goto(baseUrl+'/demo/');
  await page.waitForFunction(() => document.querySelector('#pause .game-icon'), {}, {timeout:30000});
  await page.locator('#pause').click();
  await page.locator('#fire').click();
  await audit('Demo controls after toggling');
  await page.screenshot({path:'campaign/previews/icons/06-demo.png'});
  // Review all eighty new cells with the same rendering path as game buttons.
  await page.goto(baseUrl+'/assets/ui/README.md');
  await page.evaluate(async () => {
    const {iconElement,iconGroups}=await import('/assets/ui/icons.js');
    const stylesheet=document.createElement('link');stylesheet.rel='stylesheet';stylesheet.href='/assets/ui/icons.css';
    await new Promise((resolve,reject)=>{stylesheet.onload=resolve;stylesheet.onerror=reject;document.head.append(stylesheet);});
    document.body.replaceChildren();
    document.body.style.cssText='display:block;margin:0;padding:28px;background:#171e19;color:#ddcba2;font:18px Segoe UI';
    const names=['Вооружение и модули','Здания','Техника и ходовые','Приказы и улучшения'];
    for(const [index,group] of iconGroups.entries()) {
      const title=document.createElement('h2');title.textContent=names[index];title.style.cssText='font-size:17px;margin:16px 0 8px';
      const grid=document.createElement('div');grid.style.cssText='display:grid;grid-template-columns:repeat(20,1fr);gap:6px';
      for(const name of group.names){const icon=iconElement(name);icon.style.setProperty('--icon-size','60px');icon.title=name;grid.append(icon);}
      document.body.append(title,grid);
    }
    await Promise.all([...new Set([...document.querySelectorAll('.atlas-cell')].map(icon=>icon.style.backgroundImage.slice(5,-2)))].map(src=>{const image=new Image();image.src=src;return image.decode();}));
  });
  await page.screenshot({path:'campaign/previews/icons/09-new-icons.png',fullPage:true});
  assert.deepEqual(errors, []);
  fs.mkdirSync('campaign/reports', {recursive:true});
  fs.writeFileSync('campaign/reports/ui-icons.json',JSON.stringify({checks,errors},null,2));
  console.log(JSON.stringify({checks,errors}));
} finally { await browser.close(); }
