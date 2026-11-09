import assert from 'node:assert/strict';
import fs from 'node:fs';
import {progressMission} from './check-navigation-public-progress.mjs';
import {vehicleClearance} from '../campaign/vehicle-collision.js';

// Full unchanged saves preserve the neighbouring accepted goals and live
// controllers. Do not inject a path, move blockers or issue another command.
const fixtures=JSON.parse(fs.readFileSync('tools/fixtures/navigation-arrival-horizon.json','utf8'));
const results=[];
for(const {name,subject,saved} of fixtures.cases){
 const m=progressMission();m.load(structuredClone(saved));m.state.bounds=[0,0,127,127];m.rebuildNavigation();
 const u=m.entity(subject),units=m.state.units,goals=new Map(units.map(v=>[v.id,structuredClone(v.routeOrder?.destination)]));
 const health=new Map(units.map(v=>[v.id,v.hp])),contacts=new Map(units.map(v=>[v.id,v.contactRock?.at]));
 const goal=goals.get(subject),start=m.state.time,wall=performance.now();let minGap=Infinity,maxFrameMs=0;
 const done=()=>!u.pendingOrder&&!u.task&&!u.path.length&&!u.detour&&!u.yieldReturn&&Math.hypot(u.x-goal.x,u.y-goal.y)<.65;
 assert(Math.hypot(u.x-goal.x,u.y-goal.y)>m.config.worldScale*6,'Regression must start beyond the old cutoff');
 while(!done()&&m.state.time-start<12&&performance.now()-wall<45000){
  const before=performance.now();m.advance(1/80,{budgetMs:5});maxFrameMs=Math.max(maxFrameMs,performance.now()-before);m.effects=[];
  for(const v of units){
   assert.deepEqual(v.routeOrder?.destination,goals.get(v.id),'Accepted goals remain immutable');
   assert.equal(v.hp,health.get(v.id),'Recovery must not cause damage');
   assert.equal(v.contactRock?.at,contacts.get(v.id),'Recovery must not cause a physical contact');
  }
  if(!m.pendingTick)for(let i=0;i<units.length;i++)for(let j=0;j<i;j++)
   minGap=Math.min(minGap,vehicleClearance(units[i],units[j],m.config.worldScale,m.field));
 }
 assert(done(),`${name}: ${subject} must reach its original accepted point within 12 simulation seconds`);
 assert(minGap>=0,'Recovery must preserve separated bodies');
 results.push({name,subject,seconds:m.state.time-start,error:Math.hypot(u.x-goal.x,u.y-goal.y),minGap,maxFrameMs});
}
console.log(JSON.stringify({passed:true,results}));
