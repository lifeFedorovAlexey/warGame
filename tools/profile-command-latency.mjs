import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const option=(n,d)=>process.argv.find(a=>a.startsWith('--'+n+'='))?.slice(n.length+3)??d;
const folder=option('output','campaign/reports/frame-budget/command-latency'),seconds=+option('seconds',90),runs=+option('runs',3),control=option('control','true')==='true';
const paired='campaign/reports/frame-budget/path-search/variants',supplement=path.join(folder,'supplement');
const digest=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
assert(!fs.existsSync(path.join(folder,'schedule.json')),'Use a new output directory');
fs.mkdirSync(folder,{recursive:true});
// Preserve the exact fallback inputs of the previous fixed-scale experiment.
fs.cpSync('campaign/reports/frame-budget/path-fixed-scale/supplement',supplement,{recursive:true});
const manifest=JSON.parse(fs.readFileSync(path.join(supplement,'manifest.json')));
for(const file of ['tools/command-latency-probe.mjs','tools/frame-contact-audit.mjs']){
 const target=path.join(supplement,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(file,target);manifest[file]=digest(target);
}
fs.writeFileSync(path.join(supplement,'manifest.json'),JSON.stringify(manifest,null,2));
const tools=['tools/profile-command-latency.mjs','tools/check-combat-frame-safety.mjs','tools/latency-source-hooks.mjs','tools/command-latency-probe.mjs','tools/check-command-latency-probe.mjs'];
const hashes=Object.fromEntries(tools.map(f=>[f,digest(f)]));
for(const file of tools){const target=path.join(folder,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(file,target);}
const schedule={diagnosticOnly:true,seconds,paired,renderScale:1,warmupFrames:300,hashes,started:new Date().toISOString(),runs:[...(control?[{name:'control',timeline:false}]:[]),...Array.from({length:runs},(_,i)=>({name:`run-${i+1}`,timeline:true}))]};
fs.writeFileSync(path.join(folder,'schedule.json'),JSON.stringify(schedule,null,2));
for(const run of schedule.runs){
 for(const [file,hash] of Object.entries(hashes))assert.equal(digest(file),hash);
 const out=path.join(folder,run.name),args=['tools/check-combat-frame-safety.mjs',`--paired=${paired}`,`--output=${out}`,`--seconds=${seconds}`,'--variants=baseline','--latencyProbe=true',`--commandTimeline=${run.timeline}`,`--supplement=${supplement}`,'--renderScale=1','--warmupFrames=300'];
 run.command=['node',...args].join(' ');run.started=new Date().toISOString();console.log(JSON.stringify(run));
 const result=spawnSync(process.execPath,args,{encoding:'utf8',maxBuffer:8*1024*1024});fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'run.log'),result.stdout+result.stderr);
 console.log(result.stdout);run.exitCode=result.status;run.ended=new Date().toISOString();fs.writeFileSync(path.join(folder,'schedule.json'),JSON.stringify(schedule,null,2));
 if(result.status!==0){console.error(result.stderr);process.exit(result.status??1);}
}
