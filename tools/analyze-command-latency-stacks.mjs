import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {alignFrameTrace} from './frame-trace-alignment.mjs';
const root=process.argv[2]??'campaign/reports/frame-budget/command-latency';
const selectionArg=process.argv.find(a=>a.startsWith('--outside-path='));
if(selectionArg){
 const selectionFile=selectionArg.slice('--outside-path='.length),selection=JSON.parse(fs.readFileSync(selectionFile));
 const output=process.argv.find(a=>a.startsWith('--output='))?.slice(9)??path.join(root,'outside-path.json');
 const sum=xs=>xs.reduce((s,x)=>s+x,0),length=xs=>sum(xs.map(x=>x.end-x.start));
 const intersect=(a,b)=>a.flatMap(x=>b.flatMap(y=>{const start=Math.max(x.start,y.start),end=Math.min(x.end,y.end);return end>start?[{start,end}]:[];}));
 const union=xs=>{const out=[];for(const x of xs.toSorted((a,b)=>a.start-b.start)){const last=out.at(-1);if(last&&x.start<=last.end)last.end=Math.max(last.end,x.end);else out.push({start:x.start,end:x.end});}return out;};
 const subtract=(a,b)=>{let out=a;for(const cut of union(b))out=out.flatMap(x=>cut.end<=x.start||cut.start>=x.end?[x]:[{start:x.start,end:Math.min(x.end,cut.start)},{start:Math.max(x.start,cut.end),end:x.end}].filter(x=>x.end>x.start));return out;};
 // Accounting checks: a nested child must not be added twice, and clipping
 // must retain a GC pause crossing a continuation boundary exactly once.
 assert.equal(length(union([{start:0,end:10},{start:2,end:4}])),10);
 assert.equal(length(intersect([{start:0,end:3},{start:6,end:10}],[{start:2,end:8}])),3);
 assert.equal(length(subtract([{start:0,end:10}],[{start:2,end:8},{start:4,end:6}])),4);
 const ticks=[],inputs=[];
 for(const run of [...new Set(selection.ticks.map(t=>t.run))]){
  const folder=path.join(root,run),files=['baseline.json','baseline.trace.json','baseline.cpuprofile'];
  const [raw,trace,profile]=files.map(file=>{const bytes=fs.readFileSync(path.join(folder,file));inputs.push({file:path.join(folder,file),sha256:createHash('sha256').update(bytes).digest('hex')});return JSON.parse(bytes);});
  const callbacks=trace.traceEvents.filter(e=>e.ph==='X'&&e.name==='FunctionCall'&&e.args?.data?.functionName==='frame'&&e.args.data.url.endsWith('/campaign/main.js'));
  const alignment=alignFrameTrace(callbacks,raw.perf.frames),offset=alignment.offset,thread=alignment.main[0];
  const ranges=es=>es.map(e=>({start:e.ts/1000-offset,end:(e.ts+e.dur)/1000-offset}));
  const events=trace.traceEvents.filter(e=>e.ph==='X'&&e.pid===thread.pid&&e.tid===thread.tid&&e.dur);
  const gc=union(ranges(events.filter(e=>/^(MinorGC|MajorGC|V8\.GC)/.test(e.name))));
  const gameCallbacks=union(ranges(alignment.main));
  const nodes=new Map(profile.nodes.map(n=>[n.id,n])),parents=new Map(),stacks=new Map();
  for(const n of nodes.values())for(const id of n.children??[])parents.set(id,n.id);
  for(const id of nodes.keys()){const frames=[];let at=id;while(nodes.has(at)){const f=nodes.get(at).callFrame;frames.push({fn:f.functionName,file:f.url.split('/').at(-1),line:f.lineNumber+1});at=parents.get(at);}stacks.set(id,frames);}
  const classify=s=>s.some(f=>f.fn==='vehiclePathSteps')?'path':s.some(f=>f.fn==='findPathSteps')?'other-path-closed':s.some(f=>/damage|extractDamage|updateProjectiles/i.test(f.fn))?'damage':s.some(f=>['vehicle-collision.js','vehicle-overlap.js','vehicle-impact.js'].includes(f.file))?'collision':s.some(f=>f.fn==='updateScavCombat')?'AI-controller':s.some(f=>f.fn==='updateUnitSteps')?'other-controller':'tick-other';
  const samples=[];let at=profile.startTime/1000-offset;
  for(let i=0;i<profile.samples.length;i++){const end=at+profile.timeDeltas[i]/1000;samples.push({start:at,end,id:profile.samples[i]});at=end;}
  for(const chosen of selection.ticks.filter(t=>t.run===run)){
   const t=raw.commandTimeline.ticks.find(t=>t.id===chosen.id);assert(t);
   const wall=[{start:t.start,end:t.end}],work=union(t.parts),gaps=subtract(wall,work);
   assert(Math.abs(length(work)-t.workMs)<.001);assert(Math.abs(length(gaps)-t.gapMs)<.001);
   // slow records omit sub-1ms scopes. Some nested A* records inherit the
   // parent name from diagnostic metadata: UNION, never sum these intervals.
   const knownPath=union(intersect(t.slow.filter(s=>s.name==='vehiclePathSteps'),work));
   const nonPathUpper=t.workMs-length(knownPath),pathReported=t.cpu.vehiclePathSteps??0;
   assert(length(knownPath)<=pathReported+.11);
   const otherSearch=union(intersect(raw.commandTimeline.searches.filter(q=>q.parent!=='vehiclePathSteps').flatMap(q=>q.parts),work));
   const frameIndices=[...new Set(t.parts.map(p=>raw.perf.frames.findIndex(f=>f.start<=p.start+.11&&f.start+f.cpuMs>=p.end-.11)))];
   assert(frameIndices.every(i=>i>=0));
   const interior=frameIndices.filter(i=>raw.perf.frames[i].start+raw.perf.frames[i].cpuMs<t.end-.11);
   let render=0,world=0,otherStages=0;const renderScopes=[],worldScopes=[];
   for(const i of interior){
    const f=raw.perf.frames[i],parts=t.parts.filter(p=>p.start>=f.start-.11&&p.end<=f.start+f.cpuMs+.11);
    assert(parts.length);const last=Math.max(...parts.map(p=>p.end));
    // Frozen main.js always renders world/renderer AFTER mission.advance.
    // Full interior callbacks end before the next continuation. Slow scopes
    // independently verify this placement when their duration exceeds 4 ms.
    for(const stage of ['render','world'])for(const s of f.slow.filter(s=>s.stage===stage)){
     assert(s.start>=last-.11);assert(s.start+s.ms<=t.end+.11);
     (stage==='render'?renderScopes:worldScopes).push({start:s.start,end:s.start+s.ms});
    }
    render+=f.stages.render??0;world+=f.stages.world??0;
    otherStages+=sum(['ui','minimap','contact audit'].map(n=>f.stages[n]??0));
   }
   const callbacksInGaps=length(intersect(gameCallbacks,gaps)),remainingCallbacks=callbacksInGaps-world;
   assert(remainingCallbacks>=-.22,'World stage must fit in inter-continuation callbacks');
   const sampled=new Map();
   for(const sample of samples){
    const covered=intersect([sample],work);if(!covered.length)continue;
    const weight=length(subtract(covered,[...knownPath,...gc]));if(!weight)continue;
    const stack=stacks.get(sample.id),category=classify(stack);if(category==='path')continue;
    const leaf=stack[0],key=category+' '+JSON.stringify(stack),row=sampled.get(key)??{category,ms:0,samples:0,stack:stack.toReversed()};
    row.ms+=weight;row.samples++;sampled.set(key,row);
   }
   const gcWork=intersect(gc,work),gcKnownPath=intersect(gcWork,knownPath);
   const row={run,id:t.id,wallMs:t.wallMs,workMs:t.workMs,pathReportedMs:pathReported,outsidePathReportedMs:t.workMs-pathReported,
    knownPathMs:length(knownPath),outsidePathWorkUpperMs:nonPathUpper,otherSearchMs:length(otherSearch),outsideBothPathWorkUpperMs:t.workMs-length(union([...knownPath,...otherSearch])),gapMs:t.gapMs,
    betweenContinuations:{rendererMs:render,scenePreparationMs:world-render,otherGameCallbackMs:remainingCallbacks,outsideGameCallbackMs:length(gaps)-callbacksInGaps,uiMinimapAuditMs:otherStages},
    gc:{totalMs:length(intersect(gc,wall)),workMs:length(gcWork),knownPathMs:length(gcKnownPath),outsidePathUpperMs:length(gcWork)-length(gcKnownPath),gapMs:length(intersect(gc,gaps)),note:'Union of main-thread MinorGC/MajorGC/V8.GC scopes, including incremental work. Nested events count once. Included in containing scopes, not an extra additive row.'},
    sampleEstimate:{definition:'Preceding sample intervals clipped to tick work, excluding known path scopes and trace GC. Exclusive categories; remaining path stacks excluded. Approximate subdivision of the conservative outside-path window, not exact timers for the 16.1 ms remainder.',categories:Object.fromEntries(['AI-controller','other-controller','collision','damage','tick-other','other-path-closed'].map(c=>[c,sum([...sampled.values()].filter(r=>r.category===c).map(r=>r.ms))])),topStacks:[...sampled.values()].sort((a,b)=>b.ms-a.ms).slice(0,8)},
    evidence:{parts:t.parts,interiorFrameStarts:interior.map(i=>raw.perf.frames[i].start),knownPath,renderScopes,worldScopes,traceThread:{pid:thread.pid,tid:thread.tid},clockOffsetBoundsMs:alignment.clockOffsetBoundsMs}};
   const total=row.outsidePathReportedMs+Object.values(row.betweenContinuations).slice(0,4).reduce((a,b)=>a+b,0);
   assert(Math.abs(total-(t.wallMs-pathReported))<.001,'Timed accounting must close');ticks.push(row);
   assert(sum(Object.values(row.sampleEstimate.categories))<=nonPathUpper+.001,'Samples cannot exceed the conservative non-path window');
  }
 }
 ticks.sort((a,b)=>selection.ticks.findIndex(t=>t.run===a.run&&t.id===a.id)-selection.ticks.findIndex(t=>t.run===b.run&&t.id===b.id));
 const reference=ticks.find(t=>t.run==='run-3'&&t.id===2433);
 const report={selectionFile,selectionHash:createHash('sha256').update(fs.readFileSync(selectionFile)).digest('hex'),inputs,criterion:'Find a single non-path segment with >=20 ms removable work in the reference tick before writing a patch.',
  decision:{newPatch:false,isolatedBenchmark:false,reason:'Reference simulation outside path is below 20 ms even using the conservative 17.4 ms bound. Renderer is 18.3 ms across four rAF intervals. No single eligible segment established.',largerRenderInOtherTicks:ticks.filter(t=>t.betweenContinuations.rendererMs>=20).map(t=>({run:t.run,id:t.id,ms:t.betweenContinuations.rendererMs})),nextLevel:'Scheduling/architecture or an explicitly revised target; no further path micro-optimization.',goalAchieved:false},
  definitions:{timers:'Same 20 historical diagnostic ticks, unchanged selection. Inclusive category timers are not added together.',workUpper:'Work minus the union of explicitly recorded path intervals. Conservative because sub-1ms path intervals were not individually recorded.',gaps:'Full interior world/render stage timers; trace callbacks divide the remainder into game callback work and outside-callback time. The latter is not proof of idle CPU, GPU wait or scheduler delay.',render:'CPU submission time. Rendering runs after advance; no direct GPU-time claim.',counterfactual:'Deleting a timed segment does not imply subtracting it from wall duration: continuations are rAF paced, and budgets are unchanged.',limits:'Historical diagnostic wrappers perturb production budgets; this is attribution and hypothesis screening, not a fresh clean performance baseline.'},reference,ticks};
 fs.writeFileSync(output,JSON.stringify(report,null,2));
 console.log(JSON.stringify({output,reference:{...reference,evidence:undefined,sampleEstimate:{...reference.sampleEstimate,topStacks:undefined}},ranges:Object.fromEntries(['outsidePathWorkUpperMs','gapMs'].map(k=>[k,{min:Math.min(...ticks.map(t=>t[k])),max:Math.max(...ticks.map(t=>t[k]))}]))}));
 process.exit(0);
}
const timeline=JSON.parse(fs.readFileSync(path.join(root,'timeline-analysis.json'))),out=[];
for(const result of timeline.results){
 const folder=path.join(root,result.name);
 const run=spawnSync(process.execPath,['tools/analyze-combat-frame-safety.mjs',folder],{encoding:'utf8',maxBuffer:8*1024*1024});assert.equal(run.status,0,run.stderr);fs.writeFileSync(path.join(folder,'trace-analysis.log'),run.stdout);
 const raw=JSON.parse(fs.readFileSync(path.join(folder,'baseline.json'))),analysis=JSON.parse(fs.readFileSync(path.join(folder,'baseline-analysis.json'))),profile=JSON.parse(fs.readFileSync(path.join(folder,'baseline.cpuprofile')));
 const nodes=new Map(profile.nodes.map(n=>[n.id,n])),parents=new Map();for(const n of nodes.values())for(const id of n.children??[])parents.set(id,n.id);
 const stack=id=>{const s=[];while(nodes.has(id)){const n=nodes.get(id).callFrame;s.push({function:n.functionName||'(anonymous)',file:n.url.split('/').at(-1),line:n.lineNumber+1});id=parents.get(id);}return s.reverse();};
 const samples=[];let at=profile.startTime;for(let i=0;i<profile.samples.length;i++){at+=profile.timeDeltas[i];samples.push({at:at/1000-analysis.alignment.offsetMs,ms:profile.timeDeltas[i]/1000,id:profile.samples[i]});}
 function sampleWindows(windows,predicate=()=>true){const map=new Map();let count=0;
  for(const s of samples){if(!windows.some(w=>s.at>=w.start&&s.at<w.end))continue;const frames=stack(s.id);if(!predicate(frames))continue;count++;const leaf=frames.at(-1),key=JSON.stringify(leaf),row=map.get(key)??{...leaf,ms:0,samples:0,stack:frames};row.ms+=s.ms;row.samples++;map.set(key,row);}
  return {count,topSelf:[...map.values()].toSorted((a,b)=>b.ms-a.ms).slice(0,18)};
 }
 const d=raw.commandTimeline,groups=raw.latency.commands.map(c=>({start:c.issuedAt,end:c.motionAt??c.issuedAt}));
 const windows=d?d.planning.filter(p=>p.name==='command'&&groups.some(g=>p.start<g.end&&p.end>g.start)):groups;
 const commands=sampleWindows(windows,s=>s.some(f=>f.file==='command-planner.js'));
 const worstTicks=(result.worstTicks??raw.latency.ticks.toSorted((a,b)=>b.completionWallMs-a.completionWallMs).slice(0,3)).slice(0,3).map(t=>({id:t.id??t.tick,wallMs:t.wallMs??t.completionWallMs,workMs:t.workMs,stacks:sampleWindows(t.parts??[{start:t.start,end:t.end}])}));
 out.push({run:result.name,method:'1ms sampled CPU, unique matched callback clock alignment; sample weights are estimates, not exact scope durations.',commands,worstTicks});
}
fs.writeFileSync(path.join(root,'latency-stacks.json'),JSON.stringify(out,null,2));
console.log(JSON.stringify(out.map(r=>({run:r.run,commandSamples:r.commands.count,top:r.commands.topSelf.slice(0,5).map(({stack,...x})=>x),ticks:r.worstTicks.map(t=>({id:t.id,wallMs:t.wallMs,top:t.stacks.topSelf.slice(0,5).map(({stack,...x})=>x)}))})),null,2));
