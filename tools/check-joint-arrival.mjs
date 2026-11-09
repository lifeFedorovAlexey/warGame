import assert from 'node:assert/strict';
import fs from 'node:fs';
import {progressMission} from './check-navigation-public-progress.mjs';
import {vehicleClearance} from '../campaign/vehicle-collision.js';
import {stepJointTraffic,jointPlanFor} from '../campaign/traffic-joint.js';
import {recordYieldStep,checkedCooperativeArrival} from '../campaign/traffic-start.js';
import {corridorBlocker} from '../campaign/traffic-corridor.js';

const fixture=JSON.parse(fs.readFileSync('tools/fixtures/navigation-joint-arrival.json'));
const scene=snapshot=>{const m=progressMission();m.load(structuredClone(snapshot));m.state.bounds=[0,0,127,127];m.rebuildNavigation();return m;};
const done=u=>!u.pendingOrder&&!u.task&&!u.path.length&&!u.detour&&!u.yieldReturn&&!u.jointTraffic;
const stages=new Map(),results=[];
function run(m,{saveStages=false}={}){
 const start=m.state.time,wall=performance.now(),units=m.state.units,
  goals=new Map(units.filter(u=>u.routeOrder).map(u=>[u.id,structuredClone(u.routeOrder.destination)])),
  health=new Map(units.map(u=>[u.id,u.hp])),rocks=new Map(units.map(u=>[u.id,u.contactRock?.at]));
 let contacts=0,minGap=Infinity,observed=0,input=0,maxAdvanceMs=0;
 const advance=m.continueTick;
 m.continueTick=function(...args){
  const pending=this.pendingTick,result=advance.apply(this,args);
  if(pending&&!this.pendingTick){
   observed++;
   for(const u of units){
    assert.equal(u.hp,health.get(u.id));if(goals.has(u.id))assert.deepEqual(u.routeOrder.destination,goals.get(u.id));
    if(u.contactRock?.at!==rocks.get(u.id)){contacts++;rocks.set(u.id,u.contactRock?.at);}
   }
   for(let a=0;a<units.length;a++)for(let b=0;b<a;b++)minGap=Math.min(minGap,vehicleClearance(units[a],units[b],this.config.worldScale,this.field));
   const phase=this.entity('u177').detour?.joint?.cursor;
   if(saveStages&&phase!==undefined&&!stages.has(phase))stages.set(phase,JSON.parse(this.save()));
  }
  return result;
 };
 while((m.pendingTick||!units.every(done))&&m.state.time-start<60&&performance.now()-wall<90000){
  const delta=Math.min(1/80,60-input);input+=delta;const before=performance.now();
  m.advance(delta,{budgetMs:5});maxAdvanceMs=Math.max(maxAdvanceMs,performance.now()-before);m.effects=[];
 }
 const result={passed:!m.pendingTick&&units.every(done)&&minGap>0&&!contacts,
  seconds:m.state.time-start,wallSeconds:(performance.now()-wall)/1000,minGap,contacts,observed,maxAdvanceMs,
  unfinished:units.filter(u=>!done(u)).map(u=>u.id)};
 for(const [id,goal] of goals){const u=m.entity(id);if(done(u))assert(Math.hypot(u.x-goal.x,u.y-goal.y)<2.01);}
 console.log(JSON.stringify(result));assert(result.passed,'Original public orders and all borrowed spaces must finish without an injected plan or another click');
 assert(maxAdvanceMs<250,'The joint proof must yield instead of blocking a complete frame');
 results.push(result);return result;
}
run(scene(fixture),{saveStages:true});
assert.deepEqual([...stages.keys()],[0,1,2,3,4],'Observe every real transaction phase');

// Resume a partially driven donor arc and the final return after requester
// arrival. Stored phases and actual return history must survive JSON loading.
for(const phase of [1,4]){
 const m=scene(stages.get(phase)),owner=m.entity('u177');
 assert(jointPlanFor(m,owner),'A saved transaction remains valid');
 if(phase===4){
  const end=owner.detour.reservedCorridor.at(-1),outsider={id:'outsider',owner:owner.owner,kind:owner.kind};
  assert.equal(corridorBlocker(m,outsider,end.from,end.to)?.id,owner.id,'The final donor return is reserved after the requester arrives');
 }
 run(m);console.log(JSON.stringify({passed:true,resumedPhase:phase}));
}

