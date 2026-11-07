const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,
  args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('requestfailed',request=>{if(request.failure()?.errorText!=='net::ERR_ABORTED')console.error(request.url(),request.failure()?.errorText);});
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto((process.env.DAMAGE_BASE_URL??'http://127.0.0.1:8766')+'/campaign/');
  try{await page.waitForFunction(()=>window.campaign?.ready,{},{timeout:60000});}
  catch(error){throw new Error(errors.join('\n')||await page.locator('#loading-status').textContent(),{cause:error});}
  await page.locator('#begin').click();
  if(await page.locator('[data-skip-all]').isVisible())await page.locator('[data-skip-all]').click();
  await page.locator('#pause').click();
  const fixture=await page.evaluate(async ()=>{
   const c=window.campaign,m=c.mission,w=c.world,p=w.field.gridToWorld(m.config.startGrid);
   const point=(x,y)=>({x:p.x+x,y:p.y+y});
   const gun=m.addUnit('bukhanka','rai',point(2,-18)),flame=m.addUnit('flamer','rai',point(-40,6));
   const tower=m.addStructure('mg-tower','scavs',point(17,43),{campId:'west-south'});
   const frame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   m.rebuildNavigation();m.updateFog();w.centre(point(-10,17),290);await frame();
   const top=w.screen(tower,m.config.worldScale*10.8);
   let roof;
   for(let y=-12;y<=12&&!roof;y+=2)for(let x=-12;x<=12;x+=2){
    const candidate={x:top.x+x,y:top.y+y};
    if(w.pickEntity(m,candidate.x,candidate.y)?.id===tower.id){roof=candidate;break;}
   }
   if(!roof)throw new Error('The tower roof is absent from the picking geometry');
   const ground=w.ground(roof.x,roof.y);
   const decoy=m.addStructure('camp-core','scavs',ground,{campId:'nw-pocket'});
   m.updateFog();await frame();
   if(w.pickEntity(m,roof.x,roof.y)?.id!==tower.id)throw new Error('The background building occludes the tower roof');
   c.select([gun.id]);
   const T=await import('three'),model=w.vehicles.makeDesignModel(['C01','B01','mission-flamer']);
   model.root.updateMatrixWorld(true);
   const from=model.upper.getObjectByName('mount').getWorldPosition(new T.Vector3());
   const to=model.body.getObjectByName('upper_mount').getWorldPosition(new T.Vector3());
   return {gun:gun.id,flame:flame.id,tower:tower.id,decoy:decoy.id,roof,mountError:from.distanceTo(to)};
  });
  assert(fixture.mountError<1e-7);
  await page.locator('#attack-order').click();
  await page.mouse.click(fixture.roof.x,fixture.roof.y);
  assert.equal(await page.evaluate(id=>window.campaign.mission.entity(id).task?.targetId,fixture.gun),fixture.tower);
  const move=await page.evaluate(()=>{
   const c=window.campaign,p=c.world.field.gridToWorld(c.mission.config.startGrid);
   return c.world.screen({x:p.x-93,y:p.y-20},0);
  });
  assert.equal(await page.evaluate(()=>window.campaign.state.orderMode),'attack');
  await page.mouse.click(move.x,move.y);
  assert.equal(await page.evaluate(id=>window.campaign.mission.entity(id).task?.type,fixture.gun),'attack-move');
  const effects=await page.evaluate(fixture=>{
   const c=window.campaign,m=c.mission,w=c.world;
   const gun=m.entity(fixture.gun),flame=m.entity(fixture.flame),tower=m.entity(fixture.tower);
   let time=performance.now();
   Object.defineProperty(performance,'now',{configurable:true,value:()=>time});
   if(!m.attack(gun,tower,m.unitSpec(gun))||!m.attack(flame,tower,m.unitSpec(flame)))throw new Error('Combat fixture is out of range or blocked');
   const hit=m.effects[0].to.z-w.field.heightAt(tower.x,tower.y);
   w.update(m,new Set(),0);
   const first=w.statistics;
   time+=360;w.update(m,new Set(),0);
   return {hit,first,mid:w.statistics};
  },fixture);
  assert(effects.hit>25&&effects.first.tracers>0&&effects.mid.flameCoreVertices>0,JSON.stringify(effects));
  fs.mkdirSync('campaign/previews',{recursive:true});
  await page.screenshot({path:'campaign/previews/field-combat-siege.png'});
  const impact=await page.evaluate(()=>{
   const c=window.campaign,next=performance.now()+180;
   Object.defineProperty(performance,'now',{configurable:true,value:()=>next});
   c.world.update(c.mission,new Set(),0);
   return c.world.statistics;
  });
  assert(impact.impacts>=2&&impact.smokeParticles>0,JSON.stringify(impact));
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({mountError:fixture.mountError,towerRoof:true,attackMove:true,impactHeight:effects.hit,
   tracerCount:effects.first.tracers,flameCoreVertices:effects.mid.flameCoreVertices,smokeParticles:impact.smokeParticles,errors}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
