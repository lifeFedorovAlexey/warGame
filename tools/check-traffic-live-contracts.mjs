// Cache/queue contracts using the owner's captured unit states. This does
// NOT start a game, tick physics, issue orders or claim gameplay progress.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {SEARCH_OUTCOME,trafficRequestKey,reserveIntersects,projectedTrafficView,localTrafficContext} from '../campaign/traffic-context.js';
import {maneuverAdmissionBlocker} from '../campaign/maneuver-admission.js';
import {vehicleRadiusBound,clearOfVehicles} from '../campaign/vehicle-collision.js';
import {UnitSpatialIndex} from '../campaign/unit-spatial-index.js';
const directory='campaign/reports/traffic-recovery-2026-11-09';
const fixture=JSON.parse(fs.readFileSync(directory+'/live-contract-fixture.json','utf8'));
const before=process.argv.includes('--before'),results=[];
async function sourceModule(file,extra=''){
 const source=fs.readFileSync((before?directory+'/before/':'campaign/')+file,'utf8')
  .replace(/from '(\.\/[^']+)'/g,(_,name)=>'from '+JSON.stringify(pathToFileURL(path.resolve('campaign',name)).href));
 return import('data:text/javascript;base64,'+Buffer.from(source+'\n'+extra).toString('base64'));
}
const plannerModule=await sourceModule('traffic-planner.js','export {witness as testWitness};'+(before?'export {reserveIntersects as oldReserveIntersects};':''));
const passageModule=await sourceModule('traffic-passage.js');
const normalize=u=>({...structuredClone(u),driveSpeed:u.speed??0,commandRevision:u.revision,pendingOrder:u.pending,
 combatRetreat:u.retreat,routeOrder:u.goal?{destination:structuredClone(u.goal)}:undefined,
 navigation:{...u.navigation,blockerIds:u.navigation?.blockers,blockerId:u.navigation?.blockers?.[0],waitSeconds:u.navigation?.wait},path:structuredClone(u.path??[])});
function capture(){
 const event=fixture.cycles[0].event,units=event.units.map(normalize);
 const later=fixture.cycles[1].event.units.find(u=>u.id==='u463');if(!units.some(u=>u.id===later.id))units.push(normalize(later));
 const index=new UnitSpatialIndex();index.rebuild(units);
 const m={state:{units,time:event.sim,commandRevision:15},nav:{topologyRevision:1},config:{worldScale:4.5,simulationStep:.1,units:{bukhanka:{}}},
  field:null,unitIndex:index,unitIndexActive:true,entity(id){return this.state.units.find(u=>u.id===id);},
  trafficCoordinator:{decisions:new Map(event.decisions),passageDecisions:new Map(event.passageDecisions),inputRevision:0},
  navigationDiagnostics:{recoveryCycles:structuredClone(event.cycles),dependencies:new Map(event.dependencies)},
  nearbyUnits(point,radius){return this.state.units.filter(u=>Math.abs(u.x-point.x)<=radius&&Math.abs(u.y-point.y)<=radius);},
  vehicleMotionNeighbours(){return this.state.units;},
  vehicleMotionClear(actor,from,to,grade,blockers,obstacles=this.state.units){return clearOfVehicles(actor,to,obstacles,4.5,false,from,null,blockers);},
  *parkingManeuverSteps(){m.parkingCalls=(m.parkingCalls??0)+1;return null;}};
 return {m,a:m.entity('u2'),b:m.entity('u3'),c:m.entity('u463')};
}
function run(name,fn){const start=performance.now();try{fn();results.push({name,passed:true,ms:performance.now()-start});}
 catch(error){results.push({name,passed:false,message:error.message,ms:performance.now()-start});}}
