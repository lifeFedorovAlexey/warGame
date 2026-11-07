import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture,opposingCase} from './check-start-latency-coordinator.mjs';
import {vehicleClearance} from '../campaign/vehicle-collision.js';

function finishCommands(m){for(let i=0;i<1000;i++){
 m.advance(1/80,{budgetMs:6});
 if(!m.state.commandOrders?.some(r=>['queued','planning'].includes(r.status)))return;
}throw Error('Command planning did not finish');}

function blockedOrder(){
 const m=fixture(),a=m.addUnit('bukhanka','rai',{x:0,y:-65},{heading:0}),
  b=m.addUnit('bukhanka','rai',{x:0,y:65},{heading:Math.PI}),goal={x:0,y:65};
 assert(m.order([a.id],'move',goal).ok);
 assert.deepEqual(a.routeOrder.goalBlockers,[b.id]);
 assert(Math.hypot(a.task.x-goal.x,a.task.y-goal.y)>3,'A stationary body retains its parking place');
 return {m,a,b,goal};
}

const results=[];
for(const range of [18,28,65])for(const width of [0,34]){
 const result=opposingCase({name:'released actual order',range,goalRange:range===65?90:range,width});
 assert.deepEqual(result.acceptedGoals,result.requestedGoals,'The departing body releases the original single-car goal');
 assert(result.complete&&result.goalErrors.every(error=>error<3),'Reach the original clicks');
 assert(result.minGap>=0&&result.contacts.length===0,'Preserve swept collisions');
 assert.deepEqual(result.hp,result.maxHp,'No friendly damage');
 results.push(result);
}

