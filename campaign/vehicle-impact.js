import {vehicleEnvelope,footprintSupport} from './vehicle-collision.js';
import {vehiclePose,worldToVehicle,worldDirectionToVehicle} from './builder-kinematics.js';

export function vehicleContact(a,b,scale,field){
 const aa=vehicleEnvelope(a,scale,field),bb=vehicleEnvelope(b,scale,field),dx=bb.x-aa.x,dy=bb.y-aa.y;
 let gap=-Infinity,nx=0,ny=0;
 for(const [x,y] of [[aa.c,aa.s],[-aa.s,aa.c],[bb.c,bb.s],[-bb.s,bb.c]]){
  const projection=dx*x+dy*y,separation=Math.abs(projection)-footprintSupport(aa,x,y)-footprintSupport(bb,x,y);
  if(separation>gap){gap=separation;const sign=projection<0?-1:1;nx=x*sign;ny=y*sign;}
 }
 const tx=-ny,ty=nx,ac=aa.x*tx+aa.y*ty,bc=bb.x*tx+bb.y*ty,ar=footprintSupport(aa,tx,ty),br=footprintSupport(bb,tx,ty);
 const tangent=(Math.max(ac-ar,bc-br)+Math.min(ac+ar,bc+br))/2;
 const normal=(aa.x*nx+aa.y*ny+footprintSupport(aa,nx,ny)+bb.x*nx+bb.y*ny-footprintSupport(bb,nx,ny))/2;
 return {gap,normal:[nx,ny,0],point:[nx*normal+tx*tangent,ny*normal+ty*tangent,0]};
}
export function impactPower(closingMetresPerSecond){return Math.min(220,Math.max(0,closingMetresPerSecond-1.8)**2*4);}
export function fallbackVehicleImpact(target,point,direction,field,scale){
 const pose=vehiclePose(target,field,scale),localDirection=worldDirectionToVehicle(direction,pose);
 return {worldPoint:point,worldDirection:direction,worldNormal:direction.map(v=>-v),point:worldToVehicle(point,pose),direction:localDirection,normal:localDirection.map(v=>-v),partId:0,partSpec:{material:'metal'},type:'collision'};
}
