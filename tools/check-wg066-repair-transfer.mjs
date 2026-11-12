import assert from 'node:assert/strict';
import fs from 'node:fs';
import {progressMission} from './check-navigation-public-progress.mjs';
import {repairCompletionSeconds,factoryRepairQueue} from '../campaign/factory-routing.js';
import {factoryPoint} from '../campaign/factory-garage.js';
const before=process.argv.includes('--before');
const m=progressMission();Object.assign(m.state,{units:[],buildings:[],energy:2400,time:20});m.updateMission=()=>{};
const factories=[0,220,-220,440].map(x=>m.addStructure('factory','rai',{x:x-1500,y:350},{completed:true,progress:1})),source=factories[0];
const count=20,cars=Array.from({length:count},(_,i)=>{
 const u=m.addUnit(i===count-1?'builder':'bukhanka','rai',factoryPoint(m,source,0,-3));u.hp=40;
 u.factoryVisit={garageVersion:2,factoryId:source.id,phase:'inside',arrived:i,queued:i,slot:i};
 u.combatRetreat={forced:true,home:{id:source.id,x:source.x,y:source.y},started:i,status:'servicing',service:'waiting-bay',resume:{action:'move',target:{x:700,y:700},origin:{x:0,y:-300}}};
 return u;
});
m.rebuildNavigation();m.updateEconomy(.1);
const ids=cars.map(u=>u.id),activeId=source.activeRepair.unitId,startedHp=m.entity(activeId).hp;
const workBefore=repairCompletionSeconds(m,cars[1],source);if(!before)assert(workBefore<20,'Second car waits only for the first, not the entire interior queue');
const complete=new Set(),released=new Set(),used=new Set(),rerouted=new Map();let restored=false,firstQueues,allRepairedAt;
for(let tick=0;tick<4500&&released.size<ids.length;tick++){
 m.advance(.1);m.finishPendingStep();m.drainEffects();
 for(const event of m.drainEvents()){
  if(event.type==='factory-repair-rerouted')rerouted.set(event.unit,(rerouted.get(event.unit)??0)+1);
  if(event.type==='factory-repair-start')used.add(event.factory);
  if(event.type==='factory-repair-complete')complete.add(event.unit);
  if(event.type==='factory-released'&&m.entity(event.unit)?.hp===m.entity(event.unit)?.maxHp)released.add(event.unit);
 }
 if(complete.size===count)allRepairedAt??=m.state.time;
 const active=m.entity(activeId);assert(!active.factoryVisit?.nextFactoryId,'A started repair must never be moved');
 if(tick===0){
  assert(active.hp>startedHp);if(!before)assert(ids.some(id=>m.entity(id).factoryVisit?.nextFactoryId));
  firstQueues=factories.map(f=>factoryRepairQueue(m,f).length);
  if(before)assert.deepEqual(firstQueues,[count,0,0,0]);else assert.equal(firstQueues[0],count-1,'Only one physical transfer at a time');
 }
 if(!restored&&ids.some(id=>(before||m.entity(id).factoryVisit?.nextFactoryId)&&m.entity(id).factoryVisit?.phase==='departure')){
  const saved=m.save();m.load(saved);restored=true;
 }
 if(tick%500===0)console.log(JSON.stringify({seconds:+m.state.time.toFixed(1),complete:complete.size,released:released.size,used:[...used]}));
}
const state=ids.map(id=>{const u=m.entity(id);return {id,hp:u.hp,maxHp:u.maxHp,x:u.x,y:u.y,phase:u.factoryVisit?.phase,next:u.factoryVisit?.nextFactoryId,home:u.combatRetreat?.home,reason:u.navigation?.reason,reroutes:rerouted.get(id)??0};});
const report={firstQueues,used:[...used],complete:[...complete],released:[...released],restored,allRepairedAt,seconds:m.state.time,state};
fs.mkdirSync('docs/playtest-evidence/wg066',{recursive:true});fs.writeFileSync(`docs/playtest-evidence/wg066/transfers${before?'-before':''}.json`,JSON.stringify(report,null,2));
assert(restored,'Save/load during the physical transfer');assert(before?used.size===1:used.size>1);assert.equal(complete.size,count,JSON.stringify(state));assert.equal(released.size,count,JSON.stringify(state));
assert([...rerouted.values()].every(n=>n===1),'Interior assignments do not oscillate');
const expected=2400-cars.reduce((sum,u)=>sum+(u.maxHp-40)/40*1.5,0);
if(!before)assert(allRepairedAt<20+cars.reduce((sum,u)=>sum+(u.maxHp-40)/40,0),'Transfers finish repair sooner than keeping all work in one bay');
assert(Math.abs(m.state.energy-expected)<.001,'Transfers never pay for repair twice');
assert(ids.every(id=>m.entity(id).combatRetreat?.resume?.target.x===700),'Preserve the return order');
console.log(JSON.stringify({passed:true,firstQueues,seconds:m.state.time,complete:complete.size,released:released.size,restored}));
