import assert from 'node:assert/strict';
import {beginNavigationStep,navigationDecision,finishNavigationStep,navigationSnapshot,auditNavigationWaits} from '../campaign/navigation-state.js';

const events=[],mission={state:{time:0},config:{worldScale:4.5},trafficCoordinator:{intents:new Map()},emit:(type,data)=>events.push({type,data})};
const unit={id:'test-car',hp:320,x:0,y:0,driveSpeed:20,path:[{x:0,y:100}],task:{type:'move',x:0,y:100},routeOrder:{request:{x:0,y:100},destination:{x:0,y:100}}};
const tick=(decision,move=0)=>{
 const x=unit.x,y=unit.y;mission.state.time+=.1;beginNavigationStep(unit);decision?.();unit.y+=move;finishNavigationStep(mission,unit,.1,x,y);
};
for(let i=0;i<9;i++)tick();
assert.equal(unit.navigation.state,'BLOCKED','A velocity property is not proof of actual movement');
assert(unit.navigation.potentialDefect,'An unexplained stationary order is diagnosed after 500 ms');
assert.equal(events.length,1,'A persistent defect does not emit a message each tick');
tick(()=>navigationDecision(unit,'WAITING_RESERVATION','junction-reservation','leader','resume-when-clear',20));
assert(!unit.navigation.potentialDefect);assert.equal(unit.navigation.blockerId,'leader');
tick(null,1);assert.equal(unit.navigation.state,'MOVING');assert.equal(unit.navigation.speed,10);assert.equal(unit.navigation.waitSeconds,0);
unit.task=null;unit.path=[];tick();assert.equal(unit.navigation.state,'IDLE','Losing a route near the target cannot manufacture ARRIVED');
unit.y=99;tick();assert.equal(unit.navigation.state,'ARRIVED');
unit.hp=0;tick();assert.equal(unit.navigation.reason,'destroyed');
const snapshot=navigationSnapshot(mission,unit);
assert.deepEqual(snapshot.destination,{x:0,y:100});assert.equal(snapshot.speed,0);
assert.doesNotThrow(()=>JSON.stringify(unit.navigation));
const a={id:'a',hp:1,navigation:{waitSeconds:1,state:'YIELDING',reason:'headway',blockerId:'b'}},
 b={id:'b',hp:1,navigation:{waitSeconds:1,state:'YIELDING',reason:'headway',blockerId:'a'}};
mission.state.units=[a,b];auditNavigationWaits(mission);
assert.deepEqual(mission.navigationDiagnostics.cycles,[['a','b']]);assert(a.navigation.potentialDefect&&b.navigation.potentialDefect);
const count=events.length;auditNavigationWaits(mission);assert.equal(events.length,count,'A known cycle is not repeatedly emitted');
b.navigation.waitSeconds=0;auditNavigationWaits(mission);assert.deepEqual(mission.navigationDiagnostics.cycles,[],'A moving predecessor breaks the diagnosed wait cycle');
// A second physical blocker must participate even if the first dependency
// is an acyclic reservation. Borrowers have a destination but no path yet.
const moving={id:'moving',hp:320,path:[{x:100,y:0}],task:{type:'move',x:100,y:0},commandRevision:1,
 navigation:{speed:0,waitSeconds:1,blockerId:'outside',blockerIds:['outside','borrower'],commandRevision:1}},
 borrower={id:'borrower',hp:320,path:[],task:null,commandRevision:1,yieldReturn:{home:{x:0,y:0}},
 navigation:{speed:0,waitSeconds:1,blockerId:'moving',blockerIds:['moving'],commandRevision:1}},
 tail={id:'tail',hp:320,path:[{x:100,y:0}],navigation:{speed:0,waitSeconds:1,blockerId:'moving'}};
mission.state.units=[moving,borrower,tail];auditNavigationWaits(mission);
assert.deepEqual(mission.navigationDiagnostics.recoveryCycles,[['borrower','moving']]);
assert(mission.navigationDiagnostics.deadlockedIds.has('tail'),'A tail behind a deadlock is not a healthy queue');
moving.commandRevision=2;auditNavigationWaits(mission);
assert.equal(mission.navigationDiagnostics.recoveryCycles.length,0,'A replacement order invalidates the previous physical dependency');
const waiting={id:'named-wait',hp:320,x:0,y:0,path:[{x:100,y:0}],task:{type:'move',x:100,y:0}};
beginNavigationStep(waiting);navigationDecision(waiting,'YIELDING','headway','leader');finishNavigationStep(mission,waiting,.1,0,0);
mission.state.time+=31;beginNavigationStep(waiting);navigationDecision(waiting,'YIELDING','headway','leader');finishNavigationStep(mission,waiting,.1,0,0);
assert(waiting.navigation.potentialDefect,'A named indefinite wait must remain visible');
console.log(JSON.stringify({passed:true,checks:15}));
