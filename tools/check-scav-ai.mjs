import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Mission} from '../campaign/mission.js';
const config=JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/gameplay.json','utf8'));
const field={extent:4096,half:2048,cellMetres:32,heightAt:()=>0,gradientAt:()=>({x:0,y:0}),gridToWorld:([x,y])=>({x:x*32-2048,y:2048-y*32}),worldToGrid:(x,y)=>[(x+2048)/32,(2048-y)/32]};
const p={x:-1200,y:400},checks=[];
function fixture(){const m=new Mission(config,field);m.state.units=[];m.state.buildings=[];m.state.camps=[];m.state.pendingCinematics=[];m.updateMission=()=>{};m.rebuildNavigation();return m;}
function add(m,kind,owner,dx=0,dy=0,extra={}){return m.addUnit(kind,owner,{x:p.x+dx,y:p.y+dy},extra);}
function step(m,units,seconds){for(let i=0;i<Math.round(seconds/.1);i++){m.state.time+=.1;for(const u of units)m.updateUnit(u,.1);m.updateProjectiles();}}
for(const [kind,range] of [['scav-grenadier',140],['scav-firetruck',160]]){
  const m=fixture(),enemy=add(m,kind,'scavs'),target=add(m,'builder','rai',0,range);
  step(m,[enemy],12);
  assert(enemy.y>p.y+25,kind+' closes from vision range');
  assert(target.hp<target.maxHp,kind+' reaches range and attacks');
  checks.push(kind+' detects, approaches and attacks');
}
{
  const m=fixture(),guard=add(m,'scav-rifleman','scavs',-80,0,{campId:'test',guard:{...p}}),target=add(m,'bukhanka','rai',0,210);
  const core=m.addStructure('camp-core','scavs',{x:p.x,y:p.y+60},{campId:'test'});
  const original={x:guard.x,y:guard.y};step(m,[guard],.1);assert.deepEqual({x:guard.x,y:guard.y},original,'A quiet camp keeps its guard positions');
  m.damage(core,1,target);assert.equal(guard.scavContact.id,target.id,'A hit on the camp alerts its guards');
  step(m,[guard],4);assert(Math.hypot(guard.x-original.x,guard.y-original.y)>20,'Alerted guard moves to support the camp');
  checks.push('camp damage alerts and mobilizes neighbouring guards');
}
{
  const m=fixture(),reserve=add(m,'scav-rifleman','scavs',0,0,{raidReserve:true}),target=add(m,'builder','rai',0,65);
  step(m,[reserve],.1);assert.equal(target.hp,target.maxHp,'Scripted reserve waits before its raid');
  m.damage(reserve,1,target);step(m,[reserve],.2);
  assert.equal(reserve.raidReserve,false);assert(target.hp<target.maxHp,'An attacked reserve defends itself');
  checks.push('reserves defend themselves when attacked');
}
{
  const m=fixture(),enemy=add(m,'scav-rifleman','scavs'),hidden=add(m,'builder','rai',0,40),visible=add(m,'builder','rai',40,60);
  m.lineOfSight=(_from,to)=>to.id!==hidden.id;step(m,[enemy],.1);
  assert.equal(hidden.hp,hidden.maxHp);assert(visible.hp<visible.maxHp,'A closer occluded target does not prevent firing at a visible one');
  checks.push('visible targets are preferred over occluded decoys');
}
{
  const m=fixture(),enemy=add(m,'scav-grenadier','scavs',0,0,{guard:{...p}}),target=add(m,'builder','rai',0,140);
  step(m,[enemy],.1);const contact={...enemy.scavContact};
  m.lineOfSight=()=>false;target.x+=450;
  step(m,[enemy],.2);assert.equal(enemy.scavContact.x,contact.x);assert.equal(enemy.task.x,contact.x,'Search uses the last seen position');
  const copy=fixture();copy.load(m.save());assert.deepEqual(copy.entity(enemy.id).scavContact,enemy.scavContact,'Contacts survive saves');
  step(m,[enemy],9);assert(!enemy.scavContact,'Lost contact expires');assert.notEqual(enemy.task?.type,'attack');
  checks.push('last seen search, finite memory, saved contact');
}
{
  const m=fixture(),enemy=add(m,'scav-rifleman','scavs',0,0,{raid:true}),target=add(m,'builder','rai',0,70);
  const destination={type:'move',x:p.x+100,y:p.y+150};enemy.task={...destination};
  step(m,[enemy],.1);target.hp=0;step(m,[enemy],.1);
  assert.deepEqual(enemy.task,destination,'Raid resumes its destination after contact ends');
  checks.push('raid destination survives a skirmish');
}
{
  const m=fixture(),home={x:p.x,y:p.y+210};
  const guard=add(m,'raider','scavs',0,0,{guard:home,scavHome:home});
  const plan=m.vehiclePathSteps;
  let searches=0;
  m.vehiclePathSteps=function*(unit,...args){
    if(unit===guard)searches++;
    return yield* plan.call(this,unit,...args);
  };
  step(m,[guard],12);
  assert(Math.hypot(guard.x-home.x,guard.y-home.y)<=14,'The guard returns home');
  assert.equal(searches,1,'The guard keeps its valid return path across the former replan interval');
  checks.push('guard returns without discarding a valid route');
}
console.log(JSON.stringify({checks}));
