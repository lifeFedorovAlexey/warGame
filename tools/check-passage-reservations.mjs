import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture,config} from './check-start-latency-coordinator.mjs';
import {vehicleClearance} from '../campaign/vehicle-collision.js';

// Existing routes may be loaded with a body already inside the throat. The
// pre-fix admission required occupied.length===0, so that body waited for its
// own disappearance. These tests use the real geometry-derived throat.
function setup(start=0){
 const m=fixture(14);
 for(const x of [-1030,1030])m.addStructure('generator','neutral',{x,y:0},{halfWidth:1023,halfDepth:90,completed:true,progress:1,hp:100000});
 m.rebuildNavigation();
 const units=[m.addUnit('bukhanka','rai',{x:0,y:start},{heading:0}),m.addUnit('bukhanka','rai',{x:0,y:200},{heading:Math.PI})];
 for(const [i,u] of units.entries()){
  const sign=i?-1:1,g=m.nav.passageBetween({x:0,y:-sign*200},{x:0,y:sign*400},config.worldScale);
  assert(g?.throat);
  u.passage={along:g.along,direction:g.direction,admit:g.admit,throat:g.throat};
  u.path=[{...g.exit},{x:0,y:sign*400}];u.task={type:'move',...u.path.at(-1)};
 }
 return {m,units};
}
function update(m){m.unitIndex.rebuild(m.state.units);m.trafficCoordinator.update(m);}
function simulate(m,units,seconds){
 const first=units.map(()=>null),starts=units.map(u=>({x:u.x,y:u.y})),hp=units.map(u=>u.hp);let contacts=0,gap=Infinity;
 const collision=m.vehicleCollision.bind(m);m.vehicleCollision=(...args)=>{contacts++;return collision(...args);};
 for(let i=0;i<seconds*10;i++){
  m.advance(.1);m.effects=[];gap=Math.min(gap,vehicleClearance(...units,config.worldScale,m.field));
  for(let j=0;j<units.length;j++)if(first[j]===null&&Math.hypot(units[j].x-starts[j].x,units[j].y-starts[j].y)>.5)first[j]=+(i/10+.1).toFixed(2);
  if(units.every(u=>!u.task&&!u.path.length&&!u.detour&&!u.yieldReturn))break;
 }
 return {first,seconds:m.state.time,contacts,gap,hp:units.map(u=>u.hp),undamaged:units.every((u,i)=>u.hp===hp[i]),
  arrived:units.every((u,i)=>!u.task&&!u.path.length&&!u.detour&&!u.yieldReturn&&Math.hypot(u.x,u.y-(i?-400:400))<2.5)};
}
const results=[],failures=[];
{
 const {m,units}=setup();for(let i=0;i<20;i++)m.advance(.1);
 assert(m.state.trafficControl.passages.some(p=>p.admitted.length),'Save is taken during actual admission');
 const copy=fixture(14);copy.load(m.save());copy.state.bounds=m.state.bounds.slice();copy.rebuildNavigation();
 const pose=u=>({x:u.x,y:u.y,heading:u.heading,hp:u.hp,path:u.path,passage:u.passage,detour:u.detour});
 for(let i=0;i<250;i++){
  m.advance(.1);copy.advance(.1);
  for(const u of units)assert.deepEqual(pose(copy.entity(u.id)),pose(u),'Saved passage ownership must reproduce physical continuation');
 }
 results.push({case:'saved-active-admission',passed:true});
}
for(const start of [0,120]){
 const {m,units}=setup(start);update(m);
 assert(m.trafficCoordinator.passageDecisions.get(units[0].id).admitted,'Actual occupant must acquire initial departure');
 assert(!m.trafficCoordinator.passageDecisions.get(units[1].id).admitted,'Opposite entrance must stay outside');
 const result=simulate(m,units,75);results.push({case:'initial-inside',start,...result});
 assert(result.first[0]<=.5&&result.arrived&&result.undamaged&&result.contacts===0&&result.gap>=0);
}
{
 const {m,units}=setup();update(m);m.stop([units[0].id]);
 for(let i=0;i<80;i++)m.advance(.1);
 assert(Math.abs(units[0].y)<1e-8,'Stop inside must remain a real stationary obstacle');
 assert(!m.trafficCoordinator.passageDecisions.get(units[1].id).admitted,'Elapsed time must not expire occupied ownership');
 // A real order inside cannot rediscover passageBetween (it starts between
 // the walls). The retained occupancy lease still lets its owner leave.
 const order=m.order([units[0].id],'move',{x:0,y:400});
 if(!order.ok){results.push({case:'stop-reissue',order,passed:false});failures.push('A real Stop/reissue inside the bridge was rejected despite its physical exit');}
 else{
  const result=simulate(m,units,75);results.push({case:'stop-reissue',...result});
  assert(result.first[0]<=.5&&result.arrived&&result.undamaged&&result.contacts===0&&result.gap>=0);
 }
}
{
 const {m,units}=setup();update(m);m.stop(units.map(u=>u.id));
 // Empty bookkeeping must not be retained merely because an unrelated body
 // happens to occupy its geometry. A future request rebuilds occupancy.
 m.state.trafficControl.passages[0].admitted=[];update(m);
 assert.equal(m.state.trafficControl.passages.length,0);results.push({case:'empty-lease-cleanup',passed:true});
}
fs.writeFileSync('campaign/reports/passage-reservations.json',JSON.stringify({results,failures},null,2));
console.log(JSON.stringify({passed:!failures.length,results,failures}));
assert.equal(failures.length,0,failures.join('; '));
