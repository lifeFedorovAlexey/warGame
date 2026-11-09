import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from './check-start-latency-coordinator.mjs';

const results=[];
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function cars(m,count){return Array.from({length:count},(_,i)=>m.addUnit('bukhanka','rai',
 {x:(i%10-4.5)*32,y:-Math.floor(i/10)*32},{heading:0}));}
function settle(m,max=2000){
 for(let frame=0;frame<max;frame++){
  m.advance(1/80,{budgetMs:6});
  if(!m.state.commandOrders.some(r=>['queued','planning'].includes(r.status)))return frame+1;
 }
 throw Error('Command did not finish within '+max+' frames');
}
{
 const m=fixture(),units=cars(m,20),selected=units.at(-1),start={x:selected.x,y:selected.y,heading:selected.heading,hp:selected.hp};
 m.submitOrder([selected.id],'move',{x:400,y:500});m.beginTick(.1,true);
 m.continueTick(performance.now()-1);const tick=m.pendingTick;
 assert(tick&&!tick.iterator&&tick.cursor>0,'There is an unfinished whole tick at a real unit boundary');
 for(let i=0;i<100&&selected.pendingOrder;i++)m.commandPlanner.advance(2);
 assert(!selected.pendingOrder,'A ready route commits between units without waiting for the whole 20-unit tick');
 assert.equal(m.pendingTick,tick);assert.deepEqual({x:selected.x,y:selected.y,heading:selected.heading,hp:selected.hp},start);
 assert.equal(selected.commandStartAfter,m.state.time,'The new route is held until its neighbours have a fresh coordinator snapshot');
 m.finishPendingStep();assert(selected.path.length||selected.task);
 assert.deepEqual({x:selected.x,y:selected.y,heading:selected.heading,hp:selected.hp},start,'No movement may consume stale coordinator intents');
 m.tick(.1);assert.equal(selected.commandStartAfter,undefined);assert(distance(selected,start)>.01,'The next tick activates the ready route');
 results.push({case:'ready command commits at a unit boundary without overwriting pose/HP',passed:true});
}
{
 const m=fixture(),units=cars(m,2),selected=units[0],update=m.updateUnitSteps;
 m.updateUnitSteps=function*(...args){yield;return yield* update.apply(this,args);};
 m.submitOrder([selected.id],'move',{x:400,y:500});m.beginTick(.1,true);m.continueTick(performance.now()-1);
 assert(m.pendingTick.iterator,'A real unit controller is suspended');
 for(let i=0;i<8;i++)m.commandPlanner.advance(2);
 assert(selected.pendingOrder&&!selected.routeOrder,'No result may replace an active controller\'s route');
 m.finishPendingStep();settle(m);assert(!selected.pendingOrder&&selected.routeOrder.request.x===400);
 results.push({case:'active controller blocks commit until it leaves its safe boundary',passed:true});
}
{
 const m=fixture(),units=Array.from({length:6},(_,i)=>m.addUnit('bukhanka','rai',
  {x:i<3?-6:6,y:(i%3-1)*26},{heading:Math.PI+(i%2?.06:0)}));
 m.submitOrder(units.map(u=>u.id),'move',{x:0,y:500});
 assert.deepEqual(m.state.commandOrders[0].cohorts,[],'Atomic eligibility matches the actual departure controller geometry/alignment');
 results.push({case:'unsupported departure shape has no artificial atomic barrier',passed:true});
}
{
 const m=fixture(),cohort=Array.from({length:6},(_,i)=>m.addUnit('bukhanka','rai',
  {x:i<3?-6:6,y:(i%3-1)*26},{heading:Math.PI}));
 const other=Array.from({length:44},(_,i)=>m.addUnit('bukhanka','rai',{x:400+(i%8)*40,y:-500-Math.floor(i/8)*40},{heading:0}));
 m.submitOrder([...cohort,...other].map(u=>u.id),'move',{x:0,y:500});m.advance(1/80,{budgetMs:0});
 assert.deepEqual(m.state.commandOrders[0].cohorts.map(ids=>ids.length),[6],'A small start component is preserved inside a large command');
 m.damage(cohort[0],20,null);const hp=cohort[0].hp;let departure=false;
 for(let i=0;i<160;i++){
  m.advance(1/80,{budgetMs:6});
  const pending=cohort.filter(u=>u.pendingOrder).length;assert(pending===0||pending===6,'A local component is committed atomically');
  if(cohort.every(u=>u.detour?.departure))departure=true;
 }
 assert(departure,'The actual coupled departure controller sees all six ready vehicles');
 assert.equal(cohort[0].hp,hp,'Committing navigation must not restore old health');
 results.push({case:'atomic six-car component within a 50-car order',passed:true});
}
{
 const m=fixture(),units=cars(m,50),ids=units.map(u=>u.id);let searches=0;
 const compute=m.nav.computePathSteps;m.nav.computePathSteps=function*(...args){searches++;return yield* compute.apply(this,args);};
 const start=performance.now(),response=m.submitOrder(ids,'move',{x:0,y:500}),submitMs=performance.now()-start;
 assert(response.ok&&response.pending===50);assert.equal(searches,0,'submitOrder must not search synchronously');
 let firstMotion=null,pendingAtFirst=null;
 for(let frame=0;frame<160;frame++){
  m.advance(1/80,{budgetMs:6});
  if(firstMotion===null&&units.some((u,i)=>Math.hypot(u.x-(i%10-4.5)*32,u.y+Math.floor(i/10)*32)>.5)){
   firstMotion=(frame+1)/80;pendingAtFirst=units.filter(u=>u.pendingOrder).length;
  }
 }
 assert(firstMotion!==null&&firstMotion<=.5,'A free leading car starts promptly');
 assert(units.every(u=>!u.pendingOrder));
 const before=searches,repeated=m.submitOrder(ids,'move',{x:1,y:500});
 assert(repeated.reused);m.advance(1/80,{budgetMs:6});assert.equal(searches,before);
 results.push({case:'50 incremental starts',submitMs,firstMotion,pendingAtFirst,planner:m.commandPlanner.stats});
}
{
 const m=fixture(),units=cars(m,500);m.submitOrder(units.map(u=>u.id),'move',{x:0,y:700});
 for(let step=0;step<4000&&(m.state.commandOrders[0].assigned.length<250);step++)m.commandPlanner.advance(0);
 assert(m.commandPlanner.active&&m.state.commandOrders[0].assigned.length>=250,'The large job is halfway through its real unit assignments');
 const lookup=m.entity;let calls=0;m.entity=function(id){calls++;return lookup.call(this,id);};
 m.commandPlanner.advance(0);m.entity=lookup;
 assert(calls<10,'Resuming a partial 500-car job must not look up every already assigned ID in the whole world');
 results.push({case:'partial large-job liveness guard avoids repeated whole-world lookups',entityCalls:calls});
}
{
 const m=fixture(),units=cars(m,20),ids=units.map(u=>u.id);
 const first=m.submitOrder(ids,'move',{x:0,y:500});m.stop(ids);
 const second=m.submitOrder(ids,'move',{x:0,y:500});assert.notEqual(second.revision,first.revision);
 m.advance(1/80,{budgetMs:0});const latest=m.submitOrder(ids,'move',{x:300,y:400});settle(m);
 assert(units.every(u=>!u.pendingOrder&&u.commandRevision===latest.revision));
 assert(units.every(u=>u.routeOrder.request.x===300&&u.routeOrder.request.y===400),'An obsolete result cannot overwrite the latest click');
 results.push({case:'Stop/same click and superseding revisions',passed:true});
}
for(const partial of [false,true]){
 const m=fixture(),units=cars(m,partial?2:1),ids=units.map(u=>u.id),goal={x:0,y:500};
 m.submitOrder(ids,'move',goal);settle(m);
 // B is genuinely submitted, then superseded before its budgeted generator
 // can apply. A still-valid A route must complete C's pending intent too.
 m.submitOrder(ids,'move',{x:0,y:-500});
 if(partial){m.order([units[1].id],'move',{x:300,y:300});}
 const final=m.submitOrder(ids,'move',goal);settle(m);
 assert(units.every(u=>!u.pendingOrder&&u.commandRevision===final.revision));
 assert(units.every(u=>distance(u.routeOrder.request,goal)<.01));
 assert.equal(m.state.commandOrders.at(-1).assigned.length,units.length,'Both reused and newly planned members commit the latest intent');
 results.push({case:'A/B/A cancels unfinished B with '+(partial?'mixed reused/new routes':'all routes reused'),passed:true});
}
{
 const m=fixture(),units=Array.from({length:500},(_,i)=>m.addUnit('bukhanka','rai',
  {x:-600+(i%25)*48,y:-1200+Math.floor(i/25)*48},{heading:0})),ids=units.map(u=>u.id);
 const old=m.submitOrder(ids,'move',{x:0,y:700});m.advance(1/80,{budgetMs:0});assert(m.commandPlanner.active);
 const selected=units.at(-1),latest=m.submitOrder([selected.id],'move',{x:700,y:400});
 let appliedAfter=null;
 for(let frame=0;frame<40;frame++){m.advance(1/80,{budgetMs:6});if(!selected.pendingOrder){appliedAfter=(frame+1)/80;break;}}
 assert(appliedAfter!==null&&appliedAfter<=.5,'A subset command preempts the older mass search within .5s');
 assert.equal(selected.commandRevision,latest.revision);assert.deepEqual(selected.routeOrder.request,{x:700,y:400});
 assert(units.slice(0,-1).some(u=>u.pendingOrder?.revision===old.revision),'The new intent must finish before the old 499-car job');
 assert(m.commandPlanner.stats.preemptions>0);settle(m,4000);
 assert.deepEqual(selected.routeOrder.request,{x:700,y:400},'Restarting the remainder cannot overwrite the newer subset');
 assert(units.slice(0,-1).every(u=>!u.pendingOrder&&u.routeOrder.request.y===700));
 results.push({case:'new subset preempts a suspended 500-car command',appliedAfter,preemptions:m.commandPlanner.stats.preemptions});
}
{
 const m=fixture(),units=Array.from({length:6},(_,i)=>m.addUnit('bukhanka','rai',
  {x:i<3?-6:6,y:(i%3-1)*26},{heading:Math.PI}));
 const old=m.submitOrder(units.map(u=>u.id),'move',{x:0,y:500});
 // Drive the real generator to a partially staged local cohort, one bounded
 // slice at a time. No pose or path is injected into the simulation.
 for(let i=0;i<2000&&!m.commandPlanner.active?.record.assigned.length;i++)m.advance(1/80,{budgetMs:0});
 assert(m.commandPlanner.active?.copies&&m.commandPlanner.active.record.assigned.length>0);
 assert(units.every(u=>u.pendingOrder),'A partial cohort has not physically committed');
 const selected=units[0],latest=m.submitOrder([selected.id],'move',{x:300,y:-200});settle(m);
 assert(!selected.pendingOrder&&selected.commandRevision===latest.revision);
 assert.deepEqual(selected.routeOrder.request,{x:300,y:-200});
 const record=m.state.commandOrders.find(r=>r.revision===old.revision);
 assert.equal(new Set(record.assigned).size,record.assigned.length,'Restarted staged copies cannot double-count assignments');
 assert(units.slice(1).every(u=>!u.pendingOrder&&u.routeOrder.request.y===500));
 results.push({case:'preempted staged cohort preserves live poses and revision ownership',passed:true});
}
{
 const m=fixture(),units=cars(m,20),selected=units.at(-1);
 m.addStructure('factory','neutral',{x:0,y:200},{halfWidth:100,halfDepth:24,completed:true,progress:1});m.rebuildNavigation();
 m.submitOrder(units.map(u=>u.id),'move',{x:0,y:500});
 for(let i=0;i<500&&!m.commandPlanner.nav.searchId;i++)m.advance(1/80,{budgetMs:0});
 assert(m.commandPlanner.active&&m.commandPlanner.nav.searchId>0,'The old private A* must actually be suspended');
 let flushes=0;const finish=m.finishPendingStep;m.finishPendingStep=function(...args){flushes++;return finish.apply(this,args);};
 m.submitOrder([selected.id],'move',{x:600,y:-100});
 for(let i=0;i<40&&selected.pendingOrder;i++)m.advance(1/80,{budgetMs:6});
 assert(!selected.pendingOrder);assert.equal(flushes,0,'Preemption must not synchronously finish a pending simulation tick');
 assert.deepEqual(m.nav.occupied,m.commandPlanner.nav.occupied,'A discarded A* cannot leak temporary occupancy');
 settle(m);assert.deepEqual(selected.routeOrder.request,{x:600,y:-100});
 assert(units.slice(0,-1).every(u=>u.routeOrder?.request.y===500&&!u.pendingOrder));
 results.push({case:'preemption discards suspended private A* without flushing simulation',passed:true});
}
{
 const m=fixture(),units=cars(m,50),ids=units.map(u=>u.id);m.submitOrder(ids,'move',{x:0,y:500});m.advance(1/80,{budgetMs:0});
 assert(units.some(u=>u.pendingOrder));
 const loaded=fixture();loaded.load(m.save());loaded.state.bounds=m.state.bounds.slice();loaded.rebuildNavigation();settle(loaded);
 assert(ids.every(id=>!loaded.entity(id).pendingOrder&&loaded.entity(id).routeOrder.request.y===500));
 results.push({case:'saved pending intents reconstruct searches',passed:true});
}
{
 const m=fixture(),u=m.addUnit('bukhanka','rai',{x:0,y:0});
 const building=m.addStructure('factory','rai',{x:0,y:300},{completed:true,progress:1});m.rebuildNavigation();
 m.submitOrder([u.id],'move',{x:0,y:300});settle(m);
 assert.equal(u.pendingOrder?.status,'blocked');
 let searches=0;const compute=m.commandPlanner.nav.computePathSteps;
 m.commandPlanner.nav.computePathSteps=function*(...args){searches++;return yield* compute.apply(this,args);};
 assert(m.submitOrder([u.id],'move',{x:0,y:300}).reused);
 const distant=m.addUnit('raider','scavs',{x:1000,y:1000});distant.x+=1;
 const bystander=m.addUnit('bukhanka','rai',{x:120,y:300});
 const retryAt=m.state.commandOrders.at(-1).retryAt;
 for(let i=0;i<160;i++){bystander.heading+=.001;m.advance(1/80,{budgetMs:6});}
 assert.equal(searches,0,'A repeated failure and an unrelated distant car do not restart A*');
 assert.equal(m.state.commandOrders.at(-1).retryAt,retryAt,'A known static blocker does not retry because another nearby car rotates');
 building.hp=0;m.rebuildNavigation();m.advance(1/80,{budgetMs:6});settle(m);
 assert(!u.pendingOrder&&u.path.length,'Removing the obstruction automatically retries the unchanged intent');
 results.push({case:'negative result/local invalidation/retry',passed:true});
}
{
 const m=fixture(),u=m.addUnit('bukhanka','rai',{x:0,y:-300},{heading:0}),walls=[];
 for(const [x,y,halfWidth,halfDepth] of [[0,-100,120,12],[0,100,120,12],[-100,0,12,120],[100,0,12,120]])
  walls.push(m.addStructure('factory','neutral',{x,y},{halfWidth,halfDepth,completed:true,progress:1}));
 m.rebuildNavigation();m.submitOrder([u.id],'move',{x:0,y:0});
 let searches=0;const compute=m.commandPlanner.nav.computePathSteps;
 m.commandPlanner.nav.computePathSteps=function*(...args){searches++;return yield* compute.apply(this,args);};
 settle(m);m.advance(.2,{budgetMs:6});
 assert.equal(searches,1,'An isolated target is checked once, not once per nearby parking candidate');
 assert.equal(u.pendingOrder?.reason,'route-unreachable');assert.equal(u.navigation?.state,'UNREACHABLE');
 assert(!u.routeOrder&&!u.path.length,'A slot outside the target component cannot replace the requested destination');
 m.stop([u.id]);m.submitOrder([u.id],'move',{x:0,y:0});settle(m);m.advance(.2,{budgetMs:6});
 assert.equal(searches,1,'Stop/reissue reuses the negative cache without another search');
 assert.equal(u.pendingOrder?.reason,'route-unreachable','A cached failure retains its connectivity proof');
 assert.equal(u.navigation?.state,'UNREACHABLE');
 walls[0].hp=0;m.rebuildNavigation();m.advance(.1,{budgetMs:6});settle(m);
 assert(!u.pendingOrder&&u.path.length,'Opening the target component invalidates its negative proof');
 assert.deepEqual(u.routeOrder.destination,{x:0,y:0});
 results.push({case:'one connectivity proof / UNREACHABLE / opening the target component',passed:true});
}
{
 const m=fixture();m.addStructure('factory','rai',{x:0,y:200},{completed:true,progress:1});m.rebuildNavigation();
 const from={x:0,y:0,kind:'bukhanka',heading:0},to={x:0,y:400};
 const expected=m.nav.computePath(from,to),context=m.nav.createSearchContext();
 m.nav.workDeadline=0;const movement=m.nav.computePathSteps(from,to);assert.equal(movement.next().done,false);
 context.workDeadline=Infinity;assert(context.findPath({x:-150,y:0,kind:'bukhanka',heading:0},to)?.length);
 m.nav.workDeadline=Infinity;let result;do{result=movement.next();}while(!result.done);
 assert.deepEqual(result.value,expected,'Command search must not corrupt a suspended movement search');
 results.push({case:'private A* scratch isolation',passed:true});
}
{
 const m=fixture(),u=m.addUnit('bukhanka','rai',{x:50,y:0});
 m.addStructure('factory','rai',{x:0,y:200},{completed:true,progress:1});m.state.bounds=[64,0,127,127];m.rebuildNavigation();
 m.submitOrder([u.id],'move',{x:50,y:500});m.advance(1/80,{budgetMs:0});
 assert(m.commandPlanner.active,'The command search must actually be suspended');
 const revision=m.nav.topologyRevision;m.state.bounds=[0,0,127,127];m.rebuildNavigation();
 assert(m.nav.topologyRevision>revision,'Changing map bounds invalidates the suspended topology');
 settle(m);assert.deepEqual(m.commandPlanner.nav.bounds,m.state.bounds);assert(!u.pendingOrder);
 results.push({case:'map expansion refreshes suspended private search',passed:true});
}
fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/command-planner.json',JSON.stringify({passed:true,results},null,2));
console.log(JSON.stringify({passed:true,results},null,2));
