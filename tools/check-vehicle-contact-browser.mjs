import assert from 'node:assert/strict';
import fs from 'node:fs';
export async function checkVehicleContactBrowser(page){
 const result=await page.evaluate(async()=>{
  const c=window.campaign,m=c.mission,w=c.world,d=c.damageDebug,T=await import('three');c.renderSuspended=true;
  document.querySelector('#welcome').hidden=true;d.panel.hidden=true;
  m.state.units=[];m.state.buildings=[];m.state.salvage.items=[];m.state.pendingCinematics=[];m.effects=[];m.pendingTick=null;m.accumulator=0;m.updateMission=()=>{};
  const p=w.field.gridToWorld(m.config.startGrid),oil=w.field.gridToWorld(m.config.oilFields[0]);
  const units=[m.addUnit('builder','rai',{x:oil.x+55,y:oil.y-30}),m.addUnit('bukhanka','rai',{x:oil.x+55,y:oil.y+5})];
  units[0].heading=units[0].previousHeading=.6;units[1].heading=units[1].previousHeading=-.3;
  const building=m.addStructure('derrick','rai',oil,{progress:.01,groundHeight:w.field.heightAt(oil.x,oil.y)});
  m.updateFog();d.view(units[0].id,130);w.controls.enableDamping=false;
  const point=new T.Vector3(),matrix=new T.Matrix4();
  function gaps(){
   const out=units.map(u=>({id:u.id,position:w.vehicles.transforms.get(u.id).position.toArray(),wheels:[Infinity,Infinity,Infinity,Infinity],supports:[]}));
   w.vehicles.root.traverse(mesh=>{
    if(!mesh.isInstancedMesh||!mesh.visible||!mesh.count)return;
    const p=mesh.geometry.attributes.position,part=mesh.geometry.attributes.damagePart;if(!part)return;
    for(let instance=0;instance<Math.min(mesh.count,out.length);instance++){
     mesh.getMatrixAt(instance,matrix);
     for(let i=0;i<p.count;i++){
      const id=Math.round(part.getX(i));if(id<1||id>4)continue;
      point.fromBufferAttribute(p,i).applyMatrix4(matrix);
      const gap=(point.z-w.field.heightAt(point.x,point.y))/m.config.worldScale;
      if(gap<out[instance].wheels[id-1]){out[instance].wheels[id-1]=gap;out[instance].supports[id-1]=point.toArray();}
     }
    }
   });
   const terrain=[];w.terrain.root.traverse(n=>{if(n.isMesh&&n.name.startsWith('alpha_terrain_chunk'))terrain.push(n);});
   for(const unit of out)unit.renderGaps=unit.supports.map(p=>{
    const ray=new T.Raycaster(new T.Vector3(p[0],p[1],p[2]+100),new T.Vector3(0,0,-1)),hit=ray.intersectObjects(terrain,false)[0];
    return hit?(p[2]-hit.point.z)/m.config.worldScale:null;
   });return out;
  }
  const samples=[];
  for(const progress of [.01,.1,.4,.8,1]){
   building.progress=progress;building.completed=progress===1;
   for(let i=0;i<3;i++){await new Promise(requestAnimationFrame);w.update(m,new Set(units.map(u=>u.id)),1/60);}
   samples.push({progress,units:gaps()});
  }
  return {samples};
 });
 await page.screenshot({path:'campaign/previews/vehicle-grounding-construction.png'});
 result.collision=await page.evaluate(async()=>{
  const c=window.campaign,m=c.mission,w=c.world,d=c.damageDebug,{vehicleClearance,clearOfVehicles}=await import('./vehicle-collision.js');
  m.pendingTick=null;m.accumulator=0;m.state.units=[];m.state.buildings=[];m.effects=[];m.state.salvage.items=[];
  const p=w.field.gridToWorld(m.config.startGrid),wreck=m.addUnit('raider','scavs',p),car=m.addUnit('bukhanka','rai',{x:p.x-17,y:p.y});
  car.heading=car.previousHeading=-Math.PI/2;car.driveSpeed=30;car.reversing=false;car.path=[{x:p.x+90,y:p.y}];car.task={type:'move',...car.path[0]};
  m.updateFog();d.view(car.id,48);w.update(m,new Set(),1/60);
  const before=JSON.stringify(wreck.damage?.cage??null),beforeHP=car.hp;
  m.rebuildNavigation();let minimum=Infinity,ticks=0;
  for(;ticks<60&&!car.damage?.hits;ticks++){m.state.time+=.1;m.updateUnit(car,.1);minimum=Math.min(minimum,vehicleClearance(car,wreck,m.config.worldScale,w.field));}
  const impactHits=car.damage?.hits??0,damage=beforeHP-car.hp,deformed=before!==JSON.stringify(wreck.damage.cage),blocked=!clearOfVehicles(car,{...car,x:wreck.x,y:wreck.y},m.state.units,m.config.worldScale);
  m.stop([car.id]);for(let i=0;i<30;i++){m.state.time+=.1;m.updateUnit(car,.1);}const restingHits=car.damage?.hits??0;
  d.hit(wreck.id,{type:'bullet',power:wreck.hp,side:'rear'});
  const released=clearOfVehicles(car,{...car,x:wreck.x,y:wreck.y},m.state.units,m.config.worldScale),retained=!!wreck.damage.wreck&&m.state.units.includes(wreck);
  w.update(m,new Set(),1/60);const transform=w.vehicles.transforms.get(wreck.id).matrix.elements.slice();let stationary=true;
  for(const phase of [0,.03,.09,.01]){m.accumulator=phase;w.update(m,new Set(),1/60);stationary&&=transform.every((x,i)=>x===w.vehicles.transforms.get(wreck.id).matrix.elements[i]);}
  d.selectTarget(car.id);d.view(car.id,50);w.update(m,new Set(),1/60);
  return {ticks,minimum,impactHits,restingHits,damage,deformed,blocked,released,retained,stationary,carPart:car.damage?.lastImpact?.partId,wreckPart:wreck.damage?.lastImpact?.partId};
 });
 await page.screenshot({path:'campaign/previews/vehicle-wreck-contact.png'});
 fs.writeFileSync('campaign/reports/vehicle-contact-smoke.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 for(const sample of result.samples)for(const u of sample.units){assert(u.wheels.every(Number.isFinite));assert(Math.min(...u.wheels)<.05,'Every resting vehicle needs tyre contact');assert(Math.max(...u.wheels)<.15,'Suspension must not leave all tyres floating');}
 assert(result.collision.blocked&&result.collision.stationary);assert(result.collision.minimum>=-.001,'No live vehicle overlap');assert(result.collision.damage>0&&result.collision.deformed,'Actual movement contact must damage and deform');assert.equal(result.collision.impactHits,result.collision.restingHits,'Resting contact must not cause continuous damage');
 assert(result.collision.released&&result.collision.retained,'Death immediately releases collision while the visual wreck remains');
}