{
 const {m,a,b}=blockedOrder(),before=structuredClone(a.routeOrder),path=a.path;
 const unrelated=m.addUnit('bukhanka','rai',{x:300,y:0},{heading:0});
 assert(m.order([unrelated.id],'move',{x:300,y:300}).ok);
 assert.deepEqual(a.routeOrder,before,'An unrelated order cannot reclaim occupied ground');
 assert.equal(a.path,path,'An unrelated order does not search again');
 assert(m.order([b.id],'move',{x:b.x,y:b.y}).ok);
 assert.deepEqual(a.routeOrder,before,'A new route which reserves the same place does not release it');
 assert.equal(a.path,path);
}
{
 const {m,a,b}=blockedOrder(),before=structuredClone(a.routeOrder);
 m.stop([a.id]);assert(m.order([b.id],'move',{x:150,y:65}).ok);
 assert(!a.task&&!a.path.length,'A released goal must not restart a stopped unit');
 assert.deepEqual(a.routeOrder,before);
}
{
 const {m,a,b,goal}=blockedOrder(),loaded=fixture();
 loaded.load(m.save());loaded.state.bounds=m.state.bounds.slice();loaded.rebuildNavigation();
 for(const mission of [m,loaded])assert(mission.order([b.id],'move',{x:150,y:65}).ok);
 assert.deepEqual(m.entity(a.id).path,loaded.entity(a.id).path,'Save/load retains why the click was displaced');
 assert.deepEqual(loaded.entity(a.id).routeOrder.destination,goal);
}
{
 const m=fixture(),cars=Array.from({length:3},(_,i)=>m.addUnit('bukhanka','rai',{x:(i-1)*32,y:0},{heading:0}));
 assert(m.order(cars.map(u=>u.id),'move',{x:0,y:300}).ok);
 assert(cars.every(u=>!u.routeOrder.goalBlockers),'Intentional formation slots are never reclaimed as solo clicks');
}
{
 const {m,a,b,goal}=blockedOrder();
 let searches=0;const search=m.vehiclePathSteps;
 m.vehiclePathSteps=function*(...args){searches++;return yield* search.apply(this,args);};
 m.damage(b,b.maxHp*4,a);
 assert.equal(searches,0,'Death must not run synchronous navigation inside the damage loop');
 assert.deepEqual(m.state.parkingGoalReleases,[b.id]);
 const loaded=fixture();loaded.load(m.save());loaded.state.bounds=m.state.bounds.slice();loaded.rebuildNavigation();
 const occupancy=m.nav.occupied.slice();m.beginTick(.1,true);
 assert.equal(m.continueTick(performance.now()-1),false,'Goal release obeys the tick deadline');
 assert.deepEqual(m.nav.occupied,occupancy,'Suspending the search cannot leak temporary occupancy');
 m.finishPendingStep();loaded.advance(.1);
 assert.deepEqual(a.routeOrder.destination,goal,'Death releases the original click on the next tick');
 assert.equal(searches,1,'A death releases this claim with exactly one search');
 assert.deepEqual(loaded.entity(a.id).routeOrder,a.routeOrder,'Queued death release survives save/load');
 assert.deepEqual([loaded.entity(a.id).x,loaded.entity(a.id).y],[a.x,a.y]);
 // JSON saves normalise -0 to 0 in impact normals; compare the saved state.
 assert.deepEqual(JSON.parse(JSON.stringify(loaded.state)),JSON.parse(JSON.stringify(m.state)),
  'Budgeted queued release and save/load preserve the complete serialized simulation state');
}
{
 const {m,a,b}=blockedOrder();m.damage(b,b.maxHp*4,a);m.stop([a.id]);m.advance(.1);
 assert(!a.task&&!a.path.length,'Stop cancels a queued death release');
}
const asynchronous=[];
for(const alreadyMoving of [false,true])for(const width of [0,34]){
 const m=fixture(width),a=m.addUnit('bukhanka','rai',{x:0,y:-65},{heading:0}),
  b=m.addUnit('bukhanka','rai',{x:0,y:65},{heading:Math.PI}),goal={x:0,y:65};
 if(alreadyMoving){m.submitOrder([b.id],'move',{x:0,y:-65});finishCommands(m);}
 m.submitOrder([a.id],'move',goal);finishCommands(m);
 if(!alreadyMoving){assert.deepEqual(a.routeOrder.goalBlockers,[b.id]);m.submitOrder([b.id],'move',{x:0,y:-65});finishCommands(m);}
 let contacts=0,gap=Infinity;const collision=m.vehicleCollision.bind(m);m.vehicleCollision=(...args)=>{contacts++;return collision(...args);};
 for(let step=0;step<500;step++){
  m.advance(.1);gap=Math.min(gap,vehicleClearance(a,b,m.config.worldScale,m.field));
  if(!a.task&&!b.task&&!a.path.length&&!b.path.length&&!a.detour&&!b.detour)break;
 }
 assert.deepEqual(a.routeOrder.destination,goal,'submitOrder must restore the exact click after a moving blocker leaves');
 assert(Math.hypot(a.x-goal.x,a.y-goal.y)<3&&Math.hypot(b.x,b.y+65)<3,'Both actual async orders must finish');
 assert.equal(contacts,0);assert(gap>=0);assert.equal(a.hp,a.maxHp);assert.equal(b.hp,b.maxHp);
 asynchronous.push({alreadyMoving,width,contacts,gap,seconds:m.state.time,passed:true});
}
let groupOrderMs=0,releaseMs=0;
{
 const m=fixture(),cars=Array.from({length:500},(_,i)=>m.addUnit('bukhanka','rai',
  {x:-600+(i%25)*48,y:-1200+Math.floor(i/25)*48},{heading:0}));
 let releaseSearches=0;const release=m.releaseParkingGoalsSteps,search=m.vehiclePathSteps;
 m.releaseParkingGoalsSteps=function*(changed){
  this.vehiclePathSteps=function*(...args){releaseSearches++;return yield* search.apply(this,args);};
  const started=performance.now();
  try{return yield* release.call(this,changed);}finally{releaseMs=performance.now()-started;this.vehiclePathSteps=search;}
 };
 const started=performance.now(),result=m.order(cars.map(u=>u.id),'move',{x:0,y:700});groupOrderMs=performance.now()-started;
 assert.equal(result.assigned,500);
 assert.equal(releaseSearches,0,'A 500-car formation order performs no extra goal-release searches');
 assert(cars.every(u=>!u.routeOrder.goalBlockers));
}

const report={passed:true,cases:results.length,stationaryAndReserved:true,stop:true,saveLoad:true,formationSlots:true,
 deathQueue:true,budgetedSearch:true,asynchronous,group500:{releaseSearches:0,releaseMs,groupOrderMs},results};
fs.mkdirSync('campaign/reports',{recursive:true});
fs.writeFileSync('campaign/reports/order-goal-release.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,results:results.map(({range,width,seconds,minGap,goalErrors})=>({range,width,seconds,minGap,goalErrors}))},null,2));
