import assert from 'node:assert/strict';
import {createUserCase} from './check-navigation-user-cases.mjs';
import {progressMission} from './check-navigation-public-progress.mjs';
import {checkedYieldPassage} from '../campaign/traffic-start.js';
import {vehicleClearance} from '../campaign/vehicle-collision.js';
import {corridorBlocker} from '../campaign/traffic-corridor.js';

const finish=iterator=>{let step;do{step=iterator.next();}while(!step.done);return step.value;};
const scene=createUserCase('centre-real'),{m,units}=scene;
const homes=new Map(units.map(u=>[u.id,{x:u.x,y:u.y}]));
let requester,donor;
for(let i=0;i<300&&!requester;i++){
 m.advance(.1);
 requester=units.find(u=>u.detour?.joint?.phases.length===3);
}
assert(requester,'The public centre-car command must exercise a checked loan');
donor=m.entity(requester.detour.joint.phases[0].id);
assert(donor.yieldReturn&&donor.jointTraffic?.owner===requester.id&&!donor.detour);
const futureReturn=requester.detour.joint.phases[2].corridor.at(-1),outsider={id:'outside',kind:donor.kind,owner:donor.owner};
assert.equal(corridorBlocker(m,outsider,futureReturn.from,futureReturn.to)?.id,requester.id,
 'The donor return must be reserved before any phase executes');
const saved=JSON.parse(m.save()),requesterId=requester.id,donorId=donor.id;
const goals=new Map(units.map(u=>[u.id,structuredClone(u.routeOrder?.destination??homes.get(u.id))]));
const load=(state=saved)=>{
 const copy=createUserCase('centre-real').m;copy.load(structuredClone(state));
 // load() restores campaign bounds from story flags. This test deliberately
 // uses the whole map; restore those same bounds before comparing proofs.
 copy.state.bounds=state.state.bounds.slice();copy.rebuildNavigation();return copy;
};
const done=u=>!u.task&&!u.path.length&&!u.detour&&!u.yieldReturn&&!u.pendingOrder&&!u.jointTraffic;
const results=[];
{
 const copy=load(),started=m.state.time;let minGap=Infinity;
 // contactRock also records driving over destructible street lamps. Record
 // the actual vehicle-collision callback instead of mislabelling scenery.
 const contacts=[],hit=m.vehicleCollision.bind(m);
 m.vehicleCollision=(u,s,b)=>{if(b.size)contacts.push({id:u.id,time:m.state.time,blockers:[...b].map(v=>v.id)});return hit(u,s,b);};
 for(let i=0;i<900&&!units.every(done);i++){
  m.advance(.1);copy.advance(.1);
  for(const u of units){
   const restored=copy.entity(u.id);
   assert.deepEqual([u.x,u.y,u.heading,u.hp],[restored.x,restored.y,restored.heading,restored.hp]);
   assert(JSON.stringify([u.path,u.detour,u.yieldReturn,u.jointTraffic])===JSON.stringify([restored.path,restored.detour,restored.yieldReturn,restored.jointTraffic]),
    'Saved loan state diverged for '+u.id+' at '+m.state.time);
   assert.equal(u.hp,u.maxHp);assert.equal(contacts.length,0,JSON.stringify(contacts));
   if(u.routeOrder)assert.deepEqual(u.routeOrder.destination,goals.get(u.id));
  }
  for(let i=0;i<units.length;i++)for(let j=0;j<i;j++)minGap=Math.min(minGap,vehicleClearance(units[i],units[j],m.config.worldScale,m.field));
 }
 assert(units.every(done)&&minGap>0);
 for(const u of units)assert(Math.hypot(u.x-goals.get(u.id).x,u.y-goals.get(u.id).y)<2.01);
 results.push({case:'public loan and save/load',seconds:m.state.time-started,minGap});
}
for(const who of ['requester','donor'])for(const action of ['stop','move']){
 const copy=load(),r=copy.entity(requesterId),d=copy.entity(donorId),unit=who==='requester'?r:d,plan=r.detour;
 const pose={x:unit.x,y:unit.y};
 if(action==='stop')copy.stop([unit.id],{expandGroup:false});
 else assert(copy.submitOrder([unit.id],'move',{x:goals.get(requesterId).x,y:goals.get(requesterId).y-24}).ok);
 copy.tick(.1);
 if(action==='move'){
  assert.deepEqual({x:unit.x,y:unit.y},pose,'Pending replacement cannot execute the old order');
  for(let i=0;i<100&&unit.pendingOrder;i++)copy.advance(1/80,{budgetMs:5});
  assert(!unit.pendingOrder);
 }
 assert(r.detour!==plan,'Cancellation invalidates the entire old loan: '+who+' '+action);
 if(action==='stop')assert.deepEqual({x:unit.x,y:unit.y},pose);
 if(who==='requester'){
  assert(!d.yieldReturn?.cooperativeRequester);
  if(action==='stop'){
   for(let i=0;i<300&&d.yieldReturn;i++)copy.advance(.1);
   assert(!d.yieldReturn);
   assert(Math.hypot(d.x-homes.get(d.id).x,d.y-homes.get(d.id).y)<2.01);
  }
 }
 results.push({case:who+' '+action});
}
// Isolate a cooperative proof in a dense 3x3 convoy with a public command.
// Stop must also invalidate a donor with no prior command revision.
for(const change of ['none','requester move','donor stop','construction']){
 const copy=progressMission();let r,d;
 for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++){
  const u=copy.addUnit('bukhanka','rai',{x:x*12,y:y*26});if(!x&&!y)r=u;if(!x&&y===1)d=u;
 }
 assert(copy.submitOrder([r.id],'move',{x:0,y:240}).ok);
 for(let i=0;i<100&&r.pendingOrder;i++)copy.advance(0);
 assert(!r.pendingOrder);
 const park=[{direction:1,curve:0,remaining:54}];
 assert.equal(d.commandRevision,undefined);
 copy.nav.workDeadline=-Infinity;
 const proof=checkedYieldPassage(copy,r,d,park);assert.equal(proof.next().done,false);
 if(change==='requester move')assert(copy.submitOrder([r.id],'move',{x:r.x+150,y:r.y+200}).ok);
 else if(change==='donor stop')copy.stop([d.id],{expandGroup:false});
 else if(change==='construction'){copy.addStructure('generator','rai',{x:r.x+200,y:r.y+200});copy.rebuildNavigation();}
 copy.nav.workDeadline=Infinity;
 const accepted=finish(proof);
 assert.equal(accepted,change==='none','Suspended passage proof: '+change);
 if(change==='none')assert(r.detour?.joint?.phases[0].id===d.id&&d.jointTraffic?.owner===r.id,'The positive control must lend and reserve the donor space');
 if(change==='donor stop')assert(!d.yieldReturn&&!d.detour,'Stop cannot resurrect the donor loan');
 results.push({case:'suspended proof: '+change});
}
console.log(JSON.stringify({passed:true,results}));
