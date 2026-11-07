const {chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1000,height:700}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('http://127.0.0.1:8766/demo/',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.demoState?.productionReady);
  await page.evaluate(()=>{window.demoActions.follow();window.demoActions.setTimeScale(1);});
  const sections=await page.evaluate(()=>window.demoActions.driveSegments()),samples={};
  const simulate=async(seconds)=>{const start=await page.evaluate(()=>window.demoState.simulatedSeconds);await page.waitForFunction(({start,seconds})=>window.demoState.simulatedSeconds-start>=seconds,{start,seconds},{timeout:90000});};
  for(const name of ['flat','uphill','downhill']){
   await page.evaluate(d=>window.demoActions.setRouteDistance(d),sections[name]);await simulate(3.3);
   samples[name]=await page.evaluate(()=>({speed:window.demoState.speedKmh,pitch:window.demoState.gradePitch,effects:{...window.demoState.effects},contactErrorMm:window.demoState.contactErrorMm}));
  }
  if(!(samples.uphill.speed<samples.flat.speed-.8&&samples.downhill.speed>samples.flat.speed+.8))throw new Error('Slope speed response failed: '+JSON.stringify(samples));
  if(samples.uphill.pitch<.1||samples.downhill.pitch>-.1)throw new Error('Vehicle grade direction failed');
  await page.evaluate(d=>window.demoActions.setRouteDistance(d),sections.slipEntry);await page.waitForFunction(()=>window.demoState.wheelSlip>.03,{},{timeout:90000});
  const slip=await page.evaluate(()=>window.demoState.wheelSlip);
  await simulate(1.2);const effects=await page.evaluate(()=>({...window.demoState.effects}));
  if(!effects.trackCount||!effects.dustCount||effects.trackCount>effects.trackLimit||effects.dustCount>effects.dustLimit||effects.drawCalls!==2)throw new Error('Wheel FX pool failed: '+JSON.stringify(effects));
  const groundDust=await page.evaluate(()=>({...window.demoState.groundDust}));
  if(groundDust.drawCalls!==1||groundDust.instances>groundDust.instanceLimit||groundDust.activeWakes>12||!groundDust.activeWakes||groundDust.lowlandProbe<.3||groundDust.highlandProbe>.005||groundDust.maxOpacity>.17)throw new Error('Ground dust density or fixed pool failed: '+JSON.stringify(groundDust));
  fs.mkdirSync(path.resolve('demo/previews'),{recursive:true});await page.screenshot({path:path.resolve('demo/previews/driving.png')});
  await page.evaluate(()=>window.demoActions.mode('inspect'));await simulate(2.1);
  const stopped=await page.evaluate(()=>({speed:window.demoState.speedKmh,dust:window.demoState.effects.dustCount}));if(stopped.speed!==0||stopped.dust!==0)throw new Error('Dust does not stop: '+JSON.stringify(stopped));
  if(errors.length)throw new Error(errors.join('\n'));
  await page.evaluate(()=>window.demoActions.setGroundDust(false));await simulate(.2);const hiddenDust=await page.evaluate(()=>window.demoState.groundDust.drawCalls);if(hiddenDust!==0)throw new Error('Disabled ground dust still renders');
  const report={samples,slipPeakObserved:slip,effects,groundDust,stopped,pageErrors:errors};fs.mkdirSync(path.resolve('demo/reports'),{recursive:true});fs.writeFileSync(path.resolve('demo/reports/driving.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
