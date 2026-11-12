const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

export function firingSlots(spec,scale,angle,anchor){
  const spacing=scale*7,slots=[];
  for(let radius=spec.range*.78;radius>=spec.range*.38;radius-=spacing){
    const columns=Math.max(2,Math.floor(radius*Math.PI*2/spacing/2)*2);
    for(let column=0;column<columns;column++){
      const offset=(column%2?1:-1)*(Math.floor(column/2)+.5)*spacing/radius;
      slots.push({x:anchor.x+Math.cos(angle+offset)*radius,y:anchor.y+Math.sin(angle+offset)*radius});
    }
  }
  return slots;
}
export function slotCost(unit,point,scale){
  const d=distance(unit,point),heading=Math.atan2(unit.x-point.x,point.y-unit.y);
  const turn=Math.atan2(Math.sin(heading-unit.heading),Math.cos(heading-unit.heading));
  return d*d+turn*turn*scale*scale*12;
}
export function firingPose(unit,point,target){
  return {...unit,...point,heading:Math.atan2(point.x-target.x,target.y-point.y)};
}
export function validPosition(mission,unit,target,point,reserved){
  const scale=mission.config.worldScale,spec=mission.unitSpec(unit);
  if(!mission.inBounds(point.x,point.y)||!mission.exploredAt(point.x,point.y)
    ||distance(point,target)>spec.range*.97||distance(point,target)<spec.range*.36
    ||reserved.some(other=>distance(point,other)<scale*5.3))return false;
  const pose=firingPose(unit,point,target);
  return mission.lineOfSight(pose,target)&&mission.vehicleMotionClear(unit,pose,pose);
}
