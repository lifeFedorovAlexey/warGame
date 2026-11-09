import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fixture} from './check-start-latency-coordinator.mjs';

// Independent counterexample: the precise rejected destination remains in
// the same factory. A nearby car rotating outside the factory cannot clear
// that destination. Baseline: 28 computePathSteps calls over two seconds.
const m=fixture(),unit=m.addUnit('bukhanka','rai',{x:0,y:0});
const building=m.addStructure('factory','rai',{x:0,y:300},{completed:true,progress:1});
m.rebuildNavigation();const neighbor=m.addUnit('bukhanka','rai',{x:120,y:300});
m.submitOrder([unit.id],'move',{x:0,y:300});
for(let i=0;i<200;i++)m.advance(1/80,{budgetMs:6});
assert.equal(unit.pendingOrder?.reason,'destination-occupied');
assert.equal(unit.pendingOrder?.blockerId,building.id);
let searches=0;const compute=m.commandPlanner.nav.computePathSteps;
m.commandPlanner.nav.computePathSteps=function*(...args){searches++;return yield* compute.apply(this,args);};
for(let i=0;i<160;i++){neighbor.heading+=.001;m.advance(1/80,{budgetMs:6});}
const result={passed:searches===0,seconds:2,searches,blocked:unit.pendingOrder,
 sourceSHA:createHash('sha256').update(fs.readFileSync('campaign/command-planner.js')).digest('hex')};
fs.writeFileSync('campaign/reports/command-negative-invalidation.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
assert.equal(searches,0,'An unchanged static blocker must not cause fresh searches when an unrelated nearby car turns');
