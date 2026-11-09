import assert from 'node:assert/strict';
import fs from 'node:fs';
import {progressMission} from './check-navigation-public-progress.mjs';
import {damageMobility} from '../campaign/damage-state.js';
import {updateFactoryRepairs} from '../campaign/factory-repair.js';

function fixture(){
 const m=progressMission();
 m.addStructure('generator','rai',{x:400,y:400},{completed:true,progress:1});
 const factory=m.addStructure('factory','rai',{x:180,y:120},{completed:true,progress:1});
 const unit=m.addUnit('bukhanka','rai',{x:0,y:0});
 m.rebuildNavigation();m.explored.fill(1);m.visible.fill(1);
 return {m,unit,factory};
}
function until(m,predicate,seconds=100){
 const end=m.state.time+seconds,wall=performance.now();let frames=0,maxAdvanceMs=0;
 while(!predicate()&&m.state.time<end&&performance.now()-wall<60000){
  const start=performance.now();m.advance(1/80,{budgetMs:5});maxAdvanceMs=Math.max(maxAdvanceMs,performance.now()-start);frames++;
 }
 assert(predicate(),JSON.stringify({reason:'condition not reached',time:m.state.time,units:m.state.units.filter(u=>u.kind==='bukhanka').map(u=>({x:u.x,y:u.y,hp:u.hp,task:u.task,retreat:u.combatRetreat,pending:u.pendingOrder,nav:u.navigation}))}));
 return {frames,maxAdvanceMs};
}
function start(scene){
 const {m,unit}=scene;
 assert(m.submitOrder([unit.id],'move',{x:0,y:450}).ok);
 until(m,()=>!unit.pendingOrder,5);
 const destination=structuredClone(unit.routeOrder.destination);
 m.setCombatPolicy([unit.id],{retreat:'heavy',response:'ignore'});m.damage(unit,220);
 return destination;
}
const results=[];
let repairSave,repairUnitId,repairFactoryId;
{
 const scene=fixture(),{m,unit}=scene,goal=start(scene),contacts=[];
 const collide=m.vehicleCollision.bind(m);m.vehicleCollision=(u,s,b)=>{if(b.size)contacts.push(u.id);return collide(u,s,b);};
 until(m,()=>unit.combatRetreat?.status==='arrived');
 const hurt=unit.hp;
 until(m,()=>unit.hp>hurt&&unit.hp<unit.maxHp,5);
 const saved=m.save(),copy=fixture().m;copy.load(saved);copy.state.bounds=[0,0,127,127];copy.rebuildNavigation();copy.explored.fill(1);
 repairSave=saved;repairUnitId=unit.id;repairFactoryId=scene.factory.id;
 const metrics=until(m,()=>!unit.combatRetreat&&!unit.pendingOrder&&!unit.task&&!unit.path.length&&unit.hp===unit.maxHp);
 assert(Math.hypot(unit.x-goal.x,unit.y-goal.y)<2.01,'Repair must resume the accepted destination');
 assert.equal(contacts.length,0,'Return uses collision-checked movement');
 const restored=copy.entity(unit.id);until(copy,()=>!restored.combatRetreat&&!restored.pendingOrder&&!restored.task&&!restored.path.length&&restored.hp===restored.maxHp);
 assert(Math.hypot(restored.x-goal.x,restored.y-goal.y)<2.01,'Repair and resume survive save/load');
 results.push({case:'automatic repair and return, including save/load',seconds:m.state.time,...metrics});
}
function atRepair(){
 const m=fixture().m;m.load(repairSave);m.state.bounds=[0,0,127,127];m.rebuildNavigation();m.explored.fill(1);
 return {m,unit:m.entity(repairUnitId),factory:m.entity(repairFactoryId)};
}
for(const action of ['stop','move']){
 const {m,unit}=atRepair(),pose={x:unit.x,y:unit.y},goal={x:-140,y:120};
 if(action==='stop')m.stop([unit.id],{expandGroup:false});else assert(m.submitOrder([unit.id],'move',goal).ok);
 if(action==='move')until(m,()=>!unit.pendingOrder&&!unit.task&&!unit.path.length);
 for(let i=0;i<100;i++)m.advance(.1);
 assert(!unit.combatRetreat&&!unit.pendingOrder);
 assert(Math.hypot(unit.x-(action==='stop'?pose.x:goal.x),unit.y-(action==='stop'?pose.y:goal.y))<2.01);
 assert(unit.hp<unit.maxHp,'A cancelled factory visit must not keep repairing remotely');
 results.push({case:action+' cancels repair and automatic return'});
}
{
 const {m,unit,factory}=atRepair(),hp=unit.hp,energy=m.state.energy;
 m.state.powered=false;updateFactoryRepairs(m,[factory],1);assert(unit.hp>hp);assert.equal(unit.combatRetreat.service,'repairing');
 unit.hp=hp;m.state.energy=0;updateFactoryRepairs(m,[factory],1);assert.equal(unit.hp,hp);assert.equal(unit.combatRetreat.service,'waiting-energy');
 unit.damage.parts[1]={damage:1.5,detached:true};unit.damage.parts[23]={damage:1.3,detached:true,installed:true};
 assert(damageMobility(unit.damage)<1);m.state.energy=energy;
 updateFactoryRepairs(m,[factory],20);
 assert.equal(unit.hp,unit.maxHp);assert.equal(damageMobility(unit.damage),1);assert(unit.damage.parts[23].installed);
 assert(Math.abs((energy-m.state.energy)-(unit.maxHp-hp)/40*1.5)<1e-8,'Pay only for HP actually repaired');
 results.push({case:'repair without electricity, oil stock, physical wheels and installed upgrades'});
}
{
 const {m,unit,factory}=atRepair();
 const second=m.addUnit('bukhanka','rai',{x:factory.x,y:factory.y+125});second.hp=100;
 second.combatRetreat={forced:true,status:'arrived',phase:'home',started:m.state.time,home:{id:factory.id},destination:{x:second.x,y:second.y}};
 m.state.powered=true;const firstHp=unit.hp;
 updateFactoryRepairs(m,[factory],.1);assert(unit.hp>firstHp);assert.equal(second.hp,100);assert.equal(second.combatRetreat.service,'waiting-bay');
 unit.hp=unit.maxHp;updateFactoryRepairs(m,[factory],.1);assert(second.hp>100,'Next car owns the released repair bay');
 results.push({case:'one deterministic repair queue per factory'});
}
{
 const {m,unit,factory}=atRepair(),replacement=m.addStructure('factory','rai',{x:-220,y:160},{completed:true,progress:1});
 factory.hp=0;m.rebuildNavigation();const hp=unit.hp;
 until(m,()=>unit.combatRetreat?.home?.id===replacement.id,5);
 assert.equal(unit.hp,hp,'The destroyed factory cannot continue repairs');
 until(m,()=>unit.hp===unit.maxHp&&!unit.combatRetreat&&!unit.pendingOrder&&!unit.task&&!unit.path.length);
 assert(Math.hypot(unit.x,unit.y-450)<2.01);
 results.push({case:'destroyed factory reroutes service and preserves return order'});
}
{
 const scene=fixture(),{m,unit}=scene,peer=m.addUnit('bukhanka','rai',{x:0,y:450});
 m.configureGroup([unit.id,peer.id],{leaderId:unit.id});
 start(scene);until(m,()=>unit.combatRetreat?.status==='arrived');
 assert(m.submitOrder([peer.id],'move',{x:240,y:500}).ok);
 until(m,()=>!peer.pendingOrder,5);const peerRevision=peer.commandRevision,peerGoal=structuredClone(peer.routeOrder.destination);
 until(m,()=>unit.hp===unit.maxHp&&!unit.combatRetreat&&!unit.pendingOrder);
 assert.equal(peer.commandRevision,peerRevision,'A repaired commander must not replace healthy member orders');
 assert.deepEqual(peer.routeOrder.destination,peerGoal);
 assert.equal(unit.commandGroupId,peer.commandGroupId);
 const returnGoal=structuredClone(unit.routeOrder.destination);
 until(m,()=>!unit.task&&!unit.path.length&&!unit.detour&&!unit.yieldReturn);
 assert(Math.hypot(unit.x-returnGoal.x,unit.y-returnGoal.y)<2.01,'The repaired commander physically reaches its formation slot');
 results.push({case:'commander rejoins the current formation without commanding its healthy members'});
}
const report={passed:true,results};fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/retreat-service.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
