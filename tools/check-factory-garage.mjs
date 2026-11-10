import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Mission} from '../campaign/mission.js';
import {vehicleClearance} from '../campaign/vehicle-collision.js';
import {factoryPoint,setFactoryPriority,insideFactory,factoryPriority} from '../campaign/factory-garage.js';
function progressMission(){
 const config=JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/gameplay.json','utf8'));
 config.initialMapBounds=[0,0,127,127];config.finalMapBounds=[0,0,127,127];
 const field={extent:4096,half:2048,cellMetres:32,heightAt:()=>0,gradientAt:()=>({x:0,y:0}),gridToWorld:([x,y])=>({x:x*32-2048,y:2048-y*32}),worldToGrid:(x,y)=>[(x+2048)/32,(2048-y)/32]};
 const m=new Mission(config,field);Object.assign(m.state,{units:[],buildings:[],camps:[],artifacts:[],raidReserve:[],bounds:[0,0,127,127],pendingCinematics:[]});
 m.updateMission=()=>{};m.explored.fill(255);m.visible.fill(255);return m;
}
function step(m,cars,seconds=.1){
 m.advance(seconds);m.finishPendingStep();m.effects=[];
 const visible=cars.filter(u=>u.hp>0&&!insideFactory(u));
 assert(visible.filter(u=>['gate','entering'].includes(u.factoryVisit?.phase)).length<=1,'One vehicle owns the entrance');
 assert(visible.filter(u=>['leaving','departure'].includes(u.factoryVisit?.phase)).length<=1,'One vehicle owns the exit');
 for(let i=0;i<visible.length;i++)for(let j=0;j<i;j++)assert(vehicleClearance(visible[i],visible[j],m.config.worldScale,m.field)>0,'Cars outside never overlap');
}
const m=progressMission();m.state.energy=2000;
const f=m.addStructure('factory','rai',{x:0,y:0},{completed:true,progress:1});
assert.equal(factoryPriority(f),'repair','Old and new factories default to repair');
const cars=Array.from({length:3},(_,i)=>m.addUnit('bukhanka','rai',{x:(i-1)*65,y:-210},{heading:0}));
m.rebuildNavigation();m.visible.fill(255);m.explored.fill(255);m.updateMission=()=>{};
for(const u of cars){u.hp=100;u.combatRetreat={status:'planning',started:m.state.time,resume:{action:'move',target:{x:u.x,y:-250},origin:{x:u.x,y:-250}}};}
// Keep production queued while all three arrive. With a single short order,
// the first repaired car may already leave before the third enters (correct).
f.queue.push({kind:'bukhanka',cost:130,progress:.2,funding:{paid:130}},{kind:'bukhanka',cost:130,progress:0,funding:{paid:130}});
setFactoryPriority(m,f.id,'production');
const start=performance.now();let admitted=false,productionPriorityChecks=0;
for(let i=0;i<2500&&performance.now()-start<55000;i++){
 const before= cars.map(u=>u.hp),producing=f.queue.length>0;
 step(m,cars);
 if(i===0){
  const door=factoryPoint(m,f,0,-18);
  for(const car of cars){
   assert.equal(car.factoryVisit?.phase,'approach');
   assert.deepEqual(car.routeOrder?.destination,door,'Every car starts towards the factory door');
   assert.equal(car.factoryVisit.waitingPoint,undefined,'No exterior waiting bay is assigned on entry');
  }
 }
 if(producing&&f.queue.length){assert.deepEqual(cars.map(u=>u.hp),before,'Production priority defers repairs while production remains queued');productionPriorityChecks++;}
 if(cars.every(insideFactory)){admitted=true;break;}
}
assert(admitted,'All cars must drive inside the factory');
assert(productionPriorityChecks>0,'Production priority must be exercised before the order finishes');
const productionCopy=progressMission();productionCopy.load(m.save());
const pf=productionCopy.entity(f.id);let sawFinishedProduction=false;
for(let i=0;i<1000&&productionCopy.state.units.some(u=>u.factoryVisit);i++){
 const priorQueue=pf.queue.length,health=productionCopy.state.units.filter(insideFactory).map(u=>[u.id,u.hp]);
 step(productionCopy,productionCopy.state.units);
 if(priorQueue)for(const [id,hp] of health)assert.equal(productionCopy.entity(id).hp,hp,'Production priority does not repair until the order finishes');
 if(!pf.queue.length)sawFinishedProduction=true;
}
assert(sawFinishedProduction&&productionCopy.state.units.every(u=>!u.factoryVisit),'Production-priority factory eventually produces and services all waiting vehicles');
f.queue=[{kind:'bukhanka',cost:130,progress:.2,funding:{paid:130}}];setFactoryPriority(m,f.id,'repair');
for(let i=0;i<10;i++){m.advance(.1);m.finishPendingStep();}
assert.equal(f.queue[0].progress,.2,'Repair pauses existing production progress');
assert(cars.some(u=>u.hp>100),'Repair actually restores HP');
const copy=progressMission();copy.load(m.save());assert.equal(copy.entity(f.id).workPriority,'repair');assert(copy.state.units.filter(insideFactory).length>=2);
for(let i=0;i<2000&&cars.some(u=>u.factoryVisit||u.hp<u.maxHp);i++)step(m,cars);
assert(cars.every(u=>!u.factoryVisit&&u.hp===u.maxHp),'Repaired cars leave the factory');
for(let i=0;i<100;i++)step(m,cars);
assert(!f.queue.length||f.queue[0].progress>.2,'Production resumes after the repair queue');
for(let i=0;i<2000&&copy.state.units.some(u=>u.factoryVisit);i++)step(copy,copy.state.units);
assert(copy.state.units.every(u=>!u.factoryVisit&&u.hp===u.maxHp),'Saved internal queue resumes and exits: '+JSON.stringify(copy.state.units.map(u=>({id:u.id,hp:u.hp,max:u.maxHp,x:u.x,y:u.y,visit:u.factoryVisit,retreat:u.combatRetreat}))));

