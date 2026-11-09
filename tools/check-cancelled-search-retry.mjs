import fs from 'node:fs';
import assert from 'node:assert/strict';
import {progressMission} from './check-navigation-public-progress.mjs';
import {prepareTrafficDeparture,resumeYieldHome} from '../campaign/traffic-start.js';

const complete=iterator=>{let step;do{step=iterator.next();}while(!step.done);return step.value;};
const results=[];
{
 const m=progressMission(),cars=[];
 for(let i=0;i<6;i++)cars.push(m.addUnit('bukhanka','rai',{x:i%2?6:-6,y:-Math.floor(i/2)*26}));
 assert(m.submitOrder(cars.map(u=>u.id),'move',{x:0,y:-260}).ok);
 for(let i=0;i<10000&&cars.some(u=>u.pendingOrder);i++)m.commandPlanner.advance(2);
 assert(cars.every(u=>!u.pendingOrder&&u.routeOrder));
 const search=()=>m.trafficCoordinator.currentIntentSteps(m,prepareTrafficDeparture(m,cars[0]));
 m.nav.workDeadline=-Infinity;const iterator=search();assert(!iterator.next().done,'Suspend the actual shared departure proof');
 assert(m.setCombatPolicy([cars[1].id],{response:'ignore'}).ok);assert(iterator.next().done);
 assert(cars.every(u=>!u.detour),'An interrupted proof publishes no departure');
 m.nav.workDeadline=Infinity;
 const passed=complete(search())&&cars.every(u=>u.detour?.departure);
 results.push({case:'cancelled shared departure can be retried with the same physical order',passed:!!passed});
}
const captures=JSON.parse(fs.readFileSync('tools/fixtures/navigation-progress-captures.json')).cases;
for(const [name,id,key] of [['fifty-arrival-offset','u57','failedReturn'],['fifty-return-boxed','u78','failedArrival']]){
 const m=progressMission();m.load(structuredClone(captures.find(c=>c.name===name).saved));
 m.state.bounds=[0,0,127,127];m.rebuildNavigation();
 const unit=m.entity(id),before=unit.yieldReturn[key],plan=m.planManeuverSteps;let searches=0;
 m.planManeuverSteps=function*(...args){searches++;return yield* plan.apply(this,args);};
 m.nav.workDeadline=-Infinity;
 const iterator=m.trafficCoordinator.currentIntentSteps(m,resumeYieldHome(m,unit));let step;
 for(let i=0;i<10000&&!searches;i++){step=iterator.next();if(step.done)break;}
 assert(searches&&!step.done,'Suspend a real borrowed-space return search in '+name);
 assert(m.setCombatPolicy([unit.id],{response:'ignore'}).ok);assert(iterator.next().done);
 const preserved=unit.yieldReturn[key]===before,previousSearches=searches;
 const retry=m.trafficCoordinator.currentIntentSteps(m,resumeYieldHome(m,unit));
 for(let i=0;i<10000&&searches===previousSearches;i++){step=retry.next();if(step.done)break;}
 const retried=searches>previousSearches;retry.return();
 results.push({case:'cancelled '+key+' can retry instead of caching an unfinished proof',source:name,id,preserved,retried,passed:preserved&&retried});
}
const report={passed:results.every(r=>r.passed),results};
fs.writeFileSync('campaign/reports/cancelled-search-retry.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report));assert(report.passed,'Cancellation is not a failed geometric proof');
