import assert from 'node:assert/strict';
import fs from 'node:fs';
import {progressMission} from './check-navigation-public-progress.mjs';
import {checkedPassageBackoff} from '../campaign/traffic-start.js';
import {vehicleClearance} from '../campaign/vehicle-collision.js';
import {corridorBlocker} from '../campaign/traffic-corridor.js';

const capture=JSON.parse(fs.readFileSync('tools/fixtures/navigation-progress-captures.json')).cases.find(c=>c.name==='fifty-exhausted-backoff');
const finish=it=>{let result;do{result=it.next();}while(!result.done);return result.value;};
function load(saved=capture.saved){const m=progressMission();m.load(structuredClone(saved));m.state.bounds=[0,0,127,127];m.rebuildNavigation();return m;}
function arrange(){
 const m=load(),requester=m.entity('u212'),donor=m.entity('u220');
 const debt=requester.reverseDebt,goals=m.state.units.map(u=>structuredClone(u.routeOrder?.destination));
 assert(debt>m.config.worldScale*4,'This capture exhausts ordinary reverse allowance');
 const plan=finish(checkedPassageBackoff(m,requester,donor));assert.equal(plan?.joint?.phases.length,4);
 assert.deepEqual(plan.joint.phases.map(p=>p.id),[requester.id,donor.id,requester.id,donor.id]);
 assert(plan.joint.phases[3].returning);
 const end=plan.joint.phases[3].corridor.at(-1),outsider={id:'outside',kind:donor.kind,owner:donor.owner};
 assert.equal(corridorBlocker(m,outsider,end.from,end.to)?.id,requester.id,'The last return is reserved before the initial backoff');
 assert.equal(requester.reverseDebt,debt,'The complete proof cannot erase reverse history');
 assert.deepEqual(m.state.units.map(u=>u.routeOrder?.destination),goals);
 requester.detour=plan;return {m,requester,donor,plan};
}
const results=[];
{
 const {m,requester}=arrange();m.advance(.1);
 const copy=load(JSON.parse(m.save())),units=m.state.units.filter(u=>u.routeOrder),goals=new Map(units.map(u=>[u.id,structuredClone(u.routeOrder.destination)]));
 const done=u=>!u.task&&!u.path.length&&!u.detour&&!u.yieldReturn&&!u.pendingOrder&&!u.jointTraffic;
 const start=m.state.time;let gap=Infinity;
 for(let i=0;i<400&&!units.every(done);i++){
  m.advance(.1);copy.advance(.1);
  for(const u of units){const other=copy.entity(u.id);assert.deepEqual([u.x,u.y,u.heading,u.hp],[other.x,other.y,other.heading,other.hp]);
   assert.equal(JSON.stringify([u.path,u.detour,u.yieldReturn,u.jointTraffic]),JSON.stringify([other.path,other.detour,other.yieldReturn,other.jointTraffic]));
   assert.deepEqual(u.routeOrder.destination,goals.get(u.id));assert.equal(u.hp,u.maxHp);}
  for(let a=0;a<units.length;a++)for(let b=0;b<a;b++)gap=Math.min(gap,vehicleClearance(units[a],units[b],m.config.worldScale,m.field));
 }
 assert(units.every(done)&&gap>0);assert(Math.hypot(requester.x-goals.get(requester.id).x,requester.y-goals.get(requester.id).y)<.65);
 results.push({case:'four phases and save/load',seconds:m.state.time-start,arrived:units.length,gap});
}
for(const who of ['requester','donor'])for(const action of ['stop','move']){
 const scene=arrange(),{m,requester,donor,plan}=scene;m.tick(.1);
 const unit=scene[who],pose={x:unit.x,y:unit.y};
 if(action==='stop')m.stop([unit.id],{expandGroup:false});else assert(m.submitOrder([unit.id],'move',{x:400,y:300}).ok);
 m.tick(.1);
 if(who==='requester'&&action==='move'){
  assert.deepEqual({x:unit.x,y:unit.y},pose,'Pending replacement prevents old movement immediately');
  for(let i=0;i<100&&unit.pendingOrder;i++)m.advance(1/80,{budgetMs:5});
  assert(!unit.pendingOrder);assert.deepEqual(unit.routeOrder.request,{x:400,y:300});
 }
 assert(requester.detour!==plan,'An interrupted transaction cannot execute its old continuation: '+who+' '+action);
 if(who==='requester'&&action==='stop')assert.deepEqual({x:unit.x,y:unit.y},pose);
 if(who==='requester')assert(!donor.yieldReturn?.cooperativeRequester,'The abandoned donor hold is released: '+JSON.stringify({action,donor:donor.yieldReturn,requester:requester.detour,pending:requester.pendingOrder}));
 results.push({case:who+' '+action+' cancels old transaction'});
}
for(const change of ['command','construction','donor stop']){
 const m=load(),requester=m.entity('u212'),donor=m.entity('u220');m.nav.workDeadline=-Infinity;
 const iterator=checkedPassageBackoff(m,requester,donor);assert.equal(iterator.next().done,false);
 if(change==='command')assert(m.submitOrder([requester.id],'move',{x:400,y:300}).ok);
 else if(change==='donor stop')m.stop([donor.id],{expandGroup:false});
 else{m.addStructure('generator','rai',{x:400,y:300});m.rebuildNavigation();}
 m.nav.workDeadline=Infinity;assert(finish(iterator)===null,'A suspended proof must reject '+change);assert(!donor.yieldReturn);
 results.push({case:change+' invalidates suspended proof'});
}
console.log(JSON.stringify({passed:true,results}));
