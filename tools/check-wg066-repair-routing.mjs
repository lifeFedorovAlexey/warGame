import assert from 'node:assert/strict';
import fs from 'node:fs';
import {progressMission} from './check-navigation-public-progress.mjs';
import {chooseRepairFactory,repairCompletionSeconds,repairChoiceDue,factoryRepairQueue} from '../campaign/factory-routing.js';
import {updateCombatRetreat} from '../campaign/combat-policy.js';
import {updateFactoryVisit} from '../campaign/factory-garage.js';
const before=process.argv.includes('--before'),results=[];
function scene(){
 const m=progressMission();m.state.units=[];m.state.buildings=[];m.state.energy=2400;m.state.time=20;m.updateMission=()=>{};
 const factories=[0,200,-200,400].map(x=>m.addStructure('factory','rai',{x,y:0},{completed:true,progress:1}));
 const [a]=factories;
 for(let i=0;i<6;i++){
  const u=m.addUnit('bukhanka','rai',{x:0,y:0});u.hp=1;
  u.factoryVisit={garageVersion:2,factoryId:a.id,phase:'inside',arrived:i,queued:i,slot:i};
  u.combatRetreat={forced:true,home:{id:a.id,x:a.x,y:a.y},started:i,status:'servicing',service:i?'waiting-bay':'repairing'};
 }
 m.rebuildNavigation();return {m,factories};
}
function exterior(m,a,phase='approach',x=0,y=-81){
 const u=m.addUnit('bukhanka','rai',{x,y});u.hp=40;
 u.factoryVisit={garageVersion:2,factoryId:a.id,phase,queued:20,slot:m.state.units.length};
 u.combatRetreat={forced:true,home:{id:a.id,x:a.x,y:a.y},started:20,status:'moving',phase:'home',resume:{action:'move',target:{x:700,y:700},origin:{x,y}}};
 return u;
}
const assign=(m,u)=>{const it=updateCombatRetreat(m,u,m.unitSpec(u),0);it.next();it.return();};
for(const phase of ['approach','gate']){
 const {m,factories}=scene(),a=factories[0],u=exterior(m,a,phase);a.garageGate=u.id;
 const quotes=factories.map(f=>({id:f.id,seconds:repairCompletionSeconds(m,u,f)}));
 assert(quotes[0].seconds>Math.min(...quotes.slice(1).map(q=>q.seconds))+20);
 const chosen=chooseRepairFactory(m,u),due=repairChoiceDue(m,u);delete u.combatRetreat.factoryChoiceAt;
 const pose={x:u.x,y:u.y,hp:u.hp,resume:structuredClone(u.combatRetreat.resume)};
 assign(m,u);
 if(before){assert.equal(chosen.id,a.id);assert.equal(u.combatRetreat.home.id,a.id);}
 else{
  assert.notEqual(chosen.id,a.id);assert(due);assert.notEqual(u.combatRetreat.home.id,a.id);
  assert.notEqual(a.garageGate,u.id,'Reassignment releases the old entrance reservation');
  assert.notEqual(u.factoryVisit?.factoryId,a.id,'The old visit must not override the new destination');
  assert.deepEqual({x:u.x,y:u.y,hp:u.hp,resume:u.combatRetreat.resume},pose,'No teleport, remote repair or lost return order');
 }
 results.push({phase,quotes,chosen:chosen.id,recheckAllowed:due,assigned:u.combatRetreat.home.id});
}
{
 const {m,factories}=scene(),a=factories[0];
 const cars=[exterior(m,a,'gate',0,-81),exterior(m,a,'approach',-28,-81),exterior(m,a,'approach',28,-81),exterior(m,a,'approach',0,-110)];
 a.garageGate=cars[0].id;
 for(const u of cars)assign(m,u);
 const distribution=factories.map(f=>cars.filter(u=>u.combatRetreat.home.id===f.id).length);
 if(before)assert.deepEqual(distribution,[4,0,0,0]);
 else{
  assert.equal(distribution[0],0);assert(distribution.slice(1).every(n=>n>0));
  const saved=m.save(),ids=cars.map(u=>u.id),homes=cars.map(u=>u.combatRetreat.home.id);m.load(saved);
  assert.deepEqual(ids.map(id=>m.entity(id).combatRetreat.home.id),homes);
  for(let i=0;i<10;i++){m.state.time+=2;for(const id of ids)assign(m,m.entity(id));}
  assert.deepEqual(ids.map(id=>m.entity(id).combatRetreat.home.id),homes,'Stable queues must not keep swapping destinations');
 }
 results.push({case:'four factories, six repairs inside nearest, four waiting outside',distribution});
}
if(!before){
 const {m,factories}=scene(),a=factories[0],u=exterior(m,a);
 for(const phase of ['entering','inside','leaving','departure']){
  u.factoryVisit.phase=phase;assert.equal(chooseRepairFactory(m,u),a);assert(!repairChoiceDue(m,u));
 }
 m.state.units=[u];u.factoryVisit.phase='gate';u.combatRetreat.home.id=a.id;
 assert.equal(chooseRepairFactory(m,u),a,'An almost free nearby bay beats a needless drive');
 results.push({case:'physical transfers stay protected, a free nearby factory keeps the vehicle'});
}
if(!before){
 const {m,factories}=scene(),[a,b]=factories,u=exterior(m,a);
 u.combatRetreat.factoryChoiceAt=m.state.time+40;
 assert(!repairChoiceDue(m,u),'A reserved trip keeps its destination');
 u.combatRetreat.unavailableFactories={[a.id]:{at:m.state.time,revision:m.nav.topologyRevision,x:u.x,y:u.y}};
 assert(repairChoiceDue(m,u),'A failed route breaks the long transfer hold');
 assert(!repairChoiceDue(m,u),'A failed route still waits two seconds between comparisons');
 assert.notEqual(chooseRepairFactory(m,u),a);
 const inside=m.state.units.find(v=>v.factoryVisit?.phase==='inside');
 inside.factoryVisit.nextFactoryId=b.id;
 assert(!factoryRepairQueue(m,a).includes(inside));assert(factoryRepairQueue(m,b).includes(inside));
 b.hp=0;a.repairTransferAt=m.state.time+2;
 const step=updateFactoryVisit(m,inside,a,0);step.next();step.return();
 assert.equal(inside.factoryVisit.phase,'inside');assert(!inside.factoryVisit.nextFactoryId);
 assert(factoryRepairQueue(m,a).includes(inside));assert(!factoryRepairQueue(m,b).includes(inside));
 assert.equal(inside.hp,1,'A cancelled transfer cannot repair remotely');
 results.push({case:'route failure releases trip hold; destroyed receiving factory returns the interior reservation'});
}
fs.mkdirSync('docs/playtest-evidence/wg066',{recursive:true});
fs.writeFileSync(`docs/playtest-evidence/wg066/${before?'before':'routing'}.json`,JSON.stringify({results},null,2));console.log(JSON.stringify({results}));
