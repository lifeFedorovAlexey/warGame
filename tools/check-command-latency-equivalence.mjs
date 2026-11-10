// The observer must not change production clock reads, yield order or outcomes
// when the game's budgets use a fixed virtual clock and observer uses real time.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const root=process.argv[2]??'campaign/reports/frame-budget/command-latency/equivalence';
fs.mkdirSync(root,{recursive:true});
let source=fs.readFileSync('tools/check-frame-determinism.mjs','utf8');
function replace(from,to){assert.equal(source.split(from).length,2,from);source=source.replace(from,to);}
replace("import fs from 'node:fs';","import fs from 'node:fs';\nimport {injectLatencyHooks} from './latency-source-hooks.mjs';");
replace("const combat=option('combat','false')==='true';","const combat=option('combat','false')==='true',timeline=option('timeline','false')==='true';");
replace("const rel=new URL(route.request().url()).pathname.slice(1),file=path.join(runtime,rel);return fs.existsSync(file)&&fs.statSync(file).isFile()?route.fulfill({path:file}):route.continue();",
 "let rel=new URL(route.request().url()).pathname.slice(1);if(rel==='campaign/')rel+='index.html';const file=[path.join(runtime,rel),path.join('campaign/reports/frame-budget/command-latency/supplement',rel)].find(f=>fs.existsSync(f)&&fs.statSync(f).isFile());if(file&&timeline&&['campaign/mission.js','campaign/command-planner.js'].includes(rel))return route.fulfill({body:injectLatencyHooks(rel,fs.readFileSync(file,'utf8')),contentType:'text/javascript'});return file?route.fulfill({path:file}):route.continue();");
replace('async({input,policy,snapshot})=>','async({input,policy,snapshot,timeline})=>');
replace('   const audit=()=>{',`   const detail=timeline?(await import('/tools/command-latency-probe.mjs')).installCommandLatencyProbe(m,{CommandPlanner:(await import('/campaign/command-planner.js')).CommandPlanner,now:realNow}):null;
   const audit=()=>{`);
replace('   return {policy,snapshot,simSeconds:', '   detail?.restore();\n   return {timeline:detail?.report(),policy,snapshot,simSeconds:');
replace('  },{input,policy,snapshot});','  },{input,policy,snapshot,timeline});');
const harness=path.join(root,'determinism-harness.mjs');fs.writeFileSync(harness,source);fs.copyFileSync('tools/latency-source-hooks.mjs',path.join(root,'latency-source-hooks.mjs'));
const results=[];
for(const timeline of [false,true]){
 const output=path.join(root,timeline?'on':'off'),args=[harness,'--runtime=campaign/reports/frame-budget/path-search/variants/baseline/runtime',`--output=${output}`,'--seconds=65','--repeats=1','--policies=legacy','--snapshots=selective','--combat=true',`--timeline=${timeline}`];
 console.log(['node',...args].join(' '));const r=spawnSync(process.execPath,args,{encoding:'utf8',maxBuffer:8*1024*1024});fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'run.log'),r.stdout+r.stderr);console.log(r.stdout);assert.equal(r.status,0,r.stderr);
 results.push(JSON.parse(fs.readFileSync(path.join(output,'summary.json'))));
}
assert.equal(results[0].inputHash,results[1].inputHash);assert.deepEqual(results[0].sources,results[1].sources);
const [a,b]=results.map(r=>r.results[0]);assert.equal(a.traceHash,b.traceHash,'Frame outcomes AND production clock-read counts');assert.equal(a.tickHash,b.tickHash,'Every tick pose/path/contact outcome');
const detail=JSON.parse(fs.readFileSync(path.join(root,'on',b.file))).timeline;
assert(detail.events.some(e=>e.type==='published'));assert(detail.events.some(e=>e.type==='motion-0.1'));assert(detail.searches.length>0);
const output={passed:true,method:'Same frozen combat, virtual production clock/quota, real observer clock. Not a wall-clock performance comparison.',inputHash:results[0].inputHash,off:a,on:b,events:detail.events.length,searches:detail.searches.length};
fs.writeFileSync(path.join(root,'result.json'),JSON.stringify(output,null,2));console.log(JSON.stringify(output));
