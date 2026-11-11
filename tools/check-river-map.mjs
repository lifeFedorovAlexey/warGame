import assert from 'node:assert/strict';
import {makeMission} from './m02-fixture.mjs';
import {prepareM02Diagnostic} from '../campaign/mission02-diagnostic.js';
import {siteCourts} from '../assets/campaign/alpha/mission02/site-plan.js';
import {createFactoryRoadView} from '../campaign/factory-road-view.js';
import * as T from '../demo/vendor/three.module.js';
import {damLayout,damWorld,DAM_OUTLETS,DAM_DRAINAGE_OUTFALL} from '../campaign/dam-layout.js';
const m=prepareM02Diagnostic(makeMission()),f=m.field,r=f.river,report={bridges:[]};
const east=f.roadNetwork.paths.filter(p=>['junction-1--junction-7-2','junction-3--junction-7-8'].includes(p.id));
for(const road of east)for(const p of road.points){const [x,y]=f.worldToGrid(p.x,p.y);if(y>=74&&y<=84){assert(Math.abs(x-38.65)<.001,'No kink beside the eastern compound');assert.equal(p.width,26,'Remove the obsolete junction flare');}}
const west=f.roadNetwork.paths.find(p=>p.id==='junction-7--west-south-18');
for(const p of west.points){const [x,y]=f.worldToGrid(p.x,p.y);if(x>=22&&x<=29)assert(Math.abs(y-80.5)<.001,'Straight bridge and approach share one axis');}
for(const road of [...east,west])for(let i=1;i<road.points.length;i++){
 const a=road.points[i-1],b=road.points[i],pose={...a,heading:Math.atan2(a.x-b.x,b.y-a.y),kind:'scav-bus',owner:'rai'};
 assert(m.vehicleTerrainSweep(pose,pose,{...pose,...b})!==false,road.id+' full bus at corrected road segment '+i);
}
assert.equal(r.bridges.length,2,'Exactly two engineered road crossings');
assert(r.points.every((p,i)=>i===0||p.z<r.points[i-1].z),'Water always flows downhill from the dam');
const dam=damLayout(f,m.config),outfall=damWorld(dam,DAM_DRAINAGE_OUTFALL.x,DAM_DRAINAGE_OUTFALL.y,DAM_DRAINAGE_OUTFALL.z);
assert(Math.hypot(outfall.x-r.points[0].x,outfall.y-r.points[0].y)<.2&&Math.abs(outfall.z-r.points[0].z)<.05,'Open dam channel meets river, with no gap or uphill water');
for(const p of DAM_OUTLETS){const q=damWorld(dam,p.x,-22,.18);assert(f.heightAt(q.x,q.y)<q.z,'Each relocated catch pool is above its graded apron');}
for(let x=-44;x<=-19;x+=.5){const q=damWorld(dam,x,-27,.18);assert(f.heightAt(q.x,q.y)<q.z,'No ground interrupts the open collector-to-river channel');}
for(const p of r.points.slice(2,-2))assert(r.terrainHeightAt(p.x,p.y)<p.z-3,'Continuous submerged riverbed');
for(const bridge of r.bridges){
 const points=bridge.points,mid=points[Math.floor(points.length/2)],before=points[0],after=points.at(-1),heading=Math.atan2(-(after.x-before.x),after.y-before.y);
 const vehicle=p=>({...p,heading,kind:'scav-bus',owner:'rai'});
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i];
  assert(Math.abs(a.z-b.z)/Math.hypot(a.x-b.x,a.y-b.y)<.25,'Driveable deck grade');
  assert(m.vehicleMotionClear(vehicle(a),vehicle(a),vehicle(b),.52,undefined,[]),bridge.id+' bus sweep '+i);
 }
 assert(Math.abs(f.heightAt(mid.x,mid.y)-mid.z)<.02,'Visible deck supports wheels');
 assert(f.heightAt(mid.x,mid.y)>r.sample(mid.x,mid.y).z+3,'Deck remains above water');
 report.bridges.push({road:bridge.road,length:Math.round(bridge.length),busSweeps:points.length-1});
}
const water=r.points.find(p=>p.along>r.length*.40&&!r.deckAt(p.x,p.y,60)),q=r.sample(water.x,water.y);
assert(!m.nav.terrainAllowed(water.x,water.y),'Water is not a destination');
assert(!m.nav.terrainAllowed.clearSegment({x:water.x-q.nx*90,y:water.y-q.ny*90},{x:water.x+q.nx*90,y:water.y+q.ny*90}),'No shortcut through the gorge');
for(const site of siteCourts){
 const p=f.gridToWorld(site.gate),start=f.gridToWorld(m.config.startGrid);
 assert(m.nav.findPath(start,p)?.length,site.id+' still reachable');
 const [l,t,right,b]=site.rect;
 for(let y=t;y<=b;y+=.5)for(let x=l;x<=right;x+=.5){const p=f.gridToWorld([x,y]);assert(r.sample(p.x,p.y).distance>r.outer,site.id+' footprint preserved');}
}
// Verify actual physical driving across each bridge after the swept hull audit.
for(const bridge of r.bridges){
 const d=prepareM02Diagnostic(makeMission());d.state.units=[];
 for(const spec of [...Object.values(d.config.units),...Object.values(d.config.buildings)])spec.damage=0;
 for(const base of Object.values(d.state.m02.bases))if(base.production)base.production.stopped=true;
 d.state.m02.observer.outcome='escaped';
 const a=bridge.points[0],b=bridge.points.at(-1),heading=Math.atan2(-(b.x-a.x),b.y-a.y),bus=d.addUnit('scav-bus','rai',{...a,heading});
 d.addUnit('builder','rai',f.gridToWorld(d.config.startGrid));
 assert(d.order([bus.id],'move',b).ok);let seconds=0;
 while(seconds++<90&&Math.hypot(bus.x-b.x,bus.y-b.y)>13){d.advance(1);d.drainEffects();d.drainEvents();assert(!d.field.river.forbidden(bus.x,bus.y),'Bus cannot enter water');}
 assert(Math.hypot(bus.x-b.x,bus.y-b.y)<=13,bridge.id+' physical crossing '+JSON.stringify({x:bus.x,y:bus.y,task:bus.task}));
 report.bridges.find(p=>p.road===bridge.road).driveSeconds=seconds;
}
assert(!m.nav.solids.some(b=>b.environment),'Decoration never gains collision solids');
{
 const d=prepareM02Diagnostic(makeMission()),road=d.field.m02Roads.find(r=>r.id==='m02-energy-east-exit');
 d.state.units=[];d.updateMission=()=>{};
 for(const spec of [...Object.values(d.config.units),...Object.values(d.config.buildings)])spec.damage=0;
 for(const base of Object.values(d.state.m02.bases))if(base.production)base.production.stopped=true;
 d.state.m02.observer.outcome='escaped';
 const a=road.points[0],b=road.points.at(-1),bus=d.addUnit('scav-bus','rai',{...a,heading:-Math.PI/2});
 d.addUnit('builder','rai',d.field.gridToWorld(d.config.startGrid));
 assert(d.order([bus.id],'move',b).ok);let seconds=0;
 while(seconds++<140&&Math.hypot(bus.x-b.x,bus.y-b.y)>14){d.advance(1);d.drainEffects();d.drainEvents();}
 assert(Math.hypot(bus.x-b.x,bus.y-b.y)<=14,'Bus drives from energy gates to the next-region road');
 report.southernExitDriveSeconds=seconds;
}
// Phase changes must refresh visible asphalt even when player factories and
// their access roads have not changed. The old renderer retained m01 roads.
let rendered=[];
const view=createFactoryRoadView(T,new T.Scene(),f,{setLocalRoads:roads=>{rendered=roads;}},f.missionBaseRoads,()=>{});
const north={state:{buildings:[],m02:undefined}},south={state:{buildings:[],m02:{version:2}}};
view.update(north);assert(!rendered.some(r=>r.id?.startsWith('m02-')));
view.update(south);assert.equal(rendered.filter(r=>r.id?.startsWith('m02-')).length,9);
view.update(north);assert(!rendered.some(r=>r.id?.startsWith('m02-')));
console.log('PASS shared canyon, downhill water, bridge support/sweeps/drives, blocked water and preserved reachable yards',JSON.stringify(report));
