import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage();page.on('pageerror',e=>console.log('PAGE ERROR: '+e.message));
 page.on('response',r=>{if(r.status()>=400)console.log(r.status()+' '+r.url());});
 page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE: '+m.text());});
 await page.goto('http://127.0.0.1:8893/campaign/');await page.waitForTimeout(3000);
 console.log(await page.evaluate(()=>({ready:window.campaign?.ready,loading:document.querySelector('#loading-status')?.textContent})));
}finally{await browser.close();}
