import assert from 'node:assert/strict';
import {maneuverPlanStep} from '../campaign/vehicle-motion.js';
const start={kind:'bukhanka',x:0,y:0,heading:0,reversing:false,driveSpeed:17,wheelDistance:0};
const options={scale:4.5,allowed:()=>true};
const leg=(remaining,curve=0,direction=1)=>({remaining,curve,direction});
for(const curve of [0,.4,-.7]){
 const whole=maneuverPlanStep(start,[leg(20,curve)],.1,options);
 const samples=maneuverPlanStep(start,Array.from({length:200},()=>leg(.1,curve)),.1,options);
 for(const key of ['x','y','heading','wheelDistance','driveSpeed'])assert(Math.abs(whole.pose[key]-samples.pose[key])<1e-8,key);
 assert.equal(whole.pose.driveSpeed,17);assert(samples.consumed.length>1);
}
const blocked=[leg(.2),leg(10)];
assert.equal(maneuverPlanStep(start,blocked,.1,{...options,allowed:(_a,b)=>b.y<.5}),null,'Later sub-arc collision rejects the whole tick');
assert.deepEqual(blocked,[leg(.2),leg(10)],'A rejected tick cannot consume the plan');
const gear=maneuverPlanStep(start,[leg(.3),leg(20,0,-1)],.1,options);
assert.equal(gear.consumed.length,1);assert.equal(gear.pose.y,.3,'Never drive through a gear change in one tick');
const accelerating=maneuverPlanStep({...start,driveSpeed:0},[leg(.02),leg(10)],.1,options);
assert(accelerating.pose.driveSpeed<=2.2+1e-9,'Arc boundaries cannot reset the acceleration allowance');
console.log(JSON.stringify({passed:true,checks:['sampling invariance on straight and curved paths','all sub-arcs collision checked','gear change boundary','one acceleration allowance']}));
