import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {distribution} from '../campaign/performance.js';
const folder=process.argv[2]??'campaign/reports/frame-budget/command-latency';
const schedule=JSON.parse(fs.readFileSync(path.join(folder,'schedule.json')));
const stats=(rows,key)=>distribution(rows.map(r=>r[key]).filter(Number.isFinite));
const sum=(rows,key)=>rows.reduce((n,r)=>n+(r[key]??0),0);
const overlap=(a,b)=>Math.max(0,Math.min(a.end,b.end)-Math.max(a.start,b.start));
const names=['submission','dispatch','groupQueue','route','publication','controller','motion'];
const definitions={
 submission:'received → submitOrder returned',dispatch:'submit returned → CommandPlanner.start',groupQueue:'planner start → this unit planning starts',
 route:'unit planning starts → final path ready before publication (includes cooperative waits)',publication:'path ready → live activateCommand',
 controller:'live publication → first accepted-revision controller with commandStartAfter expired',motion:'eligible controller → accumulated 0.1 displacement in its accepted revision',
 queryCpu:'sum of actual findPathSteps iterator.next durations; cooperative gaps excluded',
 tickGap:'wall minus beginTick/continueTick work. Planning intersections are exact; remaining gap includes audit/render/UI, other work and rAF wait.',
 caveat:'Diagnostic observer changes wall-clock budgets. No performance improvement or safety conclusion; one control does not estimate observer overhead causally.',
};
const results=[],commands=[];
for(const run of schedule.runs){
 assert.equal(run.exitCode,0,run.name);
 const raw=JSON.parse(fs.readFileSync(path.join(folder,run.name,'baseline.json'))),detail=raw.commandTimeline;
 assert(raw.conditions.allFramesVerified);assert.equal(raw.conditions.scale,1);assert.equal(raw.conditions.warmupFrames,300);
 const result={name:run.name,diagnostic:run.timeline,frames:raw.perf.frameMs,frameCount:raw.perf.frames.length,over33:raw.perf.over33,over50:raw.perf.over50,longTasks:raw.perf.longTasks.length,
  tickWallMs:stats(raw.latency.ticks,'completionWallMs'),tickWorkMs:stats(raw.latency.ticks,'workMs'),commandToMotionMs:stats(raw.latency.commands,'commandToMotionMs'),conditions:raw.conditions,
  alive:raw.alive,arrived:raw.arrived,combatHits:raw.combatHits,simSeconds:raw.simSeconds,contactsAreNotSafetyVerdict:raw.contactAudit.requiredBodyPenetrations,emergencyStops:raw.emergencyStops};
 if(!detail){results.push(result);continue;}
 assert.equal(detail.ticks.length,raw.latency.ticks.length,'Detailed and independent tick coverage');
 for(const baseline of raw.latency.commands){
  const ev=detail.events.filter(e=>e.revision===baseline.revision&&e.id===baseline.id),first=type=>ev.find(e=>e.type===type)?.at;
  const published=first('published'),ready=ev.filter(e=>e.type==='path-ready'&&e.found&&e.at<=published).at(-1)?.at;
  const start=first('received'),times={received:start,submitted:first('submitted'),planner:first('planner-start'),unit:first('unit-plan-start'),ready,published,eligible:first('controller-eligible'),firstDisplacement:first('first-displacement'),motion:first('motion-0.1')};
  const row={run:run.name,id:baseline.id,revision:baseline.revision,status:baseline.status,times,events:ev};
  assert.equal(baseline.status,'moved','Do not silently drop censored commands');
  for(const [k,v] of Object.entries(times))assert(Number.isFinite(v),`Missing ${k}: ${JSON.stringify(row)}`);
  const milestones=['received','submitted','planner','unit','ready','published','eligible','motion'];
  for(let i=1;i<milestones.length;i++){const delta=times[milestones[i]]-times[milestones[i-1]];assert(delta>=-.001,`Out-of-order timeline: ${JSON.stringify(row)}`);row[names[i-1]]=delta;}
  row.total=times.motion-start;row.firstMotion=times.firstDisplacement-start;
  assert(Math.abs(row.total-baseline.commandToMotionMs)<1,'Independent motion clocks must agree within observer cost');
  const queries=detail.searches.filter(s=>s.revision===row.revision&&s.unit===row.id&&s.start>=times.unit&&s.start<=ready);
  row.queryCount=queries.length;row.queryCpu=sum(queries,'cpuMs');row.queryMax=queries.length?Math.max(...queries.flatMap(q=>q.parts.map(p=>p.end-p.start))):0;
  row.queryIds=queries.map(q=>q.id);row.routeNonQueryWall=row.route-row.queryCpu;
  row.routePlanningCpu=detail.planning.filter(p=>p.name==='command').reduce((n,p)=>n+overlap(p,{start:times.unit,end:ready}),0);
  row.routeOtherCpu=row.routePlanningCpu-row.queryCpu;row.routeBetweenPlanningCalls=row.route-row.routePlanningCpu;
  row.groupQueuePlanningCpu=detail.planning.filter(p=>p.name==='command').reduce((n,p)=>n+overlap(p,{start:times.planner,end:times.unit}),0);
  const calls=detail.planning.filter(p=>p.name==='command');
  row.groupQueueEarlierPublicationWait=0;
  for(let i=0;i<calls.length-1;i++)if(calls[i].waitingTick&&calls[i].revision===row.revision)
   row.groupQueueEarlierPublicationWait+=overlap({start:calls[i].end,end:calls[i+1].start},{start:times.planner,end:times.unit});
  const gate=ev.find(e=>e.type==='publication-gate');row.snapshotGate=gate?.commandStartAfter!==null;
  commands.push(row);
 }
 const ordered=detail.ticks.toSorted((a,b)=>b.wallMs-a.wallMs);
 result.tickCount=ordered.length;result.tickGapMs=stats(ordered,'gapMs');result.observer=detail.observer;
 result.longTicks=ordered.filter(t=>t.wallMs>50).length;
 result.worstTicks=ordered.slice(0,10).map(t=>{
  const gaps=t.parts.slice(1).map((p,i)=>({start:t.parts[i].end,end:p.start}));
  const queryParts=detail.searches.flatMap(q=>q.parts.filter(p=>p.tick===t.id).map(p=>({...p,query:q.id,parent:q.parent,unit:q.unit,revision:q.revision,insideTickWorkMs:t.parts.reduce((n,b)=>n+overlap(p,b),0)})));
  const gapPlanning=gaps.reduce((n,g)=>n+detail.planning.reduce((s,p)=>s+overlap(g,p),0),0);
  return {...t,queryCpuInsideTickWorkMs:sum(queryParts,'insideTickWorkMs'),queryParts,gapPlanningMs:gapPlanning,gapOtherMs:t.gapMs-gapPlanning,
   maxContinuousMs:Math.max(...t.parts.map(p=>p.end-p.start)),gaps,slow:t.slow.toSorted((a,b)=>b.ms-a.ms).slice(0,15)};
 });
 result.longTickAggregate={count:ordered.filter(t=>t.wallMs>50).length,wallMs:sum(ordered.filter(t=>t.wallMs>50),'wallMs'),workMs:sum(ordered.filter(t=>t.wallMs>50),'workMs'),gapMs:sum(ordered.filter(t=>t.wallMs>50),'gapMs')};
 result.searches={count:detail.searches.length,cpuMs:stats(detail.searches,'cpuMs'),totalCpuMs:sum(detail.searches,'cpuMs'),worst:detail.searches.toSorted((a,b)=>b.cpuMs-a.cpuMs).slice(0,10)};
 results.push(result);
}
const groups=[];
for(const run of results.filter(r=>r.diagnostic))for(const revision of new Set(commands.filter(c=>c.run===run.name).map(c=>c.revision))){
 const rows=commands.filter(c=>c.run===run.name&&c.revision===revision);
 groups.push({run:run.name,revision,units:rows.length,firstMotionMs:Math.min(...rows.map(c=>c.total)),lastMotionMs:Math.max(...rows.map(c=>c.total)),firstDisplacementMs:Math.min(...rows.map(c=>c.firstMotion))});
}
const stages=Object.fromEntries(names.map(name=>[name,{...stats(commands,name),totalMs:sum(commands,name),nonzero:commands.filter(c=>c[name]>.1).length}]));
const output={diagnosticOnly:true,releaseReady:false,definitions,results,groups,unitObservations:commands.length,independentOrderGroups:groups.length,stages,
 ranking:Object.entries(stages).toSorted((a,b)=>b[1].totalMs-a[1].totalMs).map(([stage,metrics])=>({stage,...metrics})),commandToMotionMs:stats(commands,'total'),queryCpuMs:stats(commands,'queryCpu'),routeBreakdown:Object.fromEntries(['routePlanningCpu','routeOtherCpu','routeBetweenPlanningCalls','groupQueuePlanningCpu','groupQueueEarlierPublicationWait'].map(k=>[k,stats(commands,k)])),commands};
