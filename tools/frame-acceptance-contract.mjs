// Three independent questions. A wall-clock budget changes how much work fits
// in an advance; one unmatched battle pair is not a causal regression test.
export const CONTRACT_VERSION=3;
const FRAME_P99_LIMIT_MS=33;
const PREFERRED_FRAME_P99_MS=20;
const LONG_FRAME_MS=50;
const ORDINARY_TICK_ALERT_MS=100;
const FIRST_MOTION_TARGETS={targetRate:4,p95LimitMs:50,maxLimitMs:100};
const taskCount=x=>Array.isArray(x)?x.length:x;
const status=checks=>Object.values(checks).some(x=>x===false)?'failed':Object.keys(checks).length&&Object.values(checks).every(x=>x===true)?'passed':'not_verified';
const isDuration=ms=>Number.isFinite(ms)&&ms>=0;

export function assessFirstMotion(evidence){
 const {rate,actualFirstMotionMs,expectedCount}=evidence??{};
 const {count=0,p95,max}=actualFirstMotionMs??{};
 const {targetRate,p95LimitMs,maxLimitMs}=FIRST_MOTION_TARGETS;
 const observed=rate===targetRate&&Number.isInteger(count)&&count>0&&isDuration(p95)&&isDuration(max)&&p95<=max;
 const complete=observed&&count===expectedCount;
 const checks={p95:complete?p95<p95LimitMs:null,max:observed&&max>=maxLimitMs?false:complete?true:null};
 return {rate:rate??null,expectedCount:expectedCount??null,count,p95:p95??null,max:max??null,
  ...FIRST_MOTION_TARGETS,status:status(checks),checks,
  metric:'First physical displacement owned by the submitted revision, including pending intent.'};
}

function tickDiagnostics(pair,history){
 if(!Array.isArray(history)||!history.every(isDuration))throw new Error('Expected comparable ordinary-combat tick maxima in milliseconds');
 const last=history.at(-1),previous=history.at(-2),earlier=history.at(-3);
 return {...pair,role:'diagnostic',ordinaryCombatHistoryMs:history,thresholdMs:ORDINARY_TICK_ALERT_MS,
  alerts:{persistentOver100:history.length>=2?previous>ORDINARY_TICK_ALERT_MS&&last>ORDINARY_TICK_ALERT_MS:null,
   risingAcrossPatches:history.length>=3?earlier<previous&&previous<last:null},
  historyRequirements:'Chronological, comparable ordinary-combat runs only. Keep mission, fixture, rate, render scale, warmup, instrumentation and hardware fixed. Use different patch revisions for a growth trend.'};
}

