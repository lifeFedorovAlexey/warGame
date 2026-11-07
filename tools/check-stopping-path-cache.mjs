import assert from 'node:assert/strict';
import fs from 'node:fs';
import {maneuverAdmissionBlocker} from '../campaign/maneuver-admission.js';
import {checkManeuver,clearOfVehicles} from '../campaign/vehicle-motion.js';
import {vehicleDynamics} from '../campaign/vehicle-dynamics.js';

// Frozen pre-cache algorithm. Compare which actual body blocks the manoeuvre,
// including its order, rather than merely comparing cache implementation data.
function reference(mission,unit,from,to,dt){
 const scale=mission.config.worldScale;
 for(const other of mission.nearbyUnits(unit,scale*24)){
  if(other===unit||other.hp<=0||(other.driveSpeed??0)<.01)continue;
  const braking=vehicleDynamics(other).braking,direction=other.reversing?-1:1,curve=Math.tan(other.steering??0)*direction;
  let pose=other,speed=other.driveSpeed;
  if(Math.hypot(other.x-unit.x,other.y-unit.y)>speed*speed/(2*braking)+speed*dt+scale*7)continue;
  for(let step=0;step<64&&speed>.001;step++){
   const interval=step?.1:dt;if(step)speed=Math.max(0,speed-braking*interval);
   const length=speed*interval;if(!length)break;
   const next=checkManeuver(pose,[{direction,curve,remaining:length}],scale,()=>true);
   if(!clearOfVehicles(other,next,[{...to,kind:unit.kind,hp:1}],scale,false,pose,mission.field))return other;
   pose=next;
  }
 }
 return null;
}
let seed=99173,heightCalls=0;
const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
const field={heightAt:(x,y)=>{heightCalls++;return Math.sin(x/51)*2+Math.cos(y/43)*3;}};
const unit={id:'self',kind:'bukhanka',x:0,y:0,heading:0,hp:320};
const others=Array.from({length:8},(_,i)=>({id:'other-'+i,kind:i%2?'bukhanka':'raider',x:0,y:0,hp:320}));
const mission={config:{worldScale:4.5},field,nav:{topologyRevision:1},nearbyUnits:()=>[unit,...others]};
let comparisons=0,blocked=0;
for(let state=0;state<160;state++){
 for(const other of others)Object.assign(other,{x:(random()-.5)*110,y:(random()-.5)*110,heading:random()*Math.PI*2,
  driveSpeed:state%17===0?.01:random()*38,steering:(random()-.5)*1.44,reversing:random()<.2,hp:random()<.05?0:320});
 for(let step=0;step<24;step++){
  // Invalidate pose, speed, steering, direction, kind, terrain identity and
  // topology independently while retaining the same neighbour object IDs.
  if(step===3)others[0].x+=4;
  if(step===5)others[1].driveSpeed+=3;
  if(step===7)others[2].steering=-others[2].steering;
  if(step===9)others[3].reversing=!others[3].reversing;
  if(step===11)others[4].kind=others[4].kind==='raider'?'bukhanka':'raider';
  if(step===13)mission.nav.topologyRevision++;
  if(step===15)mission.field={heightAt:field.heightAt};
  if(step===17)others[5].heading+=.3;
  if(step===19)mission.config.worldScale=state%2?4.5:3;
  const to={x:(random()-.5)*60,y:(random()-.5)*60,heading:random()*Math.PI*2},dt=[.05,.1,.16][state%3];
  const expected=reference(mission,unit,unit,to,dt),actual=maneuverAdmissionBlocker(mission,unit,unit,to,dt);
  assert.equal(actual,expected,`First blocking body differs in state ${state}, probe ${step}`);comparisons++;if(actual)blocked++;
 }
}
// Isolate cache-key dependencies rather than changing all inputs at once.
for(const other of others)other.hp=0;
Object.assign(others[0],{x:0,y:30,heading:Math.PI,kind:'bukhanka',driveSpeed:10,steering:0,reversing:false,hp:320});
mission.config.worldScale=4.5;mission.field={heightAt:()=>0};
const sensitivityPoints=Array.from({length:600},(_,i)=>({x:(i%20-10)*1.2,y:Math.floor(i/20)*.5,heading:.15}));
const verify=(dt)=>sensitivityPoints.map(to=>{
 const expected=reference(mission,unit,unit,to,dt),actual=maneuverAdmissionBlocker(mission,unit,unit,to,dt);
 assert.equal(actual,expected);comparisons++;return actual?.id??null;
});
const shortStep=verify(.05),longStep=verify(.4);assert.notDeepEqual(shortStep,longStep,'The dt-only probes must distinguish their stopping corridors');
const beforeY=verify(.1);others[0].y+=3;const afterY=verify(.1);assert.notDeepEqual(beforeY,afterY);
mission.field={heightAt:(x,y)=>x*.35+y*.4};const onSlope=verify(.1);assert.notDeepEqual(onSlope,afterY,'Replacing only the heightfield must affect projected bodies');
Object.assign(others[1],{...others[0],id:'other-1'});
const originalOrder=verify(.1);others.reverse();const reversedOrder=verify(.1);
assert.notDeepEqual(originalOrder,reversedOrder,'First blocking body must follow current sequential iteration order');others.reverse();
// Stable physical states queried along many different candidate arcs. Both
// variants still test every obstacle pose; only duplicate forecasts disappear.
mission.config.worldScale=4.5;
mission.field=field;
for(const [i,other] of others.entries())Object.assign(other,{x:(i-3.5)*7,y:35,heading:Math.PI,driveSpeed:24,steering:.25,reversing:false,hp:320});
const probes=Array.from({length:400},()=>({x:(random()-.5)*80,y:random()*30,heading:(random()-.5)*2}));
const measure=fn=>{heightCalls=0;const start=performance.now();let hits=0;for(let pass=0;pass<3;pass++)for(const to of probes)if(fn(mission,unit,unit,to,.1))hits++;return{ms:performance.now()-start,heightCalls,hits};};
measure(reference);measure(maneuverAdmissionBlocker);
const before=measure(reference),after=measure(maneuverAdmissionBlocker);
assert.equal(after.hits,before.hits);assert(after.heightCalls<before.heightCalls*.5,'Repeated neighbour forecasts must actually be reused');
const report={passed:true,comparisons,blocked,before,after,note:'Equivalence to pre-cache swept braking queries and isolated Node microbenchmark, not game FPS.'};
fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/stopping-path-cache.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
