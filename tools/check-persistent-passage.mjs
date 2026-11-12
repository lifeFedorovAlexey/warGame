import assert from 'node:assert/strict';
import {progressMission} from './check-navigation-public-progress.mjs';
import {commitJointPlan,jointPlanFor,stepJointTraffic} from '../campaign/traffic-joint.js';
import {rememberYieldHome,recordYieldStep} from '../campaign/traffic-start.js';
const results=[];
function scene(ownerSide){
 const m=progressMission(),owner=m.addUnit('bukhanka',ownerSide,{x:0,y:0}),donor=m.addUnit('bukhanka',ownerSide,{x:80,y:0});
 owner.path=[{x:0,y:40}];owner.task={type:'move',x:0,y:40};owner.routeOrder={destination:{x:0,y:40}};
 const phases=[{body:donor,from:{...donor},legs:[{direction:1,curve:0,remaining:20}]},
  {body:owner,from:{...owner},legs:[{direction:1,curve:0,remaining:40}]},
  {body:donor,from:{...donor,y:20},legs:[{direction:-1,curve:0,remaining:20}],returning:true}];
 owner.detour=commitJointPlan(m,owner,{x:0,y:40},phases,rememberYieldHome,()=>true);assert(owner.detour);
 return {m,owner,donor,plan:owner.detour};
}
for(const side of ['rai','scavs']){
 const {m,owner,donor,plan}=scene(side),token=plan.joint.token;
 const far={id:'far',x:600,y:600,halfWidth:20,halfDepth:20,hp:1};m.nav.rebuild([...m.nav.solids,far]);
 assert.equal(jointPlanFor(m,donor)?.plan,plan.joint,'Distant construction keeps parking and return phases');
 const intruder=m.addUnit('bukhanka',side,{x:80,y:15});intruder.path=[{x:300,y:15}];intruder.task={type:'move',x:300,y:15};
 for(let i=0;i<45;i++){m.state.time+=.1;stepJointTraffic(m,donor,.1,recordYieldStep);}
 assert.equal(owner.detour,plan,'A temporary crossing does not discard the plan after three seconds');
 assert.equal(donor.jointTraffic.token,token);assert.equal(plan.joint.cursor,0);assert.equal(plan.joint.phases[2].returning,true);
 // The temporary obstacle leaves the simulation; the original phase resumes.
 m.state.units.splice(m.state.units.indexOf(intruder),1);
 const restored=progressMission();restored.load(m.save());restored.state.bounds=m.state.bounds.slice();restored.rebuildNavigation();
 assert(jointPlanFor(restored,restored.entity(donor.id)),'Saved parking and return phases retain their local proof');
 for(let i=0;i<500&&owner.detour?.joint;i++){
  m.state.time+=.1;stepJointTraffic(m,m.entity(owner.detour.joint.phases[owner.detour.joint.cursor].id),.1,recordYieldStep);
 }
 assert(!owner.detour&&!donor.jointTraffic&&!donor.yieldReturn);
 assert(Math.abs(owner.y-40)<.65&&Math.abs(donor.y)<.65);assert.equal(donor.hp,donor.maxHp);
 const obstructed=scene(side),near={id:'near',x:80,y:10,halfWidth:10,halfDepth:10,hp:1};
 obstructed.m.nav.rebuild([...obstructed.m.nav.solids,near]);assert.equal(jointPlanFor(obstructed.m,obstructed.donor),null);
 const fixed=scene(side),parked=fixed.m.addUnit('bukhanka',side,{x:80,y:15});
 for(let i=0;i<40&&fixed.owner.detour;i++){fixed.m.state.time+=.1;stepJointTraffic(fixed.m,fixed.donor,.1,recordYieldStep);}
 assert(!fixed.owner.detour,'A permanent obstruction must release the old plan for recovery');
 results.push({side,keptDuringTemporaryBlock:true,finishedAndReturned:true,localObstructionInvalidated:true});
}
console.log(JSON.stringify({passed:true,results}));
