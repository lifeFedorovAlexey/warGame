import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const root=process.argv[2]??'campaign/reports/frame-budget/minimal-command-latency/equivalence-intent';
assert(!fs.existsSync(path.join(root,'harness.mjs')),'Keep recorded runs; use a new output directory');
fs.mkdirSync(root,{recursive:true});let source=fs.readFileSync('tools/check-frame-determinism.mjs','utf8');
function replace(from,to){assert.equal(source.split(from).length,2,from);source=source.replace(from,to);}
replace("import fs from 'node:fs';","import fs from 'node:fs';\nimport {injectMinimalCommandMarks} from './minimal-command-source.mjs';");
replace("const combat=option('combat','false')==='true';","const combat=option('combat','false')==='true',minimal=option('minimal','false')==='true';");
replace("const rel=new URL(route.request().url()).pathname.slice(1),file=path.join(runtime,rel);return fs.existsSync(file)&&fs.statSync(file).isFile()?route.fulfill({path:file}):route.continue();",
 "let rel=new URL(route.request().url()).pathname.slice(1);if(rel==='campaign/')rel+='index.html';const file=[path.join(runtime,rel),path.join('campaign/reports/frame-budget/minimal-command-latency/supplement',rel)].find(f=>fs.existsSync(f)&&fs.statSync(f).isFile());if(file&&minimal&&['campaign/mission.js','campaign/command-planner.js','campaign/command-motion.js'].includes(rel))return route.fulfill({body:injectMinimalCommandMarks(rel,fs.readFileSync(file,'utf8')),contentType:'text/javascript'});return file?route.fulfill({path:file}):route.continue();");
replace('async({input,policy,snapshot})=>','async({input,policy,snapshot,minimal})=>');
replace('   const audit=()=>{',"   const marks=minimal?(await import('/tools/minimal-command-marks.mjs')).installMinimalCommandMarks(m,{now:realNow}):null;\n   const audit=()=>{");
replace("timed(()=>m.submitOrder(ids,'move',goal));","marks?.arm(ids);const submitted=timed(()=>m.submitOrder(ids,'move',goal));marks?.returned(submitted);timed(()=>m.tick(m.config.simulationStep));");
replace("...(combat?{combat:true}:{})","...(combat?{combat:true}:{}),coverageIntentTickBeforePlanning:true");
replace('   return {policy,snapshot,simSeconds:', '   marks?.restore();\n   return {minimal:marks?.report(),policy,snapshot,simSeconds:');
replace('  },{input,policy,snapshot});','  },{input,policy,snapshot,minimal});');
const harness=path.join(root,'harness.mjs');fs.writeFileSync(harness,source);fs.copyFileSync('tools/minimal-command-source.mjs',path.join(root,'minimal-command-source.mjs'));
const results=[];
for(const minimal of [false,true]){
 const output=path.join(root,minimal?'on':'off'),args=[harness,'--runtime=campaign/reports/frame-budget/path-search/variants/baseline/runtime',`--output=${output}`,'--seconds=65','--repeats=1','--policies=legacy','--snapshots=selective','--combat=true',`--minimal=${minimal}`];
 console.log(['node',...args].join(' '));const r=spawnSync(process.execPath,args,{encoding:'utf8',maxBuffer:8*1024*1024});fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'run.log'),r.stdout+r.stderr);console.log(r.stdout);assert.equal(r.status,0,r.stderr);results.push(JSON.parse(fs.readFileSync(path.join(output,'summary.json'))));
}
assert.equal(results[0].inputHash,results[1].inputHash);assert.deepEqual(results[0].sources,results[1].sources);const [off,on]=results.map(r=>r.results[0]);assert.equal(off.traceHash,on.traceHash);assert.equal(off.tickHash,on.tickHash);
const marks=JSON.parse(fs.readFileSync(path.join(root,'on',on.file))).minimal;
assert.equal(marks.groups.length,2);assert(marks.groups.flatMap(g=>g.rows).some(r=>r.firstMotionMode==='intent'),'Must exercise early intent motion');
assert(marks.groups.flatMap(g=>g.rows).every(r=>r.publishAt!==null&&r.routeThresholdAt!==null));
const result={passed:true,method:'Fixed production clock/budgets; observer reads real clock. One explicit production tick immediately after each command (before route planner slices) forces early-intent coverage on BOTH variants. Frame hash includes production clock-read counts; tick hash covers recorded poses and contacts. No wall-clock equivalence claim.',off,on,clockReads:marks.clockReads,inputHash:results[0].inputHash};
fs.writeFileSync(path.join(root,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
