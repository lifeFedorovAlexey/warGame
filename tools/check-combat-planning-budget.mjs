import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from './check-start-latency-coordinator.mjs';
import {updateCombatDeployment} from '../campaign/combat-deployment.js';
import {assignFormation,assignFormationSteps} from '../campaign/formation-assignment.js';

const results=[];
{
 // A stopped vehicle must not be resurrected by a suspended batch matching
 // operation when the remaining vehicles finish reserving firing positions.
 const m=fixture(),units=Array.from({length:20},(_,i)=>m.addUnit('bukhanka','rai',
  {x:(i%4-1.5)*36,y:-Math.floor(i/4)*32},{heading:0,combatGroup:'budget-check'}));
 const target=m.addStructure('generator','scavs',{x:0,y:200},{hp:100000,completed:true,progress:1});
 m.rebuildNavigation();m.visible.fill(255);m.explored.fill(255);
 for(const unit of units)unit.task={type:'attack',targetId:target.id};
 const steps=updateCombatDeployment(m,units[0],m.unitSpec(units[0]),.1),samples=[];
 let checks=0,maxChecks=0,yields=0,done=false;
 const clear=m.vehicleMotionClear.bind(m);m.vehicleMotionClear=(...args)=>{checks++;return clear(...args);};
 const first=steps.next();assert(!first.done,'Initial position assignment must allow a frame to finish');
 m.stop([units[0].id]);
 while(!done){const before=checks,start=performance.now(),result=steps.next();samples.push(performance.now()-start);maxChecks=Math.max(maxChecks,checks-before);done=result.done;if(!done)yields++;}
 assert(yields>1&&maxChecks<=8,'Geometry candidate checks must be split into bounded batches');
 assert.equal(units[0].task,null);assert(!units[0].combatDeployment&&!units[0].path.length,'A new Stop wins over old matching results');
 assert(units.slice(1).every(u=>u.combatDeployment?.slot),'Uncancelled members retain valid assigned positions');
 samples.sort((a,b)=>a-b);const percentile=p=>samples[Math.min(samples.length-1,Math.floor(samples.length*p))];
 results.push({name:'cancel during real twenty-unit matching',passed:true,yields,maxChecks,nextCpuMs:{p50:percentile(.5),p95:percentile(.95),p99:percentile(.99),max:samples.at(-1)}});
}
{
 const costs=[[12,1,8],[2,6,9],[7,4,3]],steps=assignFormationSteps(costs);let step;do{step=steps.next();}while(!step.done);
 assert.deepEqual(step.value,[1,0,2]);assert.deepEqual(assignFormation(costs),step.value);
 results.push({name:'minimum-cost matching remains stable',passed:true});
}
fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/combat-planning-budget.json',JSON.stringify({results},null,2));
console.log(JSON.stringify({results}));
