import assert from 'node:assert/strict';
import {progressMission} from './check-navigation-public-progress.mjs';
import {checkManeuver} from '../campaign/vehicle-motion.js';
import {vehicleEnvelope} from '../campaign/vehicle-collision.js';
import {corridorBlocker,corridorSpeedLimit,invalidateTrafficCorridors} from '../campaign/traffic-corridor.js';
import {turningHeadway} from '../campaign/turning-headway.js';

// Component contract: a future checked passage must be protected even while
// its requester is still stationary and a third car is outside the wait SCC.
const m=progressMission(),scale=m.config.worldScale;
const owner=m.addUnit('bukhanka','rai',{x:40,y:10}),leader=m.addUnit('bukhanka','rai',{x:0,y:0}),
 incoming=m.addUnit('bukhanka','rai',{x:-25,y:30},{heading:-Math.PI/2}),corridor=[];
const pose=p=>({x:p.x,y:p.y,heading:p.heading,kind:leader.kind});
checkManeuver(leader,[{direction:1,curve:0,remaining:60}],scale,(from,to)=>{corridor.push({from:pose(from),to:pose(to)});return true;});
owner.traffic={cycle:true,leader:leader.id,phase:'move',checkedPassage:true,passageCorridor:corridor};
leader.cycleContinuation=owner.id;invalidateTrafficCorridors(m);
const crossing={...incoming,x:25,y:30},step={...incoming,x:-24,y:30};
assert.equal(corridorBlocker(m,incoming,incoming,step),null,'A distant safe approach is still permitted');
assert.equal(corridorBlocker(m,incoming,incoming,crossing)?.id,leader.id,'A third body cannot enter the future swept passage');
assert.equal(corridorBlocker(m,leader,leader,{...leader,y:30}),null,'The checked requester owns its corridor');
assert.equal(corridorBlocker(m,owner,owner,{...owner,x:0}),null,'The yielding owner can execute its first phase');
const cap=corridorSpeedLimit(m,{unit:incoming,shape:vehicleEnvelope(incoming,scale,m.field),course:{x:1,y:0},length:50});
assert(cap&&cap.limit>0&&cap.limit<30&&cap.yieldTo===leader.id,'Ordinary driving brakes before a reserved swept body');
const saved=structuredClone(m.state);m.state=structuredClone(saved);
assert.equal(corridorBlocker(m,m.entity(incoming.id),incoming,crossing)?.id,leader.id,'The finite passage survives serialization');
m.entity(leader.id).pendingOrder={revision:2};
assert.equal(corridorBlocker(m,m.entity(incoming.id),incoming,crossing),null,'A replacement command revokes the obsolete future passage');
m.state=structuredClone(saved);m.entity(leader.id).hp=0;
assert.equal(corridorBlocker(m,m.entity(incoming.id),incoming,crossing),null,'A destroyed requester cannot reserve empty road forever');
m.state=structuredClone(saved);m.entity(owner.id).traffic.passageComplete=true;
assert.equal(corridorBlocker(m,m.entity(incoming.id),incoming,crossing),null,'An executed passage cannot keep a future corridor reserved');
// The requester can be far from the later part of its reserved passage.
// Absence of a nearby physical body must not disable arc braking there.
const remote=progressMission(),requester=remote.addUnit('bukhanka','rai',{x:0,y:-100}),
 yielder=remote.addUnit('bukhanka','rai',{x:200,y:10}),approach=remote.addUnit('bukhanka','rai',{x:-25,y:30},{heading:-Math.PI/2,driveSpeed:30});
const future=[];
checkManeuver(requester,[{direction:1,curve:0,remaining:160}],scale,(from,to)=>{future.push({from:pose(from),to:pose(to)});return true;});
yielder.traffic={cycle:true,leader:requester.id,passageCorridor:future};requester.cycleContinuation=yielder.id;
invalidateTrafficCorridors(remote);
remote.unitIndex.rebuild(remote.state.units);remote.unitIndexActive=true;
const blockedBy=new Set(),braking=turningHeadway(remote,approach,{x:25,y:30},.1,scale,blockedBy,.52,0);
assert(Number.isFinite(braking)&&braking<30,'An empty future reservation requires braking before the immediate sweep is blocked: '+braking+' / '+JSON.stringify(approach));
assert(blockedBy.has(requester));
console.log(JSON.stringify({passed:true,checks:11,approachSpeed:cap.limit,remoteCorridorSpeed:braking}));