output.limitations=[
 '36 unit observations come from six group orders, not 36 independent commands. Stage totals are summed per-unit latency, NOT elapsed CPU; shared waits are counted for each affected unit.',
 'Control command maximum 479 ms is retained. Its old probe records first accepted controller at 457.3 ms; no detailed phase hooks ran in control, so its earlier tail cannot be assigned to a particular phase.',
 'Detailed observer has clocks, allocations and generator wrappers. It can change work completed under wall-clock budgets. Control vs diagnostic is NOT an optimization comparison or a safety gate.',
 'Detailed tick category CPU is inclusive and some categories include planning during gaps. queryCpuInsideTickWorkMs explicitly intersects search slices with beginTick/continueTick intervals.',
 'One snapshot of 4.0 ms was measured in run-3; other runs have no snapshot timing sample. This neither meets <3 ms nor supplies phase attribution.',
 'No >33 or >50 ms frames or long tasks reproduced in these four runs. Existing rare-freeze observations and full mission remain open.',
 'Frozen M01 baseline only. No evidence about current concurrent M02 changes; production gameplay files were not edited in this task.',
 'Existing body intersections remain observed. Fixed-budget observer equivalence is not proof that the original game is collision-safe. check-damage and old open suites were not rerun or marked green.',
];
fs.writeFileSync(path.join(folder,'timeline-analysis.json'),JSON.stringify(output,null,2));
console.log(JSON.stringify({results:results.map(({worstTicks,searches,...r})=>r),groups,ranking:output.ranking},null,2));
