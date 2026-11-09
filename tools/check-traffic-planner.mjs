import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from './check-start-latency-coordinator.mjs';
import {vehicleClearance} from '../campaign/vehicle-collision.js';
import {auditNavigationWaits} from '../campaign/navigation-state.js';
import {TrafficPlanner} from '../campaign/traffic-planner.js';

const pose=u=>({x:u.x,y:u.y,heading:u.heading});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function scene(){
 const m=fixture(),a=m.addUnit('bukhanka','rai',{x:-30,y:0},{heading:-Math.PI/2}),
  b=m.addUnit('bukhanka','rai',{x:30,y:0},{heading:Math.PI/2}),remote=m.addUnit('bukhanka','rai',{x:1000,y:0},{heading:0});
 m.submitOrder([a.id],'move',{x:180,y:0});m.submitOrder([b.id],'move',{x:-180,y:0});m.submitOrder([remote.id],'move',{x:1000,y:700});
 const planner=m.trafficCoordinator.planner=new TrafficPlanner();
 for(let i=0;i<100&&!planner.queued.size&&!planner.active;i++)m.advance(.1);
 assert(planner.queued.size||planner.active,'Actual public orders must produce the physical dependency cycle');
 planner.advance(m,0);assert(planner.active,'The real recovery search must be suspended');
 return {m,a,b,remote,planner};
}
function ready(t){
 for(let i=0;i<20000&&(t.planner.queued.size||t.planner.active);i++)t.planner.advance(t.m,2);
 assert(t.planner.ready.some(j=>j.patch.length),'The production search must produce a movement proposal');
}
const results=[];
{
 const t=scene();t.m.beginTick(.1);ready(t);
 t.planner.publish(t.m);assert.equal(t.planner.stats.applied,0);assert(t.planner.ready.length,'A ready result waits outside the live controller');
 t.m.continueTick();t.planner.publish(t.m);assert.equal(t.planner.stats.applied,1);
 results.push({case:'publication waits for the completed physics tick',passed:true});
}
{
 const t=scene(),{m,a,b,remote,planner}=t,start=pose(remote),time=m.state.time,origin=pose(a),advance=planner.advance;
 // Withhold only background work, never physics, routes or collision checks.
 planner.advance=()=>{};let maxTickMs=0;
 for(let i=0;i<20;i++){const started=performance.now();m.tick(.1);maxTickMs=Math.max(maxTickMs,performance.now()-started);}
 planner.advance=advance;
 assert(planner.active,'The planner is still genuinely unfinished');
 assert(m.state.time>=time+1.999&&distance(start,remote)>20,'An unfinished recovery cannot freeze the rest of the world');
 assert(maxTickMs<50,'Physics must not drain the suspended recovery');
 assert.deepEqual(pose(a),origin,'The blocked source stays at its actual pose');
 const goals=[a,b].map(u=>structuredClone(u.routeOrder.destination));let gap=Infinity;
 for(let i=0;i<400&&[a,b].some(u=>u.task||u.jointTraffic);i++){
  m.advance(.1);gap=Math.min(gap,vehicleClearance(a,b,m.config.worldScale,m.field));
 }
 assert(planner.stats.applied>0,'Movement outside the inspected region must not cancel the useful proposal');
 [a,b].forEach((u,i)=>{assert.equal(u.hp,u.maxHp);assert(!u.task&&!u.jointTraffic&&distance(u,goals[i])<1);});
 assert(gap>0);results.push({case:'world advances during a suspended cycle search, then both public orders finish',maxTickMs,minGap:gap,stats:planner.stats});
}
for(const change of ['move','stop','construction','new obstacle']){
 const t=scene(),{m,a,planner}=t;ready(t);const before=pose(a);
 let revision;
 if(change==='move')revision=m.submitOrder([a.id],'move',{x:50,y:300}).revision;
 if(change==='stop')m.stop([a.id]);
 if(change==='construction'){m.addStructure('generator','rai',{x:300,y:300});m.rebuildNavigation();}
 if(change==='new obstacle'){
  const plan=planner.ready.flatMap(j=>j.patch).find(p=>p.fields.detour?.joint).fields.detour;
  const point=plan.reservedCorridor[0].to;
  m.addUnit('bukhanka','rai',point,{heading:point.heading});
 }
 planner.publish(m);
 assert.equal(planner.stats.applied,0,'An obsolete proposal must not publish after '+change);
 assert(planner.stats.discarded>0);assert.deepEqual(pose(a),before);
 assert(!a.jointTraffic);
 if(revision)assert.equal(a.pendingOrder.revision,revision);
 results.push({case:'ready proposal rejected after '+change,passed:true});
}
{
 const t=scene(),{m,a,planner}=t;ready(t);const before=pose(a);
 a.hp-=1;const hp=a.hp;
 planner.publish(m);
 assert.equal(planner.stats.applied,1,'A hit without a mobility or eligibility change must not restart a proved passage');
 assert.equal(a.hp,hp,'Publishing navigation must preserve new damage');
 assert.deepEqual(pose(a),before,'Publication must not move or restore the body');
 results.push({case:'nonfatal hit preserves passage and current health',passed:true});
}
{
 const t=scene(),saved=t.m.save(),m=fixture();m.load(saved);m.state.bounds=t.m.state.bounds.slice();m.rebuildNavigation();
 m.trafficCoordinator.planner=new TrafficPlanner();
 const units=[t.a,t.b].map(u=>m.entity(u.id)),goals=units.map(u=>structuredClone(u.routeOrder.destination));
 for(let i=0;i<500&&units.some(u=>u.task||u.jointTraffic);i++)m.advance(.1);
 assert(m.trafficCoordinator.planner.stats.applied>0,'Loading reconstructs the unfinished cycle work from physical dependencies');
 units.forEach((u,i)=>assert(!u.task&&!u.jointTraffic&&distance(u,goals[i])<1&&u.hp===u.maxHp));
 results.push({case:'save/load reconstructs background work without serializing a generator',passed:true});
}
{
 const capture=JSON.parse(fs.readFileSync('tools/fixtures/navigation-cycle-search-witness.json')),m=fixture();
 m.load(capture.saved);m.state.bounds=[0,0,127,127];m.rebuildNavigation();m.trafficCoordinator.planner=new TrafficPlanner();auditNavigationWaits(m);m.trafficCoordinator.update(m);
 const planner=m.trafficCoordinator.planner;
 for(let i=0;i<20000&&(planner.queued.size||planner.active);i++)planner.advance(m,2);
 planner.publish(m);assert(planner.failures.size,'The unchanged real capture must record its failed searches');
 const failed=[...planner.failures.values()][0],unrelated=m.state.units.find(u=>!failed.ids.includes(u.id)&&!failed.blockers.has(u.id)
  &&[...planner.failures.values()].every(j=>!j.ids.includes(u.id)&&!j.blockers.has(u.id)));
 assert(unrelated,'The fixture includes an unrelated body');unrelated.x+=.001;
 planner.requestCycles(m);assert.equal(planner.queued.size,0,'Unrelated movement must not repeat failed background searches');
 const witness=m.entity([...failed.blockers].find(id=>!failed.ids.includes(id)&&m.entity(id)))??m.entity(failed.ids[0]);
 witness.x+=.001;planner.requestCycles(m);assert(planner.queued.size,'A changed rejecting body must permit another search');
 results.push({case:'failed background searches retry only after their actual witnesses change',passed:true,initialSearches:planner.stats.started});
}
console.log(JSON.stringify({passed:results.length,results},null,2));
