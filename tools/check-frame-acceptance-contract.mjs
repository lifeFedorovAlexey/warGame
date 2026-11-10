import fs from 'node:fs';
import assert from 'node:assert/strict';
import {assessFirstMotion,compareWallClock,evaluateFrameAcceptance} from './frame-acceptance-contract.mjs';
const root='campaign/reports/frame-budget/safety-fix/',read=p=>JSON.parse(fs.readFileSync(root+p));
const causal=read('causality.json'),checks=read('focused-checks.json'),render=read('render-comparison.json'),source=read('source-verification.json');
const baseline=read('combat-final/baseline-analysis.json'),after=read('combat-final/after-analysis.json');
const battle=causal.deterministicCombat;
const hashesMatch=battle&&[...battle.baseline,...battle.after].every(r=>r.traceHash===battle.baseline[0].traceHash&&r.tickHash===battle.baseline[0].tickHash&&r.errors.length===0);
const oracle=checks.find(r=>r.check==='check-traffic-visibility-cache');
const fixed=render.results.filter(r=>r.variant.endsWith('soft')).map(r=>r.phases.find(p=>p.phase==='fixed'));
const args={scope:'Restored camera order and traffic visibility cache in the recorded frozen runtime',
 equivalenceChecks:{fixedEdge:causal.fixedMatchesOriginalEveryTick,fixedCombat:hashesMatch,combatRepeats:battle?.baseline.length===2&&battle?.after.length===2,
  visibilityOracle:oracle?.exit_code===0&&JSON.parse(oracle.output).passed,sourceVerified:source.passed&&source.allFrozenInputsVerified},
 wallClock:compareWallClock(baseline,after),renderChecks:{drawCalls:fixed[0].calls.max===fixed[1].calls.max,triangles:fixed[0].triangles.max===fixed[1].triangles.max,scale:fixed[0].renderScale===fixed[1].renderScale},
 knownFailures:['check-maneuver-sampling','check-combat-headway','check-joint-arrival','check-navigation-public-progress'],fullMissionVerified:false};
