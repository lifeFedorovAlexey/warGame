import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {progressMission} from './check-navigation-public-progress.mjs';
import {vehicleClearance} from '../campaign/vehicle-collision.js';

// The same prompt-start criteria as check-start-motion-latency, extended to
// three close columns through the real asynchronous public group command.
// Finishing eventually is checked separately; it cannot excuse a frozen start.
const m=progressMission(),units=[];
for(let i=0;i<9;i++)units.push(m.addUnit('bukhanka','rai',{x:(i%3-1)*12,y:-Math.floor(i/3)*26}));
const origin=units.map(u=>({x:u.x,y:u.y,hp:u.hp})),goals=new Map(),first=units.map(()=>null),snapshots={},departures=[],contacts=[];
const files=['mission','traffic-coordinator','traffic-planner','traffic-cycle','traffic-passage','traffic-start','traffic-arrival-route','traffic-joint','vehicle-motion','maneuver-admission','command-planner','command-motion','arrival-planner'];
const hashes=()=>Object.fromEntries(files.map(f=>[f,createHash('sha256').update(fs.readFileSync('campaign/'+f+'.js')).digest('hex')]));
const sourceHashes=hashes();
m.trafficDepartureDebug=e=>departures.push({...e,current:undefined});
assert(m.submitOrder(units.map(u=>u.id),'move',{x:0,y:-260}).ok);
let minGap=Infinity,maxWait=0,maxAdvanceMs=0,maxTickCpuMs=0,tickCpu=0,observed=0,input=0;
const collision=m.vehicleCollision.bind(m),tick=m.continueTick;
m.vehicleCollision=(u,s,b)=>{if(b.size)contacts.push({id:u.id,time:m.state.time,ids:[...b].map(v=>v.id)});return collision(u,s,b);};
m.continueTick=function(...args){const pending=this.pendingTick,before=performance.now();let result;
 try{result=tick.apply(this,args);}finally{if(pending)tickCpu+=performance.now()-before;}
 if(pending&&!this.pendingTick){
  maxTickCpuMs=Math.max(maxTickCpuMs,tickCpu);tickCpu=0;observed++;
  const displacement=units.map((u,i)=>Math.hypot(u.x-origin[i].x,u.y-origin[i].y));
  for(const [i,u] of units.entries()){
   if(displacement[i]>.5&&first[i]===null)first[i]=this.state.time;
   maxWait=Math.max(maxWait,u.navigation?.waitSeconds??0);assert.equal(u.hp,origin[i].hp);
   if(u.routeOrder){if(goals.has(u.id))assert.deepEqual(u.routeOrder.destination,goals.get(u.id));else goals.set(u.id,structuredClone(u.routeOrder.destination));}
  }
  for(let a=0;a<units.length;a++)for(let b=0;b<a;b++)minGap=Math.min(minGap,vehicleClearance(units[a],units[b],m.config.worldScale,m.field));
  for(const second of [1,3,10])if(this.state.time>=second-1e-7&&!snapshots[second])snapshots[second]=displacement;
 }return result;};
const wall=performance.now();
while((m.pendingTick||m.state.time<10-1e-7)&&performance.now()-wall<60000){
 const delta=Math.min(1/80,Math.max(0,10-input));input+=delta;
 const before=performance.now();m.advance(delta,{budgetMs:5});maxAdvanceMs=Math.max(maxAdvanceMs,performance.now()-before);m.effects=[];
}
const failures=[];
if(first.some(t=>t===null||t>.50001))failures.push('Meaningful movement starts later than .5 seconds');
for(const [second,minimum] of [[1,3],[3,12],[10,20]])if(!snapshots[second]?.every(d=>d>minimum))failures.push(`Not every car clears ${minimum} units by ${second} seconds`);
if(maxWait>.50001)failures.push(`An active car stops for ${maxWait.toFixed(1)} seconds during departure`);
if(maxTickCpuMs>100)failures.push(`A complete .1-second simulation step costs ${maxTickCpuMs.toFixed(1)} ms of CPU`);
if(minGap<=0||contacts.length)failures.push('Contact or overlapping hulls');
if(JSON.stringify(sourceHashes)!==JSON.stringify(hashes()))failures.push('Sources changed during the run');
const result={passed:!failures.length,seconds:m.state.time,wallSeconds:(performance.now()-wall)/1000,first,snapshots,maxWait,
 minGap,contacts,maxAdvanceMs,maxTickCpuMs,observed,departures,failures,sourceHashes};
fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/fast-start-nine.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result));assert(result.passed,'The nine-car start must keep moving, not merely finish eventually');
