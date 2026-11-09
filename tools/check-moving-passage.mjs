import assert from 'node:assert/strict';
import fs from 'node:fs';
import {progressMission} from './check-navigation-public-progress.mjs';
import {corridorBlocker,corridorReservationActive} from '../campaign/traffic-corridor.js';
import {vehicleClearance} from '../campaign/vehicle-collision.js';

// Captured before/after one real fixed step of 20 public crossing orders.
// No paths, poses or plans are injected by the test.
const fixture=JSON.parse(fs.readFileSync('tools/fixtures/navigation-moving-passage.json'));
function scene(which='fresh'){
 const m=progressMission();m.load(structuredClone(fixture[which==='fresh'?'before':which]));m.state.bounds=[0,0,127,127];m.rebuildNavigation();
 if(which==='fresh'){
  for(let i=0;i<10&&!m.entity(fixture.owner).detour?.joint;i++)m.advance(.1);
  assert(m.entity(fixture.owner).detour?.joint,'Current production controllers must commit the complete exchange');
 }
 return {m,a:m.entity(fixture.owner),b:m.entity(fixture.follower)};
}
const results=[];
let saved,ownerId,followerId;
{
 const {m,a,b}=scene();assert(a.detour?.joint,'The public commands produced a checked exchange');
 const joint=a.detour.joint;assert.equal(joint.phases.length,3);assert(joint.phases.every(p=>p.corridor.length));
 assert(joint.phases[1].continuous&&joint.phases[2].continuous);
 const reserved=a.detour.reservedCorridor,future=joint.phases[2].corridor.at(-1).to,outsider={id:'outsider',kind:a.kind,owner:a.owner};
 assert.equal(corridorBlocker(m,outsider,future,future)?.id,a.id,'The future return is reserved before any car moves');
 const goals=new Map([a,b].map(u=>[u.id,structuredClone(u.routeOrder.destination)])),phases=new Set();
 let gap=Infinity;
 for(let i=0;i<1000&&(a.task||b.task||a.jointTraffic||b.jointTraffic);i++){
  if(a.detour?.joint)phases.add(a.detour.joint.cursor);
  m.advance(.1);gap=Math.min(gap,vehicleClearance(a,b,m.config.worldScale,m.field));
  for(const u of [a,b]){assert.equal(u.hp,u.maxHp);assert.deepEqual(u.routeOrder.destination,goals.get(u.id));}
  if(a.detour?.joint?.cursor===1&&!saved){saved=m.save();ownerId=a.id;followerId=b.id;}
 }
 assert(gap>0);assert.deepEqual([...phases].sort(),[0,1,2]);assert(saved);
 for(const u of [a,b])assert(!u.task&&!u.path.length&&!u.jointTraffic&&Math.hypot(u.x-goals.get(u.id).x,u.y-goals.get(u.id).y)<2.01);
 assert(!corridorReservationActive(m,outsider,a,reserved),'Finishing releases the corridor');
 results.push({case:'both original orders finish through all three reserved phases',seconds:m.state.time,minGap:gap});
}
function restore(){const m=progressMission();m.load(saved);m.state.bounds=[0,0,127,127];m.rebuildNavigation();return {m,a:m.entity(ownerId),b:m.entity(followerId)};}
{
 const {m,a,b}=restore(),goals=[a,b].map(u=>structuredClone(u.routeOrder.destination));
 for(let i=0;i<1000&&(a.task||b.task||a.jointTraffic||b.jointTraffic);i++)m.advance(.1);
 for(const [i,u]of[a,b].entries())assert(!u.task&&!u.path.length&&!u.jointTraffic&&Math.hypot(u.x-goals[i].x,u.y-goals[i].y)<2.01);
 results.push({case:'save/load preserves the moving exchange and original destinations'});
}
for(const action of ['stop-owner','stop-follower','move-follower','retreat-follower']){
 const {m,a,b}=restore(),subject=action.endsWith('owner')?a:b;
 const reserved=a.detour.reservedCorridor,outsider={id:'outsider',kind:a.kind,owner:a.owner};
 if(action.startsWith('stop'))assert(m.stop([subject.id],{expandGroup:false}).ok);
 if(action.startsWith('move'))assert(m.submitOrder([subject.id],'move',{x:0,y:240}).ok);
 if(action.startsWith('retreat'))assert(m.retreat([subject.id]).ok);
 for(let i=0;i<10&&(a.jointTraffic||b.jointTraffic);i++)m.advance(.1);
 assert(!a.jointTraffic&&!b.jointTraffic,'New intent revokes every participant');
 assert(!corridorReservationActive(m,outsider,a,reserved),'New intent releases the old future corridor');
 results.push({case:action+' revokes the whole exchange'});
}
{
 const {m,a,b}=scene('before'),plan=m.trafficCoordinator.movingPassageSteps;let entered=false;
 m.trafficCoordinator.movingPassageSteps=function*(mission,leader,follower){if(leader.id===a.id&&follower.id===b.id)entered=true;return yield* plan.call(this,mission,leader,follower);};
 m.advance(.1,{budgetMs:0});for(let i=0;i<10000&&!entered&&m.pendingTick;i++)m.advance(0,{budgetMs:0});
 assert(entered&&m.pendingTick?.iterator,'Suspend the real proof inside its production controller');
 const iterator=m.pendingTick.iterator;assert(m.stop([b.id],{expandGroup:false}).ok);m.advance(0,{budgetMs:0});
 assert(m.pendingTick?.iterator!==iterator);assert(!a.jointTraffic&&!b.jointTraffic,'A cancelled proof never publishes half an exchange');
 results.push({case:'input during the proof publishes no partial exchange'});
}
fs.writeFileSync('campaign/reports/moving-passage.json',JSON.stringify({passed:true,results},null,2));console.log(JSON.stringify({passed:true,results}));
