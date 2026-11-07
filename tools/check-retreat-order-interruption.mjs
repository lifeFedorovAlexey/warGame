import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from './check-start-latency-coordinator.mjs';
import {updateCombatRetreat} from '../campaign/combat-policy.js';

const results=[];
function setup(){
 const m=fixture(),u=m.addUnit('bukhanka','rai',{x:0,y:0},{heading:0});
 m.state.buildings=[];m.state.camps=[];m.rebuildNavigation();m.visible.fill(1);m.explored.fill(1);
 m.retreat([u.id]);return{m,u};
}
for(const action of ['move','attack','stop','retreat']){
 const {m,u}=setup(),steps=updateCombatRetreat(m,u,m.unitSpec(u),.1);
 assert.equal(steps.next().done,false,'Pause the real retreat planner at its first candidate yield');
 if(action==='move')m.order([u.id],'move',{x:180,y:0});
 else if(action==='attack'){
  const enemy=m.addStructure('camp-core','scavs',{x:190,y:100},{completed:true,hp:100000});m.rebuildNavigation();
  m.order([u.id],'attack',enemy);
 }else if(action==='stop')m.stop([u.id]);else m.retreat([u.id]);
 const expected=structuredClone({task:u.task,path:u.path,retreat:u.combatRetreat,pose:{x:u.x,y:u.y,heading:u.heading}});
 let result,count=0;do{result=steps.next();assert(++count<10000);}while(!result.done);
 const actual=structuredClone({task:u.task,path:u.path,retreat:u.combatRetreat,pose:{x:u.x,y:u.y,heading:u.heading}});
 assert.deepEqual(actual,expected,`Suspended retreat must not overwrite ${action} or move after it`);
 results.push({case:`${action} cancels suspended retreat`,passed:true});
}
for(const change of ['construction','death']){
 const {m,u}=setup(),steps=updateCombatRetreat(m,u,m.unitSpec(u),.1);assert(!steps.next().done);
 if(change==='construction'){
  const old=m.nav.topologyRevision;m.addStructure('generator','rai',{x:-90,y:60},{completed:false});m.rebuildNavigation();
  assert.notEqual(m.nav.topologyRevision,old);
 }else u.hp=0;
 while(!steps.next().done){}
 assert.equal(u.path.length,0);assert.equal(u.task,null);assert.deepEqual([u.x,u.y],[0,0]);
 results.push({case:`${change} invalidates an unfinished retreat route`,passed:true});
}
{
 const {m,u}=setup(),steps=updateCombatRetreat(m,u,m.unitSpec(u),.1);assert(!steps.next().done);
 m.submitOrder([u.id],'move',{x:160,y:0});
 const expected=structuredClone({path:u.path,task:u.task,x:u.x,y:u.y,pending:u.pendingOrder});
 while(!steps.next().done){}
 assert.deepEqual({path:u.path,task:u.task,x:u.x,y:u.y,pending:u.pendingOrder},expected);
 results.push({case:'queued manual move invalidates suspended retreat before route commit',passed:true});
}
{
 const {m,u}=setup();m.stop([u.id]);u.hp=u.maxHp*.7;
 m.setCombatPolicy([u.id],{retreat:'light',response:'ignore'});
 const goal={x:160,y:0},response=m.submitOrder([u.id],'move',goal);assert(response.ok);
 // A controller may run before the new command's route has been calculated.
 m.updateUnit(u,.1);
 assert.equal(u.pendingOrder?.revision,response.revision,'A manual move must not be silently replaced by an older automatic retreat rule');
 for(let i=0;i<40&&u.pendingOrder;i++)m.advance(1/80,{budgetMs:6});
 assert(!u.pendingOrder);assert.deepEqual(u.routeOrder.request,goal);assert(!u.combatRetreat);
 // New enemy damage is a new event; the still-enabled retreat rule resumes.
 const enemy=m.addUnit('raider','scavs',{x:0,y:-80});m.damage(u,1,enemy);m.updateUnit(u,.1);
 assert(u.combatRetreat,'A newer hostile hit reactivates the retained retreat policy');
 results.push({case:'new manual move wins over existing damage; newer damage reactivates retreat',passed:true});
}
fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/retreat-order-interruption.json',JSON.stringify({results},null,2));
console.log(JSON.stringify({results},null,2));
