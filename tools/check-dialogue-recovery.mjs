import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {mergeDrafts,sameDraft} from '../dialogues/draft-merge.js';
const read=path=>JSON.parse(fs.readFileSync(path,'utf8'));
const recovered={...read('docs/campaign/dialogue-drafts/alpha-m01/draft.json'),revision:12};
const base=structuredClone(recovered);base.revision=10;
const ids=base.document.scenes.find(scene=>scene.id==='r36').cues;
const oldAudio=read('assets/campaign/alpha/mission01/audio-v2.json').clips;
for(const id of ids){base.document.lines[id].text='Старая реплика '+id;base.document.lines[id].audio={...oldAudio[id],file:'assets/campaign/alpha/mission01/'+oldAudio[id].file};}
const alt='m01-v3-r30-alt-l001';
base.document.lines[alt].text='Старая версия доклада';base.document.lines[alt].audio.text='Старая версия доклада';
const local=structuredClone(base);
for(const id of ids)local.document.lines[id]=structuredClone(recovered.document.lines[id]);
const before=structuredClone(base);before.revision=11;before.document.lines[alt]=structuredClone(recovered.document.lines[alt]);
const result=mergeDrafts(base.document,local.document,before.document);
assert.deepEqual(result.conflicts,[]);assert.deepEqual(result.document,recovered.document);
assert.deepEqual(mergeDrafts(base.document,local.document,recovered.document).document,recovered.document,'Already recovered edits do not revert the confirmed correction');
const mine=structuredClone(base.document),theirs=structuredClone(base.document),key='m01-s10-l005';
mine.lines[key].text='Локальный текст';theirs.lines[key].audio={file:'another-take.mp3'};
assert.deepEqual(mergeDrafts(base.document,mine,theirs).conflicts,['lines.'+key],'Words and audio from conflicting takes cannot merge');
const deleted=structuredClone(base.document);delete deleted.lines[key];
assert(!Object.hasOwn(mergeDrafts(base.document,deleted,base.document).document.lines,key));
assert.deepEqual(mergeDrafts(base.document,deleted,theirs).conflicts,['lines.'+key]);
assert(sameDraft({a:1,b:2},{b:2,a:1}));

const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 // All writes are intercepted: this test never changes the owner's real draft.
 let server=structuredClone(recovered),puts=0,conflicts=0;
 await page.route('**/docs/campaign/dialogue-drafts/alpha-m01/.history/000010.json',route=>route.fulfill({json:base}));
 await page.route('**/api/dialogues/alpha-m01',async route=>{
  if(route.request().method()==='PUT'){
   const body=route.request().postDataJSON();
   if(body.revision!==server.revision){conflicts++;return route.fulfill({status:409,json:{error:'Черновик изменён в другой вкладке.'}});}
   server={revision:server.revision+1,document:body.document,savedAt:new Date().toISOString()};puts++;
  }
  return route.fulfill({json:server});
 });
 await page.addInitScript(local=>{
  if(!sessionStorage.getItem('recovery-test-seeded')){
   localStorage.setItem('warGame.dialogueWorkshop.alpha-m01',JSON.stringify(local));sessionStorage.setItem('recovery-test-seeded','1');
  }
 },local);
 await page.goto(process.env.DIALOGUE_URL??'http://127.0.0.1:8766/dialogues/');
 await page.waitForFunction(()=>document.querySelector('#save-status').textContent==='Сохранено на диске');
 assert.equal(puts,0);assert.equal(await page.evaluate(()=>localStorage.getItem('warGame.dialogueWorkshop.alpha-m01')),null);
 assert(await page.locator('#error').isHidden());
 await page.locator('a[href="#r36"]').click();
 const textField=()=>page.locator('[data-key="'+key+'"] .cue-text');
 assert.equal(await textField().inputValue(),recovered.document.lines[key].text);
 assert.equal(await page.locator('.audio-info.user').count(),6);
 const folder='campaign/previews/dialogue-recovery';fs.mkdirSync(folder,{recursive:true});
 for(const [suffix,width,height] of [['desktop',1440,900],['narrow',390,844]]){
  await page.setViewportSize({width,height});
  if(suffix==='narrow')await page.locator('#editor').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>[...document.images].filter(img=>{const r=img.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight&&r.width>0;}).every(img=>img.complete&&img.naturalWidth>0));
  await page.screenshot({path:folder+'/'+suffix+'.png'});
  assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));
 }
 await page.setViewportSize({width:1440,height:900});
 // Reproduce the original collision, including a new edit after the export.
 server.document.lines['m01-s10-l006'].notes='Независимая серверная правка';server.revision++;
 const newText=recovered.document.lines[key].text+' Проверка восстановления.';
 await textField().fill(newText);
 await page.waitForFunction(()=>document.querySelector('#save-status').textContent==='Не сохранено');
 assert.equal(conflicts,1);assert.equal(puts,0);
 page.on('dialog',dialog=>dialog.accept());await page.reload();
 await page.waitForFunction(()=>document.querySelector('#save-status').textContent.startsWith('Сохранено ·'));
 assert.equal(puts,1);assert.equal(server.document.lines[key].text,newText);
 assert.equal(server.document.lines['m01-s10-l006'].notes,'Независимая серверная правка');
 assert.equal(server.document.lines['m01-v3-r30-alt-l001'].text,recovered.document.lines['m01-v3-r30-alt-l001'].text);
 // Editing the same line in both versions must stop, retain the local backup,
 // and allow it to be downloaded without overwriting the server's version.
 await page.locator('a[href="#r36"]').click();
 server.document.lines[key].text='Другая серверная реплика';server.revision++;
 await textField().fill('Несохранённая локальная реплика');
 await page.waitForFunction(()=>document.querySelector('#save-status').textContent==='Не сохранено');
 await page.reload();
 await page.waitForFunction(()=>document.querySelector('#save-status').textContent==='Восстановлена локальная копия');
 assert.equal(puts,1);assert.equal(server.document.lines[key].text,'Другая серверная реплика');
 const pending=await page.evaluate(()=>JSON.parse(localStorage.getItem('warGame.dialogueWorkshop.alpha-m01')));
 assert.equal(pending.document.lines[key].text,'Несохранённая локальная реплика');
 const downloadPromise=page.waitForEvent('download');await page.locator('#export').click();
 const download=await downloadPromise;const exported=read(await download.path());
 assert.equal(exported.document.lines[key].text,'Несохранённая локальная реплика');
 assert.deepEqual(errors,[]);
 console.log('PASS: recovered six uploads, preserved confirmed text, no redundant save, independent edits survive reload, conflicting takes stay local and exportable, desktop/narrow screenshots');
}finally{await browser.close();}
