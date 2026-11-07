import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {chromium} = require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const actor = process.argv[2] ?? 'commander';
const scenes = {
  commander:{trigger:'o01',chapter:'intro',portrait:'radio',line:1},
  warrant:{trigger:'o03',chapter:'story-o03',portrait:'neutral',line:1},
  scout:{trigger:'o08',chapter:'first-contact',portrait:'radio',line:0},
};
assert(actor in scenes);
const scene = scenes[actor];
const folder = `campaign/previews/${actor}-portraits`;
fs.mkdirSync(folder, {recursive:true});
const assetBase = 'assets/campaign/alpha/mission01/portraits/';
const character = JSON.parse(fs.readFileSync(assetBase + 'manifest.json')).characters[actor];
const bytes = fs.readFileSync(assetBase + character.file);
assert.equal(createHash('sha256').update(bytes).digest('hex'), character.sha256);
assert.equal(bytes.readUInt32BE(16), character.width);
assert.equal(bytes.readUInt32BE(20), character.height);
for (const {crop:[x,y,w,h]} of Object.values(character.states)) {
  assert(x >= 0 && y >= 0 && x+w <= character.width && y+h <= character.height);
}
const browser = await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless:true, args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
try {
  const page = await browser.newPage({viewport:{width:1440,height:900}}), errors = [], audioRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.url().includes('/field-radio/')) audioRequests.push(request.url()); });
  await page.goto((process.env.WARGAME_URL ?? 'http://127.0.0.1:8884') + '/campaign/');
  await page.waitForFunction(() => window.campaign?.ready, null, {timeout:90000});
  await page.locator('#begin').click();
  await page.locator('#pause').click();
  const before = await page.evaluate(({actor,trigger,line}) => {
    const {mission,radio,world,advance} = window.campaign;
    radio.reset(); radio.setEnabled(true); mission.state.pendingCinematics = [];
    const target = {x:world.controls.target.x,y:world.controls.target.y};
    const d=radio.director;d.bind(mission);d.data.clock=30000;d.data.lastEnd=0;
    for(const scene of d.script.scenes)if(scene.id!==trigger)d.data.scenes[scene.id]={status:'skipped',cursor:0,endedAt:0};
    if(actor==='warrant'){const p=mission.field.gridToWorld(mission.config.startGrid);mission.addStructure('generator','rai',{x:p.x+140,y:p.y+100},{completed:true});}
    if(actor==='scout'){
      const point=mission.field.gridToWorld(mission.config.startGrid);
      const enemy=mission.addUnit('raider','scavs',{x:point.x-20,y:point.y-40});mission.state.flags.raidIds=[enemy.id];mission.effects.push({type:'shot',from:enemy.id,to:{x:enemy.x+10,y:enemy.y,z:mission.field.heightAt(enemy.x,enemy.y)+1},weapon:'mg'});mission.updateFog();
    }
    advance(0);
    for(let i=0;i<line;i++){radio.until=0;advance(0);}
    radio.until = Infinity;
    return target;
  }, {actor,trigger:scene.trigger,line:scene.line});
  await page.waitForFunction(() => !document.querySelector('.radio-portrait').hidden);
  await page.waitForFunction(chapter => campaign.storyAudio.playing && campaign.storyAudio.chapter === chapter, scene.chapter);
  const script=JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/story-v2.json'));
  const cue=script.dialogue.find(c=>c.id===script.scenes.find(s=>s.id===scene.trigger).cues[scene.line]);
  assert.equal(await page.locator('#radio p').textContent(),cue.text);
  const layout = await page.locator('#radio').evaluate(panel => {
    const canvas = panel.querySelector('canvas'), style = getComputedStyle(canvas), box = canvas.getBoundingClientRect();
    return {state:canvas.dataset.state, speaker:canvas.dataset.speaker, width:box.width, border:style.borderWidth, radius:style.borderRadius, shadow:style.boxShadow,
      clickThrough:document.elementFromPoint(box.x+box.width/2,box.y+box.height/2) === document.querySelector('#world canvas'),
      plate:getComputedStyle(panel).backgroundColor};
  });
  assert.deepEqual(layout, {state:scene.portrait,speaker:actor,width:84,border:'0px',radius:'0px',shadow:'none',clickThrough:true,plate:'rgba(0, 0, 0, 0)'});
  assert.deepEqual(await page.evaluate(() => ({x:campaign.world.controls.target.x,y:campaign.world.controls.target.y})), before);
  await page.screenshot({path:folder + '/game-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(150);
  const narrow = await page.locator('#radio').evaluate(panel => {
    const box = panel.getBoundingClientRect();
    return {left:box.left,right:box.right,width:innerWidth,portrait:panel.querySelector('canvas').getBoundingClientRect().width};
  });
  assert(narrow.left >= 0 && narrow.right <= narrow.width);
  assert.equal(narrow.portrait,64);
  await page.screenshot({path:folder + '/game-narrow.png'});
  const behavior = await page.evaluate(async actor => {
    const {setCharacterPortrait} = await import('./character-portraits.js');
    const {radio} = window.campaign, canvas = radio.portrait;
    const pending = setCharacterPortrait(canvas,actor,'relaxed');
    radio.dismiss(); await pending;
    const staysDismissed = canvas.hidden;
    await setCharacterPortrait(canvas,'missing-character-test','neutral');
    const missingHidden = canvas.hidden;
    await setCharacterPortrait(canvas,actor,'m01-s13');
    const eveningState = canvas.dataset.state;
    await setCharacterPortrait(canvas,actor,'unknown');
    return {staysDismissed,missingHidden,eveningState,fallback:canvas.dataset.state};
  }, actor);
  assert.deepEqual(behavior,{staysDismissed:true,missingHidden:true,eveningState:character.sceneStates?.['m01-s13'] ?? character.defaultState,fallback:character.defaultState});
  await page.evaluate(() => campaign.radio.reset());
  assert.deepEqual(errors,[]);
  await page.route('**/campaign/portrait-check.html', route => route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
  await page.goto((process.env.WARGAME_URL ?? 'http://127.0.0.1:8884') + '/campaign/portrait-check.html');
  await page.setViewportSize({width:actor === 'scout' ? 304 : 916,height:actor === 'warrant' ? 700 : 356});
  await page.evaluate(async ({actor,states}) => {
    const {setCharacterPortrait} = await import('./character-portraits.js');
    document.body.innerHTML = '';
    document.body.style.cssText = 'margin:0;padding:14px;display:grid;grid-template-columns:repeat(3,276px);gap:18px;background:#141813;overflow:hidden;font:13px Arial;color:#d8d0ad';
    const labels = {neutral:'Спокойный',tea:'С кружкой',stern:'Распоряжение',relaxed:'После боя',radio:'По связи',map:'Над картой'};
    for (const state of states) {
      const figure = document.createElement('figure'), canvas = document.createElement('canvas'), caption = document.createElement('figcaption');
      figure.style.cssText = 'margin:0;width:276px;flex:none'; canvas.style.cssText = 'display:block;width:276px;height:auto;border:0';
      caption.textContent = labels[state]; caption.style.cssText = 'margin-top:10px;text-align:center';
      figure.append(canvas,caption); document.body.append(figure);
      await setCharacterPortrait(canvas,actor,state);
    }
  }, {actor,states:Object.keys(character.states)});
  await page.screenshot({path:folder + `/${actor}-states.png`});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({states:Object.keys(character.states),layout,narrow,behavior,screenshots:folder}));
} finally { await browser.close(); }
