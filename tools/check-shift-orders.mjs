import assert from 'node:assert/strict';
import fs from 'node:fs';
import {progressMission} from './check-navigation-public-progress.mjs';

const report=[],distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const idle=u=>!u.task&&!u.path.length&&!u.pendingOrder&&!u.proposedOrder&&!u.detour&&!u.orderQueue?.length;
function run(m,done,seconds=100){
 const start=m.state.time;let frames=0;
 while(!done()&&m.state.time-start<seconds&&frames++<20000){m.advance(.1);m.effects=[];}
 assert(done(),JSON.stringify(m.state.units.filter(u=>u.x>-1500).map(u=>({id:u.id,x:u.x,y:u.y,task:u.task,path:u.path,queue:u.orderQueue,pending:u.pendingOrder,navigation:u.navigation}))));
}
function add(m,x=0,y=0,kind='bukhanka'){return m.addUnit(kind,'rai',{x,y},{heading:0});}
function order(m,units,action,target,append=false){const result=m.submitOrder(units.map(u=>u.id),action,target,{append});assert(result.ok,JSON.stringify(result));return result;}
{
 const m=progressMission(),u=add(m),points=[{x:0,y:100},{x:110,y:100},{x:110,y:220}],visited=[];
 order(m,[u],'move',points[0]);const current=structuredClone(u.pendingOrder);
 for(const p of points.slice(1))order(m,[u],'move',p,true);
 assert.deepEqual(u.pendingOrder,current);assert.equal(u.orderQueue.length,2);
 run(m,()=>{if(visited.length<points.length&&distance(u,points[visited.length])<3)visited.push(points[visited.length]);return idle(u);});
 assert.equal(visited.length,3);assert(distance(u,points[2])<2.1);
 report.push({case:'one vehicle visits three waypoints in order',visited});
}
{
 const m=progressMission(),units=[add(m,-40),add(m,0),add(m,40)];
 const group=m.configureGroup(units.map(u=>u.id),{formation:'line'});assert(group.ok,JSON.stringify(group));
 const leader=m.entity(m.state.commandGroups[0].leaderId);assert(leader);
 order(m,[leader],'move',{x:0,y:120});order(m,[leader],'move',{x:130,y:250},true);
 assert(units.every(u=>u.orderQueue?.length===1));
 run(m,()=>units.every(idle),180);
 assert(units.every(u=>distance(u,{x:130,y:250})<80));
 report.push({case:'leader queue expands once; members finish independently',positions:units.map(u=>({x:u.x,y:u.y}))});
}
{
 const m=progressMission(),u=add(m);
 order(m,[u],'move',{x:0,y:100});order(m,[u],'move',{x:80,y:200},true);
 const saved=m.save(),loaded=progressMission();loaded.config.initialMapBounds=[0,0,127,127];loaded.load(saved);const restored=loaded.entity(u.id);
 assert.equal(restored.orderQueue.length,1);run(loaded,()=>idle(restored));assert(distance(restored,{x:80,y:200})<2.1);
 report.push({case:'active and queued commands survive save/load'});
}
{
 const m=progressMission(),u=add(m),other=add(m,300);
 order(m,[u],'move',{x:0,y:100});order(m,[u],'move',{x:0,y:200},true);
 const original=structuredClone(u.orderQueue);assert(!m.submitOrder([u.id],'attack',{x:0,y:0,id:'missing'},{append:true}).ok);assert.deepEqual(u.orderQueue,original);
 assert(!m.submitOrder([u.id],'attack',{x:0,y:0,id:'missing'}).ok);assert.deepEqual(u.orderQueue,original);
 order(m,[other],'move',{x:300,y:200},true);order(m,[u],'move',{x:-100,y:100});assert(!u.orderQueue);assert.equal(other.orderQueue.length,1);
 order(m,[u],'move',{x:-100,y:200},true);m.stop([u.id]);assert(!u.orderQueue);assert.equal(other.orderQueue.length,1);
 order(m,[u],'move',{x:0,y:200},true);assert(m.retreat([u.id]).ok);assert(!u.orderQueue);
 report.push({case:'invalid orders preserve queue; replacement, Stop and explicit retreat clear only their units'});
}
{
 const m=progressMission(),u=add(m);u.task={type:'move',x:0,y:200};u.path=[];
 order(m,[u],'move',{x:150,y:200},true);const pending=structuredClone(u.orderQueue);
 // Blocked movement is still a current order even with no path.
 m.beginTick(.1);assert.deepEqual(u.orderQueue,pending);assert.equal(u.pendingOrder,undefined);
 m.continueTick();m.stop([u.id]);
 // The same wait applies to a repair visit and borrowed traffic position.
 for(const key of ['factoryVisit','combatRetreat','detour','yieldReturn','jointTraffic']){
  u[key]={};order(m,[u],'move',{x:0,y:100},true);m.beginTick(.1);assert.equal(u.orderQueue.length,1);delete u[key];m.stop([u.id]);m.continueTick();
 }
 report.push({case:'empty paths, repair visits and traffic waits cannot consume the next order'});
}
{
 const m=progressMission(),u=add(m,0,0,'raider'),enemy=m.addUnit('raider','scavs',{x:0,y:90});
 enemy.hp=1;m.visibleAt=()=>true;
 order(m,[u],'attack',enemy);order(m,[u],'move',{x:100,y:150},true);
 run(m,()=>idle(u),140);assert(enemy.hp<=0);assert(distance(u,{x:100,y:150})<2.1);
 order(m,[u],'attack-move',{x:100,y:240},true);order(m,[u],'move',{x:0,y:300},true);
 run(m,()=>idle(u),140);assert(distance(u,{x:0,y:300})<2.1);
 report.push({case:'attack and attack-move finish before subsequent movement'});
}
{
 const m=progressMission(),u=add(m,0,0,'builder');m.state.energy=2400;m.state.builderAutoRepair=true;
 const b=m.addStructure('generator','rai',{x:0,y:90},{completed:true,progress:1,groundHeight:0});b.hp=b.maxHp-3;m.rebuildNavigation();
 order(m,[u],'move',{x:-75,y:35});order(m,[u],'repair',b,true);order(m,[u],'move',{x:-75,y:190},true);
 run(m,()=>idle(u),180);assert.equal(b.hp,b.maxHp);assert(distance(u,{x:-75,y:190})<2.1);
 report.push({case:'builder moves, repairs, then moves; auto repair does not steal the queue'});
}
{
 const m=progressMission(),u=add(m);m.state.artifacts.push({id:'queued-artifact',key:'cannon',x:0,y:100,collected:false});
 order(m,[u],'move',{x:0,y:50});order(m,[u],'move',m.state.artifacts[0],true);order(m,[u],'move',{x:100,y:200},true);
 run(m,()=>idle(u),180);assert(m.state.artifacts[0].collected);assert(distance(u,{x:100,y:200})<2.1);
 report.push({case:'pickup completes without its internal Stop erasing following orders'});
}
{
 const m=progressMission(),u=add(m,0,0,'builder');m.state.energy=2400;
 const site=m.addStructure('lab','rai',{x:0,y:95},{completed:false,progress:.96,groundHeight:0});m.rebuildNavigation();
 order(m,[u],'move',{x:-75,y:35});order(m,[u],'build',site,true);order(m,[u],'move',{x:-75,y:180},true);
 run(m,()=>idle(u),180);assert(site.completed);assert(distance(u,{x:-75,y:180})<2.1);
 order(m,[u],'demolish',site,true);order(m,[u],'move',{x:0,y:240},true);
 run(m,()=>idle(u),180);assert(site.hp<=0);assert(distance(u,{x:0,y:240})<2.1);
 report.push({case:'queued construction and demolition complete before the next movement'});
}
{
 const m=progressMission(),units=Array.from({length:50},(_,i)=>add(m,(i%10)*32,Math.floor(i/10)*32));
 order(m,units,'move',{x:0,y:400},true);m.beginTick(.1);
 assert.equal(m.state.commandOrders.length,1);assert.equal(m.state.commandOrders[0].ids.length,50);
 report.push({case:'50 idle vehicles share one queued route-planning request'});
}
{
 const snapshot=JSON.parse(fs.readFileSync('tools/fixtures/navigation-slow-input.json'));
 const m=progressMission();m.load(snapshot);m.state.bounds=[0,0,127,127];m.rebuildNavigation();m.accumulator=0;
 m.advance(.1,{budgetMs:0});for(let i=0;i<1000&&!m.pendingTick?.iterator;i++)m.advance(0,{budgetMs:0});
 assert(m.pendingTick?.iterator);const tick=m.pendingTick,u=m.entity('u181'),task=u.task,start=performance.now();
 order(m,[u],'move',{x:-300,y:600},true);const milliseconds=performance.now()-start;
 assert(m.pendingTick===tick&&u.task===task&&milliseconds<100);assert.equal(u.orderQueue.length,1);
 m.stop([u.id]);assert(!u.orderQueue);
 for(let i=0;m.pendingTick&&i<20000;i++)m.advance(0,{budgetMs:5});
 assert(!m.pendingTick&&!u.task&&!u.path.length&&!u.orderQueue);
 report.push({case:'Shift during a real suspended recovery returns promptly; Stop cancels both',milliseconds});
}
{
 const m=progressMission(),u=add(m,0,0,'builder'),b=m.addStructure('lab','rai',{x:0,y:90},{completed:true,progress:1,groundHeight:0});
 b.hp=b.maxHp-5;m.rebuildNavigation();order(m,[u],'repair',b,true);order(m,[u],'move',{x:0,y:240},true);
 // Pause just after work has committed, while parking reservations are being
 // released. A new async Move is proposed against that accepted work order.
 const release=m.releaseParkingGoalsSteps;m.releaseParkingGoalsSteps=function*(...args){yield;return yield* release.apply(this,args);};
 const controller=m.updateUnitSteps(u,.1);while(!u.task){assert(!controller.next().done);}
 order(m,[u],'move',{x:-100,y:180});assert(u.proposedOrder);const replacement=u.proposedOrder;
 for(let step=controller.next();!step.done;step=controller.next()){}
 assert.equal(u.proposedOrder,replacement,'Finishing an old queued search must not cancel the replacement');assert(!u.orderQueue);
 run(m,()=>idle(u));assert(distance(u,{x:-100,y:180})<2.1);
 report.push({case:'new Move wins even while a queued work command is finishing publication'});
}
{
 const m=progressMission(),u=add(m,0,0,'raider'),enemy=m.addUnit('raider','scavs',{x:100,y:100});m.visibleAt=()=>true;
 order(m,[u],'move',{x:0,y:100});order(m,[u],'attack',enemy,true);order(m,[u],'move',{x:-100,y:200},true);enemy.hp=0;
 run(m,()=>idle(u));assert(distance(u,{x:-100,y:200})<2.1);
 report.push({case:'target destroyed before queued attack is skipped'});
}
fs.mkdirSync('campaign/previews/playtest-WG-027/after',{recursive:true});fs.writeFileSync('campaign/previews/playtest-WG-027/after/simulation.json',JSON.stringify({passed:true,cases:report},null,2));
console.log(JSON.stringify({passed:true,cases:report}));
