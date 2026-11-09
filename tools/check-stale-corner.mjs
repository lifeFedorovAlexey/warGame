import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Mission} from '../campaign/mission.js';
const config=JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/gameplay.json','utf8'));
const field={extent:4096,half:2048,cellMetres:32,heightAt:()=>0,gradientAt:()=>({x:0,y:0}),
 gridToWorld:([x,y])=>({x:x*32-2048,y:2048-y*32}),worldToGrid:(x,y)=>[(x+2048)/32,(2048-y)/32]};
function fixture(blocked=false){
 const m=new Mission(config,field);
 Object.assign(m.state,{units:[],buildings:[],camps:[],bounds:[0,0,127,127],pendingCinematics:[]});
 m.updateMission=()=>{};m.rebuildNavigation();
 const goal={x:30,y:10};
 const u=m.addUnit('bukhanka','rai',{x:0,y:0},{heading:0,path:[{x:0,y:-10},goal],
  task:{type:'move',...goal},routeOrder:{revision:1,request:goal,destination:goal},
  driveWatch:{x:0,y:-10,distance:10,elapsed:2.1,blocked:0,attempts:1}});
 if(blocked){const allowed=m.vehicleMotionClear.bind(m);m.vehicleMotionClear=(unit,from,to,...rest)=>to.x<10&&allowed(unit,from,to,...rest);}
 return {m,u};
}
const free=fixture();free.m.move(free.u,.1);
assert.equal(free.u.path.length,1,'A fully checked connector releases an already-passed grid corner');
assert.deepEqual(free.u.path[0],{x:30,y:10});
assert.deepEqual(free.u.routeOrder.destination,{x:30,y:10});
for(let i=0;i<250&&free.u.task;i++)free.m.advance(.1);
assert(!free.u.task&&Math.hypot(free.u.x-30,free.u.y-10)<2);
assert.equal(free.u.hp,free.u.maxHp);
const blocked=fixture(true);blocked.m.move(blocked.u,.1);
assert.equal(blocked.u.path.length,2,'A blocked connector cannot bypass the terrain constraint');
const long=fixture(),longGoal={x:.7,y:545.6};
Object.assign(long.u,{x:-22.582,y:350.889,heading:-.490,path:[{x:-8,y:352},longGoal],
 task:{type:'move',...longGoal},routeOrder:{revision:2,request:longGoal,destination:longGoal},
 driveWatch:{x:-8,y:352,distance:14.625,elapsed:2.1,blocked:0,attempts:1}});
long.m.move(long.u,.1);
assert.equal(long.u.path.length,1,'A full checked drive can release a stale connector ahead of the unit');
assert.deepEqual(long.u.path[0],longGoal);
for(let i=0;i<600&&long.u.task;i++)long.m.advance(.1);
assert(!long.u.task&&Math.hypot(long.u.x-longGoal.x,long.u.y-longGoal.y)<2);
assert.equal(long.u.hp,long.u.maxHp);
console.log(JSON.stringify({safeConnector:'arrived',forbiddenConnector:'retained',longConnector:'arrived',hp:free.u.hp}));
