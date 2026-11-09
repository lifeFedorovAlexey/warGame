import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Mission} from '../campaign/mission.js';
import {planFactoryAccess,roadIntersectsSite} from '../campaign/factory-access.js';
import {buildingHalfSize} from '../campaign/building-placement.js';
const config=JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/gameplay.json'));
config.initialMapBounds=config.finalMapBounds=[0,0,127,127];config.oilFields=[];config.baseSites=[];
const field={extent:4096,half:2048,cellMetres:32,heightAt:()=>0,gradientAt:()=>({x:0,y:0}),gridToWorld:([x,y])=>({x:x*32-2048,y:2048-y*32}),worldToGrid:(x,y)=>[(x+2048)/32,(2048-y)/32],localRoads:[],roadNetwork:{paths:[-200,200].map(y=>({id:'street'+y,width:30,points:[{x:-500,y},{x:500,y}]}))}};
function fixture(){const m=new Mission(config,field);Object.assign(m.state,{units:[],buildings:[],camps:[],artifacts:[],raidReserve:[],bounds:[0,0,127,127],energy:2400,storyConstruction:{enabled:false}});m.updateMission=()=>{};m.explored.fill(255);m.visible.fill(255);m.constructionUnlocked=()=>true;m.rebuildNavigation();return m;}
const timings=[];
for(const rotation of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
 const m=fixture(),[halfWidth,halfDepth]=buildingHalfSize(config.buildings.factory,config.worldScale,rotation),site={kind:'factory',x:0,y:0,halfWidth,halfDepth,rotation};
 const started=performance.now(),access=planFactoryAccess(m,site);timings.push(performance.now()-started);
 assert(access.ok,JSON.stringify({rotation,access}));assert.equal(access.roads.length,2);
 for(const road of access.roads){const end=road.points.at(-1);assert(Math.abs(Math.abs(end.y)-200)<1e-6,'Road joins the actual existing street');assert(road.width>=27);}
 assert.strictEqual(planFactoryAccess(m,site),access,'Repeated previews reuse the same plan');
 const builder=m.addUnit('builder','rai',{x:-150,y:-100}),placement=m.placement('factory',0,0,rotation,{snap:false});assert(placement.ok,placement.reason);
 const built=m.build([builder.id],'factory',0,0,rotation,{snap:false});assert(built.ok,built.reason);const f=m.entity(built.id);assert.equal(f.accessRoads.length,2);
 const road=f.accessRoads[1],p=road.points[Math.floor(road.points.length/2)],obstacle={x:p.x,y:p.y,halfWidth:5,halfDepth:5};assert(roadIntersectsSite(road,obstacle));
 const blocked=m.placement('bunker',p.x,p.y,0,{snap:false});assert(!blocked.ok&&/подъезд|выезд|въезд|постройк/.test(blocked.reason),blocked.reason);
 const saved=fixture();saved.load(m.save());assert.deepEqual(saved.entity(f.id).accessRoads,f.accessRoads,'Saved geometry retains both reserved roads');
 m.state.buildings=[];m.addStructure('lab','rai',{x:0,y:100},{completed:true});m.rebuildNavigation();
 if(rotation===0)assert(!planFactoryAccess(m,site).ok,'Rear apron occupied: reject construction');
}
const noRoad=fixture();noRoad.field={...field,roadNetwork:{paths:[]}};assert(!planFactoryAccess(noRoad,{kind:'factory',x:0,y:0,halfWidth:63,halfDepth:54,rotation:0}).ok,'Do not invent a road connection');
const oneRoad=fixture();oneRoad.field={...field,roadNetwork:{paths:[field.roadNetwork.paths[0]]}};
const compact=planFactoryAccess(oneRoad,{kind:'factory',x:0,y:0,halfWidth:63,halfDepth:54,rotation:0});
assert(compact.ok,'Connect the rear door along one side of the hall');
assert(compact.roads.every(r=>r.points.every(p=>Math.abs(p.x)<=110&&p.y<=100)),'Keep the bypass close to the building contour');
assert(planFactoryAccess(oneRoad,{kind:'factory',x:0,y:0,halfWidth:54,halfDepth:63,rotation:Math.PI/2}).ok,'Rotating the hall permits two short elbows to the same street');
const slope=fixture();slope.field={...field,gradientAt:(x,y)=>({x:y>65?.8:0,y:0})};assert(!planFactoryAccess(slope,{kind:'factory',x:0,y:0,halfWidth:63,halfDepth:54,rotation:0}).ok,'Road width cannot cross a steep slope');
console.log(JSON.stringify({pass:true,checks:'both roads, rotated entrances, width, connection, obstruction, reserved corridors, save/load, missing road, slope',planMs:timings}));
