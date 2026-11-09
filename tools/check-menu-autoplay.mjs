import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const folder='campaign/previews/menu-autoplay';fs.mkdirSync(folder,{recursive:true});
const reports=[];
// Playwright evaluate/waitForFunction may grant user activation. These checks
// use CDP with userGesture:false until an actual mouse/keyboard input is tested.
async function inspect(cdp){
 const result=await cdp.send('Runtime.evaluate',{userGesture:false,returnByValue:true,expression:`(()=>{
  const root=document.getElementById('welcome'),art=document.querySelector('.menu-art'),a=document.getElementById('menu-music');
  const button=document.getElementById('loading-sound'),bar=document.getElementById('loading-progress'),rect=button?.getBoundingClientRect();
  return {ready:!!window.campaign?.ready,phase:document.getElementById('loading')?.dataset.phase,artVisible:!!art&&getComputedStyle(art).visibility==='visible',
   playVisible:!!rect?.width,playDisabled:button?.disabled,playPosition:rect&&{x:rect.x,y:rect.y,width:rect.width,height:rect.height},progress:bar?.value,progressMax:bar?.max,progressVisible:!!bar?.getBoundingClientRect().width,
   active:navigator.userActivation.hasBeenActive,paused:a?.paused,audioReady:a?.readyState,time:a?.currentTime,disabled:document.getElementById('begin')?.disabled,events:window.menuAutoplayEvents};
 })()`});
 return result.result.value;
}
async function until(cdp,predicate){
 const deadline=Date.now()+90000;let value;
 while(Date.now()<deadline){value=await inspect(cdp);if(predicate(value))return value;await new Promise(r=>setTimeout(r,100));}
 throw Error('Timed out: '+JSON.stringify(value));
}
for(const mode of ['blocked','allowed']){
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--autoplay-policy='+(mode==='blocked'?'document-user-activation-required':'no-user-gesture-required')]});
 try{
  for(const scenario of mode==='blocked'?['first-visit','pointer-start','early-click','saved-mute']:['autoplay']){
   const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),cdp=await context.newCDPSession(page),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/navigation',r=>r.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*'},body:'{}'}));
   await page.addInitScript(muted=>{
    if(muted)localStorage.setItem('warGame.fieldSound','off');
    window.menuAutoplayEvents=[];
    document.addEventListener('playing',e=>{if(e.target.id==='menu-music')menuAutoplayEvents.push({event:'playing',at:performance.now()});},true);
    new MutationObserver(()=>{
     const art=document.querySelector('.menu-art'),root=document.getElementById('welcome');
     if(art&&root&&!root.classList.contains('is-loading')&&!menuAutoplayEvents.some(e=>e.event==='menu'))menuAutoplayEvents.push({event:'menu',at:performance.now(),paused:document.getElementById('menu-music').paused});
    }).observe(document,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
   },scenario==='saved-mute');
   let release=()=>{};
   if(['first-visit','early-click'].includes(scenario)){
    const gate=new Promise(resolve=>release=resolve);
    await page.route('**/wasteland-menu.mp3',async route=>{await gate;await route.continue();});
   }
   try{
    await page.goto('http://127.0.0.1:8766/review/autoplay-'+scenario+'-'+Date.now()+'/campaign/',{waitUntil:'commit'});
    let loadingPosition;
    if(scenario==='first-visit'){
     const loading=await until(cdp,s=>s.phase==='audio');
     assert(!loading.active&&loading.playVisible&&loading.playDisabled&&loading.progressVisible&&!loading.artVisible);
     loadingPosition=loading.playPosition;
     // Playwright's screenshot preparation can also grant activation.
     fs.writeFileSync(folder+'/loading-desktop.png',Buffer.from((await cdp.send('Page.captureScreenshot')).data,'base64'));
     await page.setViewportSize({width:390,height:844});await new Promise(r=>setTimeout(r,150));
     fs.writeFileSync(folder+'/loading-narrow.png',Buffer.from((await cdp.send('Page.captureScreenshot')).data,'base64'));
     await page.setViewportSize({width:1440,height:900});release();
    }
    if(scenario==='early-click'){
     await until(cdp,s=>s.phase==='audio');await page.mouse.click(50,50);release();
    }
    if(scenario==='first-visit'){
     const blocked=await until(cdp,s=>s.phase==='activation');
     assert(!blocked.active&&blocked.paused&&blocked.audioReady===4&&blocked.disabled&&!blocked.artVisible,'A real no-gesture visit must wait visibly for sound permission');
     assert(blocked.playVisible&&!blocked.playDisabled&&blocked.progressVisible&&blocked.progress===blocked.progressMax,'Play and the completed loader remain together');
     assert.deepEqual(blocked.playPosition,loadingPosition,'The Play button stays in the same place');
     await page.screenshot({path:folder+'/ready-desktop.png'});
     await page.setViewportSize({width:390,height:844});await new Promise(r=>setTimeout(r,150));
     await page.screenshot({path:folder+'/ready-narrow.png'});
     await page.keyboard.press('Enter');
    }
    if(scenario==='pointer-start'){
     await until(cdp,s=>s.phase==='activation');await page.locator('#loading-sound').click();
    }
    const result=await until(cdp,s=>s.ready&&s.artVisible&&!s.disabled&&(scenario==='saved-mute'||!s.paused&&s.time>0));
    if(scenario==='saved-mute')assert(result.paused&&!result.active);
    else{
     const playing=result.events.find(e=>e.event==='playing'),menu=result.events.find(e=>e.event==='menu');
     assert(playing&&menu&&playing.at<=menu.at&&!menu.paused,'The music starts before the menu is revealed');
    }
    if(scenario==='autoplay')assert(!result.active,'Permitted autoplay is tested without any artificial gesture');
    assert.deepEqual(errors,[]);reports.push({scenario,...result});
   }finally{release();await context.close();}
  }
 }finally{await browser.close();}
}
fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/menu-autoplay.json',JSON.stringify({pass:true,reports},null,2));
console.log('PASS: unified loading and Play, stable desktop/narrow layout, actual no-gesture autoplay, pointer and keyboard start, early loading click, saved mute, music before menu reveal');
