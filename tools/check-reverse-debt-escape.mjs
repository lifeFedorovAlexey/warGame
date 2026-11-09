import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Mission} from '../campaign/mission.js';
import {planManeuver,checkManeuver} from '../campaign/vehicle-motion.js';
import {vehicleEnvelope} from '../campaign/vehicle-collision.js';
import {checkedProgressTurn} from '../campaign/traffic-shortcut.js';
import {createHeightfield} from '../demo/map-route.js';
import {shapeMesaRims} from '../demo/mesa-shaping.js';
import {refineRoadHeightfield} from '../demo/road-heightfield.js';
import {applyRoadGrades} from '../demo/road-grading.js';
const json=p=>JSON.parse(fs.readFileSync(p,'utf8')),config=json('assets/campaign/alpha/mission01/gameplay.json');
const raw=createHeightfield(json('assets/maps/alpha/heightfield.json'));shapeMesaRims(raw);
const field=refineRoadHeightfield(raw);applyRoadGrades(field,json('assets/maps/alpha/roads.json'));
const complete=g=>{let step;do{step=g.next();}while(!step.done);return step.value;};
// Exact in-flight pose, route and debt captured from authored-map seed 20261108,
// 20 vehicles, u45 after 180 s. These are historical inputs, not a corrective
// route inserted after the test starts. The complete seeded integration remains
// tools/check-navigation-map-samples.mjs --navigation-only --seeds 20261108.
const route=[[-912,1208],[-912,1192],[-872,1136],[-872,1072],[-856,1064],[-824,1064],[-816,1064],
 [-768,1008],[-752,888],[-784,760],[-784,720],[-824,688],[-872,688],[-888,736],[-944,744],[-961.1728485627586,741.2652375795576]]
 .map(([x,y])=>({x,y}));
function snapshot(){const m=new Mission(config,field);m.state.bounds=config.finalMapBounds.slice();m.rebuildNavigation();
 m.state.pendingCinematics=[];m.enemyOf=()=>false;m.attack=()=>{};m.updateRaid=()=>{};
 const u=m.addUnit('bukhanka','rai',{x:-909.3880826309959,y:1615.9606135500942},{heading:.21890517989686162,
  path:structuredClone(route),task:{type:'move',...route.at(-1)},reverseDebt:21.972586240020842,
  routeOrder:{revision:2,request:{x:-880,y:688},destination:{...route.at(-1)}},driveSpeed:0});return {m,u};}
const {m,u}=snapshot(),scale=config.worldScale,depth=vehicleEnvelope(u,scale,field).depth,
 allowed=(a,b)=>m.vehicleMotionClear(u,a,b),before={x:u.x,y:u.y,heading:u.heading,debt:u.reverseDebt,goal:structuredClone(u.routeOrder.destination)};
assert(m.vehicleMotionClear(u,u,u),'Historical pose is physically legal');
assert.equal(planManeuver(u,u.path[0],{scale,allowed,attempts:2,reverseBudget:0,maximumLegs:14}),null,
 'The historic exhausted-budget controller cannot leave this slope edge forward');
const legs=complete(checkedProgressTurn(m,u,u.path[0],u.task,allowed));assert(legs);
const reverse=legs.filter(l=>l.direction<0).reduce((sum,l)=>sum+l.remaining,0),end=checkManeuver(u,legs,scale,allowed);
assert(reverse<=depth+1e-8&&end&&legs.at(-1).direction===1);
assert(Math.hypot(end.x-u.task.x,end.y-u.task.y)<Math.hypot(u.x-u.task.x,u.y-u.task.y)-depth);
assert.deepEqual({x:u.x,y:u.y,heading:u.heading,debt:u.reverseDebt,goal:u.routeOrder.destination},before,'Proof mutates no pose, debt or goal');
let firstMotion=null,completedEscape=null,contacts=0;const original=m.vehicleCollision.bind(m);
m.vehicleCollision=(...args)=>{contacts++;return original(...args);};
for(let i=0;i<300;i++){
 m.advance(.1);if(firstMotion===null&&Math.hypot(u.x-before.x,u.y-before.y)>.5)firstMotion=m.state.time;
 if(firstMotion!==null&&!u.detour&&Math.hypot(u.x-u.task.x,u.y-u.task.y)<Math.hypot(before.x-u.task.x,before.y-u.task.y)-depth){completedEscape=m.state.time;break;}
}
assert(firstMotion!==null&&completedEscape!==null,'Production recovery must execute the proved escape');
assert(firstMotion<=.50001,'An exhausted historical debt cannot introduce a timed recovery pause');
assert.equal(contacts,0);assert.equal(u.hp,u.maxHp);assert.deepEqual(u.routeOrder.destination,before.goal);
console.log(JSON.stringify({reverseBudget:depth,plannedReverse:reverse,firstMotion,completedEscape,contacts,hp:u.hp,goalUnchanged:true}));
