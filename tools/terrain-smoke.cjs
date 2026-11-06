const {chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('http://127.0.0.1:8766/demo/');await page.waitForFunction(()=>window.demoState?.productionReady&&window.demoState.mapReady);
  const map=await page.evaluate(()=>({...window.demoActions.mapAudit(),vehicleScale:window.demoState.map.vehicleScale}));
  if(map.extentMetres!==4064||map.sourceSamples!==16384||map.routeLengthMetres<12000||map.stops.length!==8||map.materials.sourceSheetAsAlbedo)throw new Error('Full map or modern materials missing: '+JSON.stringify(map));
  if(map.materials.pbr?.sets.length!==4||!map.materials.roughnessByMaterial)throw new Error('Scanned PBR maps missing');
  const contacts=await page.evaluate(()=>window.demoActions.auditRoute(8192));
  if(contacts.maxContactErrorMm>3||contacts.bodyErrorMm>.1||contacts.upperErrorMm>.1)throw new Error('Route contact or assembly failed: '+JSON.stringify(contacts));
  fs.mkdirSync(path.resolve('demo/previews'),{recursive:true});await page.screenshot({path:path.resolve('demo/previews/alpha-overview.png')});
  await page.evaluate(()=>window.demoActions.roadView(2));await page.waitForTimeout(450);await page.screenshot({path:path.resolve('demo/previews/road-review.png')});
  await page.evaluate(()=>window.demoActions.setQuality('full'));await page.getByRole('button',{name:'За машиной',exact:true}).click();
  await page.selectOption('#checkpoint-select','5');await page.waitForTimeout(1800);
  if(await page.evaluate(()=>window.demoState.groundHeight)<45)throw new Error('Upper plateau jump failed');
  await page.screenshot({path:path.resolve('demo/previews/alpha-follow.png')});
  await page.evaluate(()=>{window.demoActions.followFront();window.demoActions.setCheckpoint(0);});await page.waitForTimeout(1200);await page.screenshot({path:path.resolve('demo/previews/environment-review.png')});
  await page.evaluate(()=>window.demoActions.setQuality('auto'));
  await page.locator('#terrain').click();await page.locator('#terrain').click();
  for(const [distance,lod] of [[110,1],[200,2],[45,0]]){await page.evaluate(d=>window.demoActions.setDistance(d),distance);await page.waitForFunction(n=>window.demoState.renderLod===n,lod);}
  await page.getByRole('button',{name:'Вся карта',exact:true}).click();await page.setViewportSize({width:390,height:844});await page.waitForTimeout(400);await page.screenshot({path:path.resolve('demo/previews/alpha-mobile.png')});
  if(errors.length)throw new Error(errors.join('\n'));
  const report={map,contacts,cameras:true,checkpoints:true,lodSwitching:true,routeToggle:true,pageErrors:errors};fs.mkdirSync(path.resolve('demo/reports'),{recursive:true});fs.writeFileSync('demo/reports/terrain.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({extent:map.extentMetres,routeKm:map.routeLengthMetres/1000,vehicleScale:map.vehicleScale,contacts,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