// The inside queue must not materialize a repaired vehicle into the turn
// being used by an incoming car, even when their current hulls are separated.
const transfer=progressMission();
const tf=transfer.addStructure('factory','rai',{x:0,y:0},{completed:true,progress:1});
const ready=transfer.addUnit('bukhanka','rai',factoryPoint(transfer,tf,0,-3));
const incoming=transfer.addUnit('bukhanka','rai',factoryPoint(transfer,tf,0,-18));
ready.factoryVisit={garageVersion:2,factoryId:tf.id,phase:'inside',arrived:0,slot:0};
incoming.factoryVisit={garageVersion:2,factoryId:tf.id,phase:'entering',slot:1};
incoming.hp=100;
transfer.rebuildNavigation();step(transfer,[ready,incoming]);
assert(insideFactory(ready),'Exit waits for the shared turn inside the factory');

// Rotated factories use the authored front gate, with a larger incoming group.
const rotated=progressMission();rotated.state.energy=2000;
const rf=rotated.addStructure('factory','rai',{x:0,y:0},{completed:true,progress:1,rotation:Math.PI/2});
const batch=Array.from({length:8},(_,i)=>rotated.addUnit('bukhanka','rai',factoryPoint(rotated,rf,(i%4-1.5)*9,-35-Math.floor(i/4)*9),{heading:Math.PI/2}));
for(const u of batch){u.hp=100;u.combatRetreat={status:'planning',started:0,resume:{action:'move',target:{x:320,y:u.y},origin:{x:320,y:u.y}}};}
rotated.rebuildNavigation();
for(let i=0;i<3500&&batch.some(u=>u.hp<u.maxHp||u.factoryVisit);i++)step(rotated,batch);
assert(batch.every(u=>u.hp===u.maxHp&&!u.factoryVisit),'Eight cars use the rotated factory without a jam');
const forced=progressMission();forced.state.energy=2000;
const ff=forced.addStructure('factory','rai',{x:0,y:0},{completed:true,progress:1});
const manual=Array.from({length:3},(_,i)=>forced.addUnit('bukhanka','rai',{x:(i-1)*55,y:-180}));
for(const u of manual){u.hp=100;u.combatRetreat={forced:true,status:'planning',started:0};}
forced.rebuildNavigation();
for(let i=0;i<2000&&manual.some(u=>u.hp<u.maxHp||u.factoryVisit);i++)step(forced,manual);
assert(manual.every(u=>u.hp===u.maxHp&&!u.factoryVisit),'Manual retreat clears the exit even without a return order');

// Repair expenses consume only the actual restored HP and never fund the
// suspended production order. Empty oil storage keeps the car safely inside.
const economy=progressMission();economy.state.energy=0;
const ef=economy.addStructure('factory','rai',{x:0,y:0},{completed:true,progress:1}),eu=economy.addUnit('bukhanka','rai',{x:0,y:-13.5});
eu.hp=100;eu.factoryVisit={factoryId:ef.id,phase:'inside',arrived:0,slot:0,factory:{...ef}};
ef.queue=[{kind:'bukhanka',cost:130,progress:.2,funding:{paid:0}}];economy.rebuildNavigation();step(economy,[eu]);
assert.equal(eu.hp,100);assert.equal(eu.combatRetreat.service,'waiting-energy');
economy.state.energy=100;const initialOil=100;for(let i=0;i<10;i++)step(economy,[eu]);
assert.equal(ef.queue[0].funding.paid,0);assert.equal(ef.queue[0].progress,.2);
assert(Math.abs(initialOil-economy.state.energy-(eu.hp-100)/40*1.5)<1e-7,'Oil is spent only for serviced HP');

// Destruction also releases the stored cars one at a time, even if the wreck
// has already gone from the entity list. No invisible units remain stranded.
const destroyed=progressMission();destroyed.load(copy.save());const df=destroyed.entity(f.id),evac=destroyed.state.units.slice(0,3);
for(const [i,u] of evac.entries()){Object.assign(u,factoryPoint(destroyed,df,0,-3),{hp:100});u.path=[];u.factoryVisit={factoryId:df.id,phase:'inside',slot:i,arrived:i,factory:{...df}};u.combatRetreat={status:'servicing',home:{id:df.id}};}
destroyed.state.buildings=[];destroyed.rebuildNavigation();
for(let i=0;i<1000&&evac.some(u=>u.factoryVisit);i++)step(destroyed,evac);
assert(evac.every(u=>!u.factoryVisit),'Destroyed factory releases all stored vehicles');
console.log('PASS: direct entry for all cars, internal queue, repair/production priority, save restore, eight rotated arrivals without overlap, serialized exit, destruction evacuation');
