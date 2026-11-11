import fs from 'node:fs';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import * as T from '../demo/vendor/three.module.js';
import {makeMission} from './m02-fixture.mjs';
import {prepareM02Diagnostic} from '../campaign/mission02-diagnostic.js';
import {installM02Fortifications} from '../campaign/mission02-fortifications.js';
import {updateWrecks} from '../campaign/wreck-lifecycle.js';
import {createSensorModule} from '../campaign/mission02-models.js';
import {radarAngle} from '../campaign/radar-animation.js';
import roads from '../assets/campaign/alpha/mission02/roads.js';
import {createLocalRoadMask} from '../demo/local-road-mask.js';
registerHooks({resolve(s,c,next){return next(s==='three'?new URL('../demo/vendor/three.module.js',import.meta.url).href:s,c);}});
const {createBuildingPrefab}=await import('../campaign/prefabs.js'),{vehicleKit}=await import('../campaign/field-vehicles.js');

const m=prepareM02Diagnostic(makeMission()),blocked=[];let segments=0;
// A closed service gate intentionally blocks its road until destroyed.
const service=m.state.buildings.find(b=>b.m02Base==='energy_hub'&&b.m02Gate==='service');
assert(service&&service.hp>0);
const gatePose={x:service.x,y:service.y,kind:'scav-bus',owner:'rai',heading:0};
assert.equal(m.vehicleMotionClear(gatePose,{...gatePose,y:service.y-35},{...gatePose,y:service.y+35},.52,undefined,[]),false);
m.damage(service,service.hp);m.state.time+=7;updateWrecks(m);m.rebuildNavigation();
assert(m.vehicleMotionClear(gatePose,{...gatePose,y:service.y-35},{...gatePose,y:service.y+35},.52,undefined,[]),'Destroyed service gate releases the full bus corridor');
for(const road of roads.paths)for(let i=1;i<road.points.length;i++){
 const a=road.points[i-1],b=road.points[i],pose={...a,heading:Math.atan2(a.x-b.x,b.y-a.y),kind:'bukhanka',owner:'rai'};
 segments++;if(m.vehicleTerrainSweep(pose,pose,{...pose,...b})===false)blocked.push({road:road.id,grid:m.field.worldToGrid(a.x,a.y)});
}
assert.deepEqual(blocked,[],'A whole vehicle must fit every paved centre line, including furnishings and walls');
const asphaltOverlap=[];
for(const road of [...roads.paths,...m.field.roadNetwork.paths])for(const p of road.points)for(const b of [...m.state.buildings.filter(b=>b.hp>0&&b.m02Base),...(m.field.m02Furnishings??[])]){
 const clearance=Math.hypot(Math.max(0,Math.abs(p.x-b.x)-b.halfWidth),Math.max(0,Math.abs(p.y-b.y)-b.halfDepth));
 if(clearance<road.width/2+1)asphaltOverlap.push({road:road.id,building:b.id,grid:m.field.worldToGrid(p.x,p.y)});
}
assert.deepEqual(asphaltOverlap,[],'The full asphalt width and soft shoulder must clear building foundations');
const mask=createLocalRoadMask(T),oldStub=m.field.gridToWorld([28.5,108.5]),ring=m.field.gridToWorld([31.1,108.5]),approach=m.field.roadNetwork.paths.find(r=>r.id==='junction-3--south-west-7').points.at(-3);
// Both replacement areas must remain active: the original player yard and
// the removed energy-base spur. The actual through-road stays continuous.
const yard=m.field.gridToWorld([14,40]);
mask.setRoads([{width:8,points:[{x:yard.x-50,y:yard.y-60},{x:yard.x+50,y:yard.y-60}],replaceRect:[yard.x-25,yard.y-25,yard.x+25,yard.y+25]},...roads.paths]);
assert(mask.blendAt(oldStub.x,oldStub.y,1)<.01,'Old asphalt tail must be removed');
assert(mask.blendAt(yard.x,yard.y,1)<.01,'Keep the other source-road replacement');
assert(mask.blendAt(ring.x,ring.y,0)>.99,'New ring road must survive source-road removal');
assert(mask.blendAt(approach.x,approach.y,1)>.99,'Retain the original approach outside the junction');
assert(!m.nav.roads.nearest(oldStub,1),'The removed tail must not retain an asphalt speed bonus');
const oldCrossing=m.field.gridToWorld([33.924389126367984,77.52570127455911]);
assert(mask.blendAt(oldCrossing.x,oldCrossing.y,1)<.01,'Remove the original diagonal road through the eastern yard');
assert(!m.nav.roads.nearest(oldCrossing,1),'Do not route vehicles through the removed diagonal');
for(const road of m.field.roadNetwork.paths.filter(r=>['junction-1--junction-7-2','junction-3--junction-7-8'].includes(r.id)))for(const p of road.points){
 const grid=m.field.worldToGrid(p.x,p.y);
 if(grid[1]>=75.6&&grid[1]<=81)assert(mask.blendAt(p.x,p.y,1)>.99,'Keep the north/south trunk through the replacement area');
}
for(const road of m.field.roadNetwork.paths)for(const p of road.points){
 const inside=roads.paths.some(r=>r.replaceAreas?.some(({rect:[l,b,r,t]})=>p.x>=l-32&&p.x<=r+32&&p.y>=b-32&&p.y<=t+32));
 if(inside)assert(mask.blendAt(p.x,p.y,1)>.98,'No erased gaps on retained source road '+road.id+' at '+m.field.worldToGrid(p.x,p.y));
}
const forts=m.state.buildings.filter(b=>b.m02Fortification),fence=forts.find(b=>b.kind==='scav-fence');
assert(forts.length>60);assert.equal(fence.hp,m.config.buildings['scav-fence'].hp*2);
const count=m.state.buildings.length;installM02Fortifications(m);assert.equal(m.state.buildings.length,count);
fence.hp=0;fence.destroyedAt=m.state.time;fence.damage={wreck:true};m.load(m.save());
assert.equal(m.state.buildings.length,count);assert.equal(m.state.buildings.find(b=>b.id===fence.id).hp,0,'Do not resurrect a destroyed perimeter when loading');
assert.equal(m.state.buildings.filter(b=>b.sourceId).length,39);
const palette={olive:new T.MeshStandardMaterial(),steel:new T.MeshStandardMaterial(),dark:new T.MeshStandardMaterial()};
const sensor=createSensorModule(T,vehicleKit(T),palette),size=new T.Box3().setFromObject(sensor).getSize(new T.Vector3());
assert(size.x<=.92&&size.y<=1.1&&size.z<=1.8,'Radar fits the roof module envelope');
assert(sensor.getObjectByName('camera_yaw').getObjectByName('radar_dish'));
sensor.updateMatrixWorld(true);
for(const x of [-.15,.15]){
 const ray=new T.Raycaster(new T.Vector3(x,2,1.12),new T.Vector3(0,-1,0));
 assert.equal(ray.intersectObject(sensor,true)[0]?.object.material.name,'radar_reflector','Pedestal and hinge must remain behind the reflector');
}
const tower=createBuildingPrefab(T,'scav-sensor',m.config.buildings['scav-sensor']);
assert(tower.getObjectByName('radar_mount').userData.damageDynamic);
assert.equal(radarAngle({hp:1},0),0);assert.equal(radarAngle({hp:1},3),Math.PI/2);
assert.equal(radarAngle({hp:0,destroyedAt:3},100),Math.PI/2);
const report={passed:true,roads:roads.paths.length,wholeVehicleSegments:segments,fortifications:forts.length,fenceHp:320,originalStructures:39,moduleSize:size.toArray(),rotationPeriod:12,freezeOnDestruction:true,courts:m.field.m02CourtsGrading,roadsGrading:m.field.m02Grading};
fs.mkdirSync('docs/campaign/alpha/m02/art-v3',{recursive:true});fs.writeFileSync('docs/campaign/alpha/m02/art-v3/sites.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
