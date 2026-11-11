import fs from 'node:fs';
import assert from 'node:assert/strict';
import {progressMission} from './check-navigation-public-progress.mjs';
import {vehicleEnvelope,vehicleClearance,vehicleSweep,sweepClearsVehicle} from '../campaign/vehicle-collision.js';
import {bodyEnvelope,bodyContact} from '../campaign/vehicle-overlap.js';
import {vehicleEnvelope as originalEnvelope} from '../campaign/previews/playtest-WG-056/before-source/campaign/vehicle-collision.js';
import {SCAV_PROFILES,isInfantry} from '../campaign/scav-unit-profiles.js';
const folder='campaign/previews/playtest-WG-056',reports=[];
const config=JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/gameplay.json'));
for(const kind of new Set([...Object.keys(config.units),...Object.keys(SCAV_PROFILES)])){
 const u={kind,x:14,y:19,heading:.7},old=originalEnvelope(u,4.5),shape=vehicleEnvelope(u,4.5),ratio=isInfantry(u)?1:.9;
 assert(Math.abs(shape.width/old.width-ratio)<1e-10);assert(Math.abs(shape.depth/old.depth-ratio)<1e-10);assert.equal(shape.x,old.x);assert.equal(shape.y,old.y);
 assert.deepEqual(bodyEnvelope(u,4.5),shape,'Recovery must not enlarge the route contour');
 reports.push({kind,widthBefore:old.width*2/4.5,widthAfter:shape.width*2/4.5,lengthBefore:old.depth*2/4.5,lengthAfter:shape.depth*2/4.5,infantry:isInfantry(u)});
}
for(const offset of [8.5,9,12,18])for(const heading of [0,.5,1,2]){
 const a={kind:'bukhanka',x:0,y:0,heading:0},b={...a,x:offset,y:2,heading};
 assert(Math.abs(bodyContact(bodyEnvelope(a,4.5),bodyEnvelope(b,4.5)).gap-vehicleClearance(a,b,4.5))<1e-9,'Route and recovery agree for diagonal neighbours too');
}
const scenes=[];
for(const mode of ['one','three','stop','load']){
 const m=progressMission(),half=vehicleEnvelope({kind:'bukhanka',x:0,y:0},m.config.worldScale).width,spacing=2*half+.4;
 const u=m.addUnit('bukhanka','rai',{x:0,y:-55},{heading:0}),a=m.addUnit('bukhanka','rai',{x:-spacing,y:0},{heading:0}),b=m.addUnit('bukhanka','rai',{x:spacing,y:0},{heading:0});
 const ids=[u.id,a.id,b.id];for(const unit of [u,a,b])unit.trafficOnScreen=true;m.rebuildNavigation();m.explored.fill(255);m.visible.fill(255);
 const parked=[{x:a.x,y:a.y},{x:b.x,y:b.y}],moving=mode==='three'?[u,a,b]:[u];
 const goals=new Map(moving.map(car=>[car.id,{x:car.x,y:mode==='three'&&car===u?120:75}]));
 for(const car of moving)assert(m.submitOrder([car.id],'move',goals.get(car.id)).ok);
 let stopped=false,loaded=false,finish=Infinity,trace=[];
 for(let i=0;i<240;i++){
  m.advance(.1);m.drainEffects();const cars=ids.map(id=>m.entity(id)),driver=cars[0];
  trace.push({time:m.state.time,units:cars.map(v=>({id:v.id,x:v.x,y:v.y,speed:v.driveSpeed,reason:v.navigation?.reason}))});
  assert(cars.every(v=>v.hp===v.maxHp&&!v.trafficPassThrough),'Clear passing needs neither damage nor ghost permission');
  if(mode==='stop'&&!stopped&&driver.y>-10){m.stop([driver.id],{expandGroup:false});stopped=true;}
  if(mode==='load'&&!loaded&&driver.y>-10){const save=m.save();m.load(save);m.state.bounds=[0,0,127,127];m.rebuildNavigation();m.explored.fill(255);loaded=true;}
  if(mode!=='three')for(let j=1;j<3;j++)assert(Math.hypot(cars[j].x-parked[j-1].x,cars[j].y-parked[j-1].y)<1e-8,'A clear passing oval must not shift parked neighbours');
  if(moving.every(v=>{const car=m.entity(v.id);return !car.task&&!car.path.length&&!car.pendingOrder&&!car.proposedOrder;})){finish=m.state.time;break;}
 }
 const cars=ids.map(id=>m.entity(id));assert(finish<24,JSON.stringify({mode,cars:trace.at(-1)}));
 if(mode!=='stop'){for(const car of mode==='three'?cars:[cars[0]])assert(Math.hypot(car.x-goals.get(car.id).x,car.y-goals.get(car.id).y)<.65,JSON.stringify({mode,car,trace:trace.slice(-2)}));}else assert(stopped);
 scenes.push({mode,spacing,finish,overlapCorrections:m.overlapStatistics?.moved??0,units:cars.map(v=>({id:v.id,x:v.x,y:v.y,hp:v.hp}))});
 fs.writeFileSync(folder+'/'+mode+'.json',JSON.stringify(trace));
}
{
 const u={kind:'bukhanka',x:0,y:-25,heading:0},end={...u,y:25},blocker={...u,y:0};
 assert(!sweepClearsVehicle(vehicleSweep(u,end,4.5),vehicleEnvelope(blocker,4.5),.2475),'A direct impact remains blocked');
}
fs.writeFileSync(folder+'/collision-checks.json',JSON.stringify({reports,scenes},null,2));console.log(JSON.stringify({reports,scenes},null,2));
