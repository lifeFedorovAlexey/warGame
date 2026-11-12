import fs from 'node:fs';import assert from 'node:assert/strict';import {fixture} from './check-start-latency-coordinator.mjs';
const baseline=process.argv.includes('--baseline'),report=[];
for(const kind of ['bukhanka','scav-zaporozhets','scav-rifleman']){
 const m=fixture(),u=m.addUnit(kind,'scavs',{x:0,y:0},{heading:0}),goal={x:140,y:-90};
 u.path=[goal];u.task={type:'move',...goal};let moved=null,arrived=null;const samples=[];
 for(let i=0;i<300;i++){m.advance(.1);m.drainEvents();m.drainEffects();if(moved===null&&Math.hypot(u.x,u.y)>10)moved=m.state.time;if(Math.hypot(u.x-goal.x,u.y-goal.y)<24){arrived=m.state.time;break;}if(i%30===0)samples.push({time:m.state.time,x:u.x,y:u.y,speed:u.driveSpeed,heading:u.heading});}
 report.push({kind,moved,arrived,samples});
}
if(!baseline){const old=JSON.parse(fs.readFileSync('docs/playtest-evidence/wg031/handling-before.json'));assert.deepEqual(report[0],old[0],'Player van handling is unchanged');assert(report[1].moved<old[1].moved);assert(report[1].arrived<old[1].arrived);assert(report[1].arrived<report[0].arrived);}
const folder='docs/playtest-evidence/wg031';fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(folder+'/handling-'+(baseline?'before':'after')+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
