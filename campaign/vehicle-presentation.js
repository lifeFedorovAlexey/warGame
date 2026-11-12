const clamp=value=>Math.max(0,Math.min(1,value));
const lerp=(a,b,t)=>a+(b-a)*t;
const turn=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const pose=unit=>({x:unit.x,y:unit.y,heading:unit.heading,steering:unit.steering??0,travel:unit.wheelDistance??0});
const previous=unit=>({x:unit.previousX??unit.x,y:unit.previousY??unit.y,heading:unit.previousHeading??unit.heading,
 steering:unit.previousSteering??unit.steering??0,travel:unit.previousWheelDistance??unit.wheelDistance??0});
function interpolate(from,to,phase){
 return {x:lerp(from.x,to.x,phase),y:lerp(from.y,to.y,phase),heading:from.heading+turn(to.heading,from.heading)*phase,
  steering:lerp(from.steering,to.steering,phase),travel:lerp(from.travel,to.travel,phase)};
}

// A controller can yield after changing previousX, but before publishing its
// next physical pose. Render only completed samples, independent of map and
// controller scheduling. Rebase early samples from the visible pose, so a
// shortened tick interval never jumps forward to the old simulation endpoint.
export function createVehiclePresentation(){
 const records=new WeakMap();
 return function sample(mission,unit,now){
  if(unit.hp<=0)return {...pose(unit),phase:1,moving:false};
  const at=mission.unitFrameTimes?.get(unit),nominal=mission.config.simulationStep*1000/Math.max(.01,mission.presentationRate??1);
  if(at===undefined){
   records.delete(unit);
   const phase=mission.renderUnitPhase?.(unit,now)??clamp(mission.accumulator/mission.config.simulationStep),from=previous(unit),to=pose(unit);
   return {...interpolate(from,to,phase),phase,moving:Math.hypot(to.x-from.x,to.y-from.y)>.008};
  }
  let row=records.get(unit);
  if(!row||row.clock!==mission.unitFrameTimes){
   row={clock:mission.unitFrameTimes,at,from:previous(unit),to:pose(unit),duration:nominal};records.set(unit,row);
  }else if(row.at!==at){
   const from=interpolate(row.from,row.to,clamp((at-row.at)/row.duration));
   const interval=Math.max(nominal,Math.min(nominal*4,at-row.at));
   row={clock:row.clock,at,from,to:pose(unit),duration:Math.max(nominal,interval*.75+row.duration*.25)};records.set(unit,row);
  }
  const phase=clamp((now-row.at)/row.duration);
  return {...interpolate(row.from,row.to,phase),phase,moving:Math.hypot(row.to.x-row.from.x,row.to.y-row.from.y)>.008};
 };
}
