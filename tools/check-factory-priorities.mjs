import assert from 'node:assert/strict';
import fs from 'node:fs';
import {progressMission} from './check-navigation-public-progress.mjs';
import {chooseRepairFactory,repairChoiceDue,factoryRepairQueue} from '../campaign/factory-routing.js';
import {rebalanceProduction,chooseProductionFactory} from '../campaign/factory-production.js';
import {factoryBoardState} from '../campaign/factory-status-board.js';
import {oilReserved} from '../campaign/oil-economy.js';

const results=[];
function check(name,run){run();results.push(name);console.log('PASS '+name);}
function fixture(){const m=progressMission();m.state.units=[];m.state.energy=2000;return m;}
const factory=(m,x=0)=>m.addStructure('factory','rai',{x,y:0},{completed:true,progress:1});
function car(m,f,hp=100,phase='inside'){
 const u=m.addUnit('bukhanka','rai',{x:f.x,y:f.y});u.hp=hp;
 u.factoryVisit={factoryId:f.id,phase,arrived:m.state.units.length,queued:0};u.combatRetreat={home:{id:f.id},started:0};return u;
}
const job=(n=0,paid=130)=>({kind:'bukhanka',cost:130,progress:0,funding:{paid},autoFactory:true,orderSerial:n});
for(const priority of ['repair','production'])check(priority+': two repairs and two builds, sequential, then the other service',()=>{
 const m=fixture(),f=factory(m),cars=[car(m,f),car(m,f)];f.workPriority=priority;f.queue=[job(1),job(2)];m.rebuildNavigation();
 let repairBeforeProduction=false,productionBeforeRepair=false;
 for(let n=0;n<1400&&(f.queue.length||cars.some(u=>u.hp<u.maxHp));n++){
  const hp=cars.map(u=>u.hp),progress=f.queue[0]?.progress,orders=f.queue.length,damaged=cars.some(u=>u.hp<u.maxHp);
  m.state.time+=.1;m.updateEconomy(.1);
  if(priority==='repair'&&damaged){assert.equal(f.queue[0]?.progress,progress);if(cars.some((u,i)=>u.hp>hp[i]))repairBeforeProduction=true;}
  if(priority==='production'&&orders){assert.deepEqual(cars.map(u=>u.hp),hp);if(f.queue.length<orders||f.queue[0]?.progress>progress)productionBeforeRepair=true;}
  // Produced cars drive away in the full garage regression; this economy test
  // removes them from the apron to isolate service order and oil accounting.
  m.state.units=m.state.units.filter(u=>cars.includes(u));m.rebuildNavigation();
 }
 assert.equal(f.queue.length,0);assert(cars.every(u=>u.hp===u.maxHp));
 assert(priority==='repair'?repairBeforeProduction:productionBeforeRepair);
 const expected=2000-cars.reduce((n,u)=>n+(u.maxHp-100)/40*1.5,0);assert(Math.abs(m.state.energy-expected)<1e-6);
});
check('No oil: paid assembly continues while repair waits; departure never blocks assembly',()=>{
 const m=fixture(),f=factory(m),u=car(m,f);f.queue=[job()];m.state.energy=0;m.updateEconomy(1);
 assert.equal(u.hp,100);assert(f.queue[0].progress>0);assert.equal(u.combatRetreat.service,'waiting-energy');
 for(const phase of ['entering','leaving','departure']){u.factoryVisit.phase=phase;const before=f.queue[0].progress;m.state.energy=100;m.updateEconomy(.1);assert(f.queue[0].progress>before);}
});
check('Blocked completed output yields to repairs without losing the finished vehicle',()=>{
 const m=fixture(),f=factory(m),u=car(m,f);f.workPriority='production';f.queue=[{...job(),progress:1}];f.exitBlocked=true;f.exitRetryAt=100;
 m.updateEconomy(1);assert(u.hp>100);assert.equal(f.queue[0].progress,1);assert.equal(f.queue.length,1);
});
check('Priority change and save/load retain both queues and paid progress',()=>{
 const m=fixture(),f=factory(m),u=car(m,f);f.queue=[{...job(),progress:.25},job(2,0)];f.workPriority='production';
 m.updateEconomy(.5);assert.equal(u.hp,100);const progress=f.queue[0].progress;f.workPriority='repair';m.updateEconomy(.5);assert(u.hp>100);assert.equal(f.queue[0].progress,progress);
 m.load(m.save());assert.equal(m.entity(f.id).workPriority,'repair');assert.equal(m.entity(f.id).queue[0].progress,progress);assert.equal(m.entity(f.id).queue[1].funding.paid,0);
 assert.equal(factoryBoardState(m,m.entity(f.id)).repairs,1);
});
check('Unpaid automatic orders rebalance; started, funded, legacy prepaid and explicit jobs stay put',()=>{
 const m=fixture(),a=factory(m),b=factory(m,400);
 const protectedJobs=[{...job(0),progress:.2},{...job(1,1)},{kind:'builder',cost:150,progress:0},{...job(2,0),autoFactory:false}];
 a.queue=[...protectedJobs,...Array.from({length:8},(_,i)=>job(i+3,0))];const reserve=oilReserved(m.state),energy=m.state.energy;
 rebalanceProduction(m);assert(protectedJobs.every(j=>a.queue.includes(j)));assert(b.queue.length>=4);assert.equal(a.queue.length+b.queue.length,12);assert.equal(oilReserved(m.state),reserve);assert.equal(m.state.energy,energy);
 const queues=JSON.stringify([a.queue,b.queue]);m.state.time+=2;rebalanceProduction(m);assert.equal(JSON.stringify([a.queue,b.queue]),queues,'Stable queues do not oscillate');
 const c=factory(m,800);m.state.time+=2;rebalanceProduction(m);assert(c.queue.length>0,'A newly completed factory takes waiting work');
});
check('Finite repair work is compared with assembly duration, rather than banning a busy factory',()=>{
 const m=fixture(),a=factory(m),b=factory(m,400),u=car(m,a);b.queue=[job(1,0),job(2,0)];
 assert.equal(chooseProductionFactory(m,b.id,job(3,0)),a);u.hp=u.maxHp;assert.equal(factoryRepairQueue(m,a).length,0);
});
check('Four factories rebalance a 4/12/1/12 backlog automatically without lost orders',()=>{
 const m=fixture(),factories=Array.from({length:4},(_,i)=>factory(m,i*400));let serial=0;
 for(const [i,n] of [4,12,1,12].entries())factories[i].queue=Array.from({length:n},()=>job(++serial,0));
 const reserved=oilReserved(m.state);rebalanceProduction(m);const lengths=factories.map(f=>f.queue.length);
 assert.equal(lengths.reduce((a,b)=>a+b),29);assert(Math.max(...lengths)-Math.min(...lengths)<=1,JSON.stringify(lengths));assert.equal(oilReserved(m.state),reserved);
 const serials=factories.flatMap(f=>f.queue.map(j=>j.orderSerial));assert.equal(new Set(serials).size,29);
});
check('Incoming cars reconsider overload near the door, but keep an active interior visit',()=>{
 const m=fixture(),a=factory(m),b=factory(m,200),u=car(m,a,100,'approach');u.y=-500;
 for(let n=0;n<12;n++)car(m,a,10);assert(repairChoiceDue(m,u));assert.equal(chooseRepairFactory(m,u),b);
 u.factoryVisit.phase='inside';assert(!repairChoiceDue(m,u));assert.equal(chooseRepairFactory(m,u),a);
 u.factoryVisit.phase='approach';u.y=-18*m.config.worldScale;assert.equal(chooseRepairFactory(m,u),b);
});
check('Repair numbers exclude healthy/departing cars and keep incoming repairs',()=>{
 const m=fixture(),f=factory(m),u=car(m,f),healthy=car(m,f),departing=car(m,f,100,'departure');healthy.hp=healthy.maxHp;car(m,f,100,'approach');f.autoModernize=true;f.queue=[job()];
 assert.equal(factoryBoardState(m,f).repairs,2);assert.equal(factoryBoardState(m,f).orders,1);
 u.hp=u.maxHp;assert.equal(factoryBoardState(m,f).repairs,1);assert.equal(departing.factoryVisit.phase,'departure');
});
fs.mkdirSync('campaign/previews/factory-priorities',{recursive:true});fs.writeFileSync('campaign/previews/factory-priorities/simulation.json',JSON.stringify({passed:results},null,2));
