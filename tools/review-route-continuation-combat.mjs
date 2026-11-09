import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from './check-start-latency-coordinator.mjs';
import {CommandPlanner} from '../campaign/command-planner.js';
import {automaticCombatTarget} from '../campaign/combat-policy.js';

// Independent held-tail counterexample: only delay the real asynchronous tail
// generator. Commands, prefixes, combat targeting and physical movement stay
// production code. The enemy appears after the real prefix is exhausted.
const results=[];
for(const action of ['move','attack-move']){
 const m=fixture(),units=[-48,48].map(x=>m.addUnit('bukhanka','rai',{x,y:0},{heading:0}));
 m.commandPlanner=new CommandPlanner(m,{prefixThreshold:2});
 const original=m.orderSteps;let hold=true;
 m.orderSteps=function*(...args){while(hold)yield;return yield* original.apply(this,args);};
 m.submitOrder(units.map(u=>u.id),action,{x:0,y:600});
 const tick=()=>{m.commandPlanner.advance(2);m.tick(.1);};
 for(let i=0;i<1000&&!units.every(u=>u.routeContinuation?.phase==='following'&&!u.path.length);i++)tick();
 assert(units.every(u=>u.routeContinuation?.phase==='following'&&!u.path.length));
 const enemy=m.addUnit('builder','scavs',{x:0,y:units[0].y+80},{heading:0});
 m.updateFog();
 const targetable=units.map(u=>automaticCombatTarget(m,u,m.unitSpec(u))?.id),hp=enemy.hp;
 assert(targetable.every(id=>id===enemy.id),'Late contact must be a real in-range visible automatic target');
 let shots=0;const attack=m.attack;
 m.attack=function(unit,...args){if(units.includes(unit))shots++;return attack.call(this,unit,...args);};
 for(let i=0;i<20;i++)tick();
 results.push({action,time:m.state.time,targetable,shots,hpBefore:hp,hpAfter:enemy.hp,
  units:units.map(u=>({id:u.id,x:u.x,y:u.y,task:u.task,continuation:!!u.routeContinuation,navigation:u.navigation}))});
 hold=false;
}
fs.writeFileSync('campaign/reports/route-continuation-combat-review.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2));
assert(results.every(r=>r.shots>0),'A pending tail must not suppress legal turret fire at a newly visible target');
