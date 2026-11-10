import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {distribution} from '../campaign/performance.js';
const folder=process.argv[2]??'campaign/reports/frame-budget/minimal-command-latency';
const schedule=JSON.parse(fs.readFileSync(path.join(folder,'schedule.json'))),rows=[],runs=[];
const stats=(xs,k)=>distribution(xs.map(x=>x[k]).filter(Number.isFinite));
const delta=(end,start)=>end===null||start===null?null:end-start;
for(const index of schedule.completed){
 const raw=JSON.parse(fs.readFileSync(path.join(folder,`run-${index}/minimal.json`)));
 assert.equal(raw.conditions.perfEnabled,false);assert.equal(raw.conditions.scale,1);assert.equal(raw.warmup.frames,300);assert.equal(raw.warmup.simStart,raw.warmup.simEnd);
 const commands=[];
 for(const g of raw.minimal.groups)for(const r of g.rows){
  assert.equal(r.revision,g.revision);assert.equal(g.result.reused,undefined,'Reused commands require a different receipt baseline');
  const row={run:index,revision:g.revision,id:r.id,status:r.status,atomic:g.atomic,cohorts:g.cohorts,preservesAccepted:g.preservesAccepted,
   receivedAt:g.receivedAt,...r,actualFirstMotionMs:delta(r.firstMotionAt,g.receivedAt),intentThresholdMs:delta(r.intentThresholdAt,g.receivedAt),historicalRouteThresholdMs:delta(r.routeThresholdAt,g.receivedAt),
   queuedMs:delta(g.queuedAt,g.receivedAt),plannerMs:delta(g.plannerAt,g.receivedAt),planMs:delta(r.planAt,g.receivedAt),readyMs:delta(r.readyAt,g.receivedAt),publishMs:delta(r.publishAt,g.receivedAt),controllerMs:delta(r.controllerAt,g.receivedAt),
   queueWaitMs:delta(r.planAt,g.plannerAt),routeWaitMs:delta(r.readyAt,r.planAt),publicationWaitMs:delta(r.publishAt,r.readyAt),controllerWaitMs:delta(r.controllerAt,r.publishAt)};
  // Pending-intent first movement is allowed to precede search/publication.
  for(const k of ['actualFirstMotionMs','historicalRouteThresholdMs','queueWaitMs','routeWaitMs','publicationWaitMs','controllerWaitMs'])assert(row[k]===null||row[k]>=-.11,`${index} ${r.id} ${k}`);
  commands.push(row);rows.push(row);
 }
 const intervals=raw.frameTimes.slice(1).map((t,i)=>t-raw.frameTimes[i]),raf=raw.rafTimes.slice(1).map((t,i)=>t-raw.rafTimes[i]);
 const result={run:index,frameCount:raw.frameTimes.length,rafIntervalMs:distribution(raf),afterFrameIntervalMs:distribution(intervals),clockReads:raw.minimal.clockReads,groups:raw.minimal.groups.length,units:commands.length,
  actualFirstMotionMs:stats(commands,'actualFirstMotionMs'),historicalRouteThresholdMs:stats(commands,'historicalRouteThresholdMs'),intentThresholdMs:stats(commands,'intentThresholdMs'),
  pendingIntentStarts:commands.filter(c=>c.firstMotionMode==='intent').length,routeStarts:commands.filter(c=>c.firstMotionMode==='route').length,unobservedActualStarts:commands.filter(c=>c.actualFirstMotionMs===null).length,
  alive:raw.alive,arrived:raw.arrived,simSeconds:raw.simSeconds,emergencyStops:raw.emergencyStops,commands};runs.push(result);
}
const tail=rows.filter(r=>r.historicalRouteThresholdMs>=400),actualTail=rows.filter(r=>r.actualFirstMotionMs>=400);
const output={releaseReady:false,performanceChange:false,completed:schedule.completed.length,planned:schedule.runs,conditions:schedule.mode,unitObservations:rows.length,groupOrders:runs.reduce((n,r)=>n+r.groups,0),
 definitions:{actual:'first nonzero physical displacement executed by the new pending steering revision OR its published route; excludes the preceding route',historical:'first >=0.1 displacement after pendingOrder removal; it can omit already ongoing new-command movement',statistics:'Rows within a group share inputs and are correlated. Per-run 12-unit p95 is the maximum, not a stable tail estimate.',frame:'rAF intervals and post-game-callback observations; not the old perf callback-entry interval. No CPU stage, longtask, contact audit or tick-wall measurement in minimal runs.',overhead:'No monkey-patches/profiler, but source branches and timestamp reads still have nonzero cost. No claim that observation is perfectly inert.'},
 actualFirstMotionMs:stats(rows,'actualFirstMotionMs'),historicalRouteThresholdMs:stats(rows,'historicalRouteThresholdMs'),pendingIntentStarts:rows.filter(r=>r.firstMotionMode==='intent').length,routeStarts:rows.filter(r=>r.firstMotionMode==='route').length,
 historicalTail400:tail,actualTail400:actualTail,runs,
 worstActual:rows.filter(r=>r.actualFirstMotionMs!==null).toSorted((a,b)=>b.actualFirstMotionMs-a.actualFirstMotionMs).slice(0,10),
 worstHistorical:rows.filter(r=>r.historicalRouteThresholdMs!==null).toSorted((a,b)=>b.historicalRouteThresholdMs-a.historicalRouteThresholdMs).slice(0,10)};
