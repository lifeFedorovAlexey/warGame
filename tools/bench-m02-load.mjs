import fs from 'node:fs';
import {makeMission} from './m02-fixture.mjs';
import {prepareM02Diagnostic} from '../campaign/mission02-diagnostic.js';
const m=prepareM02Diagnostic(makeMission());
for(const b of Object.values(m.state.m02.bases))if(b.production)b.production.active=true;
const samples=[],maxPopulation=[];
for(let i=0;i<1200;i++){
 const t=performance.now();m.advance(.1);samples.push(performance.now()-t);
 maxPopulation.push(m.state.units.filter(u=>u.hp>0).length);m.drainEvents();m.drainEffects();
}
const ordered=samples.slice(200).sort((a,b)=>a-b);
const report={node:process.version,case:'m02 diagnostic, all three producers activated, 1200 fixed ticks; first 200 warmup',rendering:false,medianMs:ordered[500],p95Ms:ordered[950],maxMs:ordered.at(-1),peakLiving:Math.max(...maxPopulation),enemyProduced:Object.values(m.state.m02.bases).reduce((n,b)=>n+(b.production?.count??0),0),enemyLiving:m.state.units.filter(u=>u.m02Produced&&u.hp>0).length,simulationSeconds:m.state.time};
const sliced=prepareM02Diagnostic(makeMission());for(const b of Object.values(sliced.state.m02.bases))if(b.production)b.production.active=true;
const calls=[],slow=[];
const advance=dt=>{const t=performance.now();sliced.advance(dt,{budgetMs:3});const ms=performance.now()-t;calls.push(ms);if(ms>20)slow.push({time:sliced.state.time,ms});};
for(let i=0;i<1200;i++){advance(.1);while(sliced.pendingTick||sliced.accumulator>=.1-1e-8)advance(0);sliced.drainEvents();sliced.drainEffects();}
calls.sort((a,b)=>a-b);report.frameBudget={budgetMs:3,calls:calls.length,medianMs:calls[Math.floor(calls.length*.5)],p95Ms:calls[Math.floor(calls.length*.95)],maxMs:calls.at(-1),slow,simulationSeconds:sliced.state.time};
fs.writeFileSync('docs/campaign/alpha/m02/load.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
