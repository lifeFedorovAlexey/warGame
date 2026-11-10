import assert from 'node:assert/strict';
import {installFrameLatencyProbe} from './frame-latency-probe.mjs';
let clock=0,revision=0;
const unit={id:'u',x:0,y:0,hp:10,driveSpeed:0},fog={pixels:0,historyUpdates:0,updates:0};
const m={state:{time:0},visionSources:[],entity:id=>id==='u'?unit:null,
 beginTick(){clock+=1;this.pendingTick={};this.state.time+=.1;},continueTick(done){clock+=done?4:3;if(done)this.pendingTick=null;return done;},
 submitOrder(){return {ok:true,revision:++revision};},*updateUnitSteps(u){u.x+=1;yield;u.x+=1;},walk(){}};
const probe=installFrameLatencyProbe(m,{statistics:{fog}},{now:()=>clock});
m.beginTick();m.continueTick(false);clock+=20;m.continueTick(true);
let r=probe.report();assert.equal(r.ticks[0].workMs,8);assert.equal(r.ticks[0].completionWallMs,28);assert.equal(r.ticks[0].slices,2);
m.submitOrder(['u']);let iterator=m.updateUnitSteps(unit);iterator.next();iterator.next();assert.equal(probe.report().commands[0].status,'pending','Old-route movement excluded');
unit.commandRevision=revision;unit.pendingOrder={status:'planning'};iterator=m.updateUnitSteps(unit);iterator.next();iterator.next();assert.equal(probe.report().commands[0].status,'pending','Queued revision is not yet accepted');
delete unit.pendingOrder;clock+=7;iterator=m.updateUnitSteps(unit);iterator.next();iterator.next();r=probe.report();assert.equal(r.commands[0].commandToMotionMs,7);assert.equal(r.commands[0].status,'moved');
m.submitOrder(['u']);clock+=2;m.submitOrder(['u']);r=probe.report();assert.equal(r.commands[1].status,'superseded');assert.equal(r.commands[2].status,'pending');assert.equal(r.commands[2].commandToMotionMs,undefined);
unit.hp=0;probe.sample();assert.equal(probe.report().commands[2].status,'dead-or-removed');
fog.pixels=100;fog.updates=1;fog.historyUpdates=1;probe.rendered();probe.rendered();assert.equal(probe.report().fogUpdates.length,1);assert.equal(probe.report().fogUpdates[0].pixels,100);
m.beginTick();clock+=10;r=probe.report();assert(r.unfinishedTick.observedWallMs>=10);assert.equal(r.ticks.length,1);probe.restore();
console.log(JSON.stringify({passed:true,tickWall:28,tickWork:8,oldRouteExcluded:true,queuedRevisionExcluded:true,censoredRetained:true}));
