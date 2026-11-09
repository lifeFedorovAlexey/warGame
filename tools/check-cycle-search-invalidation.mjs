import assert from 'node:assert/strict';
import fs from 'node:fs';
import {progressMission} from './check-navigation-public-progress.mjs';
import {recoverWaitCycle} from '../campaign/traffic-cycle.js';
import {auditNavigationWaits} from '../campaign/navigation-state.js';
import {checkManeuver} from '../campaign/vehicle-motion.js';
import {maneuverAdmissionBlocker} from '../campaign/maneuver-admission.js';

const m=progressMission(),a=m.addUnit('bukhanka','rai',{x:-12,y:0},{heading:-Math.PI/2}),
 b=m.addUnit('bukhanka','rai',{x:12,y:0},{heading:Math.PI/2}),unrelated=m.addUnit('bukhanka','rai',{x:55,y:55});
for(const [x,y,halfWidth,halfDepth] of [[-27,0,3,15],[27,0,3,15],[0,-9,28,3],[0,9,28,3]])
 m.addStructure('generator','rai',{x,y},{halfWidth,halfDepth});
m.rebuildNavigation();
for(const [unit,other] of [[a,b],[b,a]]){
 unit.path=[{x:other.x,y:other.y}];unit.task={type:'move',...unit.path[0]};
 unit.navigation={blockerId:other.id,blockerIds:[other.id],speed:0,waitSeconds:1,reason:'headway'};
}
const original=m.planManeuverSteps;let searches=0;
m.planManeuverSteps=function*(...args){searches++;return yield* original.apply(this,args);};
const recover=()=>{auditNavigationWaits(m);const iterator=recoverWaitCycle(m,a);let result;do{result=iterator.next();}while(!result.done);return result.value;};
assert.equal(recover(),false,'The boxed pair has no physical parking exit');
const first=searches;assert(first>0);
unrelated.x+=1;a.steering=.1;b.steering=-.1;
assert.equal(recover(),false);assert.equal(searches,first,'Unrelated movement and stationary steering relaxation cannot restart a failed physical search');
b.x+=.1;
assert.equal(recover(),false);assert(searches>first,'Moving an actual rejecting body invalidates the failed search immediately');
console.log(JSON.stringify({passed:true,initialSearches:first,retriedSearches:searches-first}));

// Parking itself succeeds, but a wall prevents the required continuation.
// This used to recompute all six identical parking candidates whenever an
// unrelated neighbour moved, even though none of the checked arcs changed.
const open=progressMission(),left=open.addUnit('bukhanka','rai',{x:-12,y:0},{heading:-Math.PI/2}),
 right=open.addUnit('bukhanka','rai',{x:12,y:0},{heading:Math.PI/2}),outside=open.addUnit('bukhanka','rai',{x:55,y:55});
for(const x of [-32,32])open.addStructure('generator','rai',{x,y:0},{halfWidth:3,halfDepth:10});
open.rebuildNavigation();
for(const [unit,other] of [[left,right],[right,left]]){
 unit.path=[{x:other.x*5,y:0}];unit.task={type:'move',...unit.path[0]};
 unit.navigation={blockerId:other.id,blockerIds:[other.id],speed:0,waitSeconds:1,reason:'headway'};
}
let candidates=0,found=0;const parking=open.parkingManeuverSteps,ends=[];
open.parkingManeuverSteps=function*(unit,...args){
 candidates++;const plan=yield* parking.call(this,unit,...args);
 if(plan){found++;ends.push(checkManeuver(unit,plan.legs,this.config.worldScale,()=>true));}
 return plan;
};
const recoverOpen=()=>{auditNavigationWaits(open);const iterator=recoverWaitCycle(open,left);let result;do{result=iterator.next();}while(!result.done);return result.value;};
assert.equal(recoverOpen(),false);assert(found>0,'Parking succeeds; the continuation fails');
const firstCandidates=candidates;outside.x++;
assert.equal(recoverOpen(),false);assert.equal(candidates,firstCandidates,'Reuse checked candidates after unrelated movement');
// A new body was absent from the original search's witnesses. Checking the
// cached arc must detect it anyway, and search again instead of trusting it.
open.addUnit('bukhanka','rai',ends[0],{heading:ends[0].heading});
assert.equal(recoverOpen(),false);assert(candidates>firstCandidates,'A newly occupied cached arc requires a new search');
const afterBody=candidates;
open.addStructure('generator','rai',{x:300,y:300},{halfWidth:3,halfDepth:3});open.rebuildNavigation();
assert.equal(recoverOpen(),false);assert(candidates>afterBody,'Topology changes invalidate cached geometry');
console.log(JSON.stringify({passed:true,initialCandidates:firstCandidates,retriedCandidates:candidates-firstCandidates}));

// An actual 40-car crossing: u195 rejected alternatives during parking
// search, but does not intersect any of the six selected parking arcs. Its
// movement must not discard those still-clear candidates and repeat all the
// searches. The same live full-body/braking test still guards every reuse.
{
 const fixture=JSON.parse(fs.readFileSync('tools/fixtures/navigation-cycle-search-witness.json'));
 const m=progressMission();m.load(structuredClone(fixture.saved));m.state.bounds=[0,0,127,127];m.rebuildNavigation();
 const parking=m.parkingManeuverSteps,plans=[];let calls=0;
 m.parkingManeuverSteps=function*(unit,...args){
  calls++;const result=yield* parking.call(this,unit,...args);if(result)plans.push({unit,legs:structuredClone(result.legs)});return result;
 };
 const recover=()=>{auditNavigationWaits(m);const it=recoverWaitCycle(m,m.entity('u200'));let step;do{step=it.next();}while(!step.done);return step.value;};
 assert.equal(recover(),false);const initial=calls;assert.equal(plans.length,6);
 m.entity('u195').x+=.001;
 for(const {unit,legs}of plans)assert(checkManeuver(unit,legs,m.config.worldScale,(from,to)=>
  m.vehicleMotionClear(unit,from,to)&&!maneuverAdmissionBlocker(m,unit,from,to,m.config.simulationStep)),
  'The selected candidate really remains clear after that body moves');
 assert.equal(recover(),false);
 assert.equal(calls,initial,'A still-clear successful candidate must not depend on bodies which rejected different alternatives');
 console.log(JSON.stringify({passed:true,capturedCandidates:initial,unnecessarySearches:calls-initial}));
}
