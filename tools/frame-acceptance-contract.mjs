// Three independent questions. A wall-clock budget changes how much work fits
// in an advance; one unmatched battle pair is not a causal regression test.
export const CONTRACT_VERSION=2;
const taskCount=x=>Array.isArray(x)?x.length:x;
const status=checks=>Object.values(checks).some(x=>x===false)?'failed':Object.keys(checks).length&&Object.values(checks).every(x=>x===true)?'passed':'not_verified';
export function compareWallClock(before,after){
 const a=before.safety??before,b=after.safety??after;
 const paired=key=>({baseline:a[key],after:b[key]});
 return {
  contractVersion:CONTRACT_VERSION,budgetModel:'wall-clock',role:'observations and frame performance; not a paired safety gate',
  safetyGate:false,causalRegressionVerdict:'not_identified_by_this_pair',
  observations:Object.fromEntries(['emergencyStops','alive','arrived','simSeconds','ellipsePenetrations','bodyPenetrations','requiredBodyPenetrations','minRequiredGap'].map(k=>[k,paired(k)])),
  performance:{
   frameP99:{baseline:before.frameMs.p99,after:after.frameMs.p99,targetMs:33,targetMet:after.frameMs.p99<33,improvementDemonstrated:after.frameMs.p99<before.frameMs.p99?null:false},
   // A single smaller number is not proof of improvement either.
   frameImprovementMethod:'A paired value alone does not establish a reproducible improvement.',
   freezes:{baseline:before.over50,after:after.over50,halved:before.over50>0?after.over50<=before.over50/2:null,reason:before.over50===0?'No baseline >50 ms frames reproduced':null},
   longTasks:{baseline:taskCount(before.longTasks),after:taskCount(after.longTasks),targetMet:taskCount(after.longTasks)===0},
   snapshot:{...(after.stages.snapshot??{}),targetMs:3,targetMet:after.stages.snapshot?after.stages.snapshot.max<3:null},
   fog:{...(after.stages['fog update']??{}),targetP95Ms:4,targetMet:after.stages['fog update']?after.stages['fog update'].p95<4:null},
   ui:{...(after.stages.ui??{}),targetP95Ms:2,targetMet:after.stages.ui?after.stages.ui.p95<2:null}
  }
 };
}
export function evaluateFrameAcceptance({scope,equivalenceChecks,wallClock,renderChecks={},knownFailures=[],fullMissionVerified=false,absoluteSafetyVerified=false,functionalVerified=false}){
 const equivalence={scope,status:status(equivalenceChecks),checks:equivalenceChecks,
  reopenOnlyFor:['changed inputs or implementation in this scope','oracle/hash mismatch','new deterministic counterexample'],
  wallClockDifferencesReopen:false};
 const observed=wallClock.observations.requiredBodyPenetrations;
 const absoluteSafety={status:absoluteSafetyVerified?'passed':observed?.baseline>0?'known_existing_defect':observed?.after>0?'observed_defect':'not_proven',
  existingDefect:'Full-body penetration / offscreen pass-through and recovery',baselinePairTicks:observed?.baseline,afterPairTicks:observed?.after,
  regressionAttribution:wallClock.causalRegressionVerdict,scopeDecisionIndependent:true};
 const p=wallClock.performance;
 const performanceChecks={frameP99:p.frameP99.targetMet,snapshot:p.snapshot.targetMet,fog:p.fog.targetMet,ui:p.ui.targetMet,
  noLongTasks:p.longTasks.targetMet,freezesHalved:p.freezes.halved,p99Improvement:p.frameP99.improvementDemonstrated,...renderChecks};
 const performance={status:status(performanceChecks),checks:performanceChecks,measurements:p};
 const mission={status:fullMissionVerified?'passed':'not_verified',battleFixtureArrivalsAreNotMissionCompletion:true};
 const functional={status:knownFailures.length?'unresolved':functionalVerified?'passed':'not_verified',knownFailures};
 const releaseReady=[equivalence,absoluteSafety,performance,mission,functional].every(gate=>gate.status==='passed');
 return {contractVersion:CONTRACT_VERSION,planningDecision:'Keep production wall-clock budgets. Operation quotas require a separate gameplay/architecture change.',
  equivalence,absoluteSafety,performance,mission,functional,wallClock,
  releaseReady,releaseReason:releaseReady?'All independent gates verified':'Scoped equivalence does not close absolute safety, full mission, functional failures or performance targets.'};
}
