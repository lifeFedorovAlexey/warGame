import fs from 'node:fs';
import assert from 'node:assert/strict';
import {progressMission} from './check-navigation-public-progress.mjs';
const results=[],done=u=>!u.pendingOrder&&!u.proposedOrder&&!u.task&&!u.path.length&&!u.detour&&!u.yieldReturn;
function until(m,predicate,seconds=65){
 const start=m.state.time,wall=performance.now();
 while(!predicate()&&m.state.time-start<seconds&&performance.now()-wall<60000){m.advance(1/80,{budgetMs:5});m.drainEffects();}
 assert(predicate(),JSON.stringify({time:m.state.time,units:m.state.units.map(u=>({id:u.id,x:u.x,y:u.y,hp:u.hp,task:u.task,reason:u.navigation?.reason,visit:u.factoryVisit,retreat:u.combatRetreat}))}));
}
function restore(save){const m=progressMission();m.load(save);m.state.bounds=[0,0,127,127];m.rebuildNavigation();m.explored.fill(255);return m;}
for(const action of ['stop','replace']){
 const m=progressMission(),u=m.addUnit('bukhanka','rai',{x:0,y:0},{heading:0});m.rebuildNavigation();
 assert(m.submitOrder([u.id],'move',{x:10,y:0}).ok);
 until(m,()=>m.trafficCoordinator.routes.has(u.id),5);
 const origin={x:u.x,y:u.y},goal={x:0,y:100};
 if(action==='stop')m.stop([u.id],{expandGroup:false});else assert(m.submitOrder([u.id],'move',goal).ok);
 until(m,()=>done(u));for(let i=0;i<30;i++)m.advance(.1);
 const target=action==='stop'?origin:goal;
 assert(Math.hypot(u.x-target.x,u.y-target.y)<.65);assert(!m.trafficCoordinator.routes.has(u.id));
 results.push({case:action+' cancels queued close parking',time:m.state.time});
}
{
 const m=progressMission(),u=m.addUnit('bukhanka','rai',{x:0,y:0},{heading:0}),goal={x:4,y:-25};m.rebuildNavigation();
 assert(m.submitOrder([u.id],'move',goal).ok);until(m,()=>u.reversing&&u.driveSpeed>2,5);
 const copy=restore(m.save()),v=copy.entity(u.id);until(copy,()=>done(v));assert(Math.hypot(v.x-goal.x,v.y-goal.y)<.65);
 results.push({case:'save/load during reverse approach',time:copy.state.time});
}
{
 const m=progressMission();m.addStructure('generator','rai',{x:400,y:400},{completed:true,progress:1});
 const factory=m.addStructure('factory','rai',{x:180,y:120},{completed:true,progress:1}),u=m.addUnit('bukhanka','rai',{x:0,y:0});
 m.rebuildNavigation();m.explored.fill(255);m.visible.fill(255);
 assert(m.submitOrder([u.id],'move',{x:0,y:450}).ok);until(m,()=>!u.pendingOrder,5);
 const goal={...u.routeOrder.destination};m.setCombatPolicy([u.id],{retreat:'heavy',response:'ignore'});m.damage(u,220);const hurt=u.hp;
 const contacts=[],collision=m.vehicleCollision.bind(m);m.vehicleCollision=(unit,s,b)=>{if(unit.id===u.id&&b.size)contacts.push([...b].map(x=>x.id));return collision(unit,s,b);};
 until(m,()=>u.hp>hurt&&u.hp<u.maxHp);
 assert(u.factoryVisit?.factoryId===factory.id||u.combatRetreat?.home?.id===factory.id,'Repair at the intended factory');
 const saved=m.save(),copy=restore(saved),v=copy.entity(u.id),repairAt=m.state.time;
 for(const [mission,car] of [[m,u],[copy,v]]){
  until(mission,()=>car.hp===car.maxHp&&!car.combatRetreat&&done(car));
  assert(Math.hypot(car.x-goal.x,car.y-goal.y)<.65,'Repair resumes the original accepted goal');
 }
 assert.equal(contacts.length,0,'Factory approach and return use collision-checked movement');
 results.push({case:'automatic factory approach, repair, exit and original-order return, including save/load',repairAt,returnedAt:m.state.time,restoredAt:copy.state.time,contacts:contacts.length});
}
fs.mkdirSync('campaign/previews/playtest-WG-051/checks',{recursive:true});fs.writeFileSync('campaign/previews/playtest-WG-051/checks/service.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
