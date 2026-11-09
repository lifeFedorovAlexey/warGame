import assert from 'node:assert/strict';
import {fixture} from './check-start-latency-coordinator.mjs';
import {CommandPlanner} from '../campaign/command-planner.js';
import {applyRouteContinuations} from '../campaign/route-continuation.js';

// Actual prefix-enabled order, through a physical 36-world-unit throat.
// Baseline: tail had passage/preceding/throat; apply dropped all three while
// keeping the route through that throat. No synthetic paths are injected.
const results=[];
for(const width of [36,14]){
const m=fixture(),walls=()=>{
 for(const x of [-80,80])m.addStructure('generator','neutral',{x,y:0},
  {halfWidth:80-width/2,halfDepth:90,completed:true,progress:1,hp:100000});
 m.rebuildNavigation();
};
if(width===36)walls();
const units=[-16,16].map(x=>m.addUnit('bukhanka','rai',{x,y:-300},{heading:0}));
m.commandPlanner=new CommandPlanner(m,{prefixThreshold:2});
let hold=true;const original=m.orderSteps;
m.orderSteps=function*(...args){while(hold)yield;return yield* original.apply(this,args);};
m.submitOrder(units.map(u=>u.id),'move',{x:0,y:600});
for(let i=0;i<1000&&!units.every(u=>u.routeContinuation?.phase==='following');i++){
 m.commandPlanner.advance(2);m.tick(.1);
}
assert(units.every(u=>u.routeContinuation?.phase==='following'));
// A real construction event narrows the route after the prefix was checked.
// The next tail search must retain the resulting single-stream admission.
if(width===14)walls();
hold=false;
for(let i=0;i<10000&&!units.every(u=>u.routeContinuation?.ready);i++)m.commandPlanner.advance(2);
assert(units.every(u=>u.routeContinuation?.ready));
const expected=units.map(u=>structuredClone(u.routeContinuation.ready.fields.passage));
assert(expected.every(p=>p?.throat?.width===width),'Production order must select this actual passage');
assert.equal(expected[1].preceding,units[0].id);
const poses=units.map(u=>({x:u.x,y:u.y,heading:u.heading,speed:u.driveSpeed,hp:u.hp}));
applyRouteContinuations(m);
assert.deepEqual(units.map(u=>u.passage),expected,'Appending a tail must preserve its passage admission and precedence');
assert.deepEqual(units.map(u=>({x:u.x,y:u.y,heading:u.heading,speed:u.driveSpeed,hp:u.hp})),poses);
m.trafficCoordinator.update(m);
// A 36-world throat admits two vans side by side and needs no exclusive
// lease. Only the 14-world physical throat must request one-way ownership.
if(width===14)assert(units.every(u=>m.trafficCoordinator.passageDecisions.has(u.id)),
 'Actual coordinator must see both single-stream passage requests before movement');
results.push({width,units:units.map(u=>({id:u.id,passage:u.passage,
 admission:m.trafficCoordinator.passageDecisions.get(u.id)}))});
}
console.log(JSON.stringify({passed:true,results},null,2));
