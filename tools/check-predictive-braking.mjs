import assert from 'node:assert/strict';
import {progressMission} from './check-navigation-public-progress.mjs';
import {vehicleDynamics} from '../campaign/vehicle-dynamics.js';
import {vehicleClearance} from '../campaign/vehicle-collision.js';
const finish=it=>{let r;do{r=it.next();}while(!r.done);return r.value;},results=[];
for(const owner of ['rai','scavs']){
 const m=progressMission(),car=m.addUnit('bukhanka',owner,{x:0,y:0},{heading:0}),blocker=m.addUnit('bukhanka',owner,{x:0,y:38});
 const walls=[-16,16].map((x,i)=>({id:'wall'+i,x,y:70,halfWidth:3,halfDepth:140,hp:1}));m.nav.rebuild(walls);
 car.driveSpeed=20;car.path=[{x:0,y:150}];car.task={type:'move',x:0,y:150};
 let gap=Infinity,loss=0;const braking=vehicleDynamics(car).braking;
 for(let i=0;i<35;i++){
  const before=car.driveSpeed;m.state.time+=.1;
  finish(m.trafficCoordinator.driveSteps(m,car,car.path[0],.1,true));
  gap=Math.min(gap,vehicleClearance(car,blocker,m.config.worldScale,m.field));loss=Math.max(loss,before-car.driveSpeed);
 }
 assert(gap>0,'Approach and braking retain physical hull clearance');
 assert(loss<=braking*.1+.001,'A future obstruction cannot reset the current speed instantly');
 assert(m.trafficCoordinator.stats.brakingProfiles>0,'The obstruction produces a computed stopping distance');
 const stoppedAt=car.y;m.state.units.splice(m.state.units.indexOf(blocker),1);
 for(let i=0;i<20;i++){m.state.time+=.1;finish(m.trafficCoordinator.driveSteps(m,car,car.path[0],.1,true));}
 assert(car.y>stoppedAt+10,'The retained brake releases when the route becomes clear');
 assert.equal(car.hp,car.maxHp);results.push({owner,minimumGap:gap,maxSpeedLoss:loss,brakingPerStep:braking*.1});
}
console.log(JSON.stringify({passed:true,results}));