output.sameClockBinAs0p1=rows.filter(r=>Math.abs((r.firstMotionMode==='intent'?r.intentThresholdAt:r.routeThresholdAt)-r.firstMotionAt)<=.11).length;
const traceEvents=[];
for(const [i,r] of rows.entries()){
 const pid=r.run,tid=i+1;traceEvents.push({ph:'M',name:'thread_name',pid,tid,args:{name:`order ${r.revision} / ${r.id}`}});
 const points=[['submit',0],['queued',r.queuedMs],['planner start',r.plannerMs],['unit queue exit',r.planMs],['route ready',r.readyMs],['publish',r.publishMs],['accepted controller',r.controllerMs],['historical route motion',r.historicalRouteThresholdMs]];
 for(let j=1;j<points.length;j++){const [name,end]=points[j],[from,start]=points[j-1];if(end!==null&&start!==null)traceEvents.push({ph:'X',cat:'wall latency, NOT CPU',name:`${from} → ${name}`,ts:start*1000,dur:Math.max(0,end-start)*1000,pid,tid});}
 if(r.actualFirstMotionMs!==null)traceEvents.push({ph:'i',s:'t',cat:'physical movement',name:`FIRST MOTION (${r.firstMotionMode})`,ts:r.actualFirstMotionMs*1000,pid,tid,args:{absoluteAt:r.firstMotionAt,revision:r.revision,thresholdSameTimestamp:Math.abs((r.firstMotionMode==='intent'?r.intentThresholdAt:r.routeThresholdAt)-r.firstMotionAt)<=.11}});
}
fs.writeFileSync(path.join(folder,'command-timeline.trace.json'),JSON.stringify({displayTimeUnit:'ms',note:'Each command rebased to submit=0. Spans are wall latency, NOT CPU execution. First motion may precede route publication.',traceEvents}));
fs.writeFileSync(path.join(folder,'analysis.json'),JSON.stringify(output,null,2));
console.log(JSON.stringify({completed:output.completed,groups:output.groupOrders,actual:output.actualFirstMotionMs,historical:output.historicalRouteThresholdMs,pendingIntentStarts:output.pendingIntentStarts,routeStarts:output.routeStarts,tail400:tail.length,actualTail400:actualTail.length,runs:runs.map(({commands,...r})=>r)},null,2));
