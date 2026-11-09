import assert from 'node:assert/strict';
import {UnitSpatialIndex} from '../campaign/unit-spatial-index.js';
import {clearOfVehicles,vehicleRadiusBound} from '../campaign/vehicle-collision.js';
const kinds=['bukhanka','raider','scav-bus','scav-firetruck'];
const units=Array.from({length:500},(_,i)=>({id:'u'+i,kind:kinds[i%kinds.length],x:Math.sin(i*1.791)*600,y:Math.cos(i*.733)*600,heading:i*.31,hp:100})),index=new UnitSpatialIndex();index.rebuild(units);
for(let i=0;i<300;i++){
  const unit=units[i%units.length];unit.x+=Math.sin(i)*70;unit.y+=Math.cos(i)*50;index.update(unit);
  const radius=10+(i%13)*17,near=index.query(unit,radius),brute=units.filter(u=>Math.abs(u.x-unit.x)<=radius&&Math.abs(u.y-unit.y)<=radius);
  assert.deepEqual(near.map(u=>u.id),brute.map(u=>u.id),'Broad phase preserves membership and sequential order');
  const next={...unit,x:unit.x+2,y:unit.y-1};
  const sweepRadius=vehicleRadiusBound(unit.kind,4.5)+index.maxBodyRadius*4.5+Math.hypot(2,1)+.3;
  assert.equal(clearOfVehicles(unit,next,index.query(next,sweepRadius),4.5),clearOfVehicles(unit,next,units,4.5),'Exact collision result is unchanged');
}
for(let i=0;i<units.length;i++)units[i].owner=i%3?'rai':'scavs';index.rebuild(units);
for(const unit of units.slice(0,20)){
 const radius=140,expected=units.filter(u=>u.owner!==unit.owner&&Math.abs(u.x-unit.x)<=radius&&Math.abs(u.y-unit.y)<=radius);
 assert.deepEqual(index.query(unit,radius,unit.owner),expected,'Hostile broad phase has no friendly-only false negative');
}
for(const unit of units){unit.owner='rai';index.update(unit);}assert.deepEqual(index.query(units[0],10000,'rai'),[]);
// Exercise packed-key sign changes, its exact 52-bit upper edge, and the
// string fallback on both sides; neighbour query entries must never alias.
const edgeUnits=[];
for(const x of [-4097,-4096,-1,0,4094,4095,4096])for(const y of [-4097,-4096,-1,0,4094,4095,4096])
 edgeUnits.push({id:'edge'+edgeUnits.length,kind:'bukhanka',x:(x+.5)*64,y:(y+.5)*64,hp:1});
index.rebuild(edgeUnits);let edgeQueries=0;
for(let pass=0;pass<2;pass++)for(const unit of edgeUnits)for(const radius of [1,33,96]){
 const expected=edgeUnits.filter(u=>Math.abs(u.x-unit.x)<=radius&&Math.abs(u.y-unit.y)<=radius);
 assert.deepEqual(index.query(unit,radius),expected,'Packed and fallback rectangles preserve exact membership');edgeQueries++;
}
console.log(JSON.stringify({spatialQueries:300,edgeQueries,collisionComparisons:300,units:500,passed:true}));
