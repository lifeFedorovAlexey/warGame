import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Mission} from '../campaign/mission.js';
import {createHeightfield} from '../demo/map-route.js';
import {shapeMesaRims} from '../demo/mesa-shaping.js';
import {refineRoadHeightfield} from '../demo/road-heightfield.js';
import {applyRoadGrades} from '../demo/road-grading.js';
const json=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const config=json('assets/campaign/alpha/mission01/gameplay.json'),raw=createHeightfield(json('assets/maps/alpha/heightfield.json'));
shapeMesaRims(raw);const field=refineRoadHeightfield(raw);applyRoadGrades(field,json('assets/maps/alpha/roads.json'));
function fixture(){
 const m=new Mission(config,field),p=field.gridToWorld(config.startGrid);
 for(let i=0;i<200;i++){
  const u=m.addUnit('bukhanka','rai',{x:p.x+(i%20)*34,y:p.y+Math.floor(i/20)*30});
  u.heading=u.previousHeading=-Math.PI/2;u.path=[{x:u.x+200,y:u.y}];u.task={type:'move',...u.path[0]};
 }
 return m;
}
const full=fixture(),sliced=fixture(),staticOccupied=sliced.nav.occupied.slice();let slices=0,pathYields=0;
for(let step=0;step<30;step++){
 full.advance(.1);sliced.advance(.1,{budgetMs:0});
 assert(sliced.pendingTick,'Zero budget must yield within the logical step');
 while(sliced.pendingTick){
  if(sliced.pendingTick.iterator&&++pathYields<10)assert.deepEqual(sliced.nav.occupied,staticOccupied,'Suspended routing restores temporary vehicle cells');
  sliced.advance(0,{budgetMs:0});assert(++slices<200000);
 }
 assert.deepEqual(sliced.state,full.state,'Slicing must preserve movement, targeting, RNG and event order');
 assert.deepEqual(sliced.events,full.events);assert.equal(sliced.randomState,full.randomState);
}
full.advance(.1);sliced.advance(.1,{budgetMs:0});assert(sliced.pendingTick);
const saved=sliced.save();assert.equal(sliced.pendingTick,null,'Save finishes the current step');
assert.deepEqual(JSON.parse(saved).state,JSON.parse(full.save()).state);
sliced.advance(.1,{budgetMs:0});assert(sliced.pendingTick);sliced.load(saved);
assert.equal(sliced.pendingTick,null);assert.equal(sliced.renderUnitPhase(sliced.state.units[0],performance.now()),null);
assert(sliced.state.units.some(u=>Math.hypot(u.x-u.previousX,u.y-u.previousY)>.01),'Fixture actually moves vehicles');
const navigator=full.nav,origin=field.gridToWorld(config.startGrid);
for(let i=0;i<12;i++){
 const target={x:origin.x+40+i*17,y:origin.y+(i%3)*30},options={maxGoalDistance:16};
 const expected=navigator.computePath(origin,target,options),first=navigator.findPath(origin,target,options);
 assert.deepEqual(first,expected);if(first?.length)first[0].x+=10000;
 assert.deepEqual(navigator.findPath(origin,target,options),expected,'Cached waypoint mutation must not leak');
}
const cachedCount=navigator.pathCache.size;navigator.rebuild(full.state.buildings);
assert.equal(navigator.pathCache.size,cachedCount,'An unchanged footprint set preserves navigation results; changed-region invalidation has its own regression test');
assert(pathYields>0,'The fixture must suspend inside pathfinding');
console.log(JSON.stringify({passed:true,slices,pathYields,units:full.state.units.length,identicalFixedSteps:31,saveFlush:true,loadReset:true}));
