import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Mission} from '../campaign/mission.js';
import {vehicleClearance} from '../campaign/vehicle-collision.js';
const config=JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/gameplay.json'));
const field={extent:4096,half:2048,cellMetres:32,heightAt:()=>0,gradientAt:()=>({x:0,y:0}),gridToWorld:([x,y])=>({x:x*32-2048,y:2048-y*32}),worldToGrid:(x,y)=>[(x+2048)/32,(2048-y)/32]};
function fixture(){const m=new Mission({...config,startGrid:[64,76]},field);m.state.units=[];m.state.buildings=[];m.state.camps=[];m.state.bounds=[0,0,127,127];m.state.pendingCinematics=[];m.updateMission=()=>{};m.rebuildNavigation();m.visible.fill(1);m.explored.fill(1);return m;}
const results=[];
{
 const m=fixture(),units=Array.from({length:4},(_,i)=>m.addUnit('bukhanka','rai',{x:(i%2)*30,y:-Math.floor(i/2)*30}));
 const first=m.addStructure('generator','scavs',{x:0,y:150},{hp:100000,completed:true,progress:1});
 const second=m.addStructure('generator','scavs',{x:65,y:170},{hp:100000,completed:true,progress:1});m.rebuildNavigation();
 assert(m.order(units.map(u=>u.id),'attack-move',{x:0,y:350}).ok);m.advance(.1);
 assert(units.every(u=>u.combatDeployment?.targetId===first.id));
 m.damage(first,100001,units[0]);
 for(let i=0;i<5;i++)m.advance(.1);
 assert(units.every(u=>u.combatDeployment?.targetId===second.id),'A second contact replaces the destroyed target');
 assert(units.every(u=>!u.combatResume&&!u.combatParking),'The new deployment cancels stale march-planning state for every member');
 assert(units.every(u=>u.combatDeployment.resume.type==='attack-move'),'Preserve the actual march behind the new deployment');
}
for(const action of ['attack-move','attack']){
 const m=fixture(),units=Array.from({length:10},(_,i)=>m.addUnit('bukhanka','rai',{x:0,y:-i*30}));
 const target=m.addStructure('generator','scavs',{x:0,y:190},{hp:100000,maxHp:100000,completed:true,progress:1});m.rebuildNavigation();
 assert(m.order(units.map(u=>u.id),action,action==='attack'?target:{x:0,y:350}).ok);
 const fired=new Set();let minimum=Infinity;
 for(let step=0;step<450;step++){
  m.advance(.1);for(const e of m.effects)if(e.type==='shot'&&units.some(u=>u.id===e.from))fired.add(e.from);m.effects=[];
  for(let i=0;i<units.length;i++)for(let j=i+1;j<units.length;j++)minimum=Math.min(minimum,vehicleClearance(units[i],units[j],config.worldScale,field));
 }
 const result={action,fired:fired.size,minimum,units:units.map(u=>({id:u.id,x:u.x,y:u.y,hp:u.hp,task:u.task,retreat:u.combatRetreat,deployment:u.combatDeployment}))};
 results.push(result);if(process.argv.includes('--diagnose'))console.log(JSON.stringify(result));
 if(!process.argv.includes('--diagnose')){
  assert.equal(fired.size,units.length,'The whole group must enter firing range');
  assert(Math.max(...units.map(u=>u.x))-Math.min(...units.map(u=>u.x))>60,'The column must spread into firing positions');
  assert(minimum>=0,'Deployment must preserve hull collisions');assert(units.every(u=>u.hp===u.maxHp),'Friendly manoeuvres must not cause damage');
 }
 m.setCombatPolicy([units[0].id],{retreat:'light'});m.damage(units[0],70,target);
 const hurt=units[0],start={x:hurt.x,y:hurt.y};
 for(let step=0;step<600&&hurt.combatRetreat?.status!=='arrived';step++){m.advance(.1);m.effects=[];}
 const retreat={action,status:hurt.combatRetreat?.status,moved:Math.hypot(hurt.x-start.x,hurt.y-start.y),distance:Math.hypot(hurt.x-target.x,hurt.y-target.y),hp:hurt.hp,path:hurt.path,detour:hurt.detour};
 console.log(JSON.stringify({retreat}));
 if(!process.argv.includes('--diagnose')){assert.equal(retreat.status,'arrived','Damaged front vehicle must withdraw through its group');assert(retreat.distance>config.units.raider.range);assert.equal(retreat.hp,250);}
}
{
 const m=fixture(),units=Array.from({length:6},(_,i)=>m.addUnit('bukhanka','rai',{x:0,y:-i*30}));
 const target=m.addStructure('mg-tower','scavs',{x:0,y:200},{hp:100000,maxHp:100000,completed:true,progress:1});m.rebuildNavigation();
 const collisions=[],originalCollision=m.vehicleCollision.bind(m);m.vehicleCollision=(unit,speed,blockers)=>{collisions.push({time:m.state.time,id:unit.id,x:unit.x,y:unit.y,heading:unit.heading,path:unit.path,speed,retreat:unit.combatRetreat?.status,blockers:[...blockers].map(other=>({id:other.id,x:other.x,y:other.y,heading:other.heading,speed:other.driveSpeed,retreat:other.combatRetreat?.status}))});return originalCollision(unit,speed,blockers);};
 m.setCombatPolicy(units.map(u=>u.id),{retreat:'light'});
 assert(m.order(units.map(u=>u.id),'attack-move',{x:0,y:350}).ok);
 let started=null;
 for(let step=0;step<900;step++){
  m.advance(.1);m.effects=[];
  if(!started&&units[0].combatRetreat)started={time:m.state.time,hp:units[0].hp};
  if(units[0].combatRetreat?.status==='arrived')break;
 }
 const result={case:'live tower fire',started,time:m.state.time,hp:units[0].hp,status:units[0].combatRetreat?.status,distance:Math.hypot(units[0].x-target.x,units[0].y-target.y)};
 console.log(JSON.stringify(result));if(process.argv.includes('--diagnose'))console.log(JSON.stringify({collisions}));assert(started,'Weapon hits must trigger retreat without debug damage');assert.equal(result.status,'arrived');assert(result.hp>0&&result.distance>config.buildings['mg-tower'].range);assert.deepEqual(collisions,[],'Advancing units yield to withdrawal');
}
{
 const m=fixture(),units=Array.from({length:6},(_,i)=>m.addUnit('bukhanka','rai',{x:0,y:-i*30}));
 const target=m.addStructure('generator','scavs',{x:0,y:190},{hp:100000,completed:true,progress:1});m.rebuildNavigation();
 const goal={x:0,y:350};m.order(units.map(u=>u.id),'attack-move',goal);m.advance(.1);m.finishPendingStep();
 const deployment=structuredClone(units[0].combatDeployment);
 const copy=fixture();copy.load(m.save());assert.deepEqual(copy.entity(units[0].id).combatDeployment,deployment,'Deployment survives save/load');
 copy.state.bounds=m.state.bounds.slice();copy.rebuildNavigation();
 assert(copy.order(units.map(u=>u.id),'attack-move',goal).ok);
 assert(!copy.entity(units[0].id).combatDeployment&&copy.entity(units[0].id).combatDisengage.includes(target.id),'A fresh ground order must release the old engagement, even at the same destination');
 m.stop([units[1].id]);m.advance(.1);assert(!units[1].combatDeployment&&!units[1].task,'Stop cancels deployment');
 assert(m.order([units[2].id],'move',{x:-150,y:-150}).ok);assert(!units[2].combatDeployment&&units[2].task.type==='move','New move overrides combat position');
 m.damage(target,100001,units[0]);m.advance(.1);assert(!units[0].combatDeployment&&units[0].task.type==='attack-move','Destroyed contact resumes original march');
 assert.equal(units[0].task.y,deployment.resume.y);
}
{
 const m=fixture(),units=Array.from({length:50},(_,i)=>m.addUnit('bukhanka','rai',{x:(i%5-2)*35,y:-Math.floor(i/5)*30}));
 const target=m.addStructure('generator','scavs',{x:0,y:190},{hp:100000,completed:true,progress:1});m.rebuildNavigation();
 assert(m.order(units.map(u=>u.id),'attack-move',{x:0,y:350}).ok);m.advance(.1);m.finishPendingStep();
 const active=units.filter(u=>u.combatDeployment?.slot),reserve=units.filter(u=>u.combatDeployment?.status==='reserve');
 assert(active.length>=6&&active.length<50&&reserve.length>0,'Limited frontage keeps a reserve');
 assert.equal(new Set(active.map(u=>u.combatDeployment.index)).size,active.length,'Every firing slot has a single owner');
 const freed=active[0].combatDeployment.index;m.stop([active[0].id]);
 for(let i=0;i<25;i++)m.advance(.1);
 assert(reserve.some(u=>u.combatDeployment?.index===freed),'Reserve replaces a unit that leaves its slot');
 console.log(JSON.stringify({case:'50-unit frontage',active:active.length,reserve:reserve.length}));
}
console.log(JSON.stringify({passed:true,groups:results.map(r=>({action:r.action,fired:r.fired,minimum:r.minimum}))}));
