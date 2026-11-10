import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {distribution} from '../campaign/performance.js';
import {compareWallClock} from './frame-acceptance-contract.mjs';
import {alignFrameTrace} from './frame-trace-alignment.mjs';
const folder=process.argv[2]??'campaign/reports/frame-budget/safety-fix/combat';
const summary=[];
for(const variant of ['baseline','after']){
 const file=path.join(folder,variant+'.json');if(!fs.existsSync(file))continue;
 const raw=JSON.parse(fs.readFileSync(file)),p=raw.perf,profile=JSON.parse(fs.readFileSync(path.join(folder,variant+'.cpuprofile')));
 const trace=JSON.parse(fs.readFileSync(path.join(folder,variant+'.trace.json')));
 // The raw trace also contains CDP export/serialization after perf.stop().
 // Match each recorded game callback against its trace FunctionCall. Reject
 // uncertain alignment instead of assigning that export pause to the game.
 const callbacks=trace.traceEvents.filter(e=>e.ph==='X'&&e.name==='FunctionCall'&&e.args?.data?.functionName==='frame'&&e.args.data.url.endsWith('/campaign/main.js'));
 const {main,offset,spread,...alignmentProof}=alignFrameTrace(callbacks,p.frames);
 const gameStart=main[0].ts,gameEnd=main.at(-1).ts+main.at(-1).dur;
 const nodes=new Map(profile.nodes.map(n=>[n.id,n])),parents=new Map(),self=new Map(),sampled=[];
 for(const n of nodes.values())for(const id of n.children??[])parents.set(id,n.id);
 const label=id=>{const f=nodes.get(id).callFrame;return `${f.functionName||'(anonymous)'} @ ${f.url.split('/').at(-1)||'browser'}:${f.lineNumber+1}`;};
 const stack=id=>{const out=[];while(nodes.has(id)){out.push(label(id));id=parents.get(id);}return out.reverse();};
 let sampledAt=profile.startTime;
 for(let i=0;i<profile.samples.length;i++){
  sampledAt+=profile.timeDeltas[i];if(sampledAt<gameStart||sampledAt>gameEnd)continue;
  const id=profile.samples[i],key=label(id),row=self.get(key)??{frame:key,samples:0,ms:0,stack:stack(id)};
  sampled.push({at:sampledAt,id,ms:profile.timeDeltas[i]/1000});
  row.samples++;row.ms+=profile.timeDeltas[i]/1000;self.set(key,row);
 }
 const topSelf=[...self.values()].sort((a,b)=>b.ms-a.ms),traceEvents={};
 const complete=trace.traceEvents.filter(e=>e.ph==='X'&&e.dur&&e.ts>=gameStart&&e.ts<gameEnd).sort((a,b)=>a.ts-b.ts||b.dur-a.dur),stacks=new Map(),layouts=[];
 for(const e of complete){
  if(['Layout','UpdateLayoutTree','MinorGC','MajorGC','FireAnimationFrame'].includes(e.name)){
   const r=traceEvents[e.name]??={count:0,totalMs:0,maxMs:0,over50:0};r.count++;r.totalMs+=e.dur/1000;r.maxMs=Math.max(r.maxMs,e.dur/1000);if(e.dur>50000)r.over50++;
  }
  const key=e.pid+':'+e.tid,s=stacks.get(key)??[];stacks.set(key,s);while(s.length&&s.at(-1).ts+s.at(-1).dur<=e.ts)s.pop();
  if(e.name==='Layout'){const caller=s.findLast(v=>v.name==='FunctionCall');if(caller){caller.layouts=(caller.layouts??0)+1;layouts.push({ms:e.dur/1000,caller:caller.args?.data,multiple:caller.layouts>1});}}
  s.push(e);
 }
 const callbackByStart=new Map(p.frames.map((f,i)=>[f.start,main[i]]));
 const worst=p.worstFrames.map(f=>{
  const call=callbackByStart.get(f.start),used=new Map();
  for(const s of sampled)if(s.at>=call.ts&&s.at<call.ts+call.dur)used.set(s.id,(used.get(s.id)??0)+s.ms);
  const gc=complete.filter(e=>['MinorGC','MajorGC'].includes(e.name)&&e.ts>=call.ts&&e.ts<call.ts+call.dur).map(e=>({name:e.name,ms:e.dur/1000}));
  return {...f,traceSpan:{start:call.ts,ms:call.dur/1000},gc,cpuSamples:[...used].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([id,ms])=>({ms,stack:stack(id)})),
   dominantStage:Object.entries(f.stages).filter(([n])=>n!=='world').sort((a,b)=>b[1]-a[1])[0],
   cause:gc.some(e=>e.ms>4)?'GC occurs in this callback; see trace duration and sampled stacks':f.cpuMs>33?'CPU: inspect stage timings and attached slow-call stacks':f.interval>33?'Gap outside measured CPU. GPU/scheduler attribution not established by stage timers.':'No >33 ms frame'};
 });
 const snapshot=p.stages['traffic snapshot']??p.stages.snapshot;
 const out={variant,frameMs:p.frameMs,cpuMs:p.cpuMs,over33:p.over33,over50:p.over50,longTasks:p.longTasks,stages:p.stages,snapshot,
  drawCalls:p.drawCalls,triangles:p.triangles,renderScale:p.renderScale,gpuMs:raw.gpuMs,traceEvents,
  alignment:{method:'Unique contiguous callback sequence; every recorded CPU interval fits inside its FunctionCall with one common clock offset',...alignmentProof,callbacks:main.length,offsetMs:offset,spreadMs:spread,gameStart,gameEnd,
   excludedAfterGame:trace.traceEvents.filter(e=>e.ph==='X'&&e.name==='FireAnimationFrame'&&e.dur>50000&&e.ts>=gameEnd).map(e=>({start:e.ts,ms:e.dur/1000,reason:'Test callback after renderSuspended/perf.stop; report construction and export'}))},
  layoutAudit:{layoutsInsideScript:layouts.length,repeatedLayouts:layouts.filter(l=>l.multiple).length,examples:layouts.slice(0,10)},
  cpuSampling:'1 ms nominal sampling; aggregate sampled time in the matched gameplay window, not exact call duration.',topSelf:topSelf.slice(0,80),worstFrames:worst,
  tickStepSeconds:distribution(raw.contactAudit.rows.slice(1).map((r,i)=>r.time-raw.contactAudit.rows[i].time)),
  safety:{completedTicks:raw.contactAudit.completedTicks,expectedTicks:raw.contactAudit.expectedTicks,emergencyStops:raw.emergencyStops,
   ellipsePenetrations:raw.contactAudit.ellipsePenetrations,bodyPenetrations:raw.contactAudit.bodyPenetrations,requiredBodyPenetrations:raw.contactAudit.requiredBodyPenetrations,
   minGap:raw.contactAudit.minGap,minBodyGap:raw.contactAudit.minBodyGap,minRequiredGap:raw.contactAudit.minRequiredGap,
   preTickMismatches:raw.preTickMismatches,postTickPoseLagFrames:raw.postTickPoseLagFrames,telemetryMismatches:raw.telemetryMismatches,combatHits:raw.combatHits,alive:raw.alive,arrived:raw.arrived,simSeconds:raw.simSeconds},
  instrumentation:{captureMs:raw.contactAudit.captureMs,auditMs:raw.contactAudit.auditDistribution,geometryOutsideSimulationDeadline:true}};
 fs.writeFileSync(path.join(folder,variant+'-analysis.json'),JSON.stringify(out,null,2));
 summary.push({variant,frameMs:out.frameMs,over50:out.over50,longTasks:out.longTasks.length,stages:out.stages,safety:out.safety,topSelf:topSelf.filter(r=>!r.frame.includes('browser:')).slice(0,6),traceEvents});
}
if(summary.length===2){
 const comparison=compareWallClock(summary[0],summary[1]);
 fs.writeFileSync(path.join(folder,'comparison.json'),JSON.stringify(comparison,null,2));
}
console.log(JSON.stringify(summary,null,2));
