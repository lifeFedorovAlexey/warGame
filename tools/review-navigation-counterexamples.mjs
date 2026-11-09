import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Mission} from '../campaign/mission.js';
import {vehicleClearance} from '../campaign/vehicle-collision.js';
const config=JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/gameplay.json'));
const field={extent:4096,half:2048,cellMetres:32,heightAt:()=>0,gradientAt:()=>({x:0,y:0}),gridToWorld:([x,y])=>({x:x*32-2048,y:2048-y*32}),worldToGrid:(x,y)=>[(x+2048)/32,(2048-y)/32]};
function fixture(){const m=new Mission(config,field);Object.assign(m.state,{units:[],buildings:[],camps:[],bounds:[0,0,127,127],pendingCinematics:[]});m.updateMission=()=>{};m.rebuildNavigation();m.explored.fill(255);return m;}
const requestedGoals=new WeakMap();
function car(m,x,y,heading,goal){
 const u=m.addUnit('bukhanka','rai',{x,y},{heading,previousHeading:heading});
 if(goal){requestedGoals.set(u,{...goal});assert(m.submitOrder([u.id],'move',goal).ok);}
 return u;
}
function run(m,units,ticks=600){
 let minimum=Infinity,firstDamage=null,maxWait=0,submitted=0,frames=0;
 const start=m.state.time,seconds=ticks/10,wall=performance.now(),contacts=[],collision=m.vehicleCollision.bind(m);
 const active=u=>u.pendingOrder||u.task||u.path.length||u.detour||u.yieldReturn;
 const missed=u=>{const goal=requestedGoals.get(u);return goal&&Math.hypot(u.x-goal.x,u.y-goal.y)>=2.01;};
 m.vehicleCollision=(u,s,b)=>{if(b.size)contacts.push({id:u.id,time:m.state.time,blockers:[...b].map(v=>v.id)});return collision(u,s,b);};
 while((m.pendingTick||m.state.time-start<seconds-1e-6)&&units.some(active)&&frames++<200000&&performance.now()-wall<90000){
  const delta=Math.min(1/80,Math.max(0,seconds-submitted));submitted+=delta;m.advance(delta,{budgetMs:5});
  for(const u of units)maxWait=Math.max(maxWait,u.navigation?.waitSeconds??0);
  if(!m.pendingTick)for(let a=0;a<units.length;a++)for(let b=a+1;b<units.length;b++)
   minimum=Math.min(minimum,vehicleClearance(units[a],units[b],config.worldScale,field));
  if(!firstDamage&&units.some(u=>u.hp<u.maxHp))firstDamage={time:m.state.time,units:units.map(u=>({id:u.id,hp:u.hp,x:u.x,y:u.y}))};
 }
 m.vehicleCollision=collision;
 return {seconds:m.state.time,minimum:Number.isFinite(minimum)?minimum:null,firstDamage,contacts,maxWait,
  // Two-car encounters have no long external queue to justify a 5.7 s stop.
  waitLimit:units.length<=4?5:30,
  unfinished:units.filter(u=>active(u)||missed(u)).map(u=>({id:u.id,x:u.x,y:u.y,path:u.path,pendingOrder:u.pendingOrder,
   traffic:u.traffic,detour:u.detour,yieldReturn:u.yieldReturn,queue:m.trafficCoordinator.queueing(u)}))};
}
const result={angles:[],fourWay:[],stopLeader:[]};
if(process.argv.includes('--timeline')){
 const m=fixture(),units=[],trace=[],size=Number(process.argv.find(x=>x.startsWith('--size='))?.split('=')[1]??5),seconds=Number(process.argv.find(x=>x.startsWith('--seconds='))?.split('=')[1]??13);
 for(let i=0;i<size;i++)for(let axis=0;axis<4;axis++){const r=axis*Math.PI/2,dx=Math.cos(r),dy=Math.sin(r),d=180+(size-i)*30;units.push(car(m,-(80+i*30)*dx,-(80+i*30)*dy,Math.atan2(-dx,dy),{x:d*dx,y:d*dy}));}
 const update=m.trafficCoordinator.update.bind(m.trafficCoordinator);
 m.trafficCoordinator.update=mission=>{update(mission);trace.push({time:m.state.time,units:units.map(u=>({id:u.id,x:u.x,y:u.y,hp:u.hp,heading:u.heading,speed:u.driveSpeed,passing:u.passingLane?{...u.passingLane}:null,decision:m.trafficCoordinator.decisions.get(u.id),course:m.trafficCoordinator.intents.get(u.id)?.course,queue:m.trafficCoordinator.queueing(u),detour:u.detour?structuredClone(u.detour):null,watch:u.driveWatch?{...u.driveWatch}:null,traffic:u.traffic?{...u.traffic}:null})),leases:m.state.trafficControl.leases.map(l=>({...l}))});};
 const clear=m.vehicleMotionClear.bind(m),speed=m.trafficSpeed.bind(m);
 m.vehicleMotionClear=(u,from,to,grade,blockers,...rest)=>{const value=clear(u,from,to,grade,blockers,...rest);if(!value&&['u36','u38','u50','u51'].includes(u.id)){trace.at(-1).blocked??={};trace.at(-1).blocked[u.id]??={to,ids:[...blockers??[]].map(x=>x.id)};}return value;};
 m.trafficSpeed=(u,...args)=>{const v=speed(u,...args);if(['u36','u38','u50','u51'].includes(u.id)){trace.at(-1).limits??={};trace.at(-1).limits[u.id]=v;}return v;};
 run(m,units,Math.round(seconds*10));fs.writeFileSync('campaign/reports/navigation-review-timeline.json',JSON.stringify(trace,null,2));console.log('timeline saved');process.exit(0);
}
for(const degrees of [20,30,35,45,60,75,90,105,120,135,145,150,160]){
 const m=fixture(),r=degrees*Math.PI/180,dx=Math.cos(r),dy=Math.sin(r),a=car(m,-80,0,-Math.PI/2,{x:120,y:0}),b=car(m,-80*dx,-80*dy,Math.atan2(-dx,dy),{x:120*dx,y:120*dy});
 result.angles.push({degrees,...run(m,[a,b])});
}
for(const size of [1,5,10]){
 const m=fixture(),units=[];
 for(let i=0;i<size;i++)for(let axis=0;axis<4;axis++){
  const r=axis*Math.PI/2,dx=Math.cos(r),dy=Math.sin(r),distance=180+(size-i)*30;
  units.push(car(m,-(80+i*30)*dx,-(80+i*30)*dy,Math.atan2(-dx,dy),{x:distance*dx,y:distance*dy}));
 }
 result.fourWay.push({size:size*4,...run(m,units,1600),decisions:[...m.trafficCoordinator.decisions],leases:m.state.trafficControl.leases});
}
for(const separation of [32,50,70,100]){
 const m=fixture(),a=car(m,0,0,0,{x:0,y:300}),b=car(m,0,-separation,0,{x:0,y:260});
 for(let i=0;i<40;i++)m.advance(.1);
 m.stop([a.id]);requestedGoals.delete(a);result.stopLeader.push({separation,...run(m,[a,b],600)});
}
fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/navigation-review-counterexamples.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
if(process.argv.includes('--verify'))for(const [family,cases] of Object.entries(result))for(const test of cases){
 assert.equal(test.firstDamage,null,`${family} ${test.degrees??test.size??test.separation}: friendly traffic damaged vehicles`);
 assert.equal(test.contacts.length,0,`${family}: vehicle contact`);
 assert(test.maxWait<=test.waitLimit,`${family}: ${test.maxWait.toFixed(1)} s stationary exceeds ${test.waitLimit} s`);
 assert.equal(test.unfinished.length,0,`${family} ${test.degrees??test.size??test.separation}: traffic did not finish`);
 assert(test.minimum===null||test.minimum>=0,`${family}: overlap`);
}
