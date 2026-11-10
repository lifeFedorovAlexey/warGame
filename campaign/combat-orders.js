import {automaticCombatTarget,combatPolicy} from './combat-policy.js';
import {footprintCast,sweepAvoidsFootprint,sweepClearsVehicle,trafficCollisionRequired,vehicleEnvelope,vehicleRadiusBound,vehicleSweep} from './vehicle-collision.js';

export const movementEngaged=unit=>!!unit.combatDeployment||unit.task?.type==='attack-move'
 &&['engaging-visible-target','firing-position'].includes(unit.navigation?.reason);

// A fresh ground attack order during an engagement is a position change.
// Keep firing at the old contacts, but do not let them immediately cancel
// that move by reserving the exact firing positions the player just left.
// New contacts still interrupt an attack-move normally. IDs are save data;
// no timer or camera-dependent state controls the player's order.
export function* interruptedCombatTargets(mission,units){
 const ids=new Set();
 for(const [index,unit] of units.entries()){
  if(index%8===0||performance.now()>=(mission.nav.workDeadline??Infinity))yield;
  for(const id of unit.combatDisengage??[])ids.add(id);
  const explicit=unit.combatDeployment?.targetId??(unit.task?.type==='attack'?unit.task.targetId:null);
  if(explicit)ids.add(explicit);
  const target=automaticCombatTarget(mission,unit,mission.unitSpec(unit));
  if(target)ids.add(target.id);
 }
 return [...ids];
}

export function movementCombatTarget(mission,unit,spec){
 if(unit.combatDisengage){
  const goal=unit.routeOrder?.destination??unit.task;
  if(!unit.path.length&&goal&&Math.hypot(unit.x-goal.x,unit.y-goal.y)<2)delete unit.combatDisengage;
  else{
   unit.combatDisengage=unit.combatDisengage.filter(id=>{
    const target=mission.entity(id);
    return target?.hp>0&&Math.hypot(unit.x-target.x,unit.y-target.y)<=spec.vision;
   });
   if(!unit.combatDisengage.length)delete unit.combatDisengage;
  }
 }
 return automaticCombatTarget(mission,unit,spec,unit.combatDisengage);
}

// A turret can clear the next leg without replacing the vehicle's order.
// Test the first obstruction, including friendly hulls and solid cover.
export function blockingCombatTarget(mission,unit,spec){
 if(unit.owner!=='rai'||unit.pendingOrder||unit.proposedOrder||mission.state.time<=unit.commandStartAfter)return null;
 const response=combatPolicy(unit).response;
 if(response==='ignore'||response==='return'&&!unit.lastHostileHit)return null;
 const point=unit.path[0]??(['move','attack-move'].includes(unit.task?.type)?unit.task:null);
 if(!point)return null;
 const dx=point.x-unit.x,dy=point.y-unit.y,distance=Math.hypot(dx,dy);
 if(distance<1)return null;
 const scale=mission.config.worldScale,length=Math.min(distance,scale*6);
 const course={x:dx/distance,y:dy/distance};
 const next={x:unit.x+course.x*length,y:unit.y+course.y*length,kind:unit.kind,heading:unit.heading};
 const vehicles=mission.vehicleMotionNeighbours(unit,unit,next);
 const solids=mission.nav.nearbySolids(unit,length+vehicleRadiusBound(unit.kind,scale));
 const hostile=body=>body.owner&&body.owner!=='neutral'&&!body.campResource&&mission.enemyOf(unit,body)
  &&(response!=='return'||body.id===unit.lastHostileHit.id);
 if(!vehicles.some(hostile)&&!solids.some(hostile))return null;
 const sweep=vehicleSweep(unit,next,scale,mission.field);
 let first=null,nearest=Infinity;
 const consider=(body,shape,skin)=>{
  const contact=footprintCast(sweep.start,course,length,shape,skin);
  if(contact<nearest){first=body;nearest=contact;}
 };
 for(const solid of solids)if(!sweepAvoidsFootprint(sweep,solid)){
  consider(solid,{x:solid.x,y:solid.y,width:solid.halfWidth,depth:solid.halfDepth,c:1,s:0},.1);
 }
 for(const other of vehicles){
  if(other===unit||other.hp<=0||!trafficCollisionRequired(unit,other))continue;
  const shape=vehicleEnvelope(other,scale,mission.field),skin=scale*.055;
  if(!sweepClearsVehicle(sweep,shape,skin))consider(other,shape,skin);
 }
 const target=first?.id&&mission.entity(first.id);
 if(!target||!hostile(target)||Math.hypot(unit.x-target.x,unit.y-target.y)>spec.range
  ||!mission.visibleAt(target.x,target.y)||!mission.lineOfSight(unit,target))return null;
 return target;
}
