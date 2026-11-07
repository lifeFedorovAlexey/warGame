import {vehiclePose,vehicleToWorld,worldToVehicle} from './builder-kinematics.js';
import {vehicleLocalBoxes} from './vehicle-collision.js';

function nearFace(dx,dy,width,depth) {
  const reach=Math.min(1,width/Math.max(.001,Math.abs(dx)),depth/Math.max(.001,Math.abs(dy)));
  return [dx*reach,dy*reach];
}

export function combatContact(source,target,config,field) {
  const scale=config.worldScale;
  if(config.units[target.kind]){
    const pose=vehiclePose(target,field,scale);
    const [width,centre,depth,z]=vehicleLocalBoxes(target.kind).at(-1);
    const [, , height]=vehicleToWorld([0,centre,z],pose);
    const [sx,sy]=worldToVehicle([source.x,source.y,height],pose);
    const [dx,dy]=nearFace(sx,sy-centre,width+.045,depth+.045);
    const [x,y,hitZ]=vehicleToWorld([dx,centre+dy,z],pose);
    return {x,y,z:hitZ,surface:'armor'};
  }
  const spec=config.buildings[target.kind],base=target.groundHeight??field.heightAt(target.x,target.y);
  const [width,depth,height]=spec?.realSizeMetres??[target.halfWidth*2/scale,target.halfDepth*2/scale,3.2];
  const dx=source.x-target.x,dy=source.y-target.y,rotation=target.rotation??0;
  const c=Math.cos(rotation),s=Math.sin(rotation),tower=target.kind==='mg-tower';
  const rim=tower?.24:target.kind==='camp-core'?.39:.49;
  const [x,y]=nearFace(dx*c+dy*s,-dx*s+dy*c,width*scale*rim,depth*scale*rim);
  return {x:target.x+x*c-y*s,y:target.y+x*s+y*c,z:base+height*scale*(tower?.74:.42),surface:tower?'armor':'structure'};
}
