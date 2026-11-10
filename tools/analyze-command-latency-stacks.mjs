import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=process.argv[2]??'campaign/reports/frame-budget/command-latency';
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
