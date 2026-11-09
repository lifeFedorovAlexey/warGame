import assert from 'node:assert/strict';
import fs from 'node:fs';
import {progressMission} from './check-navigation-public-progress.mjs';

// The unmodified end of a public 24-car order around a new building. One
// controller's real recovery search used to run synchronously on Stop/save.
const snapshot=JSON.parse(fs.readFileSync('tools/fixtures/navigation-slow-input.json'));
const load=()=>{const m=progressMission();m.load(structuredClone(snapshot));m.state.bounds=[0,0,127,127];m.rebuildNavigation();m.accumulator=0;return m;};
const suspend=m=>{
 m.advance(.1,{budgetMs:0});
 for(let i=0;i<1000&&!m.pendingTick?.iterator;i++)m.advance(0,{budgetMs:0});
 assert(m.pendingTick?.iterator,'Suspend a real movement search');
};
const settle=m=>{for(let i=0;m.pendingTick&&i<20000;i++)m.advance(0,{budgetMs:5});assert(!m.pendingTick);};
const results=[];
{
 const m=load();suspend(m);const tick=m.pendingTick,subject=m.entity('u181'),goal=structuredClone(subject.routeOrder.destination);
 const start=performance.now();m.stop([m.state.units[0].id],{expandGroup:false});const milliseconds=performance.now()-start;
 assert(m.pendingTick===tick&&milliseconds<100,'Stopping another unit must not flush this search either');
 settle(m);assert.deepEqual(subject.routeOrder.destination,goal,'The unrelated movement order remains intact');
 results.push({case:'Stop does not drain another vehicle\'s search',milliseconds});
}
{
 const m=load();suspend(m);const tick=m.pendingTick,car=m.entity('u181'),pose={x:car.x,y:car.y},start=performance.now();
 assert(m.stop([car.id],{expandGroup:false}).ok);const milliseconds=performance.now()-start;
 assert(m.pendingTick===tick,'Stop must not synchronously drain the active search');
 assert(milliseconds<100,'Stop must return promptly');
 settle(m);
 assert(!car.pendingOrder&&!car.path.length&&!car.task&&!car.routeOrder&&!car.detour&&!car.yieldReturn);
 assert.deepEqual({x:car.x,y:car.y},pose,'The cancelled search cannot execute old movement');
 results.push({case:'Stop during a real suspended recovery',milliseconds});
}
{
 const m=load();suspend(m);const car=m.entity('u181');m.stop([car.id],{expandGroup:false});
 const replacement=m.submitOrder([car.id],'move',{x:-300,y:600});assert(replacement.ok);
 for(let i=0;i<20000&&(m.pendingTick||car.pendingOrder);i++)m.advance(1/80,{budgetMs:5});
 assert.equal(car.commandRevision,replacement.revision);
 assert(!car.pendingOrder&&car.routeOrder?.request.x===-300,'An older queued Stop cannot cancel the newer Move');
 results.push({case:'new Move supersedes a pending Stop'});
}
{
 const m=load(),reference=load();reference.tick(.1);const expected=JSON.parse(reference.save());suspend(m);
 let heartbeats=0;const heartbeat=setInterval(()=>heartbeats++,0),start=performance.now();
 const promise=m.saveAsync();const submissionMs=performance.now()-start;
 let saved;try{saved=JSON.parse(await promise);}finally{clearInterval(heartbeat);}
 assert(submissionMs<100,'Requesting a save cannot drain a costly tick');
 const elapsedMs=performance.now()-start;
 assert(elapsedMs<16||heartbeats>0,'A save exceeding one frame must yield to event-loop tasks');
 assert.equal(m.pendingTick,null);assert.deepEqual(saved.state,expected.state,'Save at a complete step, with identical simulation results');
 results.push({case:'responsive save at a complete step',submissionMs,elapsedMs,heartbeats});
}
{
 const m=load();suspend(m);const world=m.state,pending=m.saveAsync(),unfinished=!!m.pendingTick;m.load(structuredClone(snapshot));
 if(unfinished)await assert.rejects(pending,/changed/i,'A save from the previous world cannot overwrite the loaded game');
 else {const saved=JSON.parse(await pending);assert.equal(saved.state.time,world.time);assert.notEqual(m.state,world);}
 results.push({case:'loading cancels an in-flight save; already completed saves remain valid',unfinished});
}
const report={passed:true,results};
fs.mkdirSync('campaign/reports',{recursive:true});
fs.writeFileSync('campaign/reports/responsive-input.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
