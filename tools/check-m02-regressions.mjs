import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const suites=['check-mission.mjs --full','check-story-v2.mjs','check-radio-save.mjs','check-oil-funding.mjs','check-production-cancel.mjs','check-factory-distribution.mjs','check-factory-access-map.mjs','check-factory-garage.mjs','check-factory-exit-priority.mjs','check-combat-policy.mjs','check-combat-sight.mjs','check-pickup-orders.mjs','check-fog-optimization.mjs','check-traffic-planner.mjs','check-simulation-budget.mjs'];
const results=[];
for(const suite of suites){
 const [file,...args]=suite.split(' '),started=performance.now();
 const r=spawnSync(process.execPath,['tools/'+file,...args],{encoding:'utf8',timeout:180000,maxBuffer:4e6});
 results.push({suite,passed:r.status===0,exitCode:r.status,ms:Math.round(performance.now()-started),error:r.error?.message,stdout:r.stdout,stderr:r.stderr});
 console.log((r.status===0?'PASS ':'FAIL ')+suite);
 fs.writeFileSync('docs/campaign/alpha/m02/regressions.json',JSON.stringify({passed:results.filter(r=>r.passed).length,total:results.length,results},null,2));
}
if(results.some(r=>!r.passed))process.exitCode=1;
