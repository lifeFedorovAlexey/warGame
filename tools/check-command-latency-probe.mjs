import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installCommandLatencyProbe} from './command-latency-probe.mjs';
import {injectLatencyHooks} from './latency-source-hooks.mjs';
let clock=0,revision=0,closed=0;
const host={},unit={id:'u',kind:'car',x:0,y:0,hp:10,commandRevision:0},trace=[];
class Nav{*findPathSteps(a,b){clock+=2;trace.push('expand-a');yield 7;clock+=3;trace.push('expand-b');return [a,b];}}
class Planner{constructor(m){this.mission=m;}start(record){return record;}advance(){clock+=1;}}
const nav=new Nav(),m={nav,state:{time:0},accumulator:0,trafficCoordinator:{update(){clock+=1;},advancePlanning(){clock+=1;}},
 submitOrder(){return {ok:true,revision:++revision};},advance(){clock+=1;},
 beginTick(){clock+=1;this.state.time+=.1;this.pendingTick={cursor:0,units:[unit]};},
 continueTick(done){clock+=2;if(done)this.pendingTick=null;},
 *updateUnitSteps(u){try{if(u.commandStartAfter===undefined||m.state.time>u.commandStartAfter)u.x+=.06;clock+=1;yield 5;u.x+=.06;clock+=1;}finally{closed++;}},
 *vehiclePathSteps(u,to){return yield* this.nav.findPathSteps(u,to);},walk(){clock+=1;},
};
const originals={next:Nav.prototype.findPathSteps,planner:Planner.prototype.advance,update:m.updateUnitSteps};
const probe=installCommandLatencyProbe(m,{CommandPlanner:Planner,now:()=>clock,host});
m.beginTick();m.continueTick(false);clock+=10;m.continueTick(true);
let r=probe.report();assert.equal(r.ticks[0].wallMs,15);assert.equal(r.ticks[0].workMs,5);assert.equal(r.ticks[0].gapMs,10);
m.submitOrder(['u']);let it=m.updateUnitSteps(unit);it.next();it.next();
assert(!probe.report().events.some(e=>e.type==='first-displacement'),'Old route must not count');
const planner=new Planner(m);planner.start({revision,ids:['u']});
host.__latencyEvent('unit-plan-start',m,{...unit},revision);
const facade=Object.create(m);facade.commandJob={revision,currentUnit:'u'};
it=facade.vehiclePathSteps(unit,{x:1,y:2});assert.deepEqual(it.next(),{value:7,done:false});clock+=20;
assert.deepEqual(it.next(),{value:[unit,{x:1,y:2}],done:true});assert.deepEqual(trace,['expand-a','expand-b']);
host.__latencyEvent('path-ready',m,{...unit},revision,{found:true});host.__latencyEvent('assigned',m,{...unit},revision);
assert(!probe.report().events.some(e=>e.type==='published'),'Assignment of a private copy is not publication');
unit.commandRevision=revision;unit.commandStartAfter=m.state.time;host.__latencyEvent('published',m,unit,revision);
it=m.updateUnitSteps(unit);it.next();it.return();
assert(!probe.report().events.some(e=>e.type==='controller-eligible'),'Snapshot gate has not expired');
m.beginTick();it=m.updateUnitSteps(unit);it.next();assert(!probe.report().events.some(e=>e.type==='motion-0.1'));it.next();m.continueTick(true);
r=probe.report();const search=r.searches[0];assert.equal(search.cpuMs,5);assert.equal(search.wallMs,25);assert.equal(search.parts.length,2);assert.equal(search.revision,1);assert.equal(search.unit,'u');
const motion=r.events.filter(e=>['controller-eligible','first-displacement','motion-0.1'].includes(e.type));assert.deepEqual(motion.map(e=>e.type),['controller-eligible','first-displacement','motion-0.1']);assert(motion[1].at<motion[2].at);
assert.equal(closed,3,'Cancellation must close underlying iterator');
probe.restore();assert.equal(Nav.prototype.findPathSteps,originals.next);assert.equal(Planner.prototype.advance,originals.planner);assert.equal(m.updateUnitSteps,originals.update);assert(!Object.hasOwn(host,'__latencyEvent'));
const root='campaign/reports/frame-budget/path-search/variants/baseline/runtime/';
for(const file of ['campaign/mission.js','campaign/command-planner.js']){
 const source=fs.readFileSync(root+file,'utf8'),transformed=injectLatencyHooks(file,source);assert.notEqual(transformed,source);
 assert.throws(()=>injectLatencyHooks(file,source+'\n'+source),/anchor must occur once/);
 assert.throws(()=>injectLatencyHooks(file,''),/anchor must occur once/);
}
console.log(JSON.stringify({passed:true,tickWall:15,tickWork:5,gap:10,searchWall:25,searchWork:5,oldRouteExcluded:true,copyAssignmentNotPublication:true,snapshotGateObserved:true,generatorReturnAndCancellation:true,ambiguousAnchorsRejected:true}));
