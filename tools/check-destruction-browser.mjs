import assert from 'node:assert/strict';
import fs from 'node:fs';
export async function checkDestructionBrowser(page){
 const first=await page.evaluate(async()=>{
  const c=window.campaign,m=c.mission,w=c.world,d=c.damageDebug;c.renderSuspended=true;
  m.state.units=[];m.state.buildings=[];m.state.salvage.items=[];m.state.pendingCinematics=[];m.pendingTick=null;m.accumulator=0;m.effects=[];m.updateMission=()=>{};
  document.querySelector('#welcome').hidden=true;d.panel.hidden=true;
  const p=w.field.gridToWorld(m.config.startGrid),builder=m.addUnit('builder','rai',{x:p.x+80,y:p.y-65}),car=m.addUnit('bukhanka','rai',{x:p.x+95,y:p.y+55});
  const camp=m.addStructure('camp-core','scavs',p,{campId:'nw-pocket'}),raider=m.addUnit('raider','scavs',{x:p.x+95,y:p.y});
  m.updateFog();m.rebuildNavigation();d.view(camp.id,130);w.controls.enableDamping=false;w.update(m,new Set(),1/60);
  const blocked=m.placement('generator',p.x,p.y,0,{checkMoney:false});
  const buildingHit=d.hit(camp.id,{type:'shell',power:camp.hp,side:'front'}),carHit=d.hit(raider.id,{type:'bullet',power:raider.hp,side:'front'});
  w.update(m,new Set(),1/60);
  c.destructionFixture={p,builderId:builder.id,carId:car.id,campId:camp.id,raiderId:raider.id,start:m.state.time};
  for(let i=0;i<24;i++){await new Promise(requestAnimationFrame);w.update(m,new Set(),1/60);}
  return {blocked:!blocked.ok,buildingHit,carHit,explosions:w.statistics.explosions,physics:w.damage.statistics.activePhysics,parts:m.state.salvage.items.map(i=>({id:i.id,kind:i.sourceKind,part:i.sourcePart}))};
 });
 assert(first.blocked&&first.buildingHit&&first.carHit);assert(first.explosions>0);assert(first.parts.some(p=>p.kind==='raider'));
 await page.screenshot({path:'campaign/previews/destruction-explosion.png'});
 const result=await page.evaluate(async()=>{
  const c=window.campaign,m=c.mission,w=c.world,f=c.destructionFixture;
  for(let i=0;i<65;i++){m.advance(.1);w.update(m,new Set(),1/60);}
  const campRemoved=!m.state.buildings.some(b=>b.id===f.campId)&&!w.buildingObjects.has(f.campId);
  const rebuilt=m.build([f.builderId],'generator',f.p.x,f.p.y);
  if(!rebuilt.ok)throw new Error('Cannot build on cleared camp: '+rebuilt.reason);
  const stock=m.state.salvage.items.find(i=>i.sourceUnit===f.raiderId),car=m.entity(f.carId);
  const order=m.order([car.id],'move',stock);if(!order.ok)throw new Error(order.reason);
  let ticks=0;for(;ticks<500&&!car.damage?.parts?.[22]?.installed;ticks++){m.advance(.1);if(ticks%5===0){await new Promise(requestAnimationFrame);w.update(m,new Set(),1/30);}}
  while(m.state.time<f.start+13)m.advance(.1);
  w.update(m,new Set(),1/60);
  return {campRemoved,rebuild:rebuilt.ok,raiderRemoved:!m.state.units.some(u=>u.id===f.raiderId),raiderRenderRemoved:!w.vehicles.transforms.has(f.raiderId),installed:!!car.damage?.parts?.[22]?.installed,ticks,activePhysics:w.damage.statistics.activePhysics,geometryUpdates:w.damage.statistics.geometryUpdates};
 });
 assert(result.campRemoved&&result.rebuild&&result.raiderRemoved&&result.raiderRenderRemoved&&result.installed);assert(result.activePhysics<=24);
 await page.screenshot({path:'campaign/previews/destruction-cleared-site.png'});
 fs.writeFileSync('campaign/reports/destruction-smoke.json',JSON.stringify({first,result},null,2));console.log(JSON.stringify({destruction:{first,result}}));
}