export function compareWallClock(before,after){
 const a=before.safety??before,b=after.safety??after;
 const paired=key=>({baseline:a[key],after:b[key]});
 const frameP99=after.frameMs.p99;
 const hasFrameP99=after.frameMs.count!==0&&isDuration(frameP99);
 return {
  contractVersion:CONTRACT_VERSION,budgetModel:'wall-clock',role:'observations and frame performance; not a paired safety gate',
  safetyGate:false,causalRegressionVerdict:'not_identified_by_this_pair',
  observations:Object.fromEntries(['emergencyStops','alive','arrived','simSeconds','ellipsePenetrations','bodyPenetrations','requiredBodyPenetrations','minRequiredGap'].map(k=>[k,paired(k)])),
  tickMax:{baselineMs:before.tickMaxMs??null,afterMs:after.tickMaxMs??null,role:'diagnostic'},
  performance:{
   frameP99:{baseline:before.frameMs.p99,after:frameP99,targetMs:FRAME_P99_LIMIT_MS,targetMet:hasFrameP99?frameP99<FRAME_P99_LIMIT_MS:null,
    preferredMs:PREFERRED_FRAME_P99_MS,preferredMet:hasFrameP99?frameP99<PREFERRED_FRAME_P99_MS:null,
    improvementDemonstrated:hasFrameP99&&before.frameMs.count!==0&&isDuration(before.frameMs.p99)&&frameP99>=before.frameMs.p99?false:null},
   firstMotion:assessFirstMotion(after.firstMotion),
   // A single smaller number is not proof of improvement either.
   frameImprovementMethod:'A paired value alone does not establish a reproducible improvement.',
   freezes:{thresholdMs:LONG_FRAME_MS,baseline:before.over50,after:after.over50,halved:before.over50>0?after.over50<=before.over50/2:null,
    investigationRequired:{baseline:before.over50>0,after:after.over50>0},reason:before.over50===0?'No baseline >50 ms frames reproduced':null},
   longTasks:{baseline:taskCount(before.longTasks),after:taskCount(after.longTasks),targetMet:taskCount(after.longTasks)===0},
   snapshot:{...(after.stages.snapshot??{}),targetMs:3,targetMet:after.stages.snapshot?after.stages.snapshot.max<3:null},
   fog:{...(after.stages['fog update']??{}),targetP95Ms:4,targetMet:after.stages['fog update']?after.stages['fog update'].p95<4:null},
   ui:{...(after.stages.ui??{}),targetP95Ms:2,targetMet:after.stages.ui?after.stages.ui.p95<2:null}
  }
 };
}
export function evaluateFrameAcceptance({scope,equivalenceChecks,wallClock,renderChecks={},knownFailures=[],fullMissionVerified=false,
 absoluteSafetyVerified=false,functionalVerified=false,longFramesInvestigated=false,ordinaryCombatTickMaxMs=[]}){
 const equivalence={scope,status:status(equivalenceChecks),checks:equivalenceChecks,
  reopenOnlyFor:['changed inputs or implementation in this scope','oracle/hash mismatch','new deterministic counterexample'],
  wallClockDifferencesReopen:false};
 const observed=wallClock.observations.requiredBodyPenetrations;
 const absoluteSafety={status:absoluteSafetyVerified?'passed':observed?.baseline>0?'known_existing_defect':observed?.after>0?'observed_defect':'not_proven',
  existingDefect:'Full-body penetration / offscreen pass-through and recovery',baselinePairTicks:observed?.baseline,afterPairTicks:observed?.after,
  regressionAttribution:wallClock.causalRegressionVerdict,scopeDecisionIndependent:true};
 const p=wallClock.performance;
 const mission={status:fullMissionVerified?'passed':'not_verified',battleFixtureArrivalsAreNotMissionCompletion:true};
 const functional={status:knownFailures.length?'unresolved':functionalVerified?'passed':'not_verified',knownFailures};
 const performanceChecks={...renderChecks,frameP99:p.frameP99.targetMet,snapshot:p.snapshot.targetMet,fog:p.fog.targetMet,ui:p.ui.targetMet,
  firstMotionP95:p.firstMotion?.checks?.p95??null,firstMotionMax:p.firstMotion?.checks?.max??null,
  noLongTasks:p.longTasks.targetMet,freezesHalved:p.freezes.halved,p99Improvement:p.frameP99.improvementDemonstrated,
  longFramesInvestigated:p.freezes.after===0||longFramesInvestigated===true?true:null};
 const measurementStatus=status(performanceChecks);
 const blockedBy=Object.entries({absoluteSafety,mission}).filter(([,gate])=>gate.status!=='passed').map(([name])=>name);
 const performance={status:measurementStatus==='passed'&&blockedBy.length?'blocked':measurementStatus,
  measurementStatus,blockedBy,checks:performanceChecks,measurements:p};
 const releaseReady=[equivalence,absoluteSafety,performance,mission,functional].every(gate=>gate.status==='passed');
 return {contractVersion:CONTRACT_VERSION,planningDecision:'Keep production wall-clock budgets. Operation quotas require a separate gameplay/architecture change.',
  equivalence,absoluteSafety,performance,mission,functional,wallClock,diagnostics:{tickMax:tickDiagnostics(wallClock.tickMax,ordinaryCombatTickMaxMs)},
  releaseReady,releaseReason:releaseReady?'All independent gates verified':'Scoped equivalence does not close absolute safety, full mission, functional failures or performance targets.'};
}
