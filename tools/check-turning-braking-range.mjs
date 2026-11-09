import assert from 'node:assert/strict';
import {fixture,config} from './check-start-latency-coordinator.mjs';
import {maneuverAdmissionBlocker} from '../campaign/maneuver-admission.js';
import {checkManeuver,clearOfVehicles} from '../campaign/vehicle-motion.js';
import {vehicleClearance} from '../campaign/vehicle-collision.js';
import {vehicleDynamics} from '../campaign/vehicle-dynamics.js';

// A turning forecast calls admission for future own poses, not only its
// current centre. The other braking path reaches that future pose while
// neither the initial bodies nor the future own body/current other overlap.
const m=fixture(),u=m.addUnit('bukhanka','rai',{x:0,y:0},{heading:0,driveSpeed:30,reversing:false}),
 other=m.addUnit('bukhanka','rai',{x:0,y:41},{heading:Math.PI,driveSpeed:10,reversing:false});
m.unitIndex.rebuild(m.state.units);
const curve=.01,from=checkManeuver(u,[{direction:1,curve,remaining:18}],config.worldScale,()=>true),
 to=checkManeuver(from,[{direction:1,curve,remaining:.14}],config.worldScale,()=>true);
let pose=other,speed=other.driveSpeed,conflict=false;
for(let step=0;step<64&&speed>.001;step++){
 if(step)speed=Math.max(0,speed-vehicleDynamics(other).braking*.1);
 const next=checkManeuver(pose,[{direction:1,curve:0,remaining:speed*.1}],config.worldScale,()=>true);
 if(!clearOfVehicles(other,next,[{...to,hp:1}],config.worldScale,false,pose,m.field)){conflict=true;break;}
 pose=next;
}
assert(vehicleClearance(u,other,config.worldScale,m.field)>0);
assert(vehicleClearance(to,other,config.worldScale,m.field)>0);
assert(conflict,'The uncullled physical braking sweep independently proves this conflict');
let blocked;
for(const active of [false,true]){
 m.unitIndexActive=active;blocked=maneuverAdmissionBlocker(m,u,from,to,.1);
 assert.equal(blocked,other,'Future-pose query with active spatial index='+active);
}
console.log(JSON.stringify({passed:blocked===other,initialGap:vehicleClearance(u,other,config.worldScale,m.field),
 futureStaticGap:vehicleClearance(to,other,config.worldScale,m.field),blocker:blocked?.id??null}));
assert.equal(blocked,other,'Admission broad phase must include displacement to the future own arc sample');
// A fast saved vehicle must be included even beyond the old fixed 24*scale
// radius. A speed update within its existing cell refreshes the aggregate.
other.y=140;other.driveSpeed=1;m.unitIndex.rebuild(m.state.units);
other.driveSpeed=90;m.unitIndex.update(other);
assert.equal(m.unitIndex.maxSpeed,90);
assert.equal(maneuverAdmissionBlocker(m,u,from,to,.1),other);
other.driveSpeed=5;m.unitIndex.update(other);assert.equal(m.unitIndex.maxSpeed,90,'Decreases remain conservative within this tick');
m.unitIndex.rebuild(m.state.units);assert.equal(m.unitIndex.maxSpeed,30,'The next rebuild removes obsolete speed bounds');
