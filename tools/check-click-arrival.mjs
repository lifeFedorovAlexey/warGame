import assert from 'node:assert/strict';
import fs from 'node:fs';
import {runProgressCase} from './check-navigation-public-progress.mjs';

// Actual public clicks: a short destination behind the car used to produce
// an ~80-unit forward loop. Check the requested point as well as the planner's
// accepted point, and bound the time of these isolated parking manoeuvres.
const cases=[
 {name:'click-back-three',goal:{x:0,y:-3},maximum:2},
 {name:'click-back-ten',goal:{x:0,y:-10},maximum:3},
 {name:'click-side',goal:{x:10,y:0},maximum:10},
 {name:'click-diagonal',goal:{x:10,y:10},maximum:8},
 {name:'click-forward',goal:{x:0,y:10},maximum:3}
];
const output='campaign/reports/navigation-public-progress/click-arrival',results=[];
for(const spec of cases){
 const r=runProgressCase({...spec,n:1,cols:1,dx:30,dy:30,y:0},{seconds:20,wallSeconds:20,budget:5,output});
 const save=JSON.parse(fs.readFileSync(output+'/'+spec.name+'.json')),id=r.commands[0].ids[0],u=save.final.state.units.find(u=>u.id===id);
 assert.deepEqual(u.routeOrder.destination,spec.goal,'An unobstructed individual click must retain its exact coordinate');
 const error=Math.hypot(u.x-spec.goal.x,u.y-spec.goal.y);
 const passed=r.passed&&r.seconds<=spec.maximum&&error<.65;
 results.push({name:spec.name,passed,seconds:r.seconds,error,failures:r.failures});
}
fs.writeFileSync(output+'/summary.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results));
assert(results.every(r=>r.passed),'A close click must finish precisely without a full forward circuit');
