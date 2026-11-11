import assert from 'node:assert/strict';
import {factoryPoint,insideFactory} from '../campaign/factory-garage.js';
import {prepareM02Diagnostic} from '../campaign/mission02-diagnostic.js';
import {vehicleClearance} from '../campaign/vehicle-collision.js';
import {makeMission} from './m02-fixture.mjs';

for(const name of ['m01','m02']){
  const m=makeMission();
  if(name==='m02')prepareM02Diagnostic(m);
  m.state.units=[];
  m.updateMission=()=>{};
  for(const spec of [...Object.values(m.config.buildings),...Object.values(m.config.units)])spec.damage=0;
  for(const base of Object.values(m.state.m02?.bases??{}))if(base.production)base.production.stopped=true;
  m.explored.fill(255);
  m.visible.fill(255);
  m.state.energy=m.config.energyCapacity;
  const site=m.config.baseSites.find(site=>site.kind==='factory');
  const factory=m.state.buildings.find(b=>b.kind==='factory'&&b.owner==='rai')
    ??m.addStructure('factory','rai',m.field.gridToWorld(site.grid),{completed:true,progress:1});
  m.rebuildNavigation();
  const cars=[];
  const gap=(a,b)=>vehicleClearance(a,b,m.config.worldScale,m.field);
  for(let row=0;row<9&&cars.length<12;row++){
    for(const side of [0,-9,9,-18,18]){
      if(cars.length===12)break;
      const p=factoryPoint(m,factory,side,-26-row*8);
      const pose={...p,heading:factory.rotation??0,kind:'bukhanka',owner:'rai'};
      if(!m.vehicleMotionClear(pose,pose,pose)||cars.some(u=>gap(pose,u)<2))continue;
      const car=m.addUnit('bukhanka','rai',pose,{heading:pose.heading});
      car.hp=160;
      car.combatRetreat={forced:true,status:'planning',started:0};
      cars.push(car);
    }
  }
  assert.equal(cars.length,12,`${name}: a clear starting formation is required`);

  const ids=new Set(cars.map(car=>car.id)),released=new Set();
  let restored=false;
  for(let tick=0;tick<6000&&released.size<ids.size;tick++){
    m.advance(.1);
    m.drainEffects();
    for(const e of m.drainEvents())if(e.type==='factory-released'&&ids.has(e.unit))released.add(e.unit);
    const live=[...ids].map(id=>m.entity(id));
    assert(live.every(Boolean),`${name}: all vehicles survive the queue at ${m.state.time} (${[...ids].filter(id=>!m.entity(id)).join(', ')})`);
    const outside=live.filter(car=>!insideFactory(car));
    assert(outside.filter(car=>['gate','entering'].includes(car.factoryVisit?.phase)).length<=1,`${name}: one incoming vehicle`);
    for(let i=0;i<outside.length;i++)for(let j=0;j<i;j++){
      assert(gap(outside[i],outside[j])>-.05,`${name}: ${outside[i].id} and ${outside[j].id} overlap at ${m.state.time}`);
    }
    if(!restored&&live.some(insideFactory)&&live.some(car=>car.factoryVisit?.phase==='waiting')){
      m.load(m.save());
      restored=true;
    }
  }
  assert(restored,`${name}: exercised save/load with a live queue`);
  assert.equal(released.size,ids.size,`${name}: ${JSON.stringify([...ids].filter(id=>!released.has(id)).map(id=>{
    const u=m.entity(id);return {id,x:u.x,y:u.y,visit:u.factoryVisit,reason:u.navigation?.reason};
  }))}`);
  console.log(JSON.stringify({map:name,released:released.size,seconds:+m.state.time.toFixed(1),restored}));
}
