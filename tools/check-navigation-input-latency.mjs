import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {progressMission} from './check-navigation-public-progress.mjs';

// Unmodified state at 3.3 s of the public nine-car reverse command. Probe the
// actual input APIs while its production local movement search is suspended.
const fixture=JSON.parse(fs.readFileSync('tools/fixtures/navigation-nine-search.json'));
const files=['campaign/mission.js','campaign/traffic-coordinator.js','campaign/combat-policy.js','tools/check-navigation-input-latency.mjs'];
const hashes=()=>Object.fromEntries(files.map(p=>[p,createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
const sourceHashes=hashes(),results=[];
function suspended(){
 const m=progressMission();m.load(structuredClone(fixture));m.state.bounds=[0,0,127,127];m.rebuildNavigation();m.accumulator=0;
 let entered=false;const plan=m.planManeuverSteps;
 m.planManeuverSteps=function*(...args){entered=true;return yield* plan.apply(this,args);};
 m.advance(.1,{budgetMs:0});
 for(let i=0;i<10000&&(!entered||!m.pendingTick?.iterator);i++)m.advance(0,{budgetMs:0});
 assert(entered&&m.pendingTick?.iterator,'Pause within a real manoeuvre search');
 return {m,owner:m.pendingTick.units[m.pendingTick.cursor],pending:m.pendingTick,iterator:m.pendingTick.iterator};
}
for(const action of ['stop-self','stop-neighbour','move-self','policy-self','policy-neighbour','retreat-self','retreat-neighbour']){
 const {m,owner,pending,iterator}=suspended();
 const other=m.state.units.find(u=>u.kind==='bukhanka'&&u!==owner),subject=action.endsWith('neighbour')?other:owner;
 const oldGoal=structuredClone(owner.routeOrder?.destination),pose={x:owner.x,y:owner.y},start=performance.now();let response;
 if(action.startsWith('stop'))response=m.stop([subject.id],{expandGroup:false});
 if(action.startsWith('move'))response=m.submitOrder([subject.id],'move',{x:-300,y:-100});
 if(action.startsWith('policy'))response=m.setCombatPolicy([subject.id],{response:'ignore'});
 if(action.startsWith('retreat'))response=m.retreat([subject.id]);
 const inputMs=performance.now()-start,preservedPending=m.pendingTick===pending;
 assert(response.ok);
 let slices=0;const cancellationStart=performance.now();
 while(m.pendingTick===pending&&pending.iterator===iterator&&slices<10000){m.advance(0,{budgetMs:0});slices++;}
 const cancellationMs=performance.now()-cancellationStart;
 const failures=[];
 if(inputMs>=100)failures.push('Input handler synchronously drains old simulation work');
 if(!preservedPending)failures.push('Input completed the pending simulation step before returning');
 if(slices>1)failures.push('An obsolete controller continues searching after the next yield');
 if(owner.x!==pose.x||owner.y!==pose.y)failures.push('The superseded controller moved after input');
 if(action.startsWith('policy')){assert.equal(subject.combatPolicy.response,'ignore');assert.deepEqual(owner.routeOrder.destination,oldGoal);}
 if(action.startsWith('retreat'))assert(subject.combatRetreat?.forced);
 if(action==='stop-self')assert(!owner.task&&!owner.path.length&&!owner.pendingOrder);
 const result={action,owner:owner.id,subject:subject.id,inputMs,cancellationMs,slices,preservedPending,failures,passed:!failures.length};
 results.push(result);console.log(JSON.stringify(result));
}
{
 const {m,owner,pending,iterator}=suspended(),revision=m.trafficCoordinator.inputRevision;
 assert.equal(m.setCombatPolicy([owner.id],{response:'invalid'}).ok,false);
 assert.equal(m.retreat(['missing-unit']).ok,false);
 assert.equal(m.trafficCoordinator.inputRevision,revision,'Rejected input does not invalidate useful work');
 m.advance(0,{budgetMs:0});
 assert(m.pendingTick===pending&&pending.iterator===iterator,'Rejected input leaves the real search running');
 iterator.return();
 results.push({action:'rejected-input-preserves-search',passed:true});
}
{
 const {m,owner}=suspended();
 const enemy=m.addUnit('raider','scavs',{x:1000,y:1000});m.visible.fill(1);
 assert(m.submitOrder([owner.id],'attack',enemy).ok);assert(owner.pendingOrder?.type==='attack');
 assert(m.setCombatPolicy([owner.id],{response:'ignore'}).ok);
 for(let i=0;i<10000&&m.pendingTick;i++)m.advance(0,{budgetMs:5});
 assert(!m.pendingTick);
 for(let i=0;i<10;i++)m.advance(.1,{budgetMs:5});
 assert(!owner.pendingOrder&&!owner.task&&!owner.path.length,'A cancelled queued attack cannot return after the old controller closes');
 results.push({action:'policy-cancels-queued-attack-during-search',passed:true});
}
const report={passed:results.every(r=>r.passed),results,sourceHashes,sourcesUnchanged:JSON.stringify(sourceHashes)===JSON.stringify(hashes())};
fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/navigation-input-latency.json',JSON.stringify(report,null,2));
assert(report.sourcesUnchanged);assert(report.passed,'Player input must preempt, not finish, an old expensive controller');
