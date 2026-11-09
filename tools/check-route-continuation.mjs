import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture,config} from './check-start-latency-coordinator.mjs';
import {Mission} from '../campaign/mission.js';
import {CommandPlanner} from '../campaign/command-planner.js';
import {applyRouteContinuations} from '../campaign/route-continuation.js';
import {createHeightfield} from '../demo/map-route.js';
import {shapeMesaRims} from '../demo/mesa-shaping.js';
import {refineRoadHeightfield} from '../demo/road-heightfield.js';
import {applyRoadGrades} from '../demo/road-grading.js';

const results=[],distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),pose=u=>({x:u.x,y:u.y,heading:u.heading,speed:u.driveSpeed??0,hp:u.hp});
const tick=m=>{m.commandPlanner.advance(2);m.tick(.1);};
function until(m,predicate,label,limit=2000){for(let i=0;i<limit&&!predicate();i++)tick(m);assert(predicate(),label);}
function setup(m=fixture(),points=[{x:-48,y:0},{x:48,y:0}],goal={x:0,y:600}){
 const units=points.map(p=>m.addUnit('bukhanka','rai',p,{heading:0})),ids=units.map(u=>u.id);
 m.commandPlanner=new CommandPlanner(m,{prefixThreshold:2});
 const order=m.orderSteps;let hold=true;
 // Stall only asynchronous tail work at a real generator boundary. No paths,
 // vehicle poses, physics, collision checks or accepted goals are injected.
 m.orderSteps=function*(...args){while(hold)yield;return yield* order.apply(this,args);};
 const result=m.submitOrder(ids,'move',goal);assert(result.ok);
 return {m,units,ids,goal,revision:result.revision,release:()=>{hold=false;}};
}
{
 const t=setup(),{m,units,goal}=t;
 until(m,()=>units.every(u=>u.routeContinuation?.phase==='following'),'Both verified prefixes commit before tail work');
 for(let i=0;i<8;i++)tick(m);
 for(const u of units){
  assert(u.y>1,'Real simulation moves before parking slots exist');
  assert(!u.routeOrder,'A temporary frontier must not masquerade as an accepted destination');
  assert.deepEqual({x:u.task.x,y:u.task.y},goal);assert.equal(u.commandRevision,t.revision);
  assert.notEqual(u.navigation.state,'ARRIVED');
 }
 const repeated=m.submitOrder(t.ids,'move',goal);assert(repeated.reused,'Repeated click reuses the in-flight prefix and tail job');
 t.release();
 for(let i=0;i<3000&&!units.every(u=>u.routeContinuation?.ready);i++)m.commandPlanner.advance(2);
 assert(units.every(u=>u.routeContinuation?.ready),'Actual orderSteps creates full tails');
 const before=units.map(pose),accepted=units.map(u=>({...u.routeContinuation.destination}));
 applyRouteContinuations(m);
 assert.deepEqual(units.map(pose),before,'Tail commit changes no pose, health or speed');
 assert(units.every(u=>!u.routeContinuation&&u.routeOrder));
 assert.deepEqual(units.map(u=>u.routeOrder.destination),accepted);
 for(const u of units)assert.deepEqual(u.routeOrder.request,goal);
 until(m,()=>units.every(u=>!u.task&&!u.path.length),'Vehicles finish at their immutable parking destinations');
 units.forEach((u,i)=>assert(distance(u,accepted[i])<2));
 results.push({case:'real early motion and pose/speed-preserving tail commit',passed:true});
}
{
 const t=setup(),{m,units}=t;
 until(m,()=>units.every(u=>u.routeContinuation?.phase==='following'),'Prefixes started');
 until(m,()=>units.every(u=>!u.path.length),'A deliberately suspended tail eventually exhausts its prefix');
 for(let i=0;i<5;i++)tick(m);
 assert(units.every(u=>u.task&&u.navigation.state==='GLOBAL_REPLAN'&&u.navigation.reason==='route-continuation-pending'));
 assert(units.every(u=>!u.routeOrder),'Frontier arrival is not destination arrival');
 m.stop(t.ids);t.release();for(let i=0;i<8;i++)tick(m);
 assert(units.every(u=>!u.routeContinuation&&!u.pendingOrder&&!u.task&&!u.path.length),'Stop cancels both stages');
 results.push({case:'frontier exhaustion is explicit pending work, Stop cancels it',passed:true});
}
{
 const t=setup(),{m,units}=t;
 until(m,()=>units.every(u=>u.routeContinuation?.phase==='following'),'Prefixes started');
 const old=t.revision,next=m.submitOrder([units[0].id],'move',{x:-300,y:300});t.release();
 assert(next.revision>old);assert(!units[0].routeContinuation);
 until(m,()=>units.every(u=>u.routeOrder&&!u.routeContinuation&&!u.pendingOrder),'Newest subset preempts without losing remaining old members');
 assert.equal(units[0].commandRevision,next.revision);assert.deepEqual(units[0].routeOrder.request,{x:-300,y:300});
 assert.equal(units[1].commandRevision,old);assert.deepEqual(units[1].routeOrder.request,t.goal);
 results.push({case:'new click preempts one member, older live members retain ownership',passed:true});
}
{
 const t=setup(),{m,units}=t;
 until(m,()=>units.every(u=>u.routeContinuation?.phase==='following'),'Prefixes started');
 const saved=m.save(),restored=fixture();restored.load(saved);restored.updateMission=()=>{};
 restored.state.bounds=JSON.parse(saved).state.bounds.slice();restored.rebuildNavigation();
 const live=t.ids.map(id=>restored.entity(id)),before=live.map(pose);
 assert(live.every(u=>u.routeContinuation&&!u.pendingOrder));
 for(let i=0;i<2000&&live.some(u=>!u.routeOrder);i++)restored.advance(.0125,{budgetMs:8});
 assert(live.every(u=>u.routeOrder&&!u.routeContinuation));assert(live.some((u,i)=>distance(u,before[i])>.01));
 assert(live.every(u=>u.routeOrder.request.y===600));
 results.push({case:'save/load reconstructs unfinished moving tails without generator serialization',passed:true});
}
{
 const t=setup(),{m,units}=t;
 until(m,()=>units.every(u=>u.routeContinuation?.phase==='following'),'Prefixes started');
 t.release();for(let i=0;i<3000&&!units.every(u=>u.routeContinuation?.ready);i++)m.commandPlanner.advance(2);
 assert(units.every(u=>u.routeContinuation?.ready));
 m.damage(units[0],units[0].hp+1,null);applyRouteContinuations(m);
 assert(!units[0].routeContinuation&&!units[0].path.length&&!units[0].task,'Dead members cannot receive staged routes');
 assert(units[1].routeOrder,'A dead peer does not cancel the surviving member');
 results.push({case:'death invalidates staged prefix/tail ownership',passed:true});
}
{
 const t=setup(),{m,units}=t;
 until(m,()=>units.every(u=>u.routeContinuation?.phase==='following'),'Prefixes started');
 t.release();for(let i=0;i<3000&&!units.every(u=>u.routeContinuation?.ready);i++)m.commandPlanner.advance(2);
 const accepted=units.map(u=>({...u.routeContinuation.destination}));
 // A real footprint change invalidates the asynchronous static snapshot.
 m.addStructure('generator','rai',{x:800,y:800},{completed:true});m.rebuildNavigation();
 applyRouteContinuations(m);
 assert(units.every(u=>!u.routeContinuation.ready&&u.routeContinuation.destination),'Invalidation retains accepted destinations');
 until(m,()=>units.every(u=>u.routeOrder&&!u.routeContinuation),'Invalidated tails are reconstructed');
 assert.deepEqual(units.map(u=>u.routeOrder.destination),accepted,'A retry must never select different parking slots');
 results.push({case:'topology invalidation retries tails without changing assigned destinations',passed:true});
}
{
 const t=setup(),{m,units}=t;
 until(m,()=>units.every(u=>u.routeContinuation?.phase==='following'),'Prefixes started');
 t.release();for(let i=0;i<3000&&!units.every(u=>u.routeContinuation?.ready);i++)m.commandPlanner.advance(2);
 const accepted=units.map(u=>({...u.routeContinuation.destination})),saved=m.save(),restored=fixture();
 restored.load(saved);restored.updateMission=()=>{};restored.state.bounds=JSON.parse(saved).state.bounds.slice();restored.rebuildNavigation();
 const live=t.ids.map(id=>restored.entity(id));
 for(let i=0;i<2000&&live.some(u=>!u.routeOrder);i++)restored.advance(.0125,{budgetMs:8});
 assert(live.every(u=>u.routeOrder&&!u.routeContinuation));assert.deepEqual(live.map(u=>u.routeOrder.destination),accepted);
 results.push({case:'save/load of staged tails preserves the exact accepted slots',passed:true});
}
{
 const m=fixture(),cohort=Array.from({length:6},(_,i)=>m.addUnit('bukhanka','rai',
  {x:i<3?-6:6,y:(i%3-1)*26},{heading:Math.PI}));
 const other=[m.addUnit('bukhanka','rai',{x:300,y:0},{heading:0}),m.addUnit('bukhanka','rai',{x:-300,y:0},{heading:0})];
 m.commandPlanner=new CommandPlanner(m,{prefixThreshold:2});m.submitOrder([...cohort,...other].map(u=>u.id),'move',{x:0,y:600});
 let departure=false;
 for(let i=0;i<100;i++){
  tick(m);const pending=cohort.filter(u=>u.pendingOrder).length;
  assert(pending===0||pending===6,'A coupled departure remains atomic inside a prefix-enabled group');
  assert(cohort.every(u=>!u.routeContinuation),'Coupled cohorts retain their checked full departure plan');
  if(cohort.every(u=>u.detour?.departure))departure=true;
 }
 assert(departure);results.push({case:'coupled reverse departure remains atomic alongside independent prefixes',passed:true});
}
if(!process.argv.includes('--flat-only')){
 const read=p=>JSON.parse(fs.readFileSync(p)),raw=createHeightfield(read('assets/maps/alpha/heightfield.json'));shapeMesaRims(raw);
 const field=refineRoadHeightfield(raw);applyRoadGrades(field,read('assets/maps/alpha/roads.json'));
 const m=new Mission(config,field),start=field.gridToWorld(config.startGrid);
 Object.assign(m.state,{units:[],buildings:[],camps:[],pendingCinematics:[],bounds:config.finalMapBounds.slice()});m.updateMission=()=>{};m.rebuildNavigation();m.explored.fill(1);
 const points=[{x:start.x-24,y:start.y},{x:start.x+24,y:start.y}],goal={x:start.x,y:start.y+240};
 const t=setup(m,points,goal);let contacts=0;const collision=m.vehicleCollision;m.vehicleCollision=function(...args){if(args[2]?.size)contacts++;return collision.apply(this,args);};
 until(m,()=>t.units.every(u=>u.routeContinuation?.phase==='following'),'Authored-map prefixes start');
 for(let i=0;i<5;i++)tick(m);assert(t.units.every((u,i)=>distance(u,points[i])>.01));t.release();
 until(m,()=>t.units.every(u=>u.routeOrder&&!u.routeContinuation),'Authored-map tails attach');
 const accepted=t.units.map(u=>({...u.routeOrder.destination}));
 until(m,()=>t.units.every(u=>!u.task&&!u.path.length),'Authored-map arrivals',1000);
 assert.equal(contacts,0);t.units.forEach((u,i)=>assert(distance(u,accepted[i])<2));
 results.push({case:'authored map prefix motion, tail swap, exact final arrivals, zero contacts',passed:true});
}
console.log(JSON.stringify({passed:results.length,results},null,2));
