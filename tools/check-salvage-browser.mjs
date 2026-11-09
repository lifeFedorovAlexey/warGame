import assert from 'node:assert/strict';
import fs from 'node:fs';
export async function checkSalvageBrowser(page){
  const result=await page.evaluate(async()=>{
    const c=window.campaign,m=c.mission,w=c.world,d=c.damageDebug,{updateSalvage}=await import('./vehicle-salvage.js'),T=await import('three');c.renderSuspended=true;
    const start=w.field.gridToWorld(m.config.startGrid);m.state.units=[];m.state.buildings=[];m.state.salvage.items=[];m.effects=[];m.events=[];
    const source=m.addUnit('bukhanka','rai',start),receiver=m.addUnit('bukhanka','rai',{x:start.x+30,y:start.y+25});
    m.updateFog();d.view(source.id,46);w.update(m,new Set(),1/60);
    const a=d.hit(source.id,{partId:7,type:'bullet',power:160}),b=d.hit(source.id,{partId:8,type:'bullet',power:160});w.update(m,new Set(),1/60);
    const spawned=m.state.salvage.items.length,drop=m.state.salvage.items[0];if(!drop)throw new Error('No actual recoverable guard');
    const beforeHP=receiver.hp;m.state.salvage.enabled=true;m.state.salvage.wanted=['hood-guard'];
    // Use the real route planner and driveStep; only mission objectives/other
    // units are excluded from this focused interaction fixture.
    receiver.x=receiver.previousX=drop.x+20;receiver.y=receiver.previousY=drop.y;
    receiver.heading=receiver.previousHeading=Math.PI/2;m.state.time=drop.readyAt+.1;
    const order=m.order([receiver.id],'move',{x:drop.x,y:drop.y});if(!order.ok)throw new Error(order.reason);
    const initialPath=structuredClone(receiver.path),initialTask=structuredClone(receiver.task),trace=[],pickupPath=m.salvagePath(receiver,drop);
    let ticks=0;for(;ticks<500&&!receiver.damage?.parts?.[22]?.installed;ticks++){
      m.state.time+=.1;m.updateUnit(receiver,.1);updateSalvage(m);
      if(ticks<5)trace.push({position:[receiver.x,receiver.y],path:receiver.path.slice(),task:receiver.task});
      if(ticks%5===0){await new Promise(requestAnimationFrame);w.update(m,new Set(),1/30);}
    }
    d.view(receiver.id,36);w.update(m,new Set(),1/60);
    const installed=!!receiver.damage?.parts?.[22]?.installed;
    if(!installed)throw new Error('Pickup failed: '+JSON.stringify({ticks,drop,pickupPath,initialPath,initialTask,trace,position:[receiver.x,receiver.y],task:receiver.task,path:receiver.path,salvage:m.state.salvage}));
    const hoodHp=receiver.hp,hoodMaxHp=receiver.maxHp;
    const hit=d.hit(receiver.id,{partId:22,type:'bullet',power:8});
    const hpLost=hoodHp-receiver.hp;
    const save=m.save();m.load(save);const loaded=m.entity(receiver.id),persisted=loaded.damage.parts[22].installed&&m.state.salvage.enabled;
    const remaining=m.state.salvage.items.length,second=m.state.salvage.items[0];m.state.salvage.wanted=['window-grille'];
    // A second drive collects the other real guard and fits the other recipe.
    const secondOrder=m.order([loaded.id],'move',{x:second.x,y:second.y});if(!secondOrder.ok)throw new Error(secondOrder.reason);
    let grilleTicks=0;for(;grilleTicks<500&&!loaded.damage?.parts?.[23]?.installed;grilleTicks++){
      m.state.time+=.1;m.updateUnit(loaded,.1);updateSalvage(m);
      if(grilleTicks%5===0){await new Promise(requestAnimationFrame);w.update(m,new Set(),1/30);}
    }
    w.update(m,new Set(),1/60);const grilleInstalled=!!loaded.damage?.parts?.[23]?.installed;
    const beforeGrilleHit=loaded.hp,grilleMaxHp=loaded.maxHp,grilleHit=d.hit(loaded.id,{partId:23,type:'bullet',power:8}),grilleHpLost=beforeGrilleHit-loaded.hp;
    m.state.time+=241;updateSalvage(m);w.update(m,new Set(),1/60);
    // Isolate the recipient for the inspection image; the pickup assertions
    // above used the actual recipient and the donor's visual, non-solid wreck.
    m.state.units=[loaded];d.selectTarget(loaded.id);w.update(m,new Set(),1/60);const matrix=w.damage.matrixFor(loaded).clone();w.controls.enableDamping=false;w.controls.target.copy(new T.Vector3(0,0,1.4).applyMatrix4(matrix));w.camera.position.copy(new T.Vector3(5,7,4.5).applyMatrix4(matrix));w.controls.update();w.update(m,new Set(),1/60);document.querySelector('#welcome').hidden=true;d.panel.hidden=true;
    return {a:!!a,b:!!b,spawned,installed,ticks,travelled:Math.hypot(receiver.x-(drop.x+20),receiver.y-drop.y),hitPart:hit?.partId,beforeHP,hoodHp,hoodMaxHp,grilleMaxHp,hpLost,persisted,remaining,grilleInstalled,grilleTicks,grilleHitPart:grilleHit?.partId,grilleHpLost,expired:m.state.salvage.items.length,renderedRecoverable:w.damage.statistics.recoverableParts,unitId:loaded.id};
  });
  assert(result.a&&result.b);assert.equal(result.spawned,2);assert(result.installed&&result.travelled>5);assert.equal(result.hitPart,22);assert(Math.abs(result.hpLost-5.2)<1e-6);assert(result.persisted);assert.equal(result.remaining,1);assert.equal(result.expired,0);assert.equal(result.renderedRecoverable,0);
  assert(result.grilleInstalled);assert.equal(result.grilleHitPart,23);assert(Math.abs(result.grilleHpLost-6)<1e-6);
  assert.equal(result.hoodHp,result.beforeHP+120);assert.equal(result.hoodMaxHp,440);assert.equal(result.grilleMaxHp,520);
  await page.screenshot({path:'campaign/previews/salvage-installed.png'});
  // Verify the actual constructor preference, rather than relying on a hidden API.
  await page.evaluate(()=>{document.querySelector('#welcome').hidden=true;document.querySelector('#design-toggle').click();});
  await page.locator('#designer').waitFor({state:'visible'});
  await page.locator('.design-salvage > summary').click();
  const toggle=page.locator('[data-salvage-enabled]');await toggle.uncheck();assert.equal(await page.evaluate(()=>window.campaign.mission.state.salvage.enabled),false);await toggle.check();
  await page.screenshot({path:'campaign/previews/salvage-designer.png'});
  fs.writeFileSync('campaign/reports/salvage-smoke.json',JSON.stringify({date:new Date().toISOString(),...result,constructorToggle:true},null,2));
  console.log(JSON.stringify({salvage:result,constructorToggle:true}));
}