for(const change of ['requester-stop','donor-stop','helper-move','construction','member-relocation','member-destroyed']){
 const m=scene(stages.get(1)),owner=m.entity('u177'),donor=m.entity('u183'),helper=m.entity('u175');
 const token=owner.jointTraffic.token,oldDonor=structuredClone(donor.yieldReturn.legs);
 if(change==='requester-stop')m.stop([owner.id],{expandGroup:false});
 if(change==='donor-stop')m.stop([donor.id],{expandGroup:false});
 if(change==='helper-move')assert(m.submitOrder([helper.id],'move',{x:600,y:800}).ok);
 if(change==='construction'){m.addStructure('generator','rai',{x:800,y:800},{halfWidth:3,halfDepth:3});m.rebuildNavigation();}
 if(change==='member-relocation')helper.x+=.1;
 if(change==='member-destroyed')helper.hp=0;
 const actor=change==='requester-stop'?donor:owner;
 assert.equal(stepJointTraffic(m,actor,.1,recordYieldStep),false,'Changed intent or geometry cancels the joint transaction');
 assert(m.state.units.every(u=>u.jointTraffic?.token!==token),'No orphaned member or reservation');
 if(change==='donor-stop')assert(!donor.yieldReturn,'Stop must not restore the old borrowed destination');
 else assert.deepEqual(donor.yieldReturn?.legs??[],oldDonor,'Cancellation preserves only the actual travelled return history');
 console.log(JSON.stringify({passed:true,cancellation:change}));
}

// An unrelated newcomer is checked by actual sweeps, even though it was not
// present in the original proof. A blocked phase releases its reservation.
{
 const m=scene(stages.get(0)),owner=m.entity('u177'),helper=m.entity('u175');
 const other=m.addUnit('bukhanka','rai',{x:helper.x-Math.sin(helper.heading)*30,y:helper.y+Math.cos(helper.heading)*30},{heading:helper.heading});
 assert(vehicleClearance(helper,other,m.config.worldScale,m.field)>0);
 for(let i=0;i<120&&helper.jointTraffic;i++){
  stepJointTraffic(m,helper,.1,recordYieldStep);
  assert(vehicleClearance(helper,other,m.config.worldScale,m.field)>0);
 }
 assert(!owner.detour?.joint&&!helper.jointTraffic,'A newly obstructed transaction cannot reserve the road indefinitely');
 console.log(JSON.stringify({passed:true,newcomer:'blocked-without-contact-and-released'}));
}

// Revoke a proof while it is suspended in the real two-donor search.
{
 const m=scene(fixture),owner=m.entity('u177'),helper=m.entity('u175'),parking=m.parkingManeuverSteps;let entered=false;
 m.parkingManeuverSteps=function(...args){
  // Observe the actual fallback call; earlier single-donor searches are not
  // evidence that cancellation inside the joint proof has been exercised.
  if(args[0].id==='u183'&&new Error().stack.includes('checkedJointArrival'))entered=true;
  return parking.apply(this,args);
 };
 m.nav.workDeadline=0;const proof=checkedCooperativeArrival(m,owner,owner.routeOrder.destination,{cooperate:true});let next;
 for(let i=0;i<200000&&!entered;i++){next=proof.next();if(next.done)break;}
 assert(entered&&!next.done);m.stop([helper.id],{expandGroup:false});m.nav.workDeadline=Infinity;
 do{next=proof.next();}while(!next.done);
 assert.equal(next.value,null);assert(m.state.units.every(u=>!u.jointTraffic&&!u.yieldReturn),'No partial transaction from an invalidated proof');
 console.log(JSON.stringify({passed:true,suspendedProof:'helper-stop'}));
}
fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/joint-arrival.json',JSON.stringify({passed:true,results,phases:[...stages.keys()]},null,2)+'\n');
