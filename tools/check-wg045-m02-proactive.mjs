import fs from 'node:fs';
import assert from 'node:assert/strict';
import {makeMission} from './m02-fixture.mjs';
import {roadDrivingLane} from '../campaign/road-merge.js';
import {vehicleEnvelope,vehicleSweep,footprintSupport} from '../campaign/vehicle-collision.js';
import {bodyEnvelope} from '../campaign/vehicle-overlap.js';
if(!fs.existsSync('campaign/mission02-diagnostic.js')){
 console.log('SKIP: second mission is not present in this checkout');process.exit(0);
}
const {prepareM02Diagnostic}=await import('../campaign/mission02-diagnostic.js');
const m=prepareM02Diagnostic(makeMission());
for(const b of Object.values(m.state.m02.bases))if(b.production)b.production.stopped=true;
for(const spec of Object.values(m.config.buildings))spec.damage=0;
m.state.units=[];m.rebuildNavigation();m.explored.fill(1);m.visible.fill(1);
const road=m.nav.roads.nearest({x:-825,y:-400},80);assert(road);
const unit=m.addUnit('bukhanka','rai',{x:road.x,y:road.y},{heading:Math.atan2(-road.segment.ux,road.segment.uy)});
unit.trafficOnScreen=true;unit.hp=unit.maxHp*.7;
assert(m.retreat([unit.id]).ok);
const start={x:unit.x,y:unit.y},wall=performance.now();let first=null,offroad=null,maxDistance=0,samples=0,onRoad=0,clearSection=0,clearSectionOnRoad=0,clearHullOnRoad=0,last=-1,lastTrace=-1;
let captured=false;
while(m.state.time<55&&performance.now()-wall<30000){
 m.advance(1/30,{budgetMs:6});
 if(process.argv.includes('--capture')&&!captured&&m.state.time>=12){
  captured=true;fs.mkdirSync('campaign/previews/playtest-WG-045',{recursive:true});
  fs.writeFileSync('campaign/previews/playtest-WG-045/m02-proactive-12.json',m.save());
 }
 if(unit.path?.length&&roadDrivingLane(m,unit,unit.path[0],m.config.worldScale)?.retreatShoulder)first??=m.state.time;
 const near=m.nav.roads.nearest(unit,m.config.worldScale*8);
 if(process.argv.includes('--trace')&&Math.floor(m.state.time/2)>lastTrace){
  lastTrace=Math.floor(m.state.time/2);const lane=unit.path?.length&&roadDrivingLane(m,unit,unit.path[0],m.config.worldScale);
  let alternate;
  if(lane?.retreatSide===-1){
   const laneRoad=m.nav.roads.nearest(lane,m.config.worldScale*12),shape=vehicleEnvelope(unit,m.config.worldScale,m.field);
   const off=(laneRoad?.width??near.width)/2+shape.width+m.config.worldScale*2.5;
   const p={x:lane.x+lane.uy*off*2,y:lane.y-lane.ux*off*2};
   const pose={...p,kind:unit.kind,heading:Math.atan2(-lane.ux,lane.uy)};
   alternate={line:m.nav.lineClear(unit,p,false,true),solid:m.nav.clearSolidSweep(vehicleSweep(pose,pose,m.config.worldScale,m.field),m.nav.nearbySolids(p,m.config.worldScale*4))};
  }
  console.log(JSON.stringify({t:+m.state.time.toFixed(1),x:+unit.x.toFixed(1),y:+unit.y.toFixed(1),road:near?.segment.pathId,
   dist:near&&+near.distance.toFixed(1),signed:near&&+((unit.x-near.x)*near.segment.uy-(unit.y-near.y)*near.segment.ux).toFixed(1),width:near?.width,
   shoulder:!!lane?.retreatShoulder,lane:lane&&{x:+lane.x.toFixed(1),y:+lane.y.toFixed(1),direction:lane.direction,side:lane.retreatSide},alternate,waypoint:unit.path?.[0],status:unit.navigation?.reason}));
 }
 if(near&&near.distance>near.width/2)offroad??=m.state.time;
 if(m.state.time>5&&unit.combatRetreat&&unit.path?.length&&near&&m.nav.roads.nearest(unit.path[0])&&Math.floor(m.state.time*2)>last){
  last=Math.floor(m.state.time*2);samples++;if(near.distance<near.width/2)onRoad++;
  if(near.segment.pathId==='junction-1--junction-7-2'&&unit.y>=-75&&unit.y<=185){
   clearSection++;if(near.distance<near.width/2)clearSectionOnRoad++;
   const body=bodyEnvelope(unit,m.config.worldScale,m.field);
   const half=footprintSupport(body,near.segment.uy,-near.segment.ux);
   if(near.distance<near.width/2+half)clearHullOnRoad++;
  }
 }
 maxDistance=Math.max(maxDistance,Math.hypot(unit.x-start.x,unit.y-start.y));
}
assert(first!==null&&first<8,'The lone retreat must choose a shoulder before encountering attackers');
assert(offroad!==null&&offroad<20,'The vehicle must physically leave the asphalt');
assert(maxDistance>100,'The vehicle must make real progress toward the repair factory');
assert(samples>40&&onRoad<=Math.ceil(samples*.12),'The retreat should mostly remain off the asphalt, including around junctions: '+JSON.stringify({samples,onRoad}));
assert(clearSection>10&&clearSectionOnRoad<=1,'On the open middle section the car should stay on the shoulder: '+JSON.stringify({clearSection,clearSectionOnRoad}));
assert.equal(clearHullOnRoad,0,'The full vehicle body must keep the open road clear');
console.log(JSON.stringify({passed:true,first,offroad,maxDistance,samples,onRoad,clearSection,clearSectionOnRoad,clearHullOnRoad,time:m.state.time}));
