import assert from 'node:assert/strict';
import fs from 'node:fs';
import {registerHooks} from 'node:module';
import * as T from '../demo/vendor/three.module.js';
import {Mission} from '../campaign/mission.js';
import {createHeightfield} from '../demo/map-route.js';
import {fitBuildingFoundation} from '../campaign/building-foundation.js';
registerHooks({resolve(s,c,next){return next(s==='three'?new URL('../demo/vendor/three.module.js',import.meta.url).href:s,c);}});
const {createBuildingPrefab}=await import('../campaign/prefabs.js');
const config=JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/gameplay.json')),field=createHeightfield(JSON.parse(fs.readFileSync('assets/maps/alpha/heightfield.json')));
const sites=[{x:-1632,y:376},{x:-1424,y:240},{x:-1040,y:752},{x:-752,y:1024}];
const prefab=createBuildingPrefab(T,'generator',config.buildings.generator),original=prefab.getObjectByName('building_foundation').children.find(n=>n.material.name==='foundation_concrete');
original.geometry.computeBoundingBox();const top=original.geometry.boundingBox.max.z;
for(const site of sites){
 const m=new Mission(config,field);m.state.storyConstruction={enabled:false};m.updateMission=()=>{};m.state.energy=2400;m.explored.fill(255);m.state.units=[];m.state.buildings=[];
 const near=config.oilFields.map(g=>field.gridToWorld(g)).sort((a,b)=>Math.hypot(a.x-site.x,a.y-site.y)-Math.hypot(b.x-site.x,b.y-site.y))[0];
 m.addStructure('derrick','rai',near,{completed:true,progress:1});
 const builder=m.addUnit('builder','rai',{x:site.x,y:site.y-110});builder.heading=0;m.rebuildNavigation();
 const place=m.placement('generator',site.x,site.y);assert(place.ok,JSON.stringify(place));
 const heights=[];for(const x of [-place.halfWidth,0,place.halfWidth])for(const y of [-place.halfDepth,0,place.halfDepth])heights.push(field.heightAt(place.x+x,place.y+y));
 assert(Math.max(...heights)-Math.min(...heights)>2.5,'Real regression site used to fail the flatness check');
 const result=m.build([builder.id],'generator',site.x,site.y);assert(result.ok,result.reason);const building=m.entity(result.id);
 for(let i=0;i<900&&!building.completed;i++){m.advance(.1);m.finishPendingStep();}
 assert(building.completed,'A valid preview must lead to a completed building');assert(builder.y>site.y-95,'Builder actually drove to the work position');assert.equal(building.funding.paid,140);
 const copy=new Mission(config,field);copy.load(m.save());assert.equal(copy.entity(building.id).groundHeight,place.height,'Foundation height survives saving');
 for(const rotation of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
  const root=prefab.clone(true);fitBuildingFoundation(root,{...building,rotation},field,config);
  const foot=root.getObjectByName('building_foundation').children.find(n=>n.material.name==='foundation_concrete');
  assert(foot.scale.z>1);assert(Math.abs(top*foot.scale.z+foot.position.z-top)<1e-6,'Building top and service rail never move');
  const bottom=place.height+(original.geometry.boundingBox.min.z*foot.scale.z+foot.position.z)*config.worldScale;
  for(const x of [-27,0,27])for(const y of [-22.5,0,22.5]){
   const c=Math.cos(rotation),s=Math.sin(rotation);assert(bottom<field.heightAt(site.x+x*c-y*s,site.y+x*s+y*c),'Footing reaches the ground at every corner');
  }
  fitBuildingFoundation(root,{kind:'generator',x:0,y:0,height:0,rotation}, {heightAt:()=>0},config);
  assert(foot.scale.z<1.1,'Moving a preview to flat ground removes its previous extension');
 }
}
assert.equal(original.scale.z,1);assert.equal(original.position.z,0,'Shared model remains unchanged');
console.log('PASS: four formerly blocked oil-field sites, builder approach and completed construction, saved heights, level foundations in all rotations, unchanged shared prefab');
