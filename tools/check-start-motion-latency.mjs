import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Mission} from '../campaign/mission.js';
import {vehicleClearance} from '../campaign/vehicle-collision.js';
import {createHeightfield} from '../demo/map-route.js';
import {shapeMesaRims} from '../demo/mesa-shaping.js';
import {refineRoadHeightfield} from '../demo/road-heightfield.js';
import {applyRoadGrades} from '../demo/road-grading.js';
const config=JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/gameplay.json'));
let field={extent:4096,half:2048,cellMetres:32,heightAt:()=>0,gradientAt:()=>({x:0,y:0}),
 gridToWorld:([x,y])=>({x:x*32-2048,y:2048-y*32}),worldToGrid:(x,y)=>[(x+2048)/32,(2048-y)/32]};
if(process.argv.includes('--real')){const raw=createHeightfield(JSON.parse(fs.readFileSync('assets/maps/alpha/heightfield.json')));shapeMesaRims(raw);field=refineRoadHeightfield(raw);applyRoadGrades(field,JSON.parse(fs.readFileSync('assets/maps/alpha/roads.json')));}
const fixture=(road=false)=>{const f=road?{...field,roadNetwork:{paths:[{id:'north',from:'a',to:'b',width:34,points:[{x:0,y:-1000},{x:0,y:1000}]}]},roadBlendAt:(x,y)=>Math.max(0,Math.min(1,(17-Math.abs(x))/2.5))}:field;
 const m=new Mission(config,f);Object.assign(m.state,{units:[],buildings:[],camps:[],bounds:[0,0,127,127],pendingCinematics:[]});m.updateMission=()=>{};m.rebuildNavigation();m.explored.fill(255);
 if(process.argv.includes('--debug'))m.trafficDepartureDebug=data=>console.log(JSON.stringify({departure:data}));
 return m;};
