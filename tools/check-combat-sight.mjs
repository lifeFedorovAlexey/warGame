import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from './check-start-latency-coordinator.mjs';
import {vehicleClearance} from '../campaign/vehicle-collision.js';
const results=[];
{
 const m=fixture(),a=m.addUnit('bukhanka','rai',{x:0,y:-110}),b=m.addUnit('raider','scavs',{x:0,y:20});
 const building=m.addStructure('factory','rai',{x:0,y:-45},{completed:true,progress:1});
 assert(!m.lineOfSight(a,b),'The factory hall must block fire');
 assert.equal(m.attack(a,b,m.unitSpec(a)),false);assert.equal(b.hp,b.maxHp);
 assert(m.lineOfSight(a,building),'A target building cannot occlude itself');
 building.rotation=Math.PI/2;assert(!m.lineOfSight({...a,x:-110,y:-45},{...b,x:110,y:-45}),'Rotated hall uses rotated structural volumes');
 building.hp=0;assert(m.lineOfSight(a,b),'Destroyed structure releases its opaque body');
 results.push({case:'opaque hall/rotation/self/death',passed:true});
}
{
 const m=fixture(),a=m.addUnit('bukhanka','rai',{x:0,y:-60}),b=m.addUnit('raider','scavs',{x:0,y:60});
 m.addUnit('bukhanka','rai',{x:0,y:0});assert(m.lineOfSight(a,b),'Existing allied-vehicle fire rules stay unchanged');
 m.addStructure('derrick','rai',{x:0,y:0},{completed:true,progress:1});assert(m.lineOfSight(a,b),'An open oil-pump frame is not a solid full-height box');
 results.push({case:'allied vehicle and open frame',passed:true});
}
for(const count of [6,20]){
 const columns=count===6?3:4,m=fixture(),units=Array.from({length:count},(_,i)=>m.addUnit('bukhanka','rai',{x:(i%columns-(columns-1)/2)*35,y:-Math.floor(i/columns)*35-55},{heading:0}));
 const wall=m.addStructure('factory','rai',{x:0,y:40},{completed:true,progress:1});
 const target=m.addStructure('camp-core','scavs',{x:0,y:140},{completed:true,progress:1,hp:100000,maxHp:100000});
 m.rebuildNavigation();m.visible.fill(1);m.explored.fill(1);
 assert(units.every(u=>!m.lineOfSight(u,target)),'Every initial firing line is occluded');
 const fired=new Map(),invalid=[],contacts=[],unknown=new Set();let minimum=Infinity;const attack=m.attack.bind(m),collision=m.vehicleCollision.bind(m);
 m.vehicleCollision=(u,s,obstacles)=>{contacts.push({time:m.state.time,unit:u.id,speed:s,blockers:[...obstacles].map(b=>b.id)});return collision(u,s,obstacles);};
 m.attack=(unit,enemy,spec)=>{const clear=m.lineOfSight(unit,enemy),result=attack(unit,enemy,spec);if(result&&unit.owner==='rai'){
  if(!clear)invalid.push(unit.id);if(!fired.has(unit.id))fired.set(unit.id,{time:m.state.time,x:unit.x,y:unit.y});
 }return result;};
 const response=m.submitOrder(units.map(u=>u.id),'attack',target);assert(response.ok);
 for(let frame=0;frame<6400&&fired.size<units.length;frame++){
  m.advance(1/80,{budgetMs:6});m.effects=[];
  for(const unit of units)if(unit.navigation?.potentialDefect)unknown.add(unit.id);
  for(let i=0;i<count;i++)for(let j=0;j<i;j++)minimum=Math.min(minimum,vehicleClearance(units[i],units[j],m.config.worldScale,m.field));
 }
 const passed=fired.size===units.length&&!invalid.length&&!contacts.length&&!unknown.size&&minimum>=0&&units.every(u=>u.hp===u.maxHp);
 results.push({case:count+' attack behind a factory',passed,seconds:m.state.time,fired:[...fired],invalid,contacts,minimum,unknown:[...unknown],damage:units.map(u=>u.maxHp-u.hp),wallHp:wall.hp});
 if(!passed)fs.writeFileSync('tools/fixtures/combat-sight-'+count+'-failed.json',m.save());
}
fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/combat-sight.json',JSON.stringify({results},null,2));
console.log(JSON.stringify({results},null,2));assert(results.every(r=>r.passed));