function drain(iterator){let step;do{step=iterator.next();}while(!step.done);return step.value;}
function failedCycle(m,ids){
 const ownerId=[...ids].sort()[0],job={ownerId,type:'cycle',ids,requestKey:trafficRequestKey(m,'cycle',ids),world:m.state,
  topology:m.nav.topologyRevision,memberRevisions:ids.map(id=>m.entity(id).commandRevision),retryAt:m.state.time+2,
  region:{left:-1300,right:-1000,bottom:250,top:500},blockers:new Set(),patch:[],outcome:SEARCH_OUTCOME.LOCAL_SEARCH_EXHAUSTED};
 job.witness=plannerModule.testWitness(m,job);return job;
}
for(const change of ['membership','edges'])run('failed cycle revisits changed '+change,()=>{
 const {m,a,b,c}=capture(),planner=new plannerModule.TrafficPlanner(),ids=[a.id,b.id];
 planner.failures.set(before?a.id:trafficRequestKey(m,'cycle',ids),failedCycle(m,ids));
 if(change==='membership')m.navigationDiagnostics.recoveryCycles=[[a.id,c.id]];
 m.navigationDiagnostics.dependencies=new Map([[a.id,[c.id]],[b.id,[a.id]],[c.id,[a.id]]]);
 planner.requestCycles(m);assert(planner.queued.has(a.id),'Old failure suppressed a different wait graph');
});
for(const change of ['loan','admission','corridor-contents'])run('negative passage cache revisits '+change,()=>{
 const {m,a,b}=capture();
 if(change==='corridor-contents')a.traffic={passageCorridor:[{from:{...a},to:{...b}}]};
 drain(passageModule.planMovingPassage(m,a,b));const calls=m.parkingCalls;
 drain(passageModule.planMovingPassage(m,a,b));assert.equal(m.parkingCalls,calls,'Unchanged failure should be reused');
 if(change==='loan')b.yieldReturn={home:{x:b.x,y:b.y},phase:'waiting',legs:[],requesters:[a.id]};
 if(change==='admission')m.trafficCoordinator.passageDecisions.set(a.id,{key:'captured-gate',admitted:true});
 if(change==='corridor-contents')a.traffic.passageCorridor[0].to.x+=1;
 drain(passageModule.planMovingPassage(m,a,b));assert(m.parkingCalls>calls,'Changed conditions incorrectly reused a negative result');
});
run('unrelated moving unit does not invalidate suspended search',()=>{
 const {m,a,b,c}=capture();m.parkingManeuverSteps=function*(){m.parkingCalls=(m.parkingCalls??0)+1;yield;return null;};
 const iterator=passageModule.planMovingPassage(m,a,b);assert.equal(iterator.next().done,false);
 c.x+=1;m.state.commandRevision++;drain(iterator);
 const calls=m.parkingCalls;drain(passageModule.planMovingPassage(m,a,b));
 assert.equal(m.parkingCalls,calls,'Distant motion/command discarded a reusable local search');
});
for(const widthOnly of [false,true])run('corridor intersects region '+(widthOnly?'by width':'with both ends outside'),()=>{
 const {m,a}=capture(),box={left:a.x-1,right:a.x+1,bottom:a.y-1,top:a.y+1};
 const y=a.y+(widthOnly?2:0),owner={...a,detour:{reservedCorridor:[{from:{...a,x:a.x-50,y,heading:-Math.PI/2},to:{...a,x:a.x+50,y,heading:-Math.PI/2}}]}};
 assert(before?plannerModule.oldReserveIntersects(owner,box):reserveIntersects(m,owner,box),'Swept corridor was missed');
});
run('zero budget has no snapshot or search',()=>{
 const {m,a,b}=capture(),planner=new plannerModule.TrafficPlanner();let snapshots=0;
 planner.queued.set(a.id,{ids:[a.id,b.id]});planner.snapshot=()=>{snapshots++;throw Error('Unexpected snapshot');};
 planner.advance(m,0);assert.equal(snapshots,0);assert.equal(planner.stats.started,0);assert.equal(planner.queued.size,1);
});
run('two evacuating blockers can enter passage recovery',()=>{
 const {m}=capture(),jam=JSON.parse(fs.readFileSync(directory+'/live-jam-before.json','utf8'));
 const row=jam.rows.findLast(r=>r.event.type==='incident').event;
 m.state.units=row.units.map(normalize);m.unitIndex.rebuild(m.state.units);
 const leader=m.state.units.find(u=>u.combatRetreat&&u.path.length&&u.navigation.blockerIds?.some(id=>m.entity(id)?.combatRetreat&&m.entity(id)?.path.length));
 assert(leader,'The recorded jam must contain a retreat-to-retreat dependency');
 const follower=m.entity(leader.navigation.blockerIds.find(id=>m.entity(id)?.combatRetreat&&m.entity(id)?.path.length));
 const orders=JSON.stringify([leader.task,leader.routeOrder,leader.combatRetreat,follower.task,follower.routeOrder,follower.combatRetreat]);
 drain(passageModule.planMovingPassage(m,leader,follower));
 assert(m.parkingCalls>0,'Evacuation flag vetoed even the first parking candidate');
 assert.equal(JSON.stringify([leader.task,leader.routeOrder,leader.combatRetreat,follower.task,follower.routeOrder,follower.combatRetreat]),orders);
});
if(!before){
 run('alternating A-B and A-C retains both unchanged failures',()=>{
  const {m,a,b,c}=capture(),planner=new plannerModule.TrafficPlanner();
  for(const ids of [[a.id,b.id],[a.id,c.id]]){const failure=failedCycle(m,ids);planner.failures.set(failure.requestKey,failure);}
  for(let i=0;i<3;i++)for(const ids of [[a.id,b.id],[a.id,c.id]])assert(planner.negativeHit(m,'cycle',ids));
  assert.equal(planner.failures.size,2);
 });
 run('passage and cycle failures do not erase each other',()=>{
  const {m,a,b}=capture(),ids=[a.id,b.id],planner=new plannerModule.TrafficPlanner();
  const cycle=failedCycle(m,ids),passage={...failedCycle(m,ids),type:'passage',requestKey:trafficRequestKey(m,'passage',ids)};
  planner.failures.set(cycle.requestKey,cycle);planner.failures.set(passage.requestKey,passage);
  for(let i=0;i<3;i++){
   assert(planner.negativeHit(m,'cycle',ids));assert(planner.negativeHit(m,'passage',ids));
   assert.equal(planner.failures.size,2);
  }
  m.state.time=cycle.retryAt;assert(!planner.negativeHit(m,'cycle',ids));assert(!planner.negativeHit(m,'passage',ids));
 });
 run('typed bounded failure and controlled retry',()=>{
  const {m,a,b}=capture(),diagnostics={};drain(passageModule.planMovingPassage(m,a,b,{diagnostics}));
  assert.equal(diagnostics.outcome,SEARCH_OUTCOME.LOCAL_SEARCH_EXHAUSTED);assert(diagnostics.retryAt>m.state.time);
  m.state.time=diagnostics.retryAt;const calls=m.parkingCalls;drain(passageModule.planMovingPassage(m,a,b));assert(m.parkingCalls>calls);
 });
 run('local dependencies detect entrants and stationary reservation change',()=>{
  const {m,a,b,c}=capture(),context=localTrafficContext(m,[a,b]);assert(context.valid());
  c.x+=1;assert(context.valid());m.trafficCoordinator.decisions.set(a.id,{yieldTo:b.id,limit:0});assert(!context.valid());
  m.trafficCoordinator.decisions.delete(a.id);assert(context.valid());c.x=a.x;c.y=a.y;assert(!context.valid());
 });
 run('projected bodies retained for collision and braking admission',()=>{
  const {m,a,b}=capture();b.driveSpeed=30;m.unitIndex.includeMotion(b);
  assert.equal(maneuverAdmissionBlocker(m,a,a,a,.1)?.id,b.id,'Captured facing pair should intersect the tested braking corridor');
  const parked={...b,x:b.x+200,y:b.y+200,driveSpeed:0},view=projectedTrafficView(m,new Map([[b,parked]]));
  assert.equal(maneuverAdmissionBlocker(view,a,a,a,.1),null,'Old braking path leaked into projected phase');
  assert.equal(view.vehicleMotionClear(a,parked,parked,.52,new Set(),view.vehicleMotionNeighbours(a,parked,parked)),false,'Projected participant was removed from collisions');
 });
 run('round robin services each ready search before resuming first',()=>{
  const {m,a,b,c}=capture(),planner=new plannerModule.TrafficPlanner(),order=[];
  // Only the generator workload is controlled; production scheduling runs.
  planner.snapshot=function(m,job){job.shadow={nav:{}};job.blockers=new Set();job.diagnostics={};job.iterator={next(){order.push(job.ownerId);
   const end=performance.now()+2.2;while(performance.now()<end){}return {done:false};},return(){return {done:true};}};};
  planner.enqueue(m,'passage',[a.id,b.id],'contract');planner.enqueue(m,'passage',[c.id],'contract');
  planner.advance(m,2);planner.advance(m,2);planner.advance(m,2);
  assert.deepEqual(order.slice(0,3),[a.id,c.id,a.id]);assert(planner.stats.maxNextMs>=2);
  assert(planner.activeFor(a));assert(planner.jobs(m).every(job=>Number.isFinite(job.queueWaitMs)));
 });
}
const report={mode:before?'before':'after',source:fixture.source,sourceSim:fixture.cycles[0].event.sim,
 scope:'Contract checks on captured states; no simulation ticks, no commands, no gameplay progress assertion',results};
fs.writeFileSync(directory+'/contracts-'+report.mode+'.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(!before)assert(results.every(r=>r.passed),'Traffic contracts failed');