const cases=[];
function run(name,poses,goal={x:0,y:400},road=false){
 const m=fixture(road),units=poses.map(p=>m.addUnit('bukhanka','rai',p,{heading:p.heading??0}));
 let initialGap=Infinity;for(let i=0;i<units.length;i++)for(let j=0;j<i;j++)initialGap=Math.min(initialGap,vehicleClearance(units[i],units[j],config.worldScale,field));
 if(initialGap<.2475)return null;
 const order=m.order(units.map(u=>u.id),'move',goal);assert(order.ok,order.reason);
 const originalGoals=units.map(u=>({x:u.task.x,y:u.task.y})),originalOrders=units.map(u=>JSON.parse(JSON.stringify(u.routeOrder)));
 const origins=units.map(u=>({x:u.x,y:u.y})),first=units.map(()=>null),first5=units.map(()=>null),idle=units.map(()=>0),longestIdle=units.map(()=>0),snapshots={},states=[];
 let minGap=initialGap;const contacts=[];let priorHp=units.map(u=>u.hp);
 for(let i=1;i<=(process.argv.includes('--long')?1800:process.argv.includes('--complete')?900:150);i++){
  m.advance(.1);m.effects=[];
  if(units.some((u,n)=>u.hp<priorHp[n]))contacts.push({time:m.state.time,units:units.map(u=>({id:u.id,x:u.x,y:u.y,heading:u.heading,hp:u.hp,speed:u.driveSpeed,detour:u.detour,path:u.path,task:u.task}))});
  priorHp=units.map(u=>u.hp);
  const displacements=units.map((u,i)=>Math.hypot(u.x-origins[i].x,u.y-origins[i].y));
  displacements.forEach((d,j)=>{if(d>.5&&first[j]===null)first[j]=i/10;});
  displacements.forEach((d,j)=>{if(d>5&&first5[j]===null)first5[j]=i/10;const u=units[j];idle[j]=u.task&&(u.driveSpeed??0)<.01?idle[j]+.1:0;longestIdle[j]=Math.max(longestIdle[j],idle[j]);});
  for(let a=0;a<units.length;a++)for(let b=0;b<a;b++)minGap=Math.min(minGap,vehicleClearance(units[a],units[b],config.worldScale,field));
  if([1,10,30,100,150,300,600,900,1800].includes(i)){
   snapshots[i/10]=displacements;
   states.push(JSON.parse(JSON.stringify({t:i/10,units:units.map(u=>({id:u.id,x:u.x,y:u.y,heading:u.heading,speed:u.driveSpeed,path:u.path.slice(0,2),task:u.task,watch:u.driveWatch,traffic:u.traffic,hold:u.trafficHold,rest:u.trafficRest,detour:u.detour,limit:m.trafficCoordinator.limit(u),queued:m.trafficCoordinator.queueing(u)}))})));
  }
 }
 const result={name,poses,goal,initialGap,minGap,first,first5,longestIdle,maxFirst:Math.max(...first.map(x=>x??Infinity)),snapshots,contacts,hp:units.map(u=>u.hp),originalGoals,originalOrders,goals:units.map((u,i)=>({heading:u.heading,watch:u.driveWatch,traffic:u.traffic,hold:u.trafficHold,rest:u.trafficRest,originalError:Math.hypot(u.x-originalGoals[i].x,u.y-originalGoals[i].y),task:u.task,path:u.path,yieldReturn:u.yieldReturn,detour:u.detour,error:Math.hypot(u.x-(u.routeOrder?.destination?.x??goal.x),u.y-(u.routeOrder?.destination?.y??goal.y)),x:u.x,y:u.y,routeOrder:u.routeOrder})),states};cases.push(result);
 console.log(JSON.stringify({name,initialGap,minGap,first5,longestIdle,snapshots}));return result;
}
const pairColumns=(spacing,heading)=>Array.from({length:6},(_,i)=>({x:(i<3?-1:1)*spacing/2,y:(i%3-1)*26,heading}));
if(process.argv.includes('--real')){const p=field.gridToWorld(config.startGrid);run('real reverse 2x3',Array.from({length:6},(_,i)=>({x:p.x+(i%2?6:-6),y:p.y+(Math.floor(i/2)-1)*26,heading:Math.PI})),{x:p.x,y:p.y+240});}
else if(process.argv.includes('--variants')){
 for(const spacing of [11.5,12,18,30])for(const angle of [0,.4,1.2]){
  const c=Math.cos(angle),s=Math.sin(angle),rotate=p=>({x:p.x*c-p.y*s,y:p.x*s+p.y*c,heading:Math.PI+angle});
  run(`reverse spacing ${spacing} rotation ${angle}`,pairColumns(spacing,Math.PI).map(rotate),rotate({x:0,y:400}));
 }
}
else if(process.argv.includes('--road'))run('road 2x3',Array.from({length:6},(_,i)=>({x:i%2?-6:6,y:-Math.floor(i/2)*24,heading:0})),{x:0,y:300},true);
else for(const spacing of [12,24,60])for(const heading of [0,Math.PI/2,Math.PI])run(`two-triples spacing ${spacing} angle ${heading}`,pairColumns(spacing,heading));
if(process.argv.includes('--search')){
 let seed=72813;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
 for(let i=0;i<160;i++){
  const poses=Array.from({length:6},(_,n)=>({x:(n<3?-1:1)*30+(random()-.5)*10,y:(n%3-1)*27+(random()-.5)*5,heading:(random()-.5)*Math.PI*2}));
  const goal={x:Math.cos(i)*400,y:Math.sin(i)*400};
  const result=run('random '+i,poses,goal);if(result?.maxFirst>=8)break;
 }
}
fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/start-motion-latency'+(process.argv.includes('--real')?'-real':'')+(process.argv.includes('--road')?'-road':'')+(process.argv.includes('--variants')?'-variants':'')+(process.argv.includes('--complete')?'-complete':'')+'.json',JSON.stringify({cases},null,2));
assert(cases.every(c=>c.minGap>=0),'No collision tolerance was relaxed');

const acceptance=process.argv.includes('--real')||process.argv.includes('--variants');
if(acceptance){
 for(const c of cases){
  assert(c.first.every(t=>t!==null&&t<=.5),`${c.name}: meaningful movement must start within .5s`);
  assert(c.snapshots[1].every(d=>d>3)&&c.snapshots[3].every(d=>d>12)&&c.snapshots[10].every(d=>d>20),`${c.name}: departure must continue beyond the first tiny movement`);
  assert(c.hp.every(hp=>hp===config.units.bukhanka.hp),`${c.name}: safe departure must not cause collision damage`);
  if(!process.argv.includes('--complete'))assert(c.longestIdle.every(t=>t<=.5+1e-8),`${c.name}: free departure cannot idle more than .5s`);
  if(process.argv.includes('--complete'))assert(c.goals.every(g=>!g.task&&!g.path.length&&g.originalError<2.5),`${c.name}: every member must reach its original assigned endpoint`);
 }
}
