import assert from 'node:assert/strict';
import fs from 'node:fs';
import {progressMission} from './check-navigation-public-progress.mjs';
import {vehicleClearance} from '../campaign/vehicle-collision.js';
import {checkedCooperativeArrival} from '../campaign/traffic-start.js';

// Unmodified public 24-car failure: the near side is blocked by two parked
// rows. A complete route needs a different entrance, beyond the local beam.
const m=progressMission();m.load(JSON.parse(fs.readFileSync('tools/fixtures/navigation-slow-input.json')));
m.state.bounds=[0,0,127,127];m.rebuildNavigation();
const units=m.state.units,goals=new Map(units.filter(u=>u.routeOrder).map(u=>[u.id,structuredClone(u.routeOrder.destination)])),
 health=new Map(units.map(u=>[u.id,u.hp])),rocks=new Map(units.map(u=>[u.id,u.contactRock?.at]));
const done=u=>!u.pendingOrder&&!u.task&&!u.path.length&&!u.detour&&!u.yieldReturn;
const start=m.state.time,wall=performance.now();let minGap=Infinity,contacts=0;
for(let step=0;step<600&&!units.every(done)&&performance.now()-wall<60000;step++){
 m.tick(.1);
 for(const u of units){
  assert.equal(u.hp,health.get(u.id));if(goals.has(u.id))assert.deepEqual(u.routeOrder.destination,goals.get(u.id));
  if(u.contactRock?.at!==rocks.get(u.id)){contacts++;rocks.set(u.id,u.contactRock?.at);}
 }
 for(let a=0;a<units.length;a++)for(let b=0;b<a;b++)minGap=Math.min(minGap,vehicleClearance(units[a],units[b],m.config.worldScale,m.field));
}
const result={passed:units.every(done)&&minGap>0&&!contacts,seconds:m.state.time-start,wallSeconds:(performance.now()-wall)/1000,
 minGap,contacts,unfinished:units.filter(u=>!done(u)).map(u=>u.id)};
for(const [id,g] of goals){const u=m.entity(id);if(done(u))assert(Math.hypot(u.x-g.x,u.y-g.y)<2.01);}
console.log(JSON.stringify(result));assert(result.passed,'The original orders must reach their original destinations without a new click or injected manoeuvre');

// Changes while the outside approach is suspended revoke the complete joint
// proof. In particular, cancelling a donor cannot later lend its old home.
for(const change of ['requester-move','donor-stop','construction','body-move']){
 const scene=progressMission();scene.load(JSON.parse(fs.readFileSync('tools/fixtures/navigation-slow-input.json')));
 scene.state.bounds=[0,0,127,127];scene.rebuildNavigation();
 const requester=scene.entity('u181'),donor=scene.entity('u180'),search=scene.vehiclePathSteps;let entered=false;
 scene.vehiclePathSteps=function*(...args){if(args[2]?.obstacles?.length===0)entered=true;return yield* search.apply(this,args);};
 scene.nav.workDeadline=0;
 const proof=checkedCooperativeArrival(scene,requester,requester.routeOrder.destination,{cooperate:true});let step;
 for(let i=0;i<200000&&!entered;i++){step=proof.next();if(step.done)break;}
 assert(entered&&!step.done,'Suspend inside the real outside-approach proof');
 if(change==='requester-move')scene.submitOrder([requester.id],'move',{x:-300,y:600});
 if(change==='donor-stop')scene.stop([donor.id],{expandGroup:false});
 if(change==='construction'){scene.addStructure('generator','rai',{x:800,y:800},{halfWidth:3,halfDepth:3});scene.rebuildNavigation();}
 if(change==='body-move')donor.x+=.1;
 scene.nav.workDeadline=Infinity;
 do{step=proof.next();}while(!step.done);
 assert.equal(step.value,null,'A changed world cannot accept the old proof: '+change);
 assert(scene.state.units.every(u=>!u.detour&&!u.yieldReturn),'No partial transaction may be committed after invalidation');
 console.log(JSON.stringify({passed:true,invalidation:change}));
}
