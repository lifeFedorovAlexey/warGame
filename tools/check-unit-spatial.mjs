import assert from 'node:assert/strict';
import {UnitSpatialIndex} from '../campaign/unit-spatial-index.js';
import {clearOfVehicles} from '../campaign/vehicle-collision.js';
const units=Array.from({length:500},(_,i)=>({id:'u'+i,kind:i%3?'bukhanka':'raider',x:Math.sin(i*1.791)*600,y:Math.cos(i*.733)*600,heading:i*.31,hp:100})),index=new UnitSpatialIndex();index.rebuild(units);
for(let i=0;i<300;i++){
  const unit=units[i%units.length];unit.x+=Math.sin(i)*70;unit.y+=Math.cos(i)*50;index.update(unit);
  const radius=10+(i%13)*17,near=index.query(unit,radius),brute=units.filter(u=>Math.abs(u.x-unit.x)<=radius&&Math.abs(u.y-unit.y)<=radius);
  assert.deepEqual(near.map(u=>u.id),brute.map(u=>u.id),'Broad phase preserves membership and sequential order');
  const next={...unit,x:unit.x+2,y:unit.y-1};
  assert.equal(clearOfVehicles(unit,next,index.query(next,7*4.5),4.5),clearOfVehicles(unit,next,units,4.5),'Exact collision result is unchanged');
}
for(let i=0;i<units.length;i++)units[i].owner=i%3?'rai':'scavs';index.rebuild(units);
for(const unit of units.slice(0,20)){
 const radius=140,expected=units.filter(u=>u.owner!==unit.owner&&Math.abs(u.x-unit.x)<=radius&&Math.abs(u.y-unit.y)<=radius);
 assert.deepEqual(index.query(unit,radius,unit.owner),expected,'Hostile broad phase has no friendly-only false negative');
}
for(const unit of units){unit.owner='rai';index.update(unit);}assert.deepEqual(index.query(units[0],10000,'rai'),[]);
console.log(JSON.stringify({spatialQueries:300,collisionComparisons:300,units:500,passed:true}));
