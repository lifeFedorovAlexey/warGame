import fs from 'node:fs';
import {Mission} from '../campaign/mission.js';
import {createHeightfield} from '../demo/map-route.js';
import {shapeMesaRims} from '../demo/mesa-shaping.js';
import {refineRoadHeightfield} from '../demo/road-heightfield.js';
import {applyRoadGrades} from '../demo/road-grading.js';
import {turningHeadway} from '../campaign/turning-headway.js';
import {driveStep} from '../campaign/vehicle-motion.js';
import {vehicleEnvelope,footprintSupport,vehicleClearance} from '../campaign/vehicle-collision.js';
const json=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const capture=json('campaign/reports/navigation-wait-500-1794094616158.json'),config=json('assets/campaign/alpha/mission01/gameplay.json');
const raw=createHeightfield(json('assets/maps/alpha/heightfield.json'));shapeMesaRims(raw);
const field=refineRoadHeightfield(raw);applyRoadGrades(field,json('assets/maps/alpha/roads.json'));
const m=new Mission(config,field);m.state=structuredClone(capture.state);m.serial=capture.serial;m.randomState=capture.randomState;
m.updateMission=()=>{};m.rebuildNavigation();m.visible.fill(1);m.explored.fill(1);m.unitIndex.rebuild(m.state.units);m.unitIndexActive=true;
const u=m.entity('u440'),leader=m.entity('u419'),lease=m.state.trafficControl.leases.find(l=>l.key==='u419|u440'),z=lease.zone;
const point=u.path[0],blockers=new Set(),physical=turningHeadway(m,u,point,.1,config.worldScale,blockers);
const pose=driveStep(u,point,.1,{speed:30,grade:0,scale:config.worldScale,tolerance:2,trafficLimit:physical,
 allowed:(a,b)=>m.vehicleMotionClear(u,a,b),curveLimit:c=>turningHeadway(m,u,point,.1,config.worldScale,blockers,.52,c)});
const shape=vehicleEnvelope(leader,config.worldScale,field),side=(shape.x-z.x)*z.nx+(shape.y-z.y)*z.ny;
const initial={u:{x:u.x,y:u.y,path:u.path},leader:{x:leader.x,y:leader.y,heading:leader.heading,speed:leader.driveSpeed},lease,
 gap:vehicleClearance(u,leader,config.worldScale,field),releaseMargin:side*z.exitSign-z.width-footprintSupport(shape,z.nx,z.ny),
 physical,blockers:[...blockers].map(v=>v.id),hypotheticalStep:pose?Math.hypot(pose.x-u.x,pose.y-u.y):0};
m.trafficCoordinator.update(m);initial.recomputedDecision=m.trafficCoordinator.decisions.get(u.id);m.unitIndexActive=false;
const start=m.state.time,origin={x:u.x,y:u.y},history=[];let first=null;
for(let i=0;i<80*12;i++){
 m.advance(1/80,{budgetMs:8});m.effects=[];
 if(Math.hypot(u.x-origin.x,u.y-origin.y)>.01&&first===null)first=m.state.time-start;
 if(i%8===0)history.push(structuredClone({time:m.state.time-start,u:{x:u.x,y:u.y,speed:u.driveSpeed,nav:u.navigation},leader:{x:leader.x,y:leader.y,heading:leader.heading,speed:leader.driveSpeed,detour:leader.detour},decision:m.trafficCoordinator.decisions.get(u.id)}));
 if(first!==null&&m.state.time-start>first+1)break;
}
const report={initial,first,seconds:m.state.time-start,history};fs.writeFileSync('campaign/reports/u440-reservation.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({initial,first,seconds:report.seconds,tail:history.at(-1)}));
