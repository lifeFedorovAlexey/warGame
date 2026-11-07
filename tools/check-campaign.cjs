const fs = require('node:fs');
const assert = require('node:assert/strict');
const {chromium} = require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1120,height:630},deviceScaleFactor:2}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
  await page.goto('http://127.0.0.1:8766/campaign/');
  await page.waitForFunction(()=>window.campaign?.ready||document.querySelector('#loading-status').textContent.startsWith('Ошибка'),{},{timeout:90000});
  assert(await page.evaluate(()=>window.campaign?.ready),errors.join('\n')||await page.locator('#loading-status').textContent());
  await page.locator('#begin').click();
  await page.waitForFunction(()=>window.campaign.drivingAudio.running&&window.campaign.drivingAudio.recordings);
  await page.waitForFunction(()=>window.campaign.mission.state.time>.2&&!document.querySelector('#radio').hidden);
  assert.equal(await page.evaluate(()=>window.campaign.mission.state.units.filter(u=>u.owner==='rai').length),5);
  await page.locator('[data-skip-all]').click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('warGame.fieldRadio')),'off');
  await page.locator('#pause').click();
  await page.getByRole('button',{name:'Строитель 2',exact:true}).click({modifiers:['Shift']});
  await page.locator('#build-toggle').click();
  try{await page.waitForFunction(()=>[...document.querySelectorAll('#build-cards img')].length===5&&[...document.querySelectorAll('#build-cards img')].every(img=>img.naturalWidth===192),{},{timeout:10000});}
  catch(error){throw new Error(errors.join('\n')||JSON.stringify(await page.evaluate(()=>({hidden:document.querySelector('#build-palette').hidden,imgs:[...document.querySelectorAll('#build-cards img')].map(i=>i.naturalWidth),selection:window.campaign.selected}))),{cause:error});}
  fs.mkdirSync('campaign/previews',{recursive:true});
  await page.screenshot({path:'campaign/previews/field-building-cards.png'});
  await page.getByRole('button',{name:/^Генератор/}).click();
  await page.locator('#suggest-site').click();
  const position=await page.evaluate(()=>{const w=window.campaign.world;return w.screen(w.controls.target,0);});
  await page.mouse.click(position.x,position.y);
  await page.waitForFunction(()=>window.campaign.mission.state.buildings.some(b=>b.owner==='rai'&&b.kind==='generator'));
  const oil=await page.evaluate(()=>{const c=window.campaign,p=c.world.field.gridToWorld(c.mission.config.oilFields[0]);c.world.centre(p,310);return c.world.screen(p,2);});
  await page.mouse.click(oil.x,oil.y);
  await page.waitForFunction(()=>window.campaign.mission.state.buildings.some(b=>b.owner==='rai'&&b.kind==='derrick'));
  assert.equal(await page.evaluate(()=>window.campaign.mission.state.energy),530);
  await page.evaluate(()=>{const c=window.campaign;for(let i=0;i<180;i++){c.advance(.3);const b=c.mission.state.buildings.find(e=>e.owner==='rai'&&e.kind==='generator');if(b.progress>.32&&b.progress<.8){c.world.centre(b,170);break;}}});
  await page.waitForFunction(()=>{
   const c=window.campaign,b=c.mission.state.buildings.find(e=>e.owner==='rai'&&e.kind==='generator'),mesh=c.world.buildingObjects.get(b.id)?.getObjectByName('building_structure');
   return c.world.statistics.projectors>0&&mesh?.visible&&mesh.children.some(o=>o.material.clippingPlanes?.length);
  });
  await page.screenshot({path:'campaign/previews/field-layer-construction.png'});
  await page.evaluate(()=>window.campaign.advance(135));
  const base=await page.evaluate(()=>{
   const c=window.campaign,m=c.mission,b=m.state.buildings.find(b=>b.kind==='derrick'&&b.owner==='rai');
   c.world.centre(b,165);
   return{power:m.state.powered,complete:b.completed,progress:m.state.buildings.filter(b=>b.owner==='rai').map(b=>b.progress)};
  });
  assert.deepEqual(base,{power:true,complete:true,progress:[1,1]});
  await page.waitForFunction(()=>{const c=window.campaign,b=c.mission.state.buildings.find(b=>b.kind==='derrick');return !!c.world.buildingObjects.get(b.id)?.getObjectByName('oil_beam');});
  const getBeam=()=>page.evaluate(()=>{const c=window.campaign,b=c.mission.state.buildings.find(b=>b.kind==='derrick');return c.world.buildingObjects.get(b.id).getObjectByName('oil_beam').rotation.y;});
  const angles=[await getBeam()];
  for(let i=0;i<4;i++){
   await page.evaluate(()=>{window.campaign.advance(1.3);return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
   angles.push(await getBeam());
  }
  assert(Math.max(...angles)-Math.min(...angles)>.12,'Oil beam must rock over a full cycle');
  await page.screenshot({path:'campaign/previews/field-oil-pump.png'});
  const powered=await page.evaluate(async ()=>{
   const c=window.campaign,m=c.mission,gen=m.state.buildings.find(b=>b.kind==='generator'&&b.owner==='rai');
   const hp=gen.hp,energy=m.state.energy,well=m.state.buildings.find(b=>b.kind==='derrick'),previous=well.pumpTime;
   gen.hp=0;c.advance(2);
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   const stopped={energy:m.state.energy===energy,pump:well.pumpTime===previous,power:well.powered,caption:document.querySelector('#details').textContent};
   gen.hp=hp;c.advance(.3);
   return {stopped,resumed:well.powered&&well.pumpTime>previous,meter:document.querySelector('#energy-meter').value,fleet:document.querySelector('#fleet-meter').value,energy:m.state.energy};
  });
  assert.deepEqual(powered.stopped,{energy:true,pump:true,power:false,caption:'650/650 HP · Нет питания'});
  assert(powered.resumed);
  assert.equal(powered.meter,powered.energy);
  assert.equal(powered.fleet,5);
  await page.evaluate(()=>{const c=window.campaign,p=c.world.field.gridToWorld(c.mission.config.startGrid);c.world.centre(p,920);return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
  assert.equal(await page.evaluate(()=>window.campaign.world.statistics.terrainMode),'overview');
  await page.screenshot({path:'campaign/previews/field-soft-fog.png'});
  await page.evaluate(()=>{const c=window.campaign,b=c.mission.state.buildings.find(b=>b.kind==='derrick');c.world.centre(b,165);return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
  const light=await page.evaluate(()=>{
   const c=window.campaign,lit=c.world.scene.getObjectsByProperty('type','SpotLight').filter(l=>l.intensity>0),canvas=document.querySelector('#labels');
   return{realSpotlights:lit.length,range:lit[0]?.distance,labelRect:canvas.getBoundingClientRect().width,labelBacking:canvas.width,frame:c.world.statistics};
  });
  assert(light.realSpotlights>=2);
  assert.equal(light.range,81);
  assert.equal(light.labelRect,1120);
  assert.equal(light.labelBacking,1680);
  await page.getByRole('button',{name:'Пулемёт 1',exact:true}).dblclick();
  const destination=await page.evaluate(()=>{
   const c=window.campaign,u=c.mission.entity(c.selected[0]);
   for(const [dx,dy] of [[64,0],[-64,0],[0,64],[0,-64],[46,46],[-46,-46]]){
    const p={x:u.x+dx,y:u.y+dy};
    if(c.mission.nav.lineClear(u,p))return c.world.screen(p,0);
   }
  });
  assert(destination);
  await page.locator('#move-order').click();
  await page.mouse.click(destination.x,destination.y);
  assert.equal(await page.evaluate(()=>{const c=window.campaign;return c.mission.entity(c.selected[0])?.task?.type;}),'move','Click in the scene must issue a move order');
  const workStart=await page.evaluate(()=>{const c=window.campaign,u=c.mission.entity(c.selected[0]);return{x:u.x,y:u.y};});
  for(let i=0;i<52;i++){
   const arrived=await page.evaluate(()=>{
    const c=window.campaign,u=c.mission.entity(c.selected[0]);
    c.advance(.5);
    return !u.path.length && !u.task;
   });
   await page.waitForTimeout(60);
   if(arrived)break;
  }
  await page.waitForFunction(()=>window.campaign.world.statistics.tireMarks>0);
  const drive=await page.evaluate(p=>{
   const c=window.campaign,u=c.mission.entity(c.selected[0]);
   return {distance:Math.hypot(u.x-p.x,u.y-p.y),unit:u,nearby:c.mission.state.units.filter(other=>other!==u&&Math.hypot(u.x-other.x,u.y-other.y)<55).map(({id,x,y,heading})=>({id,x,y,heading}))};
  },workStart);
  const driven=drive.distance;
  if(driven<=12||drive.unit.task){
   fs.mkdirSync('campaign/reports',{recursive:true});
   fs.writeFileSync('campaign/reports/field-move-failure.json',await page.evaluate(()=>window.campaign.mission.save()));
  }
  assert(driven>12&&!drive.unit.task,JSON.stringify(drive));
  await page.screenshot({path:'campaign/previews/field-headlights-tracks.png'});
  const report={base,light,driven,pausedBetweenCommands:true,layeredConstruction:true,oilDirectClick:true,radioSkipPersisted:true,animatedPump:true,oilPowerLoss:powered.stopped,resumedPump:powered.resumed,errors};
  assert.deepEqual(errors,[]);
  fs.mkdirSync('campaign/reports',{recursive:true});
  fs.writeFileSync('campaign/reports/campaign-browser.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
