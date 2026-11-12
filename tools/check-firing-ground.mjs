import assert from 'node:assert/strict';
import fs from 'node:fs';
import {progressMission} from './check-navigation-public-progress.mjs';
import {firingGroundAllowed} from '../campaign/firing-ground.js';
import {validPosition,firingPose} from '../campaign/firing-positions.js';
import {updateCombatDeployment} from '../campaign/combat-deployment.js';
const drain=steps=>{let s;do{s=steps.next();}while(!s.done);return s.value;};
const ramp=m=>{
  m.field.heightAt=(x,y)=>Math.max(0,Math.min(60,y-20))*.25;
  m.field.gradientAt=(x,y)=>({x:0,y:y>20&&y<80?.25:0});
};
const results=[];
{
  const m=progressMission();ramp(m);
  const u=m.addUnit('bukhanka','rai',{x:0,y:40});
  assert(!firingGroundAllowed(m,u));
  assert(firingGroundAllowed(m,u,{x:0,y:100}));
  assert(firingGroundAllowed(m,u,{x:0,y:0}));
  assert(!firingGroundAllowed(m,u,{x:0,y:82}),'The whole hull, not just its flat centre, must fit');
  assert(m.vehiclePath(u,{x:0,y:110})?.length,'Ramp traversal is still legal');
  assert(m.order([u.id],'move',{x:0,y:55}).ok,'Direct movement can stop on a traversable ramp');
  assert(Math.abs(u.path.at(-1).y-55)<.01);
  results.push('flat platforms at either height; slope/edge rejected; direct driving unchanged');
}
for(const owner of ['rai','scavs']){
  const m=progressMission();ramp(m);
  const u=m.addUnit(owner==='rai'?'bukhanka':'raider',owner,{x:0,y:55},{heading:0});
  const target=m.addStructure('generator',owner==='rai'?'scavs':'rai',{x:0,y:160},{hp:100000,completed:true,progress:1});m.rebuildNavigation();
  assert(!validPosition(m,u,target,u,[]));
  const path=m.attackPath(u,target);assert(path?.length,owner+': in-range vehicle must leave the ramp');
  assert(firingGroundAllowed(m,u,firingPose(u,path.at(-1),target)));
  u.task={type:'attack',targetId:target.id};u.path=[];m.updateUnit(u,.1);
  assert.notEqual(u.navigation?.reason,'engaging-visible-target',owner+': firing cannot freeze a car on the slope');
  assert(u.path.length,owner+': attack controller finds a level endpoint');
  results.push(owner+': attack planning and live controller leave slope');
}
{
  const m=progressMission();ramp(m);
  const cars=[-30,30].map(x=>m.addUnit('bukhanka','rai',{x,y:55}));
  const target=m.addStructure('generator','scavs',{x:0,y:160},{hp:100000,completed:true,progress:1});m.rebuildNavigation();
  assert(m.order(cars.map(u=>u.id),'attack',target).ok);
  for(const u of cars)drain(updateCombatDeployment(m,u,m.unitSpec(u),.1));
  for(const u of cars){
    const d=u.combatDeployment;assert(d);assert.notEqual(d.status,'arrived','Do not reserve the current sloping pose');
    if(d.slot)assert(firingGroundAllowed(m,u,firingPose(u,d.slot,target)));
  }
  // Old saves may already have marked the ramp as an arrived position.
  const u=cars[0],d=u.combatDeployment;d.goal=d.slot={x:u.x,y:u.y};d.status='arrived';u.path=[];
  drain(updateCombatDeployment(m,u,m.unitSpec(u),.1));assert.notEqual(d.status,'arrived');
  if(d.slot)assert(firingGroundAllowed(m,u,firingPose(u,d.slot,target)));
  results.push('group reservations and saved arrived positions reject slopes');
}
for(const asynchronous of [false,true]){
  const m=progressMission();ramp(m);
  const cars=[-30,30].map(x=>m.addUnit('bukhanka','rai',{x,y:-100}));
  const reply=m[asynchronous?'submitOrder':'order'](cars.map(u=>u.id),'attack-move',{x:0,y:55});assert(reply.ok);
  for(let i=0;i<1000&&cars.some(u=>u.pendingOrder||u.proposedOrder);i++)m.advance(.1);
  assert(cars.every(u=>!u.pendingOrder&&!u.proposedOrder));
  for(const u of cars){assert(u.routeOrder?.destination);assert(firingGroundAllowed(m,u,u.routeOrder.destination,0));}
  results.push((asynchronous?'shared async':'sync')+' attack-move destination excludes slope');
}
fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/firing-ground.json',JSON.stringify({results},null,2));
console.log(JSON.stringify({passed:results.length,results}));
