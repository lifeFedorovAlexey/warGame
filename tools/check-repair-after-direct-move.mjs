import assert from 'node:assert/strict';
import fs from 'node:fs';
import {progressMission} from './check-navigation-public-progress.mjs';
import {completedDirectMove,shouldAutoRetreat} from '../campaign/combat-retreat-state.js';

export function repairAfterMoveFixture(){
 const m=progressMission();m.updateMission=()=>{};m.state.energy=2400;
 const factories=[-220,0,220].map(x=>m.addStructure('factory','rai',{x,y:160},{completed:true,progress:1}));m.rebuildNavigation();
 return {m,factories};
}
const add=(m,x=0,kind='bukhanka')=>{const u=m.addUnit(kind,'rai',{x,y:-240},{heading:0});u.hp=100;m.setCombatPolicy([u.id],{retreat:'light'});return u;};
const tick=m=>{m.advance(.1);m.finishPendingStep();m.drainEffects();};
function until(m,predicate,seconds=120){
 const end=m.state.time+seconds;
 while(!predicate()&&m.state.time<end)tick(m);
 assert(predicate(),JSON.stringify(m.state.units.filter(u=>u.kind!=='builder'||u.hp<u.maxHp).map(u=>({id:u.id,hp:u.hp,x:u.x,y:u.y,task:u.task,path:u.path.length,
  suppressed:u.retreatSuppressed,pending:u.pendingOrder,retreat:u.combatRetreat,visit:u.factoryVisit,reason:u.navigation?.reason}))));
}
const results=[];
for(const kind of ['bukhanka','builder']){
 const {m}=repairAfterMoveFixture(),u=add(m,0,kind),goal={x:0,y:-100};
 m.submitOrder([u.id],'move',goal);
 until(m,()=>completedDirectMove(u));
 assert.equal(u.hp,100);assert(!u.combatRetreat,'Direct control lasts to the accepted destination');
 const arrivedAt=m.state.time;tick(m);
 assert(u.combatRetreat,'Arrival releases auto-repair without another hit or click');assert(!u.retreatSuppressed);
 until(m,()=>u.hp===u.maxHp);results.push({case:kind+' completes direct move then repairs without new damage',arrivedAt,repairedAt:m.state.time});
}
{
 const {m}=repairAfterMoveFixture(),u=add(m),goal={x:0,y:-100};m.submitOrder([u.id],'move',goal);
 until(m,()=>completedDirectMove(u));
 const copy=repairAfterMoveFixture().m;copy.load(m.save());copy.state.bounds=[0,0,127,127];copy.rebuildNavigation();copy.visible.fill(255);copy.explored.fill(255);
 const saved=copy.entity(u.id);assert(saved.retreatSuppressed,'Fixture represents the former stuck save');
 tick(copy);assert(saved.combatRetreat);until(copy,()=>saved.hp===saved.maxHp);
 results.push({case:'completed manual move in an existing save repairs without new damage',repairedAt:copy.state.time});
}
{
 const {m}=repairAfterMoveFixture(),u=add(m),goal={x:0,y:-100};m.submitOrder([u.id],'move',goal);until(m,()=>completedDirectMove(u));
 m.stop([u.id]);for(let i=0;i<20;i++)tick(m);assert(!u.combatRetreat&&!u.factoryVisit);assert.equal(u.hp,100);
 results.push({case:'explicit Stop remains authoritative'});
}
{
 const {m}=repairAfterMoveFixture(),u=add(m),goals=[{x:0,y:-160},{x:0,y:-80}];
 m.submitOrder([u.id],'move',goals[0]);m.submitOrder([u.id],'move',goals[1],{append:true});
 let firstPassed=false;
 until(m,()=>{if(Math.hypot(u.x-goals[0].x,u.y-goals[0].y)<3)firstPassed=true;return completedDirectMove(u);});
 assert(firstPassed);assert(!u.combatRetreat);assert(Math.hypot(u.x-goals[1].x,u.y-goals[1].y)<2);
 tick(m);assert(u.combatRetreat);results.push({case:'queued manual legs finish before auto-repair'});
}
{
 const {m}=repairAfterMoveFixture(),u=add(m);u.task=null;u.path=[];u.retreatSuppressed=true;
 u.routeOrder={type:'move',destination:{x:u.x,y:u.y}};
 for(const state of [{pendingOrder:{type:'move'}},{proposedOrder:{type:'move'}},{routeContinuation:{phase:'ready-prefix'}},
  {detour:{parking:true}},{yieldReturn:{phase:'routing'}},{jointTraffic:{group:'active'}},{cycleContinuation:{}}]){
  Object.assign(u,state);assert(!shouldAutoRetreat(u,m.unitSpec(u)),'A live controller must retain direct control');for(const key of Object.keys(state))delete u[key];
 }
 u.routeOrder.destination.y+=50;assert(!shouldAutoRetreat(u,m.unitSpec(u)),'Empty geometry far from destination is not arrival');
 results.push({case:'pending, borrowed and blocked movement do not release control early'});
}
{
 const {m,factories}=repairAfterMoveFixture(),cars=Array.from({length:9},(_,i)=>add(m,(i-4)*45)),ids=cars.map(u=>u.id);
 m.submitOrder(ids,'move',{x:0,y:-100});const repaired=new Set(),used=new Set();
 until(m,()=>{
  for(const u of cars)if(u.hp===u.maxHp)repaired.add(u.id);
  for(const event of m.drainEvents())if(event.type==='factory-repair-complete')used.add(event.factory);
  return repaired.size===cars.length;
 },240);
 assert.equal(used.size,factories.length,'The group actually services at all three initially empty factories');
 results.push({case:'nine completed direct moves use three empty factories',repaired:repaired.size,factories:used.size,seconds:m.state.time});
}
fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/repair-after-direct-move.json',JSON.stringify({results},null,2));
console.log(JSON.stringify({passed:results.length,results}));
