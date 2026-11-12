import assert from 'node:assert/strict';
import {fixture} from './check-start-latency-coordinator.mjs';
import {trafficCollisionRequired} from '../campaign/vehicle-collision.js';

// Exercise the shared engine boundary with each campaign tag. Scenario events
// belong to their mission suites. The camera and mission tag do not change
// collision or route scheduling.
const rows=[];
for(const tag of ['m01','m02','m03']){
 const m=fixture(),unit=m.addUnit('bukhanka','rai',{x:0,y:0}),other=m.addUnit('bukhanka','rai',{x:2000,y:2000});
 if(tag!=='m01')m.state[tag]={};
 unit.trafficOnScreen=other.trafficOnScreen=false;
 assert(trafficCollisionRequired(unit,other),tag+' ignores legacy camera flags');
 const submitted=m.submitOrder([unit.id],'move',{x:0,y:180});assert(submitted.ok);
 m.advance(0,{budgetMs:0});assert(unit.pendingOrder,'Zero budget cannot do route work');
 let frames=0;
 while(unit.pendingOrder&&frames++<200)m.advance(0,{budgetMs:2});
 assert(!unit.pendingOrder,tag+' plans between physics ticks even with an empty accumulator');
 assert.equal(m.state.time,0);assert.equal(unit.x,0);assert.equal(unit.y,0);assert(unit.path.length);
 const command=m.commandPlanner.advance,traffic=m.trafficCoordinator.advancePlanning;
 m.commandPlanner.advance=()=>{throw Error('Unbudgeted planning inside beginTick');};
 m.trafficCoordinator.advancePlanning=()=>{throw Error('Unbudgeted planning inside beginTick');};
 m.trafficCoordinator.advanceFixedPlanning=()=>{throw Error('Mission-specific fixed planning');};
 m.beginTick(.1,true);assert(m.pendingTick);
 m.commandPlanner.advance=command;m.trafficCoordinator.advancePlanning=traffic;
 delete m.state.m02;delete m.state.m03;
 m.continueTick();
 for(let i=0;i<1000&&unit.path.length;i++)m.advance(1/60,{budgetMs:5});
 assert(Math.hypot(unit.x,unit.y-180)<2,'Accepted route reaches its actual destination');
 assert.equal(unit.hp,unit.maxHp);
 rows.push({tag,planningFrames:frames,remaining:Math.hypot(unit.x,unit.y-180)});
}
console.log(JSON.stringify({passed:true,rows}));
