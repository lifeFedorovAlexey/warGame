import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Mission} from '../campaign/mission.js';
import {vehicleClearance} from '../campaign/vehicle-motion.js';
import {vehicleSweep} from '../campaign/vehicle-collision.js';
import {createHeightfield} from '../demo/map-route.js';
import {shapeMesaRims} from '../demo/mesa-shaping.js';
import {refineRoadHeightfield} from '../demo/road-heightfield.js';
import {applyRoadGrades} from '../demo/road-grading.js';

const json=path=>JSON.parse(fs.readFileSync(path,'utf8'));
const config=json('assets/campaign/alpha/mission01/gameplay.json');
const original=createHeightfield(json('assets/maps/alpha/heightfield.json'));
shapeMesaRims(original);
const field=refineRoadHeightfield(original);
applyRoadGrades(field,json('assets/maps/alpha/roads.json'));
const scale=config.worldScale,workers=['u4','u5'];

function readyBase(){
  const mission=new Mission(config,field);
  const plant=mission.build(workers,'generator',-1648,248);
  assert(plant.ok,plant.reason);
  for(let i=0;i<500&&!mission.entity(plant.id).completed;i++)mission.advance(.1);
  assert(mission.entity(plant.id).completed);
  const well=mission.build(workers,'derrick',-1696,368);
  assert(well.ok,well.reason);
  return {mission,wellId:well.id};
}

function completeWell(mission,wellId,saveDuringExit=false){
  const start=mission.state.time;
  const workersSeen=new Set(), vehicles=mission.state.units.filter(unit=>unit.owner==='rai');
  let minGap=Infinity, midExit;
  for(let i=0;i<650&&!mission.entity(wellId).completed;i++){
    const poses=new Map(vehicles.map(unit=>[unit.id,{...unit}]));
    mission.advance(.1);
    for(const unit of vehicles){
      if(unit.builderWorking&&unit.task?.targetId===wellId)workersSeen.add(unit.id);
      if(unit.detour&&unit.workEscapeRetryAt>mission.state.time&&saveDuringExit)midExit??=mission.save();
      for(const other of vehicles)if(other.id<unit.id)minGap=Math.min(minGap,vehicleClearance(unit,other,scale,field));
      const previous=poses.get(unit.id);
      if(Math.hypot(previous.x-unit.x,previous.y-unit.y)>.01){
        const sweep=vehicleSweep(previous,unit,scale,field);
        assert(mission.nav.clearSolidSweep(sweep,mission.nav.nearbySolids(unit,scale*5)),'A vehicle must drive around the station');
      }
    }
  }
  const elapsed=mission.state.time-start;
  assert(mission.entity(wellId).completed,`Wells must finish construction within ${elapsed.toFixed(1)} s`);
  assert(minGap>=0,`Vehicle envelopes overlapped by ${minGap}`);
  return {elapsed,workers:[...workersSeen].sort(),minGap,midExit};
}

const opening=readyBase();
const ordered=opening.mission.save();
const fresh=completeWell(opening.mission,opening.wellId);
assert.deepEqual(fresh.workers,workers);
assert(fresh.elapsed<50,'Both builders should reach the second site without a long wait');

const trapped=new Mission(config,field);
trapped.load(ordered);
const stalled=[
  {x:-1605.003,y:246.019,heading:1.63435,reverseDebt:9.729,points:[[-1592,248],[-1520,248],[-1520,304],[-1600,312],[-1672,320]]},
  {x:-1582.140,y:256.294,heading:.64127,reverseDebt:10.769,points:[[-1568,248],[-1520,248],[-1520,304],[-1616,336],[-1648,344]]},
];
const well=trapped.entity(opening.wellId);
delete well.builderIds;
well.awaitingWorkers=false;
for(const [index,id] of workers.entries()){
  const unit=trapped.entity(id),{points,...pose}=stalled[index],workOffset=index===0?-9:9;
  Object.assign(unit,pose,{previousX:pose.x,previousY:pose.y,previousHeading:pose.heading,driveSpeed:0,steering:0,
    task:{type:'build',targetId:well.id,...trapped.workPoint(well,workOffset),workOffset},
    path:points.map(([x,y])=>({x,y}))});
  delete unit.detour;
  delete unit.driveWatch;
}
const stuck=completeWell(trapped,well.id,true);
assert(stuck.midExit,'Test must catch a saved backing manoeuvre');

const restored=new Mission(config,field);
restored.load(stuck.midExit);
const saved=completeWell(restored,well.id);
assert(Math.abs(restored.state.time-trapped.state.time)<.11,'Loading during a manoeuvre preserves completion time');
for(const id of workers){
  const a=restored.entity(id),b=trapped.entity(id);
  assert(Math.hypot(a.x-b.x,a.y-b.y)<.01,'Loading preserves the final parking pose');
}

console.log(JSON.stringify({fresh:{...fresh,midExit:undefined},stuck:{...stuck,midExit:undefined},restored:saved}));