// The optional series is supplied explicitly. A heavy frozen fixture or an
// unmatched baseline/after pair is not an ordinary-combat trend.
const historyPath=process.argv.find(a=>a.startsWith('--ordinary-tick-history='))?.slice('--ordinary-tick-history='.length);
const history=historyPath?JSON.parse(fs.readFileSync(historyPath)):[];
const report=evaluateFrameAcceptance({...args,ordinaryCombatTickMaxMs:history});
// These assertions express the acceptance boundaries, not just field shapes.
assert.equal(report.equivalence.status,'passed');assert.equal(report.absoluteSafety.status,'known_existing_defect');
assert.equal(report.performance.status,'failed');assert.equal(report.performance.measurements.freezes.halved,null);
assert.equal(report.mission.status,'not_verified');assert.equal(report.releaseReady,false);
const changedPair=structuredClone(args);changedPair.wallClock.observations.emergencyStops.after=9999;changedPair.wallClock.observations.alive.after=0;
assert.equal(evaluateFrameAcceptance(changedPair).equivalence.status,'passed','An uncontrolled wall-clock pair cannot invalidate fixed-input equivalence');
const brokenHash=structuredClone(args);brokenHash.equivalenceChecks.fixedCombat=false;
assert.equal(evaluateFrameAcceptance(brokenHash).equivalence.status,'failed','A changed deterministic result must reopen this scope');
assert.equal(evaluateFrameAcceptance({...args,equivalenceChecks:{}}).equivalence.status,'not_verified','Missing evidence cannot pass by vacuous truth');
const faster=structuredClone(args);faster.wallClock.performance.frameP99.targetMet=true;faster.wallClock.performance.snapshot.targetMet=true;
assert.equal(evaluateFrameAcceptance(faster).absoluteSafety.status,'known_existing_defect','Performance cannot close a collision defect');
assert.equal(evaluateFrameAcceptance(faster).mission.status,'not_verified','Battle arrivals cannot close the full mission');
const fullyVerified=structuredClone(args);fullyVerified.knownFailures=[];fullyVerified.functionalVerified=fullyVerified.fullMissionVerified=fullyVerified.absoluteSafetyVerified=true;
const performance=fullyVerified.wallClock.performance;for(const name of ['snapshot','fog','ui','longTasks'])performance[name].targetMet=true;
performance.frameP99.targetMet=performance.frameP99.improvementDemonstrated=performance.freezes.halved=true;
const firstMotion=(p95,max,expectedCount=72,rate=4)=>assessFirstMotion({rate,expectedCount,actualFirstMotionMs:{count:72,p95,max}});
assert.equal(evaluateFrameAcceptance(fullyVerified).performance.status,'not_verified','The old route-only metric cannot satisfy first motion');
assert.equal(firstMotion(50,80).checks.p95,false);
assert.equal(firstMotion(40,100).checks.max,false);
assert.equal(firstMotion(40,80,73).status,'not_verified','Unobserved starts cannot count as fast starts');
assert.equal(firstMotion(40,100,73).status,'failed','One confirmed late start still breaches the maximum');
assert.equal(firstMotion(40,80,72,1).status,'not_verified','The 50 ms p95 target is scoped to ×4');
performance.firstMotion=firstMotion(44.7,55.2);
assert.equal(evaluateFrameAcceptance(fullyVerified).releaseReady,true,'The contract must be closable with separate positive evidence, not hard-coded false');
for(const gate of ['fullMissionVerified','absoluteSafetyVerified']){
 const blocked=evaluateFrameAcceptance({...fullyVerified,[gate]:false});
 assert.equal(blocked.performance.measurementStatus,'passed');assert.equal(blocked.performance.status,'blocked');assert.equal(blocked.releaseReady,false);
}
const framePolicy=(p99,over50=0)=>compareWallClock(baseline,{...after,over50,frameMs:{...after.frameMs,p99}}).performance;
assert.equal(framePolicy(33).frameP99.targetMet,false);
assert.equal(compareWallClock(baseline,{...after,frameMs:{count:0,p99:0}}).performance.frameP99.targetMet,null);
assert.equal(framePolicy(20).frameP99.targetMet,true);assert.equal(framePolicy(20).frameP99.preferredMet,false);
assert.equal(framePolicy(19.9,1).freezes.investigationRequired.after,true);
performance.freezes.after=1;
assert.equal(evaluateFrameAcceptance(fullyVerified).performance.status,'not_verified','A remaining >50 ms frame needs investigation even when the count is halved');
assert.equal(evaluateFrameAcceptance({...fullyVerified,longFramesInvestigated:true}).releaseReady,true);
performance.freezes.after=0;
const tickSeries=values=>evaluateFrameAcceptance({...fullyVerified,ordinaryCombatTickMaxMs:values});
const alerts=values=>tickSeries(values).diagnostics.tickMax.alerts;
assert.deepEqual(alerts([]),{persistentOver100:null,risingAcrossPatches:null});
assert.equal(alerts([100,101]).persistentOver100,false);
assert.equal(alerts([101,102]).persistentOver100,true);
assert.equal(alerts([80,85,90]).risingAcrossPatches,true);
assert.equal(alerts([80,85,85]).risingAcrossPatches,false);
assert.equal(tickSeries([99,101,102]).releaseReady,true,'Tick alerts are diagnostic');
const folder='campaign/reports/frame-budget/acceptance-contract-2026-11-10';fs.mkdirSync(folder,{recursive:true});
report.evidence={root,causality:'causality.json',oracle:'focused-checks.json',sources:'source-verification.json',wallClock:'combat-final',render:'render-comparison.json'};
const motionRoot='campaign/reports/frame-budget/minimal-command-latency/';
const motionAnalysis=JSON.parse(fs.readFileSync(motionRoot+'analysis.json'));
const motionSchedule=JSON.parse(fs.readFileSync(motionRoot+'schedule.json'));
report.referenceOnly={scope:'Frozen M01. M02 requires separate evidence.',source:motionRoot+'analysis.json',
 firstMotion:assessFirstMotion({rate:motionSchedule.rate,expectedCount:motionAnalysis.unitObservations,actualFirstMotionMs:motionAnalysis.actualFirstMotionMs})};
fs.writeFileSync(folder+'/acceptance-v3.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:true,equivalence:report.equivalence.status,absoluteSafety:report.absoluteSafety.status,performance:report.performance.status,
 mission:report.mission.status,releaseReady:report.releaseReady,referenceOnly:report.referenceOnly,tickAlerts:report.diagnostics.tickMax.alerts}));
