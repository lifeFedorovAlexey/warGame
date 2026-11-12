import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from './check-start-latency-coordinator.mjs';
import {firingSlots} from '../campaign/firing-positions.js';
import {advanceFiringFrontage} from '../campaign/combat-frontage.js';
import {vehicleClearance,jamPassThroughAllowed} from '../campaign/vehicle-collision.js';

const results=[];
const drain=iterator=>{let step;do{step=iterator.next();}while(!step.done);return step.value;};
const d=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function setup(owner='rai',reverse=false){
  const m=fixture();m.visible.fill(255);m.explored.fill(255);
  const target=m.addStructure('generator',owner==='rai'?'scavs':'rai',{x:0,y:200},{hp:100000,maxHp:100000,completed:true,progress:1});
  const slots=firingSlots(m.config.units.bukhanka,m.config.worldScale,-Math.PI/2,target),rear=slots[0],front=slots[22];
  const makeA=()=>m.addUnit('bukhanka',owner,rear,{heading:0,combatGroup:'fill'});
  const makeB=()=>m.addUnit('bukhanka',owner,{x:rear.x,y:rear.y-100},{heading:0,combatGroup:'fill'});
  const [a,b]=reverse?(()=>{const b=makeB();return [makeA(),b];})():[makeA(),makeB()];
  const assign=(u,index,status)=>{
    const point=slots[index];u.task={type:'combat-position',...point};
    u.combatDeployment={targetId:target.id,group:'fill',angle:-Math.PI/2,index,slot:{...point},goal:{...point},
      anchor:{x:target.x,y:target.y},resume:{type:'attack',targetId:target.id},status};
  };
  assign(a,0,'arrived');assign(b,22,'moving');b.path=[{x:b.x,y:b.y+30},{...front}];
  m.rebuildNavigation();m.unitIndex.rebuild(m.state.units);
  return {m,a,b,target,rear,front,slots,assign};
}
function fill({m,a,target}){return drain(advanceFiringFrontage(m,a,a.combatDeployment,target));}
for(const owner of ['rai','scavs'])for(const reverse of [false,true]){
  const c=setup(owner,reverse),{m,a,b,target,rear,front}=c,prefix=b.path[0];
  a.driveSpeed=reverse?0:18;b.driveSpeed=reverse?29:0;
  const poses=JSON.stringify([a,b].map(u=>[u.x,u.y,u.heading,u.hp,u.driveSpeed]));
  m.trafficCoordinator.requestFiringApproach(m,b,b.combatDeployment,target);
  const oldJob=m.trafficCoordinator.routes.get(b.id);oldJob.finished=true;oldJob.path=[front];
  assert(fill(c));assert(d(a.combatDeployment.goal,front)<.01,'First arrival takes the free front position');
  assert(d(b.combatDeployment.goal,rear)<.01,'Distant nominal owner gets the vacated rear position');
  assert.equal(b.path[0],prefix,'Accepted route prefix is retained');
  assert.equal(JSON.stringify([a,b].map(u=>[u.x,u.y,u.heading,u.hp,u.driveSpeed])),poses,'Changing destinations never changes physical state');
  assert(!m.trafficCoordinator.routes.has(b.id),'Old queued firing result cannot restore the former destination');
  m.trafficCoordinator.publishPlanning(m,Infinity);
  assert(d(b.path.at(-1),rear)<.01);
  assert.equal(fill(c),false,'A committed approach is stable while the car is travelling');
  assert(!jamPassThroughAllowed(a,b),'Filling positions cannot enable a shortcut through the other car');
  results.push({name:`arrival order over nominal ownership, ${owner}, reversed IDs ${reverse}`,passed:true});
}
for(const mode of ['arrived','near','retreat','pending','direct move','other group','damaged']){
  const c=setup(),{m,a,b,front}=c;
  if(mode==='arrived'){b.x=front.x;b.y=front.y;b.path=[];b.combatDeployment.status='arrived';}
  if(mode==='near'){b.x=front.x;b.y=front.y-20;}
  if(mode==='retreat')b.combatRetreat={status:'moving'};
  if(mode==='pending')b.pendingOrder={revision:42};
  if(mode==='direct move')b.task={type:'move',x:300,y:300};
  if(mode==='other group')b.combatDeployment.group='other';
  if(mode==='damaged'){m.setCombatPolicy([b.id],{retreat:'light'});b.hp=b.maxHp*.7;}
  m.unitIndex.rebuild(m.state.units);
  const before=JSON.stringify({task:b.task,path:b.path,deployment:b.combatDeployment});fill(c);
  assert.equal(JSON.stringify({task:b.task,path:b.path,deployment:b.combatDeployment}),before,mode+' must keep its own order');
  if(mode==='arrived'||mode==='near')assert(d(a.combatDeployment.goal,front)>1,'Physical or near-final occupancy locks the front position');
  results.push({name:'protect '+mode,passed:true});
}
{
  const c=setup(),{a,b}=c;
  b.trafficPassThrough={revision:b.commandRevision,pairs:[{id:a.id}]};
  assert(!fill(c),'A car lending passage cannot be reassigned during the crossing');
  delete b.trafficPassThrough;assert(fill(c),'Filling resumes when the crossing is finished');
  results.push({name:'finish borrowed passage before changing positions',passed:true});
}
{
  const c=setup(),{m,b,front,a}=c;m.stop([b.id]);assert(fill(c));assert(d(a.combatDeployment.goal,front)<.01);
  results.push({name:'fill unclaimed vacancy',passed:true});
}
for(const cancel of ['stop','move','retreat','target moved','new front arrival']){
  const c=setup(),{m,a,b,target,front}=c,iterator=advanceFiringFrontage(m,a,a.combatDeployment,target);
  assert(!iterator.next().done);
  if(cancel==='stop')m.stop([a.id]);
  if(cancel==='move')assert(m.order([a.id],'move',{x:-150,y:0}).ok);
  if(cancel==='retreat')a.combatRetreat={status:'moving'};
  if(cancel==='target moved')target.x+=15;
  if(cancel==='new front arrival'){b.x=front.x;b.y=front.y;b.path=[];b.combatDeployment.status='arrived';m.unitIndex.rebuild(m.state.units);}
  const aState=JSON.stringify({task:a.task,path:a.path,deployment:a.combatDeployment}),bState=JSON.stringify(b.combatDeployment);
  drain(iterator);
  assert.equal(JSON.stringify(b.combatDeployment),bState,'Cancelled proposal cannot change another car');
  if(cancel!=='new front arrival')assert.equal(JSON.stringify({task:a.task,path:a.path,deployment:a.combatDeployment}),aState);
  else assert(d(a.combatDeployment.goal,front)>1);
  results.push({name:'interrupted by '+cancel,passed:true});
}
{
  const c=setup(),{m,a,b,target,slots}=c;
  m.stop([b.id]);
  const blockers=[22,23,24].map(index=>m.addUnit('bukhanka','rai',slots[index],{heading:0}));
  m.unitIndex.rebuild(m.state.units);
  let checks=0;const clear=m.vehicleMotionClear.bind(m);m.vehicleMotionClear=(...args)=>{checks++;return clear(...args);};
  assert(!fill(c));const first=checks;assert(first>0);
  for(let i=0;i<20;i++)assert(!fill(c));assert.equal(checks,first,'Unchanged occupied frontage must reuse failure evidence');
  b.x+=1;m.unitIndex.rebuild(m.state.units);fill(c);
  // An unrelated unit beyond the local search cannot invalidate the proof.
  const far=m.addUnit('bukhanka','rai',{x:1000,y:1000});m.unitIndex.rebuild(m.state.units);fill(c);const stable=checks;
  far.x+=10;m.unitIndex.rebuild(m.state.units);fill(c);assert.equal(checks,stable);
  blockers[0].x=-300;m.unitIndex.rebuild(m.state.units);assert(fill(c),'A real vacancy retries immediately');
  results.push({name:'cache occupied positions until relevant change',passed:true,checksBeforeVacancy:stable});
}
{
  const c=setup(),{m,a,b,front,rear}=c,initial=[a,b].map(u=>u.hp);
  // Keep the normal Mission/physics/weapon pipeline running.
  m.addUnit('builder','rai',{x:-500,y:-500});
  let gap=Infinity,frontArrival=null,rearArrival=null,shots=new Set();
  for(let tick=0;tick<300;tick++){
    m.advance(.1);m.finishPendingStep();
    gap=Math.min(gap,vehicleClearance(a,b,m.config.worldScale,m.field));
    for(const event of m.effects)if(event.type==='shot')shots.add(event.from);m.effects=[];
    if(frontArrival===null&&d(a,front)<8)frontArrival=m.state.time;
    if(rearArrival===null&&d(b,rear)<8)rearArrival=m.state.time;
  }
  const details={name:'physical staggered arrival',gap,frontArrival,rearArrival,shots:[...shots],positions:[a,b].map(u=>({x:u.x,y:u.y,status:u.combatDeployment?.status,goal:u.combatDeployment?.goal}))};
  console.log(JSON.stringify(details));
  assert(frontArrival!==null&&rearArrival!==null,'Both cars must actually reach their exchanged positions');
  assert(gap>=0);assert.deepEqual([a,b].map(u=>u.hp),initial);assert(shots.has(a.id)&&shots.has(b.id));
  results.push({...details,passed:true});
}
fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/combat-frontage.json',JSON.stringify({results},null,2));
console.log(JSON.stringify({passed:results.length,results}));
