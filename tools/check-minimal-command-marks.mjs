import fs from 'node:fs';
import assert from 'node:assert/strict';
import {installMinimalCommandMarks} from './minimal-command-marks.mjs';
import {injectMinimalCommandMarks} from './minimal-command-source.mjs';
let clock=0;const unit={id:'u',hp:1,commandRevision:0},host={},m={state:{time:0},entity:id=>id==='u'?unit:null};
const descriptors=Object.getOwnPropertyDescriptors(m),marks=installMinimalCommandMarks(m,{now:()=>clock,host});
assert.deepEqual(Object.getOwnPropertyDescriptors(m),descriptors,'No methods/properties patched');
marks.arm(['u']);clock=1;marks.queued(m,{revision:1,cohorts:[],preservesAccepted:false});marks.returned({ok:true,revision:1});
clock=10;marks.planner(m,{revision:1});clock=20;marks.plan(m,unit,1);clock=21;marks.ready(m,unit,1);
marks.motion(m,unit,0,1,0,'route');assert.equal(marks.report().groups[0].rows[0].firstMotionAt,null,'Old revision excluded');
clock=25;marks.intent(m,unit,1);marks.motion(m,unit,1,0,0,'intent');assert.equal(marks.report().groups[0].rows[0].firstMotionAt,null,'Zero displacement excluded');
clock=26;marks.motion(m,unit,1,.2,0,'intent');assert.equal(marks.report().groups[0].rows[0].firstMotionAt,26,'Pending intent is actual command motion');
const reads=marks.report().clockReads;for(let i=0;i<100;i++){marks.intent(m,unit,1);marks.motion(m,unit,1,.2,0,'intent');}assert.equal(marks.report().clockReads,reads,'Completed milestones do not read the clock');
clock=479;unit.commandRevision=1;m.pendingTick={iterator:{}};unit.commandStartAfter=1;marks.publish(m,unit);
clock=480;marks.pending.get(unit).controllerAt=marks.controllerTime();clock=500;marks.motion(m,unit,1,.1,0,'route');
const row=marks.report().groups[0].rows[0];assert.equal(row.firstMotionAt,26);assert.equal(row.routeThresholdAt,500);assert.equal(row.publishedDuringTick,true);assert.equal(row.commandStartAfter,1);assert(!marks.pending.has(unit));
marks.restore();assert(!host.__minimalMarks);assert.deepEqual(Object.getOwnPropertyDescriptors(m),{...descriptors,pendingTick:Object.getOwnPropertyDescriptor(m,'pendingTick')});
const root='campaign/reports/frame-budget/path-search/variants/baseline/runtime/';
for(const file of ['campaign/mission.js','campaign/command-planner.js','campaign/command-motion.js']){
 const text=fs.readFileSync(root+file,'utf8');assert.notEqual(injectMinimalCommandMarks(file,text),text);assert.throws(()=>injectMinimalCommandMarks(file,text+text),/anchor must occur once/);
}
console.log(JSON.stringify({passed:true,noMonkeyPatch:true,oldRevisionExcluded:true,zeroDisplacementExcluded:true,pendingMotion:26,historicalRouteThreshold:500,noRepeatedClockReads:true,ambiguousSourceRejected:true}));
