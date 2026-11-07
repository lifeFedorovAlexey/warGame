import assert from 'node:assert/strict';
import {fixture,config} from './check-start-latency-coordinator.mjs';
import {clearOfVehicles,vehicleClearance} from '../campaign/vehicle-collision.js';

const m=fixture(),bus=m.addUnit('scav-bus','scavs',{x:0,y:0},{heading:0}),
 other=m.addUnit('scav-bus','scavs',{x:0,y:35},{heading:0}),to={...bus,y:1};
assert(vehicleClearance(bus,other,config.worldScale,m.field)>0,'The captured bus counterexample must begin without penetration');
assert(vehicleClearance(to,other,config.worldScale,m.field)<0,'The proposed step genuinely overlaps their real authored bodies');
assert.equal(clearOfVehicles(bus,to,[other],config.worldScale,false,bus,m.field),false,
 'A fixed seven-scale-unit cutoff must not discard a long vehicle before narrow phase');
for(const active of [false,true]){
 m.unitIndex.rebuild(m.state.units);m.unitIndexActive=active;
 assert.equal(m.vehicleMotionClear(bus,bus,to),false,'Mission broad phase must retain both long hulls; index active='+active);
}
// Querying only around the end also loses an intervening body on a long
// checked connector. Both end bodies are clear; its swept middle is not.
const n=fixture(),a=n.addUnit('bukhanka','rai',{x:0,y:0},{heading:0}),
 b=n.addUnit('bukhanka','rai',{x:0,y:40},{heading:0}),end={...a,y:80};
assert(vehicleClearance(a,b,config.worldScale,n.field)>0);
assert(vehicleClearance(end,b,config.worldScale,n.field)>0);
for(const active of [false,true]){
 n.unitIndex.rebuild(n.state.units);n.unitIndexActive=active;
 assert.equal(n.vehicleMotionClear(a,a,end),false,'Spatial lookup must cover the entire checked sweep; index active='+active);
}
console.log(JSON.stringify({passed:true,cases:5,busInitialGap:vehicleClearance(bus,other,config.worldScale,m.field),busProposedGap:vehicleClearance(to,other,config.worldScale,m.field)}));
