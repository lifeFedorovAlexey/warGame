// One compatibility cross-check with the EXACT old common instrumentation.
// This is NOT a clean latency baseline. Both definitions observe the same run.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const root=process.argv[2]??'campaign/reports/frame-budget/minimal-command-latency/legacy-bridge';
assert(!fs.existsSync(path.join(root,'result.json')));fs.mkdirSync(root,{recursive:true});
let source=fs.readFileSync('campaign/reports/frame-budget/command-latency/tools/check-combat-frame-safety.mjs','utf8');
function replace(from,to){assert.equal(source.split(from).length,2,from);source=source.replace(from,to);}
replace("import {injectLatencyHooks} from './latency-source-hooks.mjs';","import {injectMinimalCommandMarks} from './minimal-command-source.mjs';");
replace("if(commandTimeline)for(const rel of ['campaign/mission.js','campaign/command-planner.js']){","for(const rel of ['campaign/mission.js','campaign/command-planner.js','campaign/command-motion.js']){");
replace('injectLatencyHooks(rel,','injectMinimalCommandMarks(rel,');
replace('   const audit=installTickContactAudit(m);',"   const marks=(await import('/tools/minimal-command-marks.mjs')).installMinimalCommandMarks(m);\n   const audit=installTickContactAudit(m);");
replace("stats.orders.push({elapsed,goal,result:m.submitOrder(ids,'move',goal)});","marks.arm(ids);const submitted=m.submitOrder(ids,'move',goal);marks.returned(submitted);stats.orders.push({elapsed,goal,result:submitted});");
replace('   const latencyMetrics=latency?.report()??null;','   const minimal=marks.report();marks.restore();\n   const latencyMetrics=latency?.report()??null;');
replace('   return {commandTimeline:commandTimelineMetrics,','   return {minimal,commandTimeline:commandTimelineMetrics,');
const harness=path.join(root,'harness.mjs');fs.writeFileSync(harness,source);
for(const file of ['minimal-command-source.mjs','frame-benchmark-conditions.mjs'])fs.copyFileSync('tools/'+file,path.join(root,file));
const args=[harness,'--paired=campaign/reports/frame-budget/path-search/variants',`--output=${path.join(root,'run')}`,'--seconds=90','--variants=baseline','--latencyProbe=true','--commandTimeline=false','--supplement=campaign/reports/frame-budget/minimal-command-latency/supplement','--renderScale=1','--warmupFrames=300'];
console.log(['node',...args].join(' '));const run=spawnSync(process.execPath,args,{encoding:'utf8',maxBuffer:8*1024*1024});fs.writeFileSync(path.join(root,'run.log'),run.stdout+run.stderr);console.log(run.stdout);assert.equal(run.status,0,run.stderr);
const raw=JSON.parse(fs.readFileSync(path.join(root,'run/baseline.json'))),rows=[];
for(const group of raw.minimal.groups)for(const row of group.rows){const old=raw.latency.commands.find(c=>c.id===row.id&&c.revision===group.revision);assert(old);
 const historical=row.routeThresholdAt===null?null:row.routeThresholdAt-group.receivedAt;
 if(historical!==null)assert(Math.abs(old.commandToMotionMs-historical)<1,'Both measurements must identify the same historical event');
 rows.push({id:row.id,revision:group.revision,actualFirstMotionMs:row.firstMotionAt===null?null:row.firstMotionAt-group.receivedAt,mode:row.firstMotionMode,historicalRouteThresholdMs:historical,oldProbeMs:old.commandToMotionMs,oldControllerMs:old.controllerReadyMs,phases:row,group:{receivedAt:group.receivedAt,queuedAt:group.queuedAt,plannerAt:group.plannerAt,atomic:group.atomic,cohorts:group.cohorts}});
}
const result={passed:true,purpose:'Bridge to the previous common instrumentation, NOT a clean baseline or observer-cost estimate',legacyDefinitionAgrees:true,clockReads:raw.minimal.clockReads,rows};
fs.writeFileSync(path.join(root,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
