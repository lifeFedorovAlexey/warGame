import fs from 'node:fs';
import assert from 'node:assert/strict';
import {progressMission} from './check-navigation-public-progress.mjs';

const phase=process.env.MANEUVER_PHASE??'verified',folder='campaign/previews/playtest-WG-051/'+phase;
fs.mkdirSync(folder,{recursive:true});
const specs=[
 {name:'forward',goal:{x:0,y:120}},
 {name:'reverse-close',goal:{x:0,y:-10}},
 {name:'reverse-offset',goal:{x:4,y:-25}},
 {name:'turn-around',goal:{x:0,y:-120}},
 {name:'side-close',goal:{x:10,y:0}},
 {name:'side-left',goal:{x:-10,y:0}},
 {name:'diagonal-back',goal:{x:15,y:-20}},
 {name:'moving-reversal',goal:{x:0,y:160},replaceAt:2,next:{x:0,y:-120}},
 {name:'beside-building',goal:{x:55,y:35},building:{x:110,y:35}},
 {name:'group-reverse',goal:{x:0,y:-120},count:6},
];
const selected=process.env.MANEUVER_CASES?.split(','),summaries=[];
for(const spec of specs.filter(s=>!selected||selected.includes(s.name))){
 const m=progressMission(),units=Array.from({length:spec.count??1},(_,i)=>m.addUnit('bukhanka','rai',{x:(i%3)*24,y:-Math.floor(i/3)*28},{heading:0}));
 if(spec.building)m.addStructure('generator','rai',spec.building,{completed:true,progress:1});
 m.rebuildNavigation();m.explored.fill(255);m.visible.fill(255);
 const ids=units.map(u=>u.id),initial=m.save(),trace=[],health=units.map(u=>u.hp),contacts=[],goals=new Map(),goalChanges=[];
 const collision=m.vehicleCollision;m.vehicleCollision=function(u,s,b){contacts.push({t:this.state.time,id:u.id,s,blockers:[...b].map(x=>x.id)});return collision.call(this,u,s,b);};
 assert(m.submitOrder(ids,'move',spec.goal).ok);let replaced=false,frame=0;
 const done=u=>!u.pendingOrder&&!u.proposedOrder&&!u.task&&!u.path.length&&!u.detour&&!u.yieldReturn;
 const wall=performance.now();
 while(m.state.time<45&&performance.now()-wall<45000){
  if(spec.replaceAt&&!replaced&&m.state.time>=spec.replaceAt){assert(m.submitOrder(ids,'move',spec.next).ok);replaced=true;goals.clear();}
  m.advance(.1);m.drainEffects();
  for(const u of units)if(!u.pendingOrder&&u.routeOrder?.destination){
   const goal=u.routeOrder.destination;
   if(!goals.has(u.id))goals.set(u.id,{...goal});
   else if(Math.hypot(goal.x-goals.get(u.id).x,goal.y-goals.get(u.id).y)>.001)goalChanges.push(u.id);
  }
  trace.push({time:m.state.time,units:units.map(u=>({id:u.id,x:u.x,y:u.y,heading:u.heading,speed:u.driveSpeed,reverse:!!u.reversing,
   steering:u.steering,requested:u.steeringRequested,reason:u.navigation?.reason,wait:u.navigation?.waitSeconds,
   pending:!!u.pendingOrder,task:u.task?.type,path:u.path.length,waypoint:u.path[0],goal:u.routeOrder?.destination,
   detour:u.detour?.recoveryTurn?'pivot':u.detour?.legs?.map(l=>({direction:l.direction,remaining:l.remaining})),
   control:m.trafficCoordinator.controls?.get(u.id),done:done(u)}))});
  frame++;if(units.every(done)&&(!spec.replaceAt||replaced))break;
 }
 const stats=units.map((u,i)=>{
  const rows=trace.map(r=>r.units[i]);let travel=0,gearChanges=0,steerChanges=0,stops=0,maxIdle=0,idle=0,previousSign=0,lastSteer=0;
  for(let n=0;n<rows.length;n++){
   const r=rows[n],prev=rows[n-1],sign=r.speed>.2?(r.reverse?-1:1):0,steer=Math.abs(r.steering)>.04?Math.sign(r.steering):0;
   if(sign&&previousSign&&sign!==previousSign)gearChanges++;if(sign)previousSign=sign;
   if(steer&&lastSteer&&steer!==lastSteer&&r.speed>1)steerChanges++;if(steer)lastSteer=steer;
   if(prev){const d=Math.hypot(r.x-prev.x,r.y-prev.y);travel+=d;idle=!r.done&&d<.01?idle+.1:0;maxIdle=Math.max(idle,maxIdle);if(prev.speed>1&&r.speed<.05&&!r.done)stops++;}
  }
  const goal=goals.get(u.id)??spec.next??spec.goal;
  return {id:u.id,done:done(u),seconds:trace.find(r=>r.units[i].done&&(!spec.replaceAt||r.time>spec.replaceAt))?.time??m.state.time,travel,gearChanges,steerChanges,stops,maxIdle,
   error:Math.hypot(u.x-goal.x,u.y-goal.y),hpLost:health[i]-u.hp};
 });
 const report={name:spec.name,initial:JSON.parse(initial),trace,stats,contacts,final:JSON.parse(m.save())};
 fs.writeFileSync(folder+'/'+spec.name+'.json',JSON.stringify(report,null,2));
 const summary={name:spec.name,stats,contacts:contacts.length,goalChanges};summaries.push(summary);console.log(JSON.stringify(summary));
}
fs.writeFileSync(folder+'/summary.json',JSON.stringify(summaries,null,2));
if(process.argv.includes('--verify'))for(const row of summaries){
 assert(row.stats.every(s=>s.done&&s.seconds<25&&s.error<.65&&s.hpLost===0),row.name+': arrival, precision, health');
 assert.equal(row.contacts,0,row.name+': physical contacts');assert.equal(row.goalChanges.length,0,row.name+': accepted goals stay fixed');
 if(['moving-reversal','turn-around','reverse-offset','diagonal-back'].includes(row.name))assert(row.stats.every(s=>s.steerChanges<=2),row.name+': steering must not oscillate');
 if(row.name==='reverse-offset')assert(row.stats[0].travel<30,'Nearby rear target must not cause a forward loop');
 if(row.name.startsWith('side-'))assert(row.stats[0].travel<45&&row.stats[0].gearChanges<=2,'Compact parking manoeuvre');
}
