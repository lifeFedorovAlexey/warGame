import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080}});
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8893')+'/campaign/');
 await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});
 await page.locator('#begin').click();await page.locator('#pause').click();
 await page.evaluate(()=>{
  const c=campaign,m=c.mission,p=m.field.gridToWorld(m.config.startGrid);c.radio.setEnabled(false);
  m.state.units=[];m.state.buildings=[];m.state.camps=[];m.state.pendingCinematics=[];m.updateMission=()=>{};
  const units=Array.from({length:9},(_,i)=>m.addUnit('bukhanka','rai',{x:p.x+(i%3-1)*28,y:p.y-20-Math.floor(i/3)*30}));
  for(let i=0;i<4;i++)m.addUnit('raider','scavs',{x:p.x+(i%2?35:-35),y:p.y+165+Math.floor(i/2)*35});
  m.rebuildNavigation();m.updateFog();m.explored.fill(1);c.select(units.map(u=>u.id));c.world.centre({x:p.x,y:p.y+70},610);c.advance(0);
  m.order(units.map(u=>u.id),'attack-move',{x:p.x,y:p.y+270});
  window.startupProfile={slow:[],cpu:[],contacts:{},started:m.state.time};
  for(const name of ['resolveDamageContact','onDamageImpact','damagePartWorldPosition','rebuildNavigation','updateFog','advance']){
   const original=m[name]?.bind(m);if(!original)continue;
   m[name]=(...args)=>{const start=performance.now(),result=original(...args),ms=performance.now()-start;
    if(name==='advance')startupProfile.cpu.push(ms);
    if(name==='resolveDamageContact'){const kind=args[1].kind,entry=startupProfile.contacts[kind]??={count:0,maxMs:0};entry.count++;entry.maxMs=Math.max(entry.maxMs,ms);}
    if(ms>3)startupProfile.slow.push({name,time:m.state.time,ms,target:args[1]?.kind??args[0]?.kind});
    return result;
   };
  }
 });
 await page.locator('#pause').click();
 await page.waitForFunction(()=>campaign.mission.state.time-startupProfile.started>=10,null,{timeout:60000});
 await page.locator('#pause').click();
 const result=await page.evaluate(()=>{const cpu=startupProfile.cpu.slice().sort((a,b)=>a-b);return{...startupProfile,summary:{samples:cpu.length,p99:cpu[Math.floor(cpu.length*.99)],max:cpu.at(-1)}};});
 fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/combat-startup-profile.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify({summary:result.summary,contacts:result.contacts,slow:result.slow.filter(s=>s.name!=='advance'||s.ms>12.5)}));
}finally{await browser.close();}
