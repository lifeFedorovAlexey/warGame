import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {progressMission} from '../check-navigation-public-progress.mjs';
import {PredictiveTraffic} from '../../campaign/predictive-traffic.js';
import {vehicleClearance} from '../../campaign/vehicle-collision.js';

const selected=process.argv[2]??'single';
const m=progressMission();m.trafficCoordinator=new PredictiveTraffic();
const units=[],groups=[];
const add=(x,y,heading=0)=>{const u=m.addUnit('bukhanka','rai',{x,y},{heading});units.push(u);return u;};
if(selected==='crossing20')for(let axis=0;axis<4;axis++){
 const a=axis*Math.PI/2,dx=Math.cos(a),dy=Math.sin(a),group=[];
 for(let i=0;i<5;i++)group.push(add(-(100+i*32)*dx,-(100+i*32)*dy,Math.atan2(-dx,dy)));
 groups.push({units:group,target:{x:450*dx,y:450*dy}});
}else{
 const count=selected==='nine'?9:1;
 for(let i=0;i<count;i++)add(count===1?0:(i%3-1)*12,-Math.floor(i/3)*26);
 groups.push({units,target:{x:0,y:selected==='nine'?-260:450}});
}
const before=new Map(units.map(u=>[u.id,{x:u.x,y:u.y,hp:u.hp}]));
const goals=new Map(),first=new Map(),snapshots={},changedGoals=[],failures=[];
const sources=['tools/experiments/check-predictive-traffic.mjs',
 ...fs.readdirSync('campaign').filter(f=>f.endsWith('.js')).map(f=>'campaign/'+f),'assets/campaign/alpha/mission01/gameplay.json'];
const hashes=()=>Object.fromEntries(sources.map(f=>[f,createHash('sha256').update(fs.readFileSync(f)).digest('hex')]));
const sourceHashes=hashes();
for(const group of groups)assert(m.submitOrder(group.units.map(u=>u.id),'move',group.target).ok);
const done=u=>!u.pendingOrder&&!u.task&&!u.path.length&&goals.has(u.id)&&Math.hypot(u.x-goals.get(u.id).x,u.y-goals.get(u.id).y)<2;
let minGap=Infinity,maxWait=0,maxTickMs=0,cpu=0,contacts=0;
const tick=m.continueTick,wall=performance.now();
m.continueTick=function(...args){
 const pending=this.pendingTick,started=performance.now(),result=tick.apply(this,args);cpu+=performance.now()-started;
 if(pending&&!this.pendingTick){
  maxTickMs=Math.max(maxTickMs,cpu);cpu=0;
  for(const u of units){
   const initial=before.get(u.id),displacement=Math.hypot(u.x-initial.x,u.y-initial.y);
   if(displacement>.5&&!first.has(u.id))first.set(u.id,m.state.time);
   if(u.routeOrder&&!u.pendingOrder){
    if(goals.has(u.id)&&Math.hypot(goals.get(u.id).x-u.routeOrder.destination.x,goals.get(u.id).y-u.routeOrder.destination.y)>.001)changedGoals.push(u.id);
    if(!goals.has(u.id))goals.set(u.id,structuredClone(u.routeOrder.destination));
   }
   maxWait=Math.max(maxWait,u.navigation?.waitSeconds??0);
   if(u.hp!==initial.hp||u.contactRock)contacts++;
  }
  for(let i=0;i<units.length;i++)for(let j=0;j<i;j++)minGap=Math.min(minGap,vehicleClearance(units[i],units[j],m.config.worldScale,m.field));
  for(const second of [1,3,10])if(m.state.time>=second-1e-7&&!snapshots[second])snapshots[second]=units.map(u=>Math.hypot(u.x-before.get(u.id).x,u.y-before.get(u.id).y));
 }return result;
};
let input=0;
while(m.state.time<100&&performance.now()-wall<15000&&!units.every(done)){
 const delta=input<100?Math.min(1/80,100-input):0;input+=delta;m.advance(delta,{budgetMs:5});m.effects=[];
}
if(!units.every(done))failures.push('Not all public orders completed at their accepted destinations');
if(minGap<0||contacts)failures.push('Overlap/contact/damage');
if(changedGoals.length)failures.push('Accepted destinations changed');
if(m.trafficCoordinator.stats.emergencyStops)failures.push('No admissible control while moving: abrupt stop');
if(maxWait>5)failures.push('Stopped active order for more than 5 seconds');
if(maxTickMs>100)failures.push('Complete physical tick costs more than 100 ms');
if(selected==='nine'){
 if(first.size!==9||[...first.values()].some(t=>t>.50001))failures.push('Departure starts after .5 seconds');
 for(const [time,limit] of [[1,3],[3,12],[10,20]])if(!snapshots[time]?.every(d=>d>limit))failures.push('Insufficient departure displacement at '+time);
 if(maxWait>.50001)failures.push('Nine-car departure stop exceeds .5 seconds');
}
if(JSON.stringify(hashes())!==JSON.stringify(sourceHashes))failures.push('Sources changed during run');
const result={case:selected,passed:!failures.length,arrived:units.filter(done).length,total:units.length,time:m.state.time,
 wallSeconds:(performance.now()-wall)/1000,minGap,maxWait,maxTickMs,contacts,first:Object.fromEntries(first),snapshots,
 stats:m.trafficCoordinator.stats,failures,sourceHashes,units:units.map(u=>({id:u.id,x:u.x,y:u.y,heading:u.heading,path:u.path,task:u.task,goal:goals.get(u.id),navigation:u.navigation}))};
fs.mkdirSync('campaign/reports/predictive-traffic',{recursive:true});
fs.writeFileSync('campaign/reports/predictive-traffic/'+selected+'.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,sourceHashes:undefined,units:undefined}));
process.exitCode=result.passed?0:1;
