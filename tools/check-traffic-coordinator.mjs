import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Mission} from '../campaign/mission.js';
import {TrafficCoordinator,TRAFFIC_LIMITS} from '../campaign/traffic-coordinator.js';
import {vehicleClearance} from '../campaign/vehicle-collision.js';
const config=JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/gameplay.json'));
const field={extent:4096,half:2048,cellMetres:32,heightAt:()=>0,gradientAt:()=>({x:0,y:0}),gridToWorld:([x,y])=>({x:x*32-2048,y:2048-y*32}),worldToGrid:(x,y)=>[(x+2048)/32,(2048-y)/32]};
function fixture(){const m=new Mission(config,field);m.state.units=[];m.state.buildings=[];m.state.camps=[];m.state.bounds=[0,0,127,127];m.state.pendingCinematics=[];m.updateMission=()=>{};m.rebuildNavigation();m.explored.fill(255);return m;}
function car(m,x,y,heading,goal){const u=m.addUnit('bukhanka','rai',{x,y},{heading,previousHeading:heading});if(goal){u.path=[goal];u.task={type:'move',...goal};}return u;}
const tests=[];
{
 const m=fixture(),a=car(m,-45,0,-Math.PI/2,{x:90,y:0}),b=car(m,0,-45,0,{x:0,y:90});
 m.advance(.1);assert(m.state.trafficControl.leases.length>0);
 const saved=m.save(),restored=fixture();restored.load(saved);
 // The fixture uses the whole flat map; the production loader restores the
 // campaign sector from its progression flags.
 restored.state.bounds=m.state.bounds.slice();restored.rebuildNavigation();
 assert.deepEqual(restored.state.trafficControl,m.state.trafficControl);
 for(let i=0;i<120;i++){m.advance(.1);restored.advance(.1);}
 assert.deepEqual(restored.state.trafficControl,m.state.trafficControl,'Right of way survives save/load');
 for(const u of [a,b]){const copy=restored.entity(u.id);assert.deepEqual([copy.x,copy.y,copy.hp],[u.x,u.y,u.hp]);assert.equal(u.hp,u.maxHp);assert(!u.task);}
 tests.push({mode:'save-during-queue',passed:true});
}
for(const streamSize of [10,50]){
 const m=fixture(),units=[],goals=[],collisions=[],original=m.vehicleCollision.bind(m);
 m.vehicleCollision=(unit,speed,blockers)=>{if(collisions.length<10)collisions.push({time:m.state.time,id:unit.id,x:unit.x,y:unit.y,speed,decision:m.trafficCoordinator.decisions.get(unit.id),blockers:[...blockers].map(b=>({id:b.id,x:b.x,y:b.y,speed:b.driveSpeed,path:b.path[0]}))});return original(unit,speed,blockers);};
 for(let i=0;i<streamSize;i++)for(const axis of [0,1]){
  const goal=axis?{x:0,y:180+(streamSize-i)*30}:{x:180+(streamSize-i)*30,y:0};
  units.push(axis?car(m,0,-80-i*30,0,goal):car(m,-80-i*30,0,-Math.PI/2,goal));goals.push(goal);
 }
 let minimum=Infinity,yields=0;
 for(let step=0;step<streamSize*120&&units.some(u=>u.task);step++){
  m.advance(.1);yields+=m.trafficCoordinator.statistics.yielding;
  for(let i=0;i<units.length;i++)for(let j=i+1;j<units.length;j++)if(Math.abs(units[i].x-units[j].x)<30&&Math.abs(units[i].y-units[j].y)<30)minimum=Math.min(minimum,vehicleClearance(units[i],units[j],config.worldScale,field));
 }
 assert(minimum>=0);assert(units.every(u=>u.hp===u.maxHp),'Queued traffic must not crash: '+JSON.stringify(collisions));
 assert(units.every((u,i)=>Math.hypot(u.x-goals[i].x,u.y-goals[i].y)<5),'Queue must finish');
 tests.push({mode:(streamSize*2)+'-crossing-queue',minimum,yields,seconds:m.state.time});
}
for(const mode of ['crossing','opposing']){
 const m=fixture(),a=car(m,-65,0,-Math.PI/2,{x:90,y:0}),b=mode==='crossing'?car(m,0,-65,0,{x:0,y:90}):car(m,65,0,Math.PI/2,{x:-90,y:0});
 const goals=[a.task,b.task];let clearance=Infinity,yields=0;
 for(let step=0;step<600&&(a.task||b.task);step++){
  m.advance(.1);yields+=m.trafficCoordinator.statistics.yielding;
  clearance=Math.min(clearance,vehicleClearance(a,b,config.worldScale,field));
 }
 assert(clearance>=0,mode+' overlap');assert.equal(a.hp,a.maxHp,mode+' unwanted collision damage');assert.equal(b.hp,b.maxHp);
 for(const [i,u] of [a,b].entries())assert(Math.hypot(u.x-goals[i].x,u.y-goals[i].y)<5,mode+' did not clear');
 if(mode==='crossing')assert(yields>0);
 tests.push({mode,clearance,yields,seconds:m.state.time});
}
{
 const m=fixture(),b=m.addStructure('generator','rai',{x:0,y:0},{completed:true,progress:1}),u=car(m,43,0,-Math.PI/2);
 m.rebuildNavigation();assert(m.nav.occupied[m.nav.grid(u.x,u.y)[1]*m.nav.size+m.nav.grid(u.x,u.y)[0]],'Fixture is in the planning margin');
 const order=m.order([u.id],'move',{x:160,y:0});assert(order.ok,'A parked vehicle can leave building clearance');
 for(let i=0;i<300&&u.task;i++)m.advance(.1);
 assert(u.x>150);tests.push({mode:'building-margin',x:u.x});
}
{
 const m=fixture();for(let i=0;i<500;i++)car(m,10+(i%25)*7,10+Math.floor(i/25)*7,0);
 m.unitIndex.rebuild(m.state.units);m.trafficCoordinator.update(m);
 assert.equal(m.trafficCoordinator.groups.length,5);assert(m.trafficCoordinator.groups.every(g=>g.units.length<=TRAFFIC_LIMITS.groupSize&&g.virtual));
 const commander=m.addUnit('command','rai',{x:200,y:200});for(const u of m.state.units.slice(0,80))u.commanderId=commander.id;
 m.unitIndex.rebuild(m.state.units);m.trafficCoordinator.update(m);
 assert(m.trafficCoordinator.groups.some(g=>g.leaderId===commander.id&&!g.virtual&&g.units.length===80));
 tests.push({mode:'500-groups',...m.trafficCoordinator.statistics});
}
fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/traffic-coordinator.json',JSON.stringify({passed:true,tests},null,2));console.log(JSON.stringify({passed:true,tests}));
