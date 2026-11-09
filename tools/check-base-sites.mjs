import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Mission} from '../campaign/mission.js';
import {createHeightfield} from '../demo/map-route.js';
import {shapeMesaRims} from '../demo/mesa-shaping.js';
import {refineRoadHeightfield} from '../demo/road-heightfield.js';
import {applyRoadGrades} from '../demo/road-grading.js';
import {baseApproachRoads} from '../campaign/base-roads.js';
import {createLocalRoadMask} from '../demo/local-road-mask.js';
import * as T from '../demo/vendor/three.module.js';
const json=p=>JSON.parse(fs.readFileSync(p,'utf8')),config=json('assets/campaign/alpha/mission01/gameplay.json');
const raw=createHeightfield(json('assets/maps/alpha/heightfield.json'));shapeMesaRims(raw);
const field=refineRoadHeightfield(raw);applyRoadGrades(field,json('assets/maps/alpha/roads.json'));
const mission=new Mission(config,field);mission.explored.fill(1);
const roads=baseApproachRoads(field,config),mask=createLocalRoadMask(T);mask.setRoads(roads);
assert.equal(roads.length,4);
for(const road of roads){
 for(const p of road.points){
  assert(mask.blendAt(p.x,p.y)>.9,'Continuous asphalt along every approach');
  for(const site of config.baseSites){
   const centre=field.gridToWorld(site.grid),[w,d]=config.buildings[site.kind].realSizeMetres;
   assert(!(Math.abs(p.x-centre.x)<w*config.worldScale/2&&Math.abs(p.y-centre.y)<d*config.worldScale/2),'Road must stop before the building');
  }
 }
}
assert.equal(mask.blendAt(0,0),0,'No road outside the base');
const streetStart=field.gridToWorld(config.startGrid);
assert.equal(mask.blendAt(streetStart.x,streetStart.y+25,1),0,'The old round road end is removed beside the straight street');
for(const site of config.baseSites){
 const point=field.gridToWorld(site.grid),angle=(site.rotationDegrees??0)*Math.PI/180,place=mission.placement(site.kind,point.x,point.y,angle,{checkMoney:false});
 assert(place.ok,site.kind+': '+place.reason);assert.equal(place.blockers.length,0,site.kind);
 assert.equal(place.x,point.x);assert.equal(place.y,point.y);
 mission.addStructure(site.kind,'rai',place,{completed:true,rotation:angle,groundHeight:place.height});mission.rebuildNavigation();
}
for(const grid of config.oilFields.slice(0,2)){
 const point=field.gridToWorld(grid),place=mission.placement('derrick',point.x,point.y,0,{checkMoney:false});
 assert(place.ok,'The prepared base must preserve its oil sites: '+place.reason);
}
const factory=mission.state.buildings.find(b=>b.kind==='factory');
mission.updateEconomy(0);mission.produce(factory.id,'bukhanka');
mission.updateEconomy(config.units.bukhanka.seconds+1);
assert.equal(mission.state.statistics.produced,1,'The planned factory has a usable exit');
console.log('PASS: all prepared sites are buildable together, original oil sites stay clear, factory exit works');
