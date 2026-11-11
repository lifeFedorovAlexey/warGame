import fs from 'node:fs';
import {makeMission} from './m02-fixture.mjs';
const field=makeMission().field,results=[];
for(let run=0;run<4;run++){
 const m=makeMission(field);m.state.pendingCinematics=[];
 const samples=[];
 for(let i=0;i<200;i++){const t=performance.now();m.advance(.1);samples.push(performance.now()-t);m.drainEvents();m.drainEffects();}
 samples.sort((a,b)=>a-b);results.push({medianMs:samples[100],p95Ms:samples[190],maxMs:samples.at(-1),ticks:200,units:m.state.units.length});
}
const report={node:process.version,case:'m01 unchanged initial world, 200 fixed ticks, no rendering',runs:results};
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
