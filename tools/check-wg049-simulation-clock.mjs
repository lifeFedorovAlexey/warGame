import assert from 'node:assert/strict';
import {Mission} from '../campaign/mission.js';

// Deterministic CPU budget: each logical tick needs `cost` milliseconds of
// cooperatively sliced work, independent of the browser's frame frequency.
let clock=0;
Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>clock}});
function fixture(cost){
 return {state:{status:'running',m02:{},time:0},config:{simulationStep:.1},accumulator:0,pendingTick:null,trafficCoordinator:{},
  beginTick(){this.pendingTick={left:cost};},
  continueTick(deadline){
   while(this.pendingTick.left){clock++;this.pendingTick.left--;if(clock>=deadline&&this.pendingTick.left)return false;}
   this.pendingTick=null;this.state.time+=.1;return true;
  }};
}
function run(m,fps,seconds,rate=1,budgetMs=5){
 const start=m.state.time;
 for(let i=0;i<fps*seconds;i++){
  clock+=1000/fps;
  Mission.prototype.advance.call(m,rate/fps,{budgetMs,rate});
  assert(m.accumulator+(m.pendingTick?.1:0)<=.200001,'Budgeted backlog must stay bounded');
 }
 return m.state.time-start;
}
for(const fps of [30,60,144]){
 const m=fixture(10),elapsed=run(m,fps,5);
 assert(Math.abs(elapsed-5)<.11,`Normal speed at ${fps} FPS: ${elapsed}`);
}
{
 const m=fixture(10),elapsed=run(m,144,5,2);
 assert(Math.abs(elapsed-10)<.11,`Double speed must remain effective: ${elapsed}`);
}
{
 const m=fixture(50),underLoad=run(m,30,5),recovery=run(m,144,5),steady=run(m,144,5);
 assert(underLoad<4,'Fixture must fall behind during overload');
 assert(recovery<=5.11,`Recovery must not replay seconds of old elapsed time: ${recovery}`);
 assert(Math.abs(steady-5)<.11,`Speed must return to normal: ${steady}`);
 console.log(JSON.stringify({underLoad,recovery,steady,backlog:m.accumulator+(m.pendingTick?.1:0)}));
}
{
 const m=fixture(10);Mission.prototype.advance.call(m,1,{budgetMs:Infinity});
 assert(Math.abs(m.state.time-1)<1e-8,'Explicit unbudgeted simulation retains the full requested time');
}
console.log('PASS: normal and double speed, low-to-high FPS recovery, and unbudgeted advance');
