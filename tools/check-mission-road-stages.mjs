import assert from 'node:assert/strict';
import * as T from '../demo/vendor/three.module.js';
import {makeMission} from './m02-fixture.mjs';
import {prepareM02Diagnostic} from '../campaign/mission02-diagnostic.js';
import {baseApproachRoads} from '../campaign/base-roads.js';
import {scavBaseRoads} from '../campaign/scav-base-roads.js';
import {createFactoryRoadView} from '../campaign/factory-road-view.js';
import {createLocalRoadMask} from '../demo/local-road-mask.js';
import authored from '../assets/campaign/alpha/mission02/roads.js';

const m=makeMission(),f=m.field,originalNavigation=f.navigation,originalNetwork=f.roadNetwork;
const base=[...baseApproachRoads(f,m.config),...scavBaseRoads(f,m.config)];
f.missionBaseRoads=base;f.localRoads=base;m.rebuildNavigation();
let painted=[];
const view=createFactoryRoadView(T,new T.Scene(),f,{setLocalRoads:roads=>painted=roads},base);
const mask=createLocalRoadMask(T),m01=m.save();
const check=(southern)=>{
 view.update(m);mask.setRoads(painted);
 const spur=f.gridToWorld([33,79.75]);
 assert.equal(mask.blendAt(spur.x,spur.y,0)>.99,southern,'No empty southern service spur during mission one');
 for(const road of authored.paths){
  assert.equal(painted.some(r=>r.id===road.id),southern,'Rendered road '+road.id);
  assert.equal(m.nav.roads.routes.has(road.id),southern,'Navigable road '+road.id);
 }
 assert(painted.some(r=>r.campId==='west-south'&&r.m01LayoutVersion===3),'The conquered northern headquarters keeps its roads in mission two');
 assert.equal(f.navigation.transitions.length,originalNavigation.transitions.length+(southern?authored.transitions.length:0));
 if(!southern){assert.equal(f.roadNetwork,originalNetwork);assert.equal(f.navigation,originalNavigation);}
 for(const end of authored.sourceRoadEnds){
  const road=f.roadNetwork.paths.find(r=>r.id===end.id),original=originalNetwork.paths.find(r=>r.id===end.id);
  assert.deepEqual(road.points.at(-1),southern?end.point:original.points.at(-1));
 }
 for(const start of authored.sourceRoadStarts){
  const road=f.roadNetwork.paths.find(r=>r.id===start.id),original=originalNetwork.paths.find(r=>r.id===start.id);
  assert.deepEqual(road.points[0],southern?start.point:original.points[0]);
 }
 if(southern)for(const span of authored.sourceRoadSpans){
  const before=f.roadNetwork.paths.find(r=>r.id===span.id),after=f.roadNetwork.paths.find(r=>r.id===span.id+'-after-'+span.road),bypass=authored.paths.find(r=>r.id===span.road);
  for(const [a,b] of [[before.points.at(-1),bypass.points[0]],[after.points[0],bypass.points.at(-1)]])assert(Math.hypot(a.x-b.x,a.y-b.y)<.001,'The bypass must meet both retained source sections exactly');
 }
};
check(false);
prepareM02Diagnostic(m);assert(m.state.m02?.initialized);check(true);
const m02=m.save();
// Returning to either checkpoint must switch all representations, not only
// hide a rendered mesh while leaving an invisible fast lane or level opening.
for(let i=0;i<2;i++){m.load(m01);check(false);m.load(m02);check(true);}
console.log('PASS mission road stages: new game, continuation, both save directions, source endpoints, level openings, rendering and routing');
