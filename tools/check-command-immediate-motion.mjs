import assert from 'node:assert/strict';
import {fixture} from './check-start-latency-coordinator.mjs';
import {vehicleClearance} from '../campaign/vehicle-collision.js';
import {commandPathFromLive} from '../campaign/command-motion.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const pose=u=>({x:u.x,y:u.y,heading:u.heading});
const results=[];
// Deliberately withhold planner slices. The production physics/dispatcher
// must consume the latest intent even before any route search completes.
for(const target of [{x:120,y:400},{x:120,y:-400}]){
 const m=fixture(),u=m.addUnit('bukhanka','rai',{x:0,y:0},{heading:0}),start=pose(u);
 m.submitOrder([u.id],'move',target);
 m.tick(.1);
 assert(u.pendingOrder,'This is movement before a route exists');
 assert(distance(start,u)>.05,'An unobstructed car must move on the first physics step');
 assert(Math.abs(u.heading-start.heading)>1e-5,'The body turns through actual motion');
 assert(distance(start,u)>Math.abs(u.heading-start.heading),'No rotation in place');
 results.push({case:'immediate car-like start',target,displacement:distance(start,u),turn:u.heading-start.heading});
}
{
 const m=fixture(),units=Array.from({length:9},(_,i)=>m.addUnit('bukhanka','rai',{x:(i%3-1)*32,y:-Math.floor(i/3)*32},{heading:0}));
 const starts=units.map(pose);
 m.submitOrder(units.map(u=>u.id),'move',{x:0,y:400});m.tick(.1);
 assert(units.every((u,i)=>u.pendingOrder&&distance(starts[i],u)>.05),'All nine independently clear vehicles start before route allocation');
 assert(units.every(u=>Math.abs(u.heading)<1e-9),'Initial group intent preserves its lanes instead of converging on one point');
 results.push({case:'nine-car forward intent without any route-planner slice',passed:true});
}
{
 const m=fixture(),u=m.addUnit('bukhanka','rai',{x:0,y:0},{heading:0});
 m.submitOrder([u.id],'move',{x:0,y:450});
 // Suspend the real search, move its source, then finish that same command.
 m.commandPlanner.advance(0);
 for(let i=0;i<10;i++)m.tick(.1);
 const before=pose(u),hp=u.hp;
 assert(before.y>5,'The car progresses while the dispatcher is unfinished');
 for(let i=0;i<1000&&u.pendingOrder;i++)m.commandPlanner.advance(2);
 assert(!u.pendingOrder,'The moving source must not cause endless route restarts');
 assert.deepEqual(pose(u),before,'Publishing a route never rewinds the live pose');
 assert.equal(u.hp,hp);
 assert.deepEqual(u.routeOrder.destination,{x:0,y:450});
 for(let i=0;i<400&&u.task;i++)m.advance(.1);
 assert(!u.task&&distance(u,{x:0,y:450})<1,'The handoff preserves the actual requested destination');
 results.push({case:'live-pose handoff and exact arrival',passed:true});
}
{
 const m=fixture(),a=m.addUnit('bukhanka','rai',{x:0,y:-30},{heading:0}),b=m.addUnit('bukhanka','rai',{x:0,y:30},{heading:Math.PI});
 const hp=[a.hp,b.hp];
 m.submitOrder([a.id],'move',{x:0,y:200});m.submitOrder([b.id],'move',{x:0,y:-200});
 let gap=Infinity;
 for(let i=0;i<30;i++){m.tick(.1);gap=Math.min(gap,vehicleClearance(a,b,m.config.worldScale,m.field));}
 assert(gap>0,'Pending commands still obey swept-body and braking clearance');
 assert.deepEqual([a.hp,b.hp],hp);
 const before=pose(a);m.stop([a.id]);m.tick(.1);assert.deepEqual(pose(a),before);
 m.submitOrder([a.id],'move',{x:250,y:a.y});m.tick(.1);
 assert.equal(a.pendingOrder.target.x,250,'The latest click owns immediate steering');
 results.push({case:'opposing pending commands, Stop and replacement',minimumGap:gap});
}
{
 const m=fixture(),u=m.addUnit('bukhanka','rai',{x:0,y:0},{heading:0});
 m.submitOrder([u.id],'move',{x:130,y:500});for(let i=0;i<4;i++)m.tick(.1);
 const saved=m.save(),copy=fixture();copy.load(saved);copy.state.bounds=m.state.bounds.slice();copy.rebuildNavigation();
 const loaded=copy.entity(u.id);
 assert(loaded.pendingOrder.started,'The moving command survives serialization');
 for(let i=0;i<8;i++){
  m.tick(.1);copy.tick(.1);assert.deepEqual(pose(loaded),pose(u));assert.equal(loaded.driveSpeed,u.driveSpeed);
 }
 for(let i=0;i<1000&&loaded.pendingOrder;i++)copy.advance(0,{budgetMs:2});
 assert(!loaded.pendingOrder&&loaded.routeOrder.request.x===130);
 results.push({case:'save/load of a moving unfinished command',passed:true});
}
{
 const m=fixture(),units=Array.from({length:6},(_,i)=>m.addUnit('bukhanka','rai',{x:i<3?-6:6,y:(i%3-1)*26},{heading:Math.PI}));
 m.submitOrder(units.map(u=>u.id),'move',{x:0,y:600});
 // Older saves have neither the early steering directive nor its cohort
 // guard. They must keep the old pending semantics until a new click.
 for(const u of units){delete u.pendingOrder.steeringTarget;delete u.pendingOrder.holdForRoute;}
 const saved=m.save(),copy=fixture();copy.load(saved);copy.state.bounds=m.state.bounds.slice();copy.rebuildNavigation();
 const loaded=units.map(u=>copy.entity(u.id)),before=loaded.map(pose);copy.tick(.1);
 assert.deepEqual(loaded.map(pose),before,'Loading an old pending cohort cannot release independent turns');
 results.push({case:'legacy pending saves preserve coordinated departure',passed:true});
}
{
 const source={x:0,y:0,heading:0},empty=[];
 const mission={nav:{lineClear(){assert.fail('An empty route has no segment to validate');}}};
 assert.equal(commandPathFromLive(mission,{...source},source,empty),empty,'An in-range stationary attack needs no movement');
 for(const unit of [{...source,x:1},{...source,heading:.1}]){
  const before={...unit};
  assert.equal(commandPathFromLive(mission,unit,source,empty),null,'A moved or turned attacker must recheck its empty route');
  assert.deepEqual(unit,before,'Rejecting an old empty route must not rewind the live pose');
 }
 results.push({case:'empty attack route after translation or rotation replans without reading path[0]',passed:true});
}
console.log(JSON.stringify(results,null,2));
