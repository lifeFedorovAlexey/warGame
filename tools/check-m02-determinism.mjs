import fs from 'node:fs';
import assert from 'node:assert/strict';
import {makeField,makeMission} from './m02-fixture.mjs';
import {prepareM02Diagnostic} from '../campaign/mission02-diagnostic.js';
const field=makeField(),setup=prepareM02Diagnostic(makeMission(field));
const start=field.gridToWorld(setup.config.startGrid),army=()=>setup.state.units.filter(u=>u.owner==='rai'&&setup.unitSpec(u).damage);
for(let row=0;row<12&&army().length<20;row++)for(let col=0;col<9&&army().length<20;col++){
 const p={x:start.x-160+col*32,y:start.y-140-row*32,heading:0,kind:'bukhanka',owner:'rai'};
 if(setup.vehicleMotionClear(p,p,p)&&setup.state.units.every(u=>Math.hypot(u.x-p.x,u.y-p.y)>28))setup.addUnit('bukhanka','rai',p);
}
const initial=setup.save();
for(const method of ['order','submitOrder']){
const states=[];
const cases=[Infinity,.01,.1];
for(const budgetMs of cases){
 const m=makeMission(field);m.load(initial);
 const ids=m.state.units.filter(u=>u.owner==='rai'&&m.unitSpec(u).damage).map(u=>u.id);assert(m[method](ids,'attack-move',field.gridToWorld([37.5,76.5])).ok);
 for(let tick=0;tick<600;tick++){
  m.advance(.1,{budgetMs});while(m.pendingTick||m.accumulator>=.1-1e-8)m.advance(0,{budgetMs});
  m.drainEvents();m.drainEffects();
 }
 const data=JSON.parse(m.save());delete data.accumulator;states.push(data);
 console.log(JSON.stringify({method,budgetMs,time:m.state.time,produced:m.state.m02.bases.hill_factory.production.count}));
}
for(const [i,state] of states.slice(1).entries()){
 const a=JSON.stringify(state),b=JSON.stringify(states[0]);
 if(a!==b){fs.writeFileSync('docs/campaign/alpha/m02/determinism-failed.json',JSON.stringify(states));throw new Error('State mismatch: '+JSON.stringify(cases[i+1]));}
}
}
console.log('PASS m02 slicing determinism');
