import assert from 'node:assert/strict';
import fs from 'node:fs';
import {progressMission} from './check-navigation-public-progress.mjs';
import {firingSlots} from '../campaign/firing-positions.js';
import {advanceFiringFrontage} from '../campaign/combat-frontage.js';
const drain=steps=>{let result;do{result=steps.next();}while(!result.done);return result.value;};
const results=[];
for(const phase of ['attack','attack-move','firing','filling','retreat','factory-waiting','factory-gate','building']){
  const m=progressMission(),u=m.addUnit(phase==='building'?'builder':'bukhanka','rai',{x:0,y:0},{heading:0});
  const target=m.addStructure('generator','scavs',{x:0,y:120},{hp:100000,completed:true,progress:1});m.rebuildNavigation();
  u.commandRevision=5;u.task={type:phase==='attack-move'?'attack-move':'attack',targetId:target.id,x:0,y:250};u.path=[{x:0,y:90}];
  if(['firing','filling'].includes(phase)){
    u.combatGroup='direct-test';u.task={type:'combat-position',x:0,y:90};
    u.combatDeployment={group:u.combatGroup,targetId:target.id,status:phase==='firing'?'arrived':'moving',compacting:phase==='filling',
      index:0,slot:{x:0,y:90},goal:{x:0,y:90},anchor:{x:target.x,y:target.y},angle:-Math.PI/2,resume:{type:'attack',targetId:target.id}};
    if(phase==='firing')u.path=[];
  }
  if(['retreat','factory-waiting','factory-gate'].includes(phase)){
    u.task={type:'move',x:0,y:90};u.combatRetreat={status:'moving',phase:'home',destination:{x:0,y:90},started:0};
    u.hp=100;u.combatPolicy={retreat:'light',response:'ignore',priority:'nearest'};
    if(phase.startsWith('factory'))u.factoryVisit={factoryId:'old-factory',phase:phase==='factory-gate'?'gate':'waiting',waitingPoint:{x:0,y:90}};
  }
  if(phase==='building')u.task={type:'build',targetId:target.id};
  const goal={x:-150,y:100},reply=m.submitOrder([u.id],'move',goal);
  assert(reply.ok);assert.equal(u.pendingOrder?.revision,reply.revision,phase+': the direct move owns the next tick');
  assert(!u.proposedOrder,phase+': no waiting behind the cancelled behaviour');assert(u.retreatSuppressed);
  // Exercise the real coordinator and motion executor before giving any
  // budget to the route planner. A click must not need a completed A* first.
  m.trafficCoordinator.update(m);m.updateUnit(u,.1);
  assert(u.pendingOrder?.started,phase+': immediate steering starts');assert(u.x<0&&u.heading>0,phase+': steering follows the left click');
  assert(!u.combatDeployment&&!u.combatRetreat&&!u.factoryVisit,phase+': former controller is released');
  for(let n=0;n<200&&u.pendingOrder;n++)m.advance(.1);
  assert(!u.pendingOrder&&!u.proposedOrder);assert(!u.combatDeployment&&!u.combatRetreat);assert.deepEqual(u.routeOrder.request,goal);
  results.push({phase,passed:true});
}
{
  const m=progressMission(),target=m.addStructure('generator','scavs',{x:0,y:200},{hp:100000,completed:true,progress:1});
  const points=firingSlots(m.config.units.bukhanka,m.config.worldScale,-Math.PI/2,target);
  const a=m.addUnit('bukhanka','rai',points[0]),b=m.addUnit('bukhanka','rai',{x:points[0].x,y:points[0].y-100});
  for(const [u,index,status] of [[a,0,'arrived'],[b,22,'moving']]){
    u.combatGroup='suspended';u.task={type:'combat-position',...points[index]};
    u.combatDeployment={group:'suspended',targetId:target.id,index,slot:{...points[index]},goal:{...points[index]},status,
      angle:-Math.PI/2,anchor:{x:0,y:200},resume:{type:'attack',targetId:target.id}};
  }
  b.path=[points[22]];m.rebuildNavigation();m.visible.fill(255);m.explored.fill(255);
  const steps=advanceFiringFrontage(m,a,a.combatDeployment,target);assert(!steps.next().done);
  const originalB=JSON.stringify(b.combatDeployment),goal={x:-200,y:100};m.submitOrder([a.id],'move',goal);drain(steps);
  assert.equal(JSON.stringify(b.combatDeployment),originalB,'Suspended position exchange cannot move the other reservation after LMB');
  assert.equal(a.pendingOrder?.type,'move');assert(!a.proposedOrder);
  results.push({phase:'direct click cancels suspended filling before publication',passed:true});
}
fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/direct-combat-control.json',JSON.stringify({results},null,2));
console.log(JSON.stringify({passed:results.length,results}));
