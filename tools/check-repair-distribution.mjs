import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Mission} from '../campaign/mission.js';
import {chooseRepairFactory,repairCompletionSeconds,repairChoiceDue} from '../campaign/factory-routing.js';
import {updateCombatRetreat} from '../campaign/combat-policy.js';
const config=JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/gameplay.json','utf8'));
const field={extent:4096,half:2048,cellMetres:32,heightAt:()=>0,gradientAt:()=>({x:0,y:0}),gridToWorld:([x,y])=>({x:x*32-2048,y:2048-y*32}),worldToGrid:(x,y)=>[(x+2048)/32,(2048-y)/32]};
function fixture(){
 const m=new Mission({...config,initialMapBounds:[0,0,127,127]},field);
 Object.assign(m.state,{units:[],buildings:[],camps:[],artifacts:[],raidReserve:[],bounds:[0,0,127,127],pendingCinematics:[],energy:2000,time:20});
 m.updateMission=()=>{};m.visible.fill(255);m.explored.fill(255);
 const factories=[-240,0,240].map(x=>m.addStructure('factory','rai',{x,y:0},{completed:true,progress:1}));
 m.rebuildNavigation();return {m,factories};
}
function car(m,i=0){
 const u=m.addUnit('bukhanka','rai',{x:(i-4)*35,y:-400});u.hp=100;
 u.combatRetreat={status:'planning',started:m.state.time,resume:{action:'move',target:{x:u.x,y:-600},origin:{x:u.x,y:-600}}};
 return u;
}
const counts=(m,fs)=>fs.map(f=>m.state.units.filter(u=>u.combatRetreat?.home?.id===f.id).length);
// Use the production retreat dispatcher, stopping when its path search yields.
// Choosing a factory must happen before any en-route car reaches a repair bay.
function assign(m,u){const it=updateCombatRetreat(m,u,m.unitSpec(u),0);it.next();it.return();}
const results=[];
{
 const {m,factories}=fixture(),cars=Array.from({length:9},(_,i)=>car(m,i));
 for(const u of cars)assign(m,u);
 const distribution=counts(m,factories);assert(distribution.every(n=>n>=2&&n<=4),JSON.stringify(distribution));
 assert(cars.every(u=>u.hp===100),'Assignment never repairs remotely');
 const before=cars.map(u=>u.combatRetreat.home.id),restored=fixture().m;restored.load(m.save());
 assert.deepEqual(restored.state.units.map(u=>u.combatRetreat.home.id),before,'Assignments survive save/load');
 results.push({case:'nine simultaneous retreats reserve three repair queues',distribution});
}
{
 const {m,factories}=fixture(),f=factories[1],cars=Array.from({length:9},(_,i)=>car(m,i));
 for(const [i,u] of cars.entries()){
  u.combatRetreat.home={id:f.id,x:f.x,y:f.y};u.combatRetreat.status='servicing';
  u.factoryVisit={garageVersion:2,factoryId:f.id,phase:i===0?'inside':'waiting',queued:i,arrived:i,slot:i};
 }
 const poses=cars.map(u=>({x:u.x,y:u.y,hp:u.hp,resume:structuredClone(u.combatRetreat.resume)}));
 for(const u of cars)assign(m,u);
 assert.equal(cars[0].factoryVisit.factoryId,f.id,'A car already inside stays in its bay');
 const distribution=counts(m,factories);assert(distribution.every(n=>n>=2&&n<=5),JSON.stringify(distribution));
 assert.deepEqual(cars.map(u=>({x:u.x,y:u.y,hp:u.hp,resume:u.combatRetreat.resume})),poses,'Rerouting preserves position, HP and return orders');
 const stable=cars.map(u=>u.combatRetreat.home.id);
 for(let i=0;i<15;i++){m.state.time+=2;for(const u of cars)assign(m,u);}
 assert.deepEqual(cars.map(u=>u.combatRetreat.home.id),stable,'Queues do not oscillate between factories');
 results.push({case:'old overloaded queue redistributes only exterior cars and stays stable',distribution});
}
{
 const {m,factories:[a,b,c]}=fixture(),u=car(m,4);a.hp=0;c.completed=false;
 assert.equal(chooseRepairFactory(m,u),b);
 a.hp=1400;c.completed=true;a.owner='scavs';assert.notEqual(chooseRepairFactory(m,u),a);
 b.workPriority='production';b.queue=[{kind:'bukhanka',progress:0,cost:130,funding:{paid:0}},{kind:'bukhanka',progress:0,cost:130,funding:{paid:0}}];
 assert.equal(chooseRepairFactory(m,u),c,'Production priority includes unfinished orders and oil transfers');
 b.workPriority='repair';assert.equal(chooseRepairFactory(m,u),b,'Repair priority ignores suspended production work');
 c.x=1800;const peer=car(m);peer.combatRetreat.home={id:b.id};peer.hp=319;
 assert.equal(chooseRepairFactory(m,u),b,'A nearly free nearby bay beats a long drive to an empty factory');
 const estimate=repairCompletionSeconds(m,u,b);peer.hp=1;
 assert(repairCompletionSeconds(m,u,b)>estimate,'Missing HP matters, not just queue count');
 peer.hp=320;peer.combatRetreat.service='complete';
 const completedEstimate=repairCompletionSeconds(m,u,b);m.state.units=[u];
 assert.equal(repairCompletionSeconds(m,u,b),completedEstimate,'Completed visits no longer occupy a queue');
 results.push({case:'travel time, damage, production priority, completed visits and valid allied factories'});
}
{
 const {m,factories:[a,b]}=fixture(),u=car(m);u.combatRetreat.home={id:a.id};
 a.workPriority='production';a.queue=[{kind:'bukhanka',progress:0}];
 for(const phase of ['gate','entering','inside','leaving','departure']){
  u.factoryVisit={factoryId:a.id,phase};assert.equal(chooseRepairFactory(m,u),a);assert(!repairChoiceDue(m,u));
 }
 u.factoryVisit.phase='waiting';assert(repairChoiceDue(m,u));assert(!repairChoiceDue(m,u));
 m.state.time+=2;assert(repairChoiceDue(m,u));u.detour={};m.state.time+=2;assert(!repairChoiceDue(m,u));
 delete u.detour;a.hp=0;assert.notEqual(chooseRepairFactory(m,u),a);
 results.push({case:'doorway ownership, recheck interval, active manoeuvres and destroyed factory'});
}
console.log(JSON.stringify({passed:true,results},null,2));
