import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Mission} from '../campaign/mission.js';
import {vehicleObstacle,clearOfVehicles} from '../campaign/vehicle-collision.js';
const config=JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/gameplay.json'));
const field={extent:4096,half:2048,cellMetres:32,heightAt:()=>0,gradientAt:()=>({x:0,y:0}),
 gridToWorld:([x,y])=>({x:x*32-2048,y:2048-y*32}),worldToGrid:(x,y)=>[(x+2048)/32,(2048-y)/32]};
const results=[];
for(const kind of ['bukhanka','scav-rifleman']){
 assert(config.units[kind]);
 const m=new Mission(config,field);Object.assign(m.state,{units:[],buildings:[],camps:[],bounds:[0,0,127,127],pendingCinematics:[]});
 m.updateMission=()=>{};m.rebuildNavigation();m.explored.fill(255);
 const car=m.addUnit('bukhanka','rai',{x:0,y:-27}),blocker=m.addUnit(kind,'rai',{x:0,y:0});
 const goal={x:0,y:120};
 assert(!m.vehicleMotionClear(car,car,{...car,x:0,y:0}),'A living unit retains its full collision');
 m.damage(blocker,blocker.hp,car,{type:'shell',point:[0,0,1],normal:[0,-1,0],direction:[0,1,0],partId:0});
 assert.equal(blocker.hp,0);assert(blocker.damage.wreck);assert(m.state.units.includes(blocker),'Visual wreck remains in the scene');
 assert(!vehicleObstacle(blocker));
 assert(clearOfVehicles(car,{...car,x:0,y:0},m.state.units,config.worldScale,true,car,field));
 assert(m.vehicleMotionClear(car,car,{...car,x:0,y:0}),'Death releases the sweep immediately, before any tick or cleanup');
 const path=m.vehiclePath(car,goal,{fallback:false,maxGoalDistance:.01});assert(path?.length);assert(path.every(p=>Math.abs(p.x)<.01),'No route detour around a corpse');
 const site={x:0,y:0,halfWidth:8,halfDepth:8,kind:'factory',rotation:0};
 assert(!m.siteUnits(site).includes(blocker),'A corpse cannot hold a construction evacuation');
 m.order([car.id],'move',goal);let crossedAt=null;
 for(let i=0;i<80&&crossedAt===null;i++){m.advance(.1);assert.equal(car.hp,car.maxHp,'No collision damage while crossing a corpse; salvage may raise maximum HP');if(car.y>10)crossedAt=m.state.time;}
 assert(crossedAt!==null&&crossedAt<5,'Move through the retained wreck without waiting for its lifetime');
 assert(m.state.units.includes(blocker),'Visual removal is independent of collision removal');
 const saved=m.save();m.load(saved);assert(!vehicleObstacle(m.state.units.find(u=>u.id===blocker.id)),'Load cannot restore corpse collision');
 results.push({kind,crossedAt,retained:true,hp:car.hp});
}
assert(results.some(r=>r.kind==='bukhanka'));
console.log(JSON.stringify({passed:true,results}));
