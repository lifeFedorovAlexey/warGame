import assert from 'node:assert/strict';
import fs from 'node:fs';
import {progressMission} from './check-navigation-public-progress.mjs';
import {vehicleClearance} from '../campaign/vehicle-collision.js';

function scene(blocked=true){
 const m=progressMission();m.state.energy=2000;
 const factory=m.addStructure('factory','rai',{x:0,y:0},{completed:true,progress:1});
 m.addStructure('generator','rai',{x:-600,y:0},{completed:true,progress:1});m.rebuildNavigation();
 assert(m.produce(factory.id,'bukhanka').ok);factory.queue[0].progress=1;
 const cars=[];
 if(blocked)for(let row=0;row<3;row++)for(let col=-1;col<=1;col++)cars.push(m.addUnit('bukhanka','rai',
  {x:col*16,y:-82-row*26},{heading:Math.PI}));
 for(let i=0;i<cars.length;i++)for(let j=0;j<i;j++)assert(vehicleClearance(cars[i],cars[j],m.config.worldScale,m.field)>0);
 return {m,factory,cars};
}
const results=[];
for(const blocked of [true,false]){
 const {m,factory}=scene(blocked),reference=scene(blocked).m;reference.tick(.1);
 let calls=0,maxAdvanceMs=0,heartbeats=0;
 const advance=delta=>{const start=performance.now();m.advance(delta,{budgetMs:5});maxAdvanceMs=Math.max(maxAdvanceMs,performance.now()-start);calls++;};
 const timer=setInterval(()=>heartbeats++,0);
 try{
  advance(.1);
  while(m.pendingTick&&calls<10000){await new Promise(resolve=>setImmediate(resolve));advance(0);}
 }finally{clearInterval(timer);}
 assert(!m.pendingTick);assert.deepEqual(JSON.parse(m.save()),JSON.parse(reference.save()),'Slicing the economy preserves the complete fixed step');
 const result={blocked,calls,maxAdvanceMs,heartbeats,produced:m.state.statistics.produced,exitBlocked:factory.exitBlocked};
 results.push(result);console.log(JSON.stringify(result));
 assert(maxAdvanceMs<100,'Factory egress must respect the frame budget instead of draining its whole search');
 if(blocked)assert(calls>1&&heartbeats>1,'UI/event-loop work runs while a real blocked-exit proof is pending');
 else assert.equal(m.state.statistics.produced,1,'An unobstructed factory still creates the actual queued vehicle');
}
for(const action of ['stop','retreat','auto-retreat-policy']){
 const {m,cars}=scene(),parking=m.parkingManeuverSteps;let selected;
 m.parkingManeuverSteps=function*(...args){selected=args[0];return yield* parking.apply(this,args);};
 for(let i=0;i<1000&&!selected;i++)m.advance(i?0:.1,{budgetMs:0});
 assert(selected&&m.pendingTick?.iterator,'Suspend the real factory parking search');
 const position={x:selected.x,y:selected.y},tick=m.pendingTick,start=performance.now();
 if(action==='stop')assert(m.stop([selected.id],{expandGroup:false}).ok);
 else if(action==='retreat')assert(m.retreat([selected.id]).ok);
 else{selected.hp=selected.maxHp*.3;assert(m.setCombatPolicy([selected.id],{retreat:'heavy'}).ok);}
 const inputMs=performance.now()-start;
 assert(m.pendingTick===tick&&inputMs<100,'Input cannot finish the suspended factory search synchronously');
 for(let i=0;i<10000&&m.pendingTick;i++)m.advance(0,{budgetMs:5});
 assert(!m.pendingTick&&!selected.detour&&!selected.pendingOrder,'A cancelled factory yield cannot publish its stale manoeuvre');
 assert.deepEqual({x:selected.x,y:selected.y},position);assert(cars.includes(selected));
 if(action==='retreat')assert(selected.combatRetreat?.forced);
 if(action==='auto-retreat-policy'){
  for(let i=0;i<10000&&!selected.combatRetreat;i++)m.advance(i?0:.1,{budgetMs:5});
  assert(selected.combatRetreat&&!selected.detour?.factoryExit,'The next controller gives low-HP retreat ownership instead of the factory loan');
 }
 results.push({case:action+' invalidates a suspended factory yield',inputMs,passed:true});
}
{
 const {m,factory}=scene(false),routing=m.movePathSteps;let entered=false;
 assert(m.setRally(factory.id,{x:600,y:600}).ok);
 m.movePathSteps=function*(...args){entered=true;return yield* routing.apply(this,args);};
 for(let i=0;i<10000&&!entered;i++)m.advance(i?0:.1,{budgetMs:0});
 assert(entered&&m.pendingTick?.iterator&&!m.state.statistics.produced,'Suspend a real factory route search');
 assert(m.setRally(factory.id,{x:-600,y:-600}).ok);
 for(let i=0;i<10000&&m.pendingTick;i++)m.advance(0,{budgetMs:5});
 assert(!m.pendingTick&&!m.state.statistics.produced,'An old rally proof cannot create a vehicle after the flag moves');
 for(let i=0;i<10000&&!m.state.statistics.produced;i++)m.advance(1/80,{budgetMs:5});
 const unit=m.state.units.find(u=>u.kind==='bukhanka');
 assert.equal(m.state.statistics.produced,1);assert(Math.hypot(unit.task.x+600,unit.task.y+600)<m.config.worldScale*27);
 results.push({case:'Changed rally invalidates a suspended exit route; retry uses the new flag',passed:true});
}
fs.writeFileSync('campaign/reports/factory-frame-budget.json',JSON.stringify({passed:true,results},null,2));
