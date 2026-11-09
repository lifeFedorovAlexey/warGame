import fs from 'node:fs';
import {fixture,config} from './check-start-latency-coordinator.mjs';
import {turningHeadway} from '../campaign/turning-headway.js';
import {driveStep} from '../campaign/vehicle-motion.js';
const events=JSON.parse(fs.readFileSync('campaign/reports/combat-wait-events.json')).events;
const results=[];
for(const event of events){
 const m=fixture();m.state=structuredClone(event.state);m.rebuildNavigation();
 for(const id of event.data.units??[]){
  const u=m.entity(id),point=u.path[0];if(!point||u.detour)continue;
  const d=Math.hypot(point.x-u.x,point.y-u.y),course={x:(point.x-u.x)/d,y:(point.y-u.y)/d};
  const forward={x:-Math.sin(u.heading),y:Math.cos(u.heading)},projectionBlocked=new Set(),arcBlocked=new Set();
  const straight=m.trafficSpeed(u,course,null,config.worldScale,projectionBlocked);
  const arc=turningHeadway(m,u,point,.1,config.worldScale,arcBlocked);
  const pose=driveStep(u,point,.1,{speed:30,grade:0,scale:config.worldScale,tolerance:2,trafficLimit:arc,
   allowed:(from,to)=>m.vehicleMotionClear(u,from,to),curveLimit:c=>turningHeadway(m,u,point,.1,config.worldScale,arcBlocked,.52,c)});
  results.push({time:event.time,id,dot:forward.x*course.x+forward.y*course.y,straight,arc,projectionBlocked:[...projectionBlocked].map(u=>u.id),
   arcBlocked:[...arcBlocked].map(u=>u.id),actualStep:pose?Math.hypot(pose.x-u.x,pose.y-u.y):0});
 }
}
console.log(JSON.stringify(results,null,2));
