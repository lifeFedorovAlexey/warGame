import fs from 'node:fs';
import assert from 'node:assert/strict';
import {fixture} from './check-start-latency-coordinator.mjs';
import {vehicleClearance} from '../campaign/vehicle-collision.js';
const results=[];
function observe(m,units){
 const hit=m.vehicleCollision.bind(m),contacts=[],fired=new Map();
 m.vehicleCollision=(unit,speed,blockers)=>{contacts.push({time:m.state.time,unit:unit.id,speed,blockers:[...blockers].map(b=>b.id)});return hit(unit,speed,blockers);};
 const attack=m.attack.bind(m);m.attack=(unit,target,spec)=>{
  const allowed=m.lineOfSight(unit,target)&&Math.hypot(unit.x-target.x,unit.y-target.y)<=spec.range,result=attack(unit,target,spec);
  if(result&&units.includes(unit)){assert(allowed);if(!fired.has(unit.id))fired.set(unit.id,m.state.time);}
  return result;
 };
 let minimum=Infinity;const unknown=new Set();
 return {contacts,fired,unknown,check(){
  for(const unit of units)if(unit.navigation?.potentialDefect)unknown.add(unit.id);
  for(let i=0;i<units.length;i++)for(let j=0;j<i;j++)minimum=Math.min(minimum,vehicleClearance(units[i],units[j],m.config.worldScale,m.field));
 },get minimum(){return minimum;}};
}
for(const action of ['attack','attack-move']){
 const m=fixture(),units=Array.from({length:20},(_,i)=>m.addUnit('bukhanka','rai',{x:(i%4-1.5)*36,y:-Math.floor(i/4)*32},{heading:0}));
 const target=m.addStructure('generator','scavs',{x:0,y:200},{hp:100000,completed:true,progress:1});
 m.rebuildNavigation();m.visible.fill(255);m.explored.fill(255);const monitor=observe(m,units);
 assert(m.submitOrder(units.map(u=>u.id),action,action==='attack'?target:{x:0,y:420}).ok);
 for(let i=0;i<6400&&monitor.fired.size<20;i++){m.advance(1/80,{budgetMs:5});m.effects=[];monitor.check();}
 const distinct=new Set(units.map(u=>u.combatDeployment?.goal).filter(Boolean).map(p=>p.x+','+p.y)).size;
 const result={name:'20-'+action,seconds:m.state.time,fired:monitor.fired.size,firstShot:[...monitor.fired],distinctPositions:distinct,
  contacts:monitor.contacts,minimum:monitor.minimum,unknown:[...monitor.unknown],damage:units.map(u=>u.maxHp-u.hp)};
 result.passed=result.fired===20&&result.contacts.length===0&&result.minimum>=0&&!result.unknown.length&&result.damage.every(d=>d===0);
 if(!result.passed)fs.writeFileSync('tools/fixtures/navigation-20-'+action+'.json',m.save());
 m.damage(target,100001);m.advance(.1);
 result.releasedTarget=units.every(u=>u.combatDeployment?.targetId!==target.id&&u.task?.targetId!==target.id);result.passed&&=result.releasedTarget;
 results.push(result);
}
{
 const m=fixture();m.addStructure('factory','rai',{x:0,y:0},{completed:true,progress:1});
 const units=[m.addUnit('builder','rai',{x:0,y:-78},{heading:Math.PI}),m.addUnit('bukhanka','rai',{x:0,y:-110},{heading:Math.PI})];
 m.rebuildNavigation();const monitor=observe(m,units);
 assert(units.every(u=>m.vehicleMotionClear(u,u,u)),'Mixed egress fixture must start outside the actual building');
 assert(m.submitOrder(units.map(u=>u.id),'move',{x:120,y:-340}).ok);const first=units.map(()=>null),starts=units.map(u=>({x:u.x,y:u.y}));
 for(let i=0;i<6400;i++){
  m.advance(1/80,{budgetMs:5});m.effects=[];monitor.check();
  units.forEach((u,j)=>{if(first[j]===null&&Math.hypot(u.x-starts[j].x,u.y-starts[j].y)>.5)first[j]=m.state.time;});
  if(units.every(u=>!u.pendingOrder&&!u.task&&!u.path.length&&!u.detour&&!u.yieldReturn))break;
 }
 const arrived=units.map(u=>!!u.routeOrder&&!u.task&&!u.path.length&&!u.detour&&!u.yieldReturn&&Math.hypot(u.x-u.routeOrder.destination.x,u.y-u.routeOrder.destination.y)<2);
 const result={name:'mixed-builder-combat-egress',seconds:m.state.time,first,arrived,contacts:monitor.contacts,minimum:monitor.minimum,unknown:[...monitor.unknown],damage:units.map(u=>u.maxHp-u.hp)};
 result.passed=arrived.every(Boolean)&&first.every(t=>t!==null&&t<=.50001)&&!result.contacts.length&&result.minimum>=0&&!result.unknown.length&&result.damage.every(d=>d===0);
 if(!result.passed)fs.writeFileSync('tools/fixtures/navigation-mixed-egress.json',m.save());results.push(result);
}
fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/navigation-required-cases.json',JSON.stringify({seed:19452,results},null,2));
console.log(JSON.stringify({results},null,2));assert(results.every(r=>r.passed),'Required navigation cases failed; fixtures saved');
