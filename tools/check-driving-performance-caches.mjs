import assert from 'node:assert/strict';
import {livingEntity} from '../campaign/entity-lookup.js';
import {vehicleEnvelope,vehicleClearance} from '../campaign/vehicle-collision.js';
import {sightVolumes} from '../campaign/combat-sight.js';
import {fixture} from './check-start-latency-coordinator.mjs';
import {turningHeadway} from '../campaign/turning-headway.js';

const units=Array.from({length:500},(_,i)=>({id:'u'+i,hp:100}));
const lookup=id=>assert.equal(livingEntity(units,id),units.find(u=>u.id===id&&u.hp>0));
for(const u of units)lookup(u.id);
units.reverse();for(const u of units)lookup(u.id);
units.splice(100,40);units[200]={...units[200],hp:0};units[10]={...units[10]};
for(let i=0;i<500;i++)lookup('u'+i);lookup(undefined);lookup(null);
units[200].hp=10;lookup(units[200].id);
const pose={kind:'bukhanka',x:5,y:8,heading:.2},saved=vehicleEnvelope(pose,4.5),original=structuredClone(saved);
for(let i=0;i<40000;i++)vehicleEnvelope({kind:i%2?'builder':'raider',x:i/32,y:-i/16,heading:i*.002},i%2?1:4.5);
assert.deepEqual(vehicleEnvelope({...pose},4.5),original,'Eviction recomputes exact geometry');
assert.deepEqual(saved,original,'Old envelopes remain immutable');
assert.notDeepEqual(vehicleEnvelope({...pose,x:pose.x+1e-9},4.5),original,'No rounded positions');
const building={kind:'scav-fence',fenceSpan:7,fenceProfile:[0,0,0]},before=sightVolumes(building,{},4.5);
building.fenceProfile[1]=3;assert.notDeepEqual(sightVolumes(building,{},4.5),before,'In-place geometry edits invalidate sight volumes');
const factory={kind:'factory'},spec={realSizeMetres:[20,18,10]},old=sightVolumes(factory,spec,4.5);
spec.realSizeMetres[2]=15;assert.notDeepEqual(sightVolumes(factory,spec,4.5),old);
const gate={kind:'scav-gate',fenceSpan:7},closed=sightVolumes(gate,{},4.5);
gate.scavVariant='m02-open-leaf';assert.notDeepEqual(sightVolumes(gate,{},4.5),closed);
// Compare regional arc admission with full-world collision queries. Vary
// speeds, heading, neighbouring sizes and the side/rear approach to the arc.
let comparisons=0;
for(const kind of ['bukhanka','scav-bus'])for(const heading of [0,.6,1.8])for(const speed of [0,12,35])for(const curve of [0,1e-6,.4]){
 const m=fixture(),u=m.addUnit(kind,'rai',{x:0,y:0},{heading}),v=m.addUnit('scav-bus','scavs',{x:18,y:24},{heading:-1});
 u.driveSpeed=speed;v.driveSpeed=17;m.unitIndex.rebuild(m.state.units);m.unitIndexActive=true;
 const target={x:45,y:120},regional=new Set(),all=new Set(),actual=turningHeadway(m,u,target,.1,4.5,regional,.52,curve);
 const clear=m.vehicleMotionClear,nearby=m.nearbyUnits;
 m.vehicleMotionClear=function(a,b,c,d,e){return clear.call(this,a,b,c,d,e,this.state.units);};
 m.nearbyUnits=()=>m.state.units;
 const expected=turningHeadway(m,u,target,.1,4.5,all,.52,curve);
 assert.equal(actual,expected,'Region includes every physical and braking obstacle');
 assert.deepEqual([...regional].map(x=>x.id),[...all].map(x=>x.id));comparisons++;
 m.nearbyUnits=nearby;assert(Number.isFinite(vehicleClearance(u,v,4.5)));
}
console.log(JSON.stringify({passed:true,entityCount:500,evictions:40000,regionalHeadwayComparisons:comparisons}));
