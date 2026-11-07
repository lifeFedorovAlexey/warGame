import assert from 'node:assert/strict';
import {fixture,config} from './check-start-latency-coordinator.mjs';
import {checkManeuver} from '../campaign/vehicle-motion.js';
const m=fixture(),u=m.addUnit('bukhanka','rai',{x:0,y:0}),ahead=m.addUnit('bukhanka','rai',{x:0,y:35}),
 left=m.addUnit('bukhanka','rai',{x:-14,y:20}),right=m.addUnit('bukhanka','rai',{x:14,y:20});
const goal={x:0,y:180},start={x:0,y:0,heading:0,kind:u.kind},end={...start,y:80};
u.path=[goal];u.task={type:'move',...goal};
u.passage={along:'y',direction:1,admit:20,egress:{phase:'waiting',entry:{x:0,y:0},start,end,legs:[{direction:1,curve:0,remaining:80}]}};
let searches=0,contacts=0;const plan=m.planManeuverSteps.bind(m),collision=m.vehicleCollision.bind(m);
m.planManeuverSteps=function*(...args){searches++;return yield* plan(...args);};
m.vehicleCollision=(...args)=>{contacts++;return collision(...args);};
for(let i=0;i<10;i++)m.advance(.1);
assert.equal(searches,1,'An unchanged physically blocked exit runs its alternative search only once');
assert.equal(u.x,0);assert.equal(u.y,0);
// Opening the side route leaves the old straight cached sweep obstructed.
left.hp=0;right.hp=0;const changedAt=m.state.time;
assert.equal(checkManeuver(u,u.passage.egress.legs,config.worldScale,(a,b)=>m.vehicleMotionClear(u,a,b)),null);
let firstMotion=null;
for(let i=0;i<5&&!firstMotion;i++){m.advance(.1);if(Math.hypot(u.x,u.y)>.1)firstMotion=m.state.time-changedAt;}
assert(firstMotion!==null&&firstMotion<=.50001,'The newly available alternative must start immediately, not after 1.8 s');
assert.equal(searches,2,'Exactly one new search for the changed physical configuration');
for(let i=0;i<300&&u.task;i++)m.advance(.1);
assert(!u.task&&Math.hypot(u.x-goal.x,u.y-goal.y)<2,'The actual checked exit reaches the original destination');
assert.equal(u.hp,u.maxHp);assert.equal(ahead.hp,ahead.maxHp);assert.equal(contacts,0);
console.log(JSON.stringify({searchesBeforeChange:1,searchesAfterChange:searches,firstMotion,contacts,goalError:Math.hypot(u.x-goal.x,u.y-goal.y)}));
