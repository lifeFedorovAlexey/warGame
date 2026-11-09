import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fixture} from './check-start-latency-coordinator.mjs';
import {updateCombatDeployment} from '../campaign/combat-deployment.js';
import {vehicleClearance} from '../campaign/vehicle-collision.js';

const results=[],sources=Object.fromEntries(['mission.js','combat-orders.js','combat-deployment.js','combat-policy.js','command-planner.js','vehicle-dynamics.js'].map(n=>[n,createHash('sha256').update(fs.readFileSync('campaign/'+n)).digest('hex')]));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function setup(count){
 const m=fixture(),units=Array.from({length:count},(_,i)=>m.addUnit('bukhanka','rai',{x:(i-(count-1)/2)*30,y:0},{heading:0}));
 const target=m.addStructure('camp-core','scavs',{x:0,y:90},{completed:true,hp:100000,maxHp:100000});
 m.rebuildNavigation();m.visible.fill(1);m.explored.fill(1);
 m.submitOrder(units.map(u=>u.id),'attack',target);
 for(let i=0;i<160;i++)m.advance(1/80,{budgetMs:6});
 assert(units.every(u=>u.task?.type==='attack'||u.combatDeployment?.status==='arrived'));
 return {m,units,target};
}
for(const [count,action] of [[1,'attack-move'],[3,'attack-move'],[6,'attack-move'],[3,'move']]){
 const {m,units,target}=setup(count),origins=units.map(u=>({x:u.x,y:u.y})),first=units.map(()=>null),ids=units.map(u=>u.id);
 const contacts=[],oldDeployments=[],acceptedGoals=units.map(()=>null),initialTime=m.state.time,collision=m.vehicleCollision.bind(m);let gap=Infinity;
 m.vehicleCollision=(u,s,b)=>{if(b.size)contacts.push({time:m.state.time,id:u.id,speed:s,blockers:[...b].map(x=>x.id)});return collision(u,s,b);};
 const response=m.submitOrder(ids,action,{x:0,y:-180});assert(response.ok);
 for(let frame=0;frame<4800;frame++){
  m.advance(1/80,{budgetMs:6});
  for(const [i,u] of units.entries()){
   if(!u.pendingOrder&&u.routeOrder&&!acceptedGoals[i])acceptedGoals[i]={...u.routeOrder.destination};
   if(first[i]===null&&dist(u,origins[i])>.01)first[i]=m.state.time-initialTime;
   if(!u.pendingOrder&&u.combatDeployment?.targetId===target.id)oldDeployments.push(u.id);
   for(let j=0;j<i;j++)gap=Math.min(gap,vehicleClearance(u,units[j],m.config.worldScale,m.field));
  }
  if(units.every(u=>!u.task&&!u.path.length&&!u.pendingOrder&&!u.detour))break;
 }
 const arrived=units.every((u,i)=>!u.task&&!u.pendingOrder&&acceptedGoals[i]&&dist(u,acceptedGoals[i])<2),passed=arrived&&first.every(t=>t!==null&&t<=.50001)&&!contacts.length&&!oldDeployments.length&&gap>=0&&units.every(u=>u.hp===u.maxHp);
 results.push({case:`${count} shooting vehicles accept ${action}`,passed,firstMotionSeconds:first,seconds:m.state.time-initialTime,arrived,contacts,oldDeployments,minimumGap:Number.isFinite(gap)?gap:null,units:units.map((u,i)=>({id:u.id,x:u.x,y:u.y,task:u.task,acceptedGoal:acceptedGoals[i],goal:u.routeOrder?.destination,hp:u.hp}))});
}
{
 const {m,units}=setup(3),ids=units.map(u=>u.id),second=m.addStructure('camp-core','scavs',{x:220,y:-70},{completed:true,hp:100000,maxHp:100000});
 m.rebuildNavigation();m.visible.fill(1);m.submitOrder(ids,'attack',second);
 for(let i=0;i<160;i++)m.advance(1/80,{budgetMs:6});
 assert(units.every(u=>!u.pendingOrder&&(u.task?.targetId??u.combatDeployment?.targetId)===second.id));
 m.stop(ids);for(let i=0;i<80;i++)m.advance(1/80,{budgetMs:6});
 assert(units.every(u=>!u.task&&!u.combatDeployment&&!u.combatDisengage&&!u.path.length));
 results.push({case:'retarget and Stop override an active engagement',passed:true});
}
{
 const {m,units,target}=setup(1),u=units[0];m.submitOrder([u.id],'attack-move',{x:0,y:-180});
 for(let i=0;i<16;i++)m.advance(1/80,{budgetMs:6});
 assert(u.combatDisengage.includes(target.id));
 const saved=m.save(),loaded=fixture();loaded.load(saved);loaded.state.bounds=[0,0,127,127];loaded.rebuildNavigation();
 const v=loaded.entity(u.id);assert.deepEqual(v.combatDisengage,u.combatDisengage);
 const newEnemy=loaded.addStructure('camp-core','scavs',{x:v.x-80,y:v.y-25},{completed:true,hp:100000,maxHp:100000});
 loaded.rebuildNavigation();loaded.visible.fill(1);const hp=newEnemy.hp;
 for(let i=0;i<100;i++)loaded.advance(1/80,{budgetMs:6});
 assert(newEnemy.hp<hp,'A genuinely new contact still triggers attack-move combat');
 results.push({case:'saved relocation retains old contact exclusion, new contact is engaged',passed:true});
}
{
 const m=fixture(),u=m.addUnit('bukhanka','rai',{x:0,y:0}),target=m.addStructure('camp-core','scavs',{x:0,y:200},{completed:true,hp:100000});
 m.rebuildNavigation();m.visible.fill(1);
 // Start the real candidate-search phase, then interrupt exactly at a yield.
 u.combatGroup='interrupt';u.combatDeployment={group:'interrupt',targetId:target.id,status:'planning',slot:{x:0,y:100},anchor:{x:0,y:200},resume:{type:'attack',targetId:target.id}};
 u.task={type:'combat-position',x:0,y:100};
 const steps=updateCombatDeployment(m,u,m.unitSpec(u),.1);assert(!steps.next().done);
 m.order([u.id],'move',{x:160,y:0});const task=u.task,path=structuredClone(u.path),pose={x:u.x,y:u.y};
 let result;do{result=steps.next();}while(!result.done);
 assert.equal(u.task,task);assert.deepEqual(u.path,path);assert.equal(dist(u,pose),0);assert(!u.combatDeployment);
 results.push({case:'suspended firing-position search cannot overwrite a newer move or move the body',passed:true});
}
for(const count of [1,3]){
 const m=fixture(),units=Array.from({length:count},(_,i)=>m.addUnit('bukhanka','rai',{x:(i-(count-1)/2)*30,y:0},{heading:0}));
 const target=m.addStructure('camp-core','scavs',{x:0,y:300},{completed:true,hp:100000,maxHp:100000}),goal={x:0,y:500},ids=units.map(u=>u.id);
 m.rebuildNavigation();m.visible.fill(1);m.explored.fill(1);m.submitOrder(ids,'attack-move',goal);
 const held=u=>u.navigation?.reason==='engaging-visible-target'||u.combatDeployment?.status==='arrived';
 for(let frame=0;frame<3200&&!units.every(held);frame++)m.advance(1/80,{budgetMs:6});
 assert(units.every(held),'First attack-move must genuinely stop and engage a contact acquired on the march');
 const response=m.submitOrder(ids,'attack-move',goal),origins=units.map(u=>({x:u.x,y:u.y})),first=units.map(()=>null),at=m.state.time;
 assert(!response.reused,'A repeated click while held by combat must express a fresh intent');
 for(let frame=0;frame<240;frame++){
  m.advance(1/80,{budgetMs:6});
  for(const [i,u] of units.entries())if(first[i]===null&&dist(u,origins[i])>.01)first[i]=m.state.time-at;
 }
 const passed=first.every(t=>t!==null&&t<=.50001)&&units.every(u=>!u.pendingOrder&&!u.combatDeployment&&u.combatDisengage?.includes(target.id));
 results.push({case:`${count} vehicles reissued the same attack-move after contact`,passed,firstMotionSeconds:first});
}
fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/combat-order-interruption.json',JSON.stringify({sources,results},null,2));
console.log(JSON.stringify({results},null,2));assert(results.every(r=>r.passed));
