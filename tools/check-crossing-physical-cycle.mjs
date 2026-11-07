import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fixture,config} from './check-start-latency-coordinator.mjs';
import {vehicleEnvelope,footprintSupport,vehicleClearance} from '../campaign/vehicle-collision.js';

// Unmodified failed production save: u57 follows the actual u60 body, while
// the old crossing promises say u57 -> u53 -> u60. All three were stationary
// from 23.7 to 80 s and only 17 of the twenty cars could fire.
const saved=fs.readFileSync('tools/fixtures/crossing-physical-cycle.json','utf8');
const sourceFiles=['campaign/traffic-coordinator.js','campaign/mission.js','campaign/vehicle-motion.js','campaign/vehicle-dynamics.js'];
const hashes=()=>Object.fromEntries(sourceFiles.map(p=>[p,createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
const sourceHashes=hashes();
function load(){const m=fixture();m.load(saved);m.state.bounds=[0,0,127,127];m.rebuildNavigation();m.visible.fill(1);m.explored.fill(1);
 m.unitIndex.rebuild(m.state.units);return m;}
const key='u53|u60',results=[];
{
 const m=load(),start=m.state.time,ids=['u53','u57','u60'],fired=new Set(),contacts=[],withdrawn=[],transferred=[];
 const collision=m.vehicleCollision.bind(m),update=m.trafficCoordinator.update.bind(m.trafficCoordinator);
 m.vehicleCollision=(u,speed,b)=>{if(b.size)contacts.push({time:m.state.time,id:u.id,speed,blockers:[...b].map(x=>x.id)});return collision(u,speed,b);};
 m.trafficCoordinator.update=mission=>{update(mission);withdrawn.push(...m.trafficCoordinator.statistics.withdrawn);transferred.push(...m.trafficCoordinator.statistics.transferred);};
 for(let i=0;i<30*80&&fired.size<3;i++){
  m.advance(1/80,{budgetMs:6});for(const e of m.effects)if(e.type==='shot'&&ids.includes(e.from))fired.add(e.from);m.effects=[];
 }
 const passed=fired.size===3&&!contacts.length&&transferred.some(x=>x.key===key&&x.to==='u60')&&ids.every(id=>m.entity(id).hp===320);
 results.push({case:'saved physical following cycle completes',passed,seconds:m.state.time-start,fired:[...fired],contacts,withdrawn,transferred});
 if(!passed)fs.writeFileSync('tools/fixtures/crossing-physical-cycle-after.json',m.save());
}
for(const moving of [false,true]){
 const m=load(),zone=m.state.trafficControl.leases.find(l=>l.key===key).zone;
 const heading=Math.atan2(-zone.ux,zone.uy),car=m.addUnit('bukhanka','rai',{x:zone.x,y:zone.y},{heading});
 if(moving){
  const shape=vehicleEnvelope(car,config.worldScale,m.field),projection=Math.abs(zone.ux*zone.nx+zone.uy*zone.ny);
  const distance=(zone.width+footprintSupport(shape,zone.nx,zone.ny)+2)/projection;
  car.x+=zone.ux*distance;car.y+=zone.uy*distance;car.heading+=Math.PI;car.driveSpeed=30;car.steering=0;
  assert(Math.abs((car.x-zone.x)*zone.nx+(car.y-zone.y)*zone.ny)>zone.width+footprintSupport(shape,zone.nx,zone.ny),
   'The incoming body starts outside the reserved lane; its stopping sweep enters it');
 }
 m.unitIndex.rebuild(m.state.units);m.trafficCoordinator.update(m);
 const retained=m.state.trafficControl.leases.find(l=>l.key===key);
 const minimumBodyGap=Math.min(...m.state.units.filter(u=>u!==car).map(u=>vehicleClearance(car,u,config.worldScale,m.field)));
 const passed=minimumBodyGap>0&&retained?.winner==='u53'&&!!retained.zone&&!m.trafficCoordinator.statistics.withdrawn.some(x=>x.key===key);
 results.push({case:moving?'incoming stopping sweep prevents withdrawal':'occupied crossing prevents withdrawal',passed,
  minimumBodyGap,
  winner:retained?.winner,occupiedCycles:m.trafficCoordinator.statistics.occupiedCycles});
}
const sourceChanged=JSON.stringify(sourceHashes)!==JSON.stringify(hashes());
const report={passed:results.every(r=>r.passed)&&!sourceChanged,results,sourceChanged,sourceHashes};
fs.writeFileSync('campaign/reports/crossing-physical-cycle.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
assert(report.passed,'Renegotiation must preserve occupied rights and unavoidable stopping sweeps');
