import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root='campaign/reports/traffic-recovery-2026-11-09',before=process.argv.includes('--before');
const fixture=JSON.parse(fs.readFileSync(root+'/live-contract-fixture.json','utf8'));
let code=fs.readFileSync(before?root+'/before/r23-traffic-planner.js':'campaign/traffic-planner.js','utf8');
code=code.replace(/from '(\.\/[^']+)'/g,(_,name)=>'from '+JSON.stringify(pathToFileURL(path.resolve('campaign',name)).href));
const {TrafficPlanner}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const units=fixture.cycles[0].event.units.map(u=>({...u,driveSpeed:u.speed,commandRevision:u.revision}));
units.push({...fixture.cycles[1].event.units.find(u=>u.id==='u463'),driveSpeed:0});
const m={state:{units,time:236.7},nav:{topologyRevision:1},entity:id=>units.find(u=>u.id===id),
 navigationDiagnostics:{recoveryCycles:[['u2','u3']],dependencies:new Map([['u2',['u3']],['u3',['u2']]])}};
const planner=new TrafficPlanner(),job=planner.enqueue(m,'cycle',['u2','u3'],'capture');let cancelled=0;
job.iterator={return(){cancelled++;return {done:true};}};
m.navigationDiagnostics.recoveryCycles=[['u2','u463']];m.navigationDiagnostics.dependencies=new Map([['u2',['u463']],['u463',['u2']]]);
planner.requestCycles(m);
const passed=planner.queued.get('u2')===job&&cancelled===0;
const result={source:fixture.source,mode:before?'r23':'after',passed,cancelled,
 contract:'A changed wait graph does not cancel an already started physical proof; publication still validates actual bodies'};
fs.writeFileSync(root+'/active-dependencies-'+result.mode+'.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
if(!before)assert(passed);
