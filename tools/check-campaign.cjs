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
  try{await page.waitForFunction(()=>window.campaign?.ready||document.querySelector('#loading-status').textContent.startsWith('Ошибка'),{},{timeout:90000});}
  catch(error){throw new Error(errors.join('\n')||await page.locator('#loading-status').textContent(),{cause:error});}
  assert(await page.evaluate(()=>window.campaign?.ready),errors.join('\n')||await page.locator('#loading-status').textContent());
  await page.locator('#begin').click();
  await page.waitForFunction(()=>window.campaign.drivingAudio.running&&window.campaign.drivingAudio.recordings);
  await page.waitForFunction(()=>window.campaign.mission.state.time>.2&&!document.querySelector('#radio').hidden);
  await page.waitForFunction(()=>window.campaign.storyAudio.playing);
  assert.equal(await page.evaluate(()=>window.campaign.mission.state.units.filter(u=>u.owner==='rai').length),5);
  const briefing=await page.evaluate(()=>{
   const c=window.campaign,{field,controls,storySignals}=c.world;
   const start=field.gridToWorld(c.mission.config.startGrid);
   return {target:{x:controls.target.x,y:controls.target.y},start,signal:storySignals.current};
  });
  assert.deepEqual(briefing.target,briefing.start,'Briefing leaves the camera under player control');
  assert.equal(briefing.signal.kind,'guidance');
  assert.equal(await page.locator('#objective-focus').isVisible(),false,'Only the radio shows the oil shortcut during the briefing');
  await page.locator('[data-focus]').click();
  assert(await page.evaluate(p=>{
   const {target}=window.campaign.world.controls;
   return Math.hypot(target.x-p.x,target.y-p.y)<.01;
  },briefing.signal),'Optional radio focus goes to the marked oil point');
  const warning=await page.evaluate(()=>{
   const c=window.campaign,{mission,radio}=c;
   const seen=mission.state.seenCinematics.slice(),until=radio.until;
   mission.cinematic('artifact-mg-ammo-1');c.advance(0);
   const before=radio.entry.chapter;
   mission.cinematic('first-contact');c.advance(0);
   radio.until=Infinity;
   mission.state.seenCinematics=seen;
   return {before,chapter:radio.entry.chapter,interrupted:performance.now()<until,
    queued:radio.queue.map(entry=>entry.chapter),signal:c.world.storySignals.current?.kind};
  });
  assert.deepEqual(warning,{before:'intro',chapter:'first-contact',interrupted:true,queued:['artifact-mg-ammo-1'],signal:'threat'});
  await page.waitForFunction(()=>{
   const audio=window.campaign.storyAudio;
   return audio.playing&&audio.chapter==='first-contact'&&audio.urgent;
  });
  const minimapWithRadio=await page.locator('#minimap').boundingBox();
  await page.locator('[data-skip-all]').click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('warGame.fieldRadio')),'off');
  assert.equal(await page.evaluate(()=>window.campaign.world.storySignals.current),null);
  assert.equal(await page.evaluate(()=>window.campaign.storyAudio.playing),false);
  assert.equal(await page.evaluate(()=>window.campaign.radio.queue.length),0,'Skipping radio also drops queued transmissions');
  assert.deepEqual(await page.locator('#minimap').boundingBox(),minimapWithRadio,'Dismissing the radio does not move the minimap');
  if(!await page.locator('#home').isVisible())await page.locator('.settings > summary').click();
  assert(await page.locator('#control-hints').isHidden());
  await page.locator('#controls-help').click();
  assert(await page.locator('#control-hints').isVisible());
  await page.locator('#controls-help').click();
  await page.locator('#home').click();
  assert.equal(await page.locator('.settings').getAttribute('open'),null);
  await page.locator('#pause').click();
  const idleShadows=await page.evaluate(()=>{
   const {mission,world,advance}=window.campaign;
   const render=()=>world.update(mission,new Set(),1/60);
   advance(.25);render();
   const before=world.statistics.shadowUpdates;
   for(let i=0;i<4;i++){advance(.125);render();}
   return world.statistics.shadowUpdates-before;
  });
  assert.equal(idleShadows,0,'Simulation ticks with identical casters reuse the shadow map');
  await page.getByRole('button',{name:'Строитель 2',exact:true}).click({modifiers:['Shift']});
  await page.locator('#build-toggle').click();
  try{await page.waitForFunction(()=>[...document.querySelectorAll('#build-cards img')].length===5&&[...document.querySelectorAll('#build-cards img')].every(img=>img.naturalWidth===192),{},{timeout:10000});}
  catch(error){throw new Error(errors.join('\n')||JSON.stringify(await page.evaluate(()=>({hidden:document.querySelector('#build-palette').hidden,imgs:[...document.querySelectorAll('#build-cards img')].map(i=>i.naturalWidth),selection:window.campaign.selected}))),{cause:error});}
  fs.mkdirSync('campaign/previews',{recursive:true});
  await page.screenshot({path:'campaign/previews/field-building-cards.png'});
  const viewport=page.viewportSize();
  await page.setViewportSize({width:800,height:600});
  const buildLayout=await page.evaluate(()=>{
   const tray=document.querySelector('#build-palette');
   const map=document.querySelector('#world canvas').getBoundingClientRect();
   const squad=document.querySelector('.squad').getBoundingClientRect();
   const orders=document.querySelector('.order-bar').getBoundingClientRect();
   const x=(squad.right+orders.left)/2,y=(orders.top+orders.bottom)/2;
   const rows=new Set([...tray.querySelectorAll('#build-cards button')].map(card=>card.getBoundingClientRect().top));
   return {rows:rows.size,scroll:tray.scrollHeight>tray.clientHeight,
    fullMap:map.top===0&&map.bottom===innerHeight,
    mapClick:x>squad.right&&document.elementFromPoint(x,y)===document.querySelector('#world canvas')};
  });
  assert.deepEqual(buildLayout,{rows:1,scroll:false,fullMap:true,mapClick:true},
   'The compact controls fit without reserving an opaque strip below the map');
  await page.setViewportSize(viewport);
  await page.getByRole('button',{name:/^АЭС/}).click();
  await page.locator('#suggest-site').click();
  const position=await page.evaluate(()=>{const w=window.campaign.world;return w.screen(w.controls.target,0);});
  await page.mouse.click(position.x,position.y);
  await page.waitForFunction(()=>window.campaign.mission.state.buildings.some(b=>b.owner==='rai'&&b.kind==='generator'));
  await page.getByRole('button',{name:'К нефти',exact:true}).click();
  assert.equal(await page.locator('.settings').getAttribute('open'),null,'Oil focus is available with the operation menu closed');

  const oil=await page.evaluate(()=>{
   const {world,storyAudio}=window.campaign,p=world.storySignals.current;
   return {position:world.screen(p,2),target:{x:world.controls.target.x,y:world.controls.target.y},signal:p,playing:storyAudio.playing};
  });
  assert.deepEqual(oil.target,{x:briefing.signal.x,y:briefing.signal.y},'The objective opens the same playable oil point with radio off');
  assert.equal(oil.signal.kind,'guidance');
  assert.equal(oil.playing,false);
  await page.mouse.move(oil.position.x,oil.position.y);
  assert.equal(await page.locator('#world canvas').getAttribute('title'),'Построить вышку');
  await page.mouse.click(oil.position.x,oil.position.y);
  await page.waitForFunction(()=>window.campaign.mission.state.buildings.some(b=>b.owner==='rai'&&b.kind==='derrick'));
  assert.equal(await page.locator('#objective-focus').isVisible(),false);
  assert.equal(await page.evaluate(()=>window.campaign.world.storySignals.current),null);
  assert.equal(await page.evaluate(()=>window.campaign.mission.state.energy),530);
  const construction=await page.evaluate(async ()=>{
   const c=window.campaign,m=c.mission,b=m.state.buildings.find(e=>e.owner==='rai'&&e.kind==='generator');
   const {workProjection,projectorHasSight}=await import('/campaign/builder-optics.js');
   let simultaneous=0;
   for(let i=0;i<180;i++){
    c.advance(.3);
    const active=m.state.units.filter(u=>u.builderWorking&&u.task?.targetId===b.id);
    simultaneous=Math.max(simultaneous,active.length);
    for(const worker of active){
     const aim=workProjection(worker,b,m.config,m.field);
     if(!aim||!projectorHasSight(aim,worker,b,m.state.units,m.field,m.config.worldScale))throw new Error('Projector overlaps another vehicle');
    }
    if(b.progress>.32&&b.progress<.8&&simultaneous===2){c.world.centre(b,170);break;}
   }
   return {simultaneous,progress:b.progress};
  });
  assert.equal(construction.simultaneous,2,JSON.stringify(construction));
  await page.waitForFunction(()=>{
   const c=window.campaign,b=c.mission.state.buildings.find(e=>e.owner==='rai'&&e.kind==='generator'),mesh=c.world.buildingObjects.get(b.id)?.getObjectByName('building_structure');
   return c.world.statistics.projectors>0&&mesh?.visible&&mesh.children.some(o=>o.material.clippingPlanes?.length);
  });
  const projection=await page.evaluate(async ()=>{
   const T=await import('three'),{mission,world}=window.campaign,beams=world.vehicles.workBeams;
   const geometry=world.scene.getObjectByName('construction_projection').geometry,positions=geometry.getAttribute('position');
   const error=(a,b,point)=>Math.hypot(
    (positions.getX(a)+positions.getX(b))/2-point.x,
    (positions.getY(a)+positions.getY(b))/2-point.y,
    (positions.getZ(a)+positions.getZ(b))/2-point.z);
   let endpointError=0;
   for(const [i,{from,to}] of beams.entries())for(const side of [0,6]){
    const first=i*12+side;
    endpointError=Math.max(endpointError,error(first,first+1,from),error(first+2,first+4,to));
   }
   const surfaceErrors=[];
   for(const {from,to,targetId} of beams){
    if(mission.entity(targetId)?.kind!=='generator')continue;
    const body=world.buildingObjects.get(targetId).getObjectByName('building_structure');
    const direction=to.clone().sub(from),length=direction.length();
    const ray=new T.Raycaster(from,direction.normalize(),0,length+.4);
    const hits=ray.intersectObject(body,true).filter(hit=>hit.point.z<=to.z+.13);
    surfaceErrors.push(Math.min(...hits.map(hit=>Math.abs(hit.distance-length))));
   }
   return {beams:beams.length,vertices:geometry.drawRange.count,endpointError,surfaceErrors};
  });
  assert(projection.beams>=2&&projection.vertices===projection.beams*12&&projection.endpointError<.002,JSON.stringify(projection));
  assert(projection.surfaceErrors.length>=2&&projection.surfaceErrors.every(error=>error<.35),JSON.stringify(projection));
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
  const workStart=await page.evaluate(()=>{const c=window.campaign,u=c.mission.entity(c.selected[0]);return{x:u.x,y:u.y,shadowUpdates:c.world.statistics.shadowUpdates};});
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
   return {distance:Math.hypot(u.x-p.x,u.y-p.y),shadowUpdates:c.world.statistics.shadowUpdates-p.shadowUpdates,unit:u,nearby:c.mission.state.units.filter(other=>other!==u&&Math.hypot(u.x-other.x,u.y-other.y)<55).map(({id,x,y,heading})=>({id,x,y,heading}))};
  },workStart);
  const driven=drive.distance;
  if(driven<=12||drive.unit.task){
   fs.mkdirSync('campaign/reports',{recursive:true});
   fs.writeFileSync('campaign/reports/field-move-failure.json',await page.evaluate(()=>window.campaign.mission.save()));
  }
  assert(driven>12&&!drive.unit.task,JSON.stringify(drive));
  assert(drive.shadowUpdates>0,'Moving vehicles still refresh their shadows');
  await page.screenshot({path:'campaign/previews/field-headlights-tracks.png'});
  const models=await page.evaluate(async ()=>{
   const c=window.campaign,m=c.mission;
   const p=c.world.field.gridToWorld(m.config.startGrid);
   const keys=['flamethrower','mg-ammo-1','mg-tower'];
   keys.forEach((key,i)=>m.state.artifacts.push({id:'fixture-'+i,key,x:p.x+21*(i-1),y:p.y,collected:false}));
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   const parts=keys.map(key=>c.world.scene.getObjectByName('salvage_'+key)?.children.length);
   m.state.artifacts[0].collected=true;
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   return {parts,collectedRemoved:!c.world.scene.getObjectByName('salvage_flamethrower')};
  });
  assert(models.parts.every(count=>count>4)&&models.collectedRemoved);
  const approach=await page.evaluate(()=>{
   const {mission,world}=window.campaign,{field}=world;
   return mission.state.buildings.filter(b=>b.campId==='west-south').map(b=>{
    const tower=b.kind==='mg-tower',scale=mission.config.worldScale;
    const w=(tower?2.58:5.55)*scale,d=(tower?2.58:3.6)*scale;
    const foundation=field.heightAt(b.x,b.y),depth=(tower ? .22 : .18)*scale;
    let asphalt=0,airGap=0;
    for(const x of [-w,0,w])for(const y of [-d,0,d]){
     asphalt=Math.max(asphalt,field.roadBlendAt(b.x+x,b.y+y));
     if(!tower||(x&&y))airGap=Math.max(airGap,foundation-depth-field.heightAt(b.x+x,b.y+y));
    }
    return {kind:b.kind,asphalt,airGap};
   });
  });
  assert(approach.length===3&&approach.every(b=>b.asphalt<.2&&b.airGap<.1),JSON.stringify(approach));
  const towerShots=await page.evaluate(async ()=>{
   const T=await import('three'),{mission,world}=window.campaign,{field}=world;
   const tower=mission.state.buildings.find(b=>b.kind==='mg-tower'&&b.campId==='west-south');
   const [col,row]=field.worldToGrid(tower.x,tower.y).map(Math.round);
   mission.visible[row*128+col]=mission.explored[row*128+col]=1;
   const result=[];
   for(const [dx,dy] of [[90,30],[-76,65]]){
    const x=tower.x+dx,y=tower.y+dy,to={x,y,z:field.heightAt(x,y)+9};
    tower.aimTarget=to;
    mission.effects.push({type:'shot',from:tower.id,to,weapon:'mg'});
    world.update(mission,new Set(),0);
    const model=world.buildingObjects.get(tower.id),muzzle=model.getObjectByName('muzzle');
    const recoil=model.getObjectByName('tower_recoil').position.y;
    const tip=muzzle.getWorldPosition(new T.Vector3()),forward=new T.Vector3(0,-1,0).transformDirection(muzzle.matrixWorld);
    const alignment=forward.dot(new T.Vector3(to.x,to.y,to.z).sub(tip).normalize());
    const flash=world.scene.getObjectByName('field_muzzle_flash'),matrix=new T.Matrix4();
    const expected=tip.clone().addScaledVector(forward,.10*mission.config.worldScale);
    let flashDistance=Infinity;
    for(let i=0;i<flash.count;i++){
     flash.getMatrixAt(i,matrix);
     flashDistance=Math.min(flashDistance,new T.Vector3().setFromMatrixPosition(matrix).distanceTo(expected));
    }
    let part;
    if(world.damage){
     const origin=muzzle.localToWorld(new T.Vector3(.4,.23,0));
     const direction=new T.Vector3(-1,0,0).transformDirection(muzzle.matrixWorld);
     part=world.damage.trace(tower,origin.toArray(),direction.toArray())?.partId??null;
    }
    result.push({alignment,flashDistance,recoil,part});
   }
   return result;
  });
  assert(towerShots.every(shot=>shot.alignment>.9999&&shot.flashDistance<.005&&shot.recoil>.09&&[undefined,9].includes(shot.part)),JSON.stringify(towerShots));
  const finalView=await page.evaluate(()=>{
   // Present the debrief from an isolated UI fixture after the real base/drive checks.
   const c=window.campaign,m=c.mission,{target}=c.world.controls;
   m.state.status='victory';
   return {x:target.x,y:target.y,time:m.state.time,explored:m.explored.reduce((a,b)=>a+Number(!!b),0)};
  });
  await page.locator('#result-signal').waitFor();
  assert(await page.evaluate(p=>{
   const {target}=window.campaign.world.controls;
   return Math.hypot(target.x-p.x,target.y-p.y)<.01;
  },finalView),'Victory leaves camera in place');
  await page.locator('#result-signal').click();
  await page.waitForFunction(()=>window.campaign.world.scene.getObjectByName('southern_energy_trace').visible);
  const signal=await page.evaluate(()=>{
   const c=window.campaign,m=c.mission,{field,storySignals}=c.world,p=storySignals.current;
   return {grid:field.worldToGrid(p.x,p.y),bounds:m.state.bounds,time:m.state.time,explored:m.explored.reduce((a,b)=>a+Number(!!b),0)};
  });
  assert(signal.grid[1]>signal.bounds[3],'Energy signal comes from south of the operation');
  assert.equal(signal.time,finalView.time);
  assert.equal(signal.explored,finalView.explored);
  await page.screenshot({path:'campaign/previews/field-southern-signal.png'});
  const report={base,light,driven,pausedBetweenCommands:true,layeredConstruction:construction,oilDirectClick:true,radioSkipPersisted:true,optionalRadioFocus:true,oilFocusWithoutRadio:true,approach,towerShots,signal,artifactModels:models,animatedPump:true,oilPowerLoss:powered.stopped,resumedPump:powered.resumed,errors};
  assert.deepEqual(errors,[]);
  fs.mkdirSync('campaign/reports',{recursive:true});
  fs.writeFileSync('campaign/reports/campaign-browser.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
