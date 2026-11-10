import fs from 'node:fs';
import assert from 'node:assert/strict';
import {compareWallClock,evaluateFrameAcceptance} from './frame-acceptance-contract.mjs';
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
const report=evaluateFrameAcceptance(args);
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
assert.equal(evaluateFrameAcceptance(fullyVerified).releaseReady,true,'The contract must be closable with separate positive evidence, not hard-coded false');
const folder='campaign/reports/frame-budget/acceptance-contract-2026-11-10';fs.mkdirSync(folder,{recursive:true});
report.evidence={root,causality:'causality.json',oracle:'focused-checks.json',sources:'source-verification.json',wallClock:'combat-final',render:'render-comparison.json'};
fs.writeFileSync(folder+'/acceptance.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:true,equivalence:report.equivalence.status,absoluteSafety:report.absoluteSafety.status,performance:report.performance.status,mission:report.mission.status,releaseReady:report.releaseReady}));
