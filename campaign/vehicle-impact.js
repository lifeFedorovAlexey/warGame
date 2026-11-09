import {vehicleEnvelope,footprintContact,footprintPoint} from './vehicle-collision.js';
import {vehiclePose,worldToVehicle,worldDirectionToVehicle} from './builder-kinematics.js';
import {resolveVehicleOverlapsSteps as resolveBodyOverlapsSteps} from './vehicle-overlap.js';
import {invalidateTrafficCorridors} from './traffic-corridor.js';

export function vehicleContact(a,b,scale,field){
 const aa=vehicleEnvelope(a,scale,field),bb=vehicleEnvelope(b,scale,field),{gap,nx,ny}=footprintContact(aa,bb);
 const p=footprintPoint(aa,nx,ny),q=footprintPoint(bb,-nx,-ny);
 return {gap,normal:[nx,ny,0],point:[(p.x+q.x)/2,(p.y+q.y)/2,0]};
}
export function impactPower(closingMetresPerSecond){return Math.min(220,Math.max(0,closingMetresPerSecond-1.8)**2*4);}
export function fallbackVehicleImpact(target,point,direction,field,scale){
 const pose=vehiclePose(target,field,scale),localDirection=worldDirectionToVehicle(direction,pose);
 return {worldPoint:point,worldDirection:direction,worldNormal:direction.map(v=>-v),point:worldToVehicle(point,pose),direction:localDirection,normal:localDirection.map(v=>-v),partId:0,partSpec:{material:'metal'},type:'collision'};
}

export function* resolveVehicleOverlapsSteps(mission,dt){
 yield* resolveBodyOverlapsSteps(mission,dt,()=>invalidateTrafficCorridors(mission));
}
