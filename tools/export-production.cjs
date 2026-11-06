const {chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs');const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const target=path.resolve('assets/vehicles');fs.mkdirSync(target,{recursive:true});const report=[];
  for(let lod=0;lod<3;lod++){
   await page.goto(`http://127.0.0.1:8766/demo/?lod=${lod}&export=1`,{waitUntil:'networkidle'});
   try{await page.waitForFunction(()=>window.demoState?.ready&&window.exportProductionParts);}catch(e){throw new Error(errors.join('\n')||e.message);}
   const result=await page.evaluate(()=>window.exportProductionParts());
   for(const f of result.files){const folder=path.join(target,f.name.slice(0,3));fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,f.name),Buffer.from(f.base64,'base64'));}
   report.push(...result.report);
  }
  if(errors.length)throw new Error(errors.join('\n'));
  fs.writeFileSync(path.join(target,'geometry-report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
