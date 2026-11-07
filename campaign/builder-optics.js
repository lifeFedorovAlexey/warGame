import {vehiclePose, vehicleToWorld, worldToVehicle} from './builder-kinematics.js';

export function buildLayerHeight(building,spec,scale) {
  const h = spec.realSizeMetres[2];
  const step = .24;
  const slice = Math.min(h,Math.ceil((.25+building.progress*(h-.25))/step)*step);
  return building.groundHeight+slice*scale;
}

export function workProjection(unit,target,config,field) {
  const scale=config.worldScale, pose=vehiclePose(unit,field,scale);
  let world;
  if(config.units[target.kind]){
    const poseTarget=vehiclePose(target,field,scale);
    const rear=target.kind==='command'?-2.02:-2.022;
    world=vehicleToWorld([0,rear,1.82],poseTarget);
  }else{
    const spec=config.buildings[target.kind];
    if(!spec||target.clearing)return null;
    const angle=target.rotation, c=Math.cos(angle), s=Math.sin(angle);
    const dx=unit.x-target.x,dy=unit.y-target.y,localX=dx*c+dy*s,localY=-dx*s+dy*c;
    const w=spec.realSizeMetres[0]*scale,d=spec.realSizeMetres[1]*scale;
    const side=Math.abs(localX)/w>Math.abs(localY)/d;
    const faceX=side?Math.sign(localX)*w*.486:Math.max(-w*.39,Math.min(w*.39,localX));
    const faceY=side?Math.max(-d*.39,Math.min(d*.39,localY)):Math.sign(localY||-1)*d*.486;
    world=[target.x+faceX*c-faceY*s,target.y+faceX*s+faceY*c,buildLayerHeight(target,spec,scale)];
  }
  const [x,y,z]=worldToVehicle(world,pose),dx=x,dy=y+.65,dz=z-3.377;
  const radius=Math.hypot(dx,dy), yaw=Math.atan2(-dx,dy), pitch=Math.atan2(dz,radius-.21);
  const reach=config.units[target.kind]?20:13.5;
  if(radius<1.1||Math.hypot(radius,dz)>reach||pitch<-.87||pitch>1.13)return null;
  const along=.21+.511*Math.cos(pitch)-.003*Math.sin(pitch);
  const emitter=vehicleToWorld([-Math.sin(yaw)*along,-.65+Math.cos(yaw)*along,3.377+.511*Math.sin(pitch)+.003*Math.cos(pitch)],pose);
  for(let i=1;i<12;i++){
    const f=i/12, tx=emitter[0]+(world[0]-emitter[0])*f,ty=emitter[1]+(world[1]-emitter[1])*f,tz=emitter[2]+(world[2]-emitter[2])*f;
    if(field.heightAt(tx,ty)+.06>tz)return null;
  }
  return {yaw,pitch,world,emitter};
}
