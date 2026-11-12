import assert from 'node:assert/strict';
import fs from 'node:fs';
import {progressMission} from './check-navigation-public-progress.mjs';
import {factoryPoint,updateFactoryVisit,insideFactory} from '../campaign/factory-garage.js';
import {prepareFactoryQueue,factoryWaitingPoint} from '../campaign/factory-waiting.js';
import {vehicleClearance,trafficCollisionRequired} from '../campaign/vehicle-collision.js';
const drain=iterator=>{let result;do{result=iterator.next();}while(!result.done);return result.value;};
const results=[];
function scene(rotation=0,y=0){
  const m=progressMission();m.state.energy=10000;m.updateMission=()=>{};
  const f=m.addStructure('factory','rai',{x:0,y},{completed:true,progress:1,rotation});m.rebuildNavigation();
  function add(x,y,queued=0){
    const u=m.addUnit('bukhanka','rai',factoryPoint(m,f,x,y),{heading:rotation});u.hp=100;
    u.combatRetreat={forced:true,status:'moving',phase:'home',started:queued,home:{id:f.id,x:f.x,y:f.y}};
    u.factoryVisit={garageVersion:2,factoryId:f.id,phase:'waiting',slot:m.state.units.length,queued,factory:{...f,queue:[]}};
    return u;
  }
  return {m,f,add};
}
{
  const {m,f,add}=scene(),far=add(-9,-90,0),first=add(0,-18,100);m.state.time=120;
  drain(updateFactoryVisit(m,far,f,.1));drain(updateFactoryVisit(m,first,f,.1));
  assert.equal(f.garageGate,first.id);assert.equal(first.factoryVisit.phase,'entering');assert.notEqual(far.factoryVisit.phase,'gate');
  results.push({name:'actual first arrival enters before earlier distant order',passed:true});
}
{
  const {m,f,add}=scene(),occupant=add(0,-18),first=add(-9,-23,100),later=add(9,-65,0);
  occupant.factoryVisit.phase='entering';m.state.time=10;
  drain(updateFactoryVisit(m,first,f,0));assert.equal(first.factoryVisit.queueArrivedAt,10);
  later.x=factoryPoint(m,f,9,-23).x;later.y=factoryPoint(m,f,9,-23).y;m.state.time=12;
  drain(updateFactoryVisit(m,later,f,0));assert.equal(later.factoryVisit.queueArrivedAt,12);
  occupant.factoryVisit.phase='inside';occupant.factoryVisit.arrived=9;
  drain(updateFactoryVisit(m,later,f,0));assert.equal(f.garageGate,first.id,'Arrival is recorded even while the shutter is busy');
  results.push({name:'busy entrance retains physical arrival order',passed:true});
}
{
  const {m,f,add}=scene(),cars=Array.from({length:8},(_,i)=>add(i%2?40:-40,-60-i*10));
  drain(prepareFactoryQueue(m,f,cars));const points=f.repairWaiting.points.slice(),coordinates=JSON.stringify(points);
  for(let i=0;i<20;i++)drain(prepareFactoryQueue(m,f,cars));assert.equal(JSON.stringify(f.repairWaiting.points),coordinates);
  assert(points.every((p,i)=>p===f.repairWaiting.points[i]),'The same points are reused, without rebuilding coordinates');
  const extra=add(0,-160);drain(prepareFactoryQueue(m,f,[...cars,extra]));assert.equal(f.repairWaiting.points.length,9);
  assert(points.every((p,i)=>p===f.repairWaiting.points[i]),'Adding one arrival only extends the tail');
  extra.hp=0;drain(prepareFactoryQueue(m,f,cars));assert.equal(f.repairWaiting.points.length,8);assert(points.every((p,i)=>p===f.repairWaiting.points[i]));
  m.load(m.save());assert.equal(JSON.stringify(m.entity(f.id).repairWaiting.points),coordinates,'Queue coordinates survive save/load');
  results.push({name:'persistent points grow and shrink only at tail; save/load',passed:true});
}
{
  const {m,f,add}=scene(),a=add(-9,-33,10),b=add(-9,-80,0),extra=add(50,-90);
  drain(prepareFactoryQueue(m,f,[a,b,extra]));const queue=f.repairWaiting,rear=queue.points[2],front=queue.points[0];
  Object.assign(a,{x:rear.x,y:rear.y,task:{type:'move',x:rear.x,y:rear.y}});
  Object.assign(a.factoryVisit,{waitingPoint:{x:rear.x,y:rear.y},waitSlot:2});
  Object.assign(b.factoryVisit,{waitingPoint:{x:front.x,y:front.y},waitSlot:0});
  b.path=[{x:b.x,y:b.y+20},{x:front.x,y:front.y}];const prefix=b.path[0];
  const before=[a,b].map(u=>[u.x,u.y,u.hp]);
  const point=drain(factoryWaitingPoint(m,f,a,()=>true));
  assert.deepEqual(point,{x:front.x,y:front.y});assert.equal(b.factoryVisit.waitSlot,2);assert.equal(b.path[0],prefix);
  assert.deepEqual([a,b].map(u=>[u.x,u.y,u.hp]),before,'Swapping queue positions never moves bodies');
  assert.equal(f.repairWaiting,queue);assert.equal(queue.points[0],front);assert.equal(queue.points[2],rear);
  results.push({name:'near arrival fills front vacancy and reuses distant car route',passed:true});
}
{
  const {m,f,add}=scene(0,1850),cars=Array.from({length:500},(_,i)=>add((i%25-12)*7,-50-Math.floor(i/25)*7));
  const iterator=prepareFactoryQueue(m,f,cars);let steps=0,maxMs=0,step;
  do{const at=performance.now();step=iterator.next();maxMs=Math.max(maxMs,performance.now()-at);steps++;}while(!step.done);
  assert.equal(f.repairWaiting.points.length,500);assert(steps>=500,'Large allocation yields between geometry checks');
  const points=f.repairWaiting.points.slice();drain(prepareFactoryQueue(m,f,cars));assert(points.every((p,i)=>f.repairWaiting.points[i]===p));
  results.push({name:'500 repair requests allocate 500 reusable points',passed:true,steps,maxMs});
}
{
  const {m,f,add}=scene(),u=add(-9,-60),steps=updateFactoryVisit(m,u,f,.1);
  assert(!steps.next().done);assert(m.order([u.id],'move',{x:-300,y:-300}).ok);
  const state=JSON.stringify({x:u.x,y:u.y,path:u.path,task:u.task,visit:u.factoryVisit,retreat:u.combatRetreat});
  drain(steps);assert.equal(JSON.stringify({x:u.x,y:u.y,path:u.path,task:u.task,visit:u.factoryVisit,retreat:u.combatRetreat}),state);
  results.push({name:'new direct order cancels suspended queue allocation',passed:true});
}
for(const rotation of [0,Math.PI/2]){
  const {m,f}=scene(rotation),cars=Array.from({length:8},(_,i)=>{
    const u=m.addUnit('bukhanka','rai',factoryPoint(m,f,(i%4-1.5)*9,-35-Math.floor(i/4)*9),{heading:rotation});
    u.hp=100;u.combatRetreat={forced:true,status:'planning',started:0};return u;
  });
  m.rebuildNavigation();const released=new Set(),events=[];let gap=Infinity;
  const started=performance.now();
  for(let tick=0;tick<2400&&released.size<cars.length;tick++){
    m.advance(.1);m.finishPendingStep();m.effects=[];
    for(const e of m.drainEvents())if(['factory-admitted','factory-released'].includes(e.type)){events.push({type:e.type,id:e.unit,time:m.state.time});if(e.type==='factory-released')released.add(e.unit);}
    const outside=cars.filter(u=>!insideFactory(u));
    assert(outside.filter(u=>['gate','entering'].includes(u.factoryVisit?.phase)).length<=1);
    for(let i=0;i<outside.length;i++)for(let j=0;j<i;j++)if(trafficCollisionRequired(outside[i],outside[j]))gap=Math.min(gap,vehicleClearance(outside[i],outside[j],m.config.worldScale,m.field));
  }
  const result={name:'physical repair queue '+rotation,seconds:m.state.time,cpuMs:performance.now()-started,released:released.size,gap,events,
    remaining:cars.filter(u=>u.factoryVisit).map(u=>({id:u.id,x:u.x,y:u.y,visit:u.factoryVisit,reason:u.navigation?.reason,path:u.path}))};
  fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/factory-arrival-'+rotation+'.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify({...result,events:undefined,remaining:undefined}));
  assert.equal(released.size,cars.length,'Every visitor repairs and leaves');assert(cars.every(u=>u.hp===u.maxHp));assert(gap>=0);
  results.push({...result,passed:true});
}
fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/factory-arrival-queue.json',JSON.stringify({results},null,2));
console.log(JSON.stringify({passed:results.length,results:results.map(r=>({...r,events:undefined,remaining:undefined}))}));
