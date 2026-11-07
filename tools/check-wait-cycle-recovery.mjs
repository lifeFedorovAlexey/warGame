import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from './check-start-latency-coordinator.mjs';
import {recoverWaitCycle,resumeCycleRoute} from '../campaign/traffic-cycle.js';
import {checkedRouteShortcut} from '../campaign/traffic-shortcut.js';
import {auditNavigationWaits} from '../campaign/navigation-state.js';
import {vehicleClearance,vehicleEnvelope,footprintSupport} from '../campaign/vehicle-collision.js';

// Captured, unmodified production bodies/routes at a real three-body cycle.
// The historical capture is a tick state, not a flushed save: event serial and
// RNG were not recorded. These tests prove this physical state/lifecycle;
// check-combat-sight separately starts from actual submitOrder.
const capture=JSON.parse(fs.readFileSync('tools/fixtures/crossing-occupied-cycle.json'));
const finish=iterator=>{let result;do{result=iterator.next();}while(!result.done);return result.value;};
const key=u=>JSON.stringify({x:u.x,y:u.y,heading:u.heading,path:u.path,task:u.task,routeOrder:u.routeOrder});
function restore(){
 const m=fixture();m.state=structuredClone(capture.state);m.serial=10000;m.rebuildNavigation();m.visible.fill(1);
 return m;
}
function arrange(){
 const m=restore(),units=capture.data.units.map(id=>m.entity(id)),before=units.map(key);
 auditNavigationWaits(m);
 assert(finish(recoverWaitCycle(m,units.slice().sort((a,b)=>a.id.localeCompare(b.id))[0])));
 assert.deepEqual(units.map(key),before,'Planning must preserve every pose, route, task and accepted destination');
 const selected=units.find(u=>u.detour?.cycleRecovery);
 assert(selected&&units.filter(u=>u.detour?.cycleRecovery).length===1);
 return {m,units,selected};
}
const results=[];
for(const change of ['construction','replacement command']){
 const {m,selected}=arrange();
 for(let i=0;i<20&&selected.traffic?.phase!=='parked';i++)m.advance(.1);
 const state=selected.traffic,requester=m.entity(state.leader),release=state.releaseGoal,scale=m.config.worldScale,
  direction={x:-Math.sin(release.heading),y:Math.cos(release.heading)},planned=vehicleEnvelope(release,scale,m.field);
 const rear=()=>{const actual=vehicleEnvelope(requester,scale,m.field);return (actual.x-planned.x)*direction.x+(actual.y-planned.y)*direction.y
  -footprintSupport(actual,direction.x,direction.y)+footprintSupport(planned,direction.x,direction.y);};
 // Execute the requester's actual controller until its promised passage is
 // complete, holding the test at the yielder's next return-controller boundary.
 for(let i=0;i<100&&rear()<-.05;i++){m.trafficCoordinator.update(m);m.move(requester,.1);}
 assert(rear()>=-.05);
 m.nav.workDeadline=-Infinity;const iterator=resumeCycleRoute(m,selected);assert.equal(iterator.next().done,false);
 if(change==='construction'){m.addStructure('generator','rai',{x:-130,y:-20});m.rebuildNavigation();}
 else assert(m.submitOrder([selected.id],'move',{x:180,y:-200}).ok);
 const pending=selected.pendingOrder;m.nav.workDeadline=Infinity;
 assert.equal(finish(iterator),true,'An obsolete return connector cannot publish release');
 assert.equal(selected.traffic,state);assert.equal(selected.pendingOrder,pending);
 results.push({case:'suspended return invalidated by '+change,passed:true});
}
for(const change of ['construction','replacement command','command revision','body pose']){
 const m=restore(),owner=m.entity(capture.data.units.slice().sort()[0]);auditNavigationWaits(m);m.nav.workDeadline=-Infinity;
 const iterator=recoverWaitCycle(m,owner);assert.equal(iterator.next().done,false,'The physical search must yield under its CPU deadline');
 if(change==='construction'){m.addStructure('generator','rai',{x:-130,y:-20});m.rebuildNavigation();}
 if(change==='replacement command')assert(m.submitOrder([owner.id],'move',{x:180,y:-200}).ok);
 if(change==='command revision')owner.commandRevision=(owner.commandRevision??0)+1;
 if(change==='body pose'){
  // A test-only external state correction while the iterator is suspended.
  // No move is certified from this modified state; it must reject publication.
  m.entity(capture.data.units[1]).heading+=.01;
 }
 m.nav.workDeadline=Infinity;
 assert.equal(finish(iterator),false,'A stale proof cannot publish any recovery: '+change);
 assert(!m.state.units.some(u=>u.detour?.cycleRecovery));
 results.push({case:'suspended proof invalidated by '+change,passed:true});
}
{
 const m=restore(),units=capture.data.units.map(id=>m.entity(id));
 for(const unit of units)unit.navigation.waitSeconds=.1;
 auditNavigationWaits(m);
 assert.equal(m.navigationDiagnostics.cycles.length,0);
 assert(m.navigationDiagnostics.recoveryCycles.some(cycle=>cycle.length===3),'Recovery sees a proved dependency before the diagnostic threshold');
 const owner=units.slice().sort((a,b)=>a.id.localeCompare(b.id))[0];
 assert(m.submitOrder([owner.id],'move',{x:180,y:-200}).ok);
 assert.equal(finish(recoverWaitCycle(m,owner)),false,'A queued replacement invalidates old dependency evidence');
 // Idle-yield cycles remain failures even though they cannot enter this
 // route-only recovery. The new early graph must not weaken diagnostics.
 const a=units[0],b=units[1];m.state.units=[a,b];a.path=[];b.path=[];
 a.navigation.blockerId=b.id;b.navigation.blockerId=a.id;
 a.navigation.waitSeconds=b.navigation.waitSeconds=.6;
 auditNavigationWaits(m);assert.deepEqual(m.navigationDiagnostics.cycles,[[a.id,b.id]]);
 results.push({case:'early event, stale command and unchanged diagnostics',passed:true});
}
{
 const {m,selected}=arrange();
 for(let i=0;i<20&&selected.traffic?.phase!=='parked';i++)m.advance(.1);
 const reservation=selected.traffic;assert.equal(reservation?.phase,'parked');
 const requester=m.entity(reservation.leader),origin={x:selected.x,y:selected.y};
 assert(finish(checkedRouteShortcut(m,selected,selected.path[0],{allowed:(a,b)=>m.vehicleMotionClear(selected,a,b)})),
  'The saved counterexample has a statically clear own route before the requester enters its crossing');
 assert.equal(finish(resumeCycleRoute(m,selected)),true,'Static clearance alone must not reclaim the promised passing corridor');
 assert.equal(selected.navigation.controlReason,'cycle-requester-crossing');
 assert.deepEqual({x:selected.x,y:selected.y},origin);
 for(let i=0;i<100&&selected.traffic===reservation;i++)m.advance(.1);
 assert.notEqual(selected.traffic,reservation,'A real pass releases the reservation without a timeout');
 const release=reservation.releaseGoal,scale=m.config.worldScale,direction={x:-Math.sin(release.heading),y:Math.cos(release.heading)},
  actual=vehicleEnvelope(requester,scale,m.field),planned=vehicleEnvelope(release,scale,m.field);
 const rear=(actual.x-planned.x)*direction.x+(actual.y-planned.y)*direction.y
  -footprintSupport(actual,direction.x,direction.y)+footprintSupport(planned,direction.x,direction.y);
 assert(rear>=-.05,'The requester must physically clear the proved sector before returning');
 results.push({case:'no premature return across requester',passed:true,rear});
}
{
 const {m,units,selected}=arrange(),start=m.state.time,initialHp=new Map(m.state.units.map(u=>[u.id,u.hp]));
 const contacts=[],fired=new Set(),attack=m.attack.bind(m),collision=m.vehicleCollision.bind(m);
 m.vehicleCollision=(u,s,others)=>{contacts.push({time:m.state.time,id:u.id,speed:s,blockers:[...others].map(v=>v.id)});return collision(u,s,others);};
 m.attack=(u,target,spec)=>{const result=attack(u,target,spec);if(result)fired.add(u.id);return result;};
 let first=null,finished=null,minGap=Infinity;
 const origin={x:selected.x,y:selected.y};
 for(let tick=0;tick<650&&units.some(u=>!fired.has(u.id));tick++){
  m.advance(.1);m.effects=[];
  if(first===null&&Math.hypot(selected.x-origin.x,selected.y-origin.y)>.1)first=m.state.time-start;
  if(finished===null&&!selected.detour?.cycleRecovery)finished=m.state.time-start;
  for(let i=0;i<units.length;i++)for(let j=0;j<i;j++)minGap=Math.min(minGap,vehicleClearance(units[i],units[j],m.config.worldScale,m.field));
 }
 assert(first<=.50001,'The proved recovery starts on the next tick');
 assert(finished<2,'Internal combat replanning must not cancel or restart the 5.4-world reverse');
 assert(units.every(u=>fired.has(u.id)),'All three actual original combat orders regain firing positions');
 assert.equal(contacts.length,0);assert(minGap>=0);
 assert(units.every(u=>u.hp===initialHp.get(u.id)));
 results.push({case:'captured three-body cycle',first,finished,seconds:m.state.time-start,minGap,contacts,fired:units.map(u=>u.id)});
}
{
 const {m,selected}=arrange();m.advance(.1);
 assert(selected.detour?.cycleRecovery,'Combat must preserve the checked manoeuvre');
 const saved=m.save(),copy=fixture(),bounds=m.state.bounds.slice();copy.load(saved);copy.state.bounds=bounds;copy.rebuildNavigation();copy.updateFog();
 const clone=copy.entity(selected.id);
 assert.deepEqual(clone.traffic,selected.traffic);assert.deepEqual(clone.detour,selected.detour);
 for(let i=0;i<5;i++){m.advance(.1);copy.advance(.1);}
 assert.deepEqual([clone.x,clone.y,clone.heading],[selected.x,selected.y,selected.heading]);
 results.push({case:'mid-manoeuvre save/load',passed:true});
}
{
 const {m,units,selected}=arrange();m.advance(.1);const origin={x:selected.x,y:selected.y};
 m.stop([selected.id],{expandGroup:false});
 assert(!selected.detour&&!selected.traffic&&!selected.path.length);
 m.advance(.1);m.advance(.1);
 assert(Math.hypot(selected.x-origin.x,selected.y-origin.y)<1e-6);
 assert(units.filter(u=>u!==selected).every(u=>u.trafficHold!==selected.id),'Stop releases dependent cycle holds');
 results.push({case:'explicit Stop cancels recovery',passed:true});
}
{
 const {m,selected}=arrange();m.advance(.1);
 assert(m.submitOrder([selected.id],'move',{x:180,y:-200}).ok);
 for(let i=0;i<80&&(selected.pendingOrder||selected.task?.type!=='move');i++)m.advance(.1);
 assert.equal(selected.task?.type,'move');assert(!selected.detour?.cycleRecovery&&!selected.traffic?.cycle);
 results.push({case:'explicit Move replaces recovery',passed:true});
}
fs.writeFileSync('campaign/reports/wait-cycle-recovery.json',JSON.stringify({results},null,2));
console.log(JSON.stringify({results},null,2));
