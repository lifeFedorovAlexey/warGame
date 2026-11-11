// Controlled route check: no combat or production; all structures remain solid.
// The starting vehicles drive through public orders, without position injection.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {makeMission} from './m02-fixture.mjs';
const m=makeMission(),s=m.state,visits=[];
s.units=s.units.filter(u=>u.owner==='rai');s.flags.raidWon=true;s.flags.raidStarted=true;s.flags.raidIds=[];
for(const b of s.buildings)delete b.scavProduction;
for(const spec of [...Object.values(m.config.units),...Object.values(m.config.buildings)])spec.damage=0;
const unit=s.units.find(u=>u.kind==='bukhanka');
for(const id of ['outpost','east','northwest','hq','home']){
 const road=m.field.localRoads.find(r=>r.id==='m01-original-'+id+'-yard');
 const target=id==='home'?m.field.gridToWorld(m.config.startGrid):road.points.at(-1);
 assert(m.order([unit.id],'move',target).ok,'Accept route to '+id);
 let seconds=0;
 for(;seconds<240&&Math.hypot(unit.x-target.x,unit.y-target.y)>24;seconds++){
  m.advance(1);m.drainEffects();m.drainEvents();
 }
 const distance=Math.hypot(unit.x-target.x,unit.y-target.y);
 visits.push({id,seconds,distance});console.log(visits.at(-1));
 assert(distance<=24,'Physically enter '+id+' courtyard');
}
fs.mkdirSync('docs/campaign/alpha/m01-original-layout',{recursive:true});
fs.writeFileSync('docs/campaign/alpha/m01-original-layout/drive.json',JSON.stringify({passed:true,visits},null,2));
console.log('PASS starting vehicle enters all four original yards and returns home using real movement');
