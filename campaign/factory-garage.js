import {vehicleEnvelope,vehicleSweep,clearOfVehicles,vehicleGroundSafe} from './vehicle-collision.js';
import {angleDelta} from './builder-kinematics.js';
import {CommandPlanner} from './command-planner.js';
import {retreatReturnOrder} from './factory-repair.js';

export const insideFactory=u=>u.factoryVisit?.phase==='inside';
export const factoryPriority=f=>f.workPriority??'repair';
export function factoryPoint(m,f,x,y){const a=f.rotation??0,c=Math.cos(a),s=Math.sin(a),scale=m.config.worldScale;return{x:f.x+(x*c-y*s)*scale,y:f.y+(x*s+y*c)*scale};}
export function factoryVisitors(m,f){return m.state.units.filter(u=>u.hp>0&&u.factoryVisit?.factoryId===f.id);}
export function factoryProductionPaused(m,f){return factoryVisitors(m,f).some(u=>['entering','leaving','departure'].includes(u.factoryVisit.phase)||insideFactory(u)&&u.hp<u.maxHp&&factoryPriority(f)==='repair');}
export function setFactoryPriority(m,id,priority){
 m.finishPendingStep();const f=m.entity(id);
 if(!f||f.kind!=='factory'||f.owner!=='rai'||!f.completed||!['repair','production'].includes(priority))return m.fail('Нужен работающий завод');
 f.workPriority=priority;f.productionPaused=factoryProductionPaused(m,f);return {ok:true};
}
function resetDrive(u){u.path=[];u.task=null;u.driveSpeed=0;for(const k of ['detour','yieldReturn','traffic','trafficHold','passingLane','driveWatch','routeOrder','routeContinuation','combatParking'])delete u[k];}
function gateOwner(m,f){
 const visitors=factoryVisitors(m,f),current=visitors.find(u=>['gate','entering','leaving','departure'].includes(u.factoryVisit.phase));
 if(current&&!insideFactory(current)){f.garageGate=current.id;return current;}
 const ready=visitors.filter(u=>insideFactory(u)&&(u.hp>=u.maxHp||f.hp<=0)).sort((a,b)=>a.factoryVisit.arrived-b.factoryVisit.arrived);
 const arriving=visitors.filter(u=>u.factoryVisit.phase==='waiting').sort((a,b)=>a.factoryVisit.queued-b.factoryVisit.queued||a.id.localeCompare(b.id));
 // Finish a crossing already in progress, then release repaired cars before
 // admitting another arrival. A stored gate id alone is not a live crossing:
 // cancelled/waiting arrivals must not hold ready vehicles inside.
 const owner=ready[0]??arriving[0];f.garageGate=owner?.id;return owner;
}
function waitPoint(m,f,index){
 const side=index%2?1:-1,column=Math.floor(index/2)%3,row=Math.floor(index/6);
 return factoryPoint(m,f,side*(9+column*7),-23-row*7);
}
export function factoryWaitingPoint(m,f,u){return waitPoint(m,f,u.factoryVisit.slot);}
function createVisit(m,u,f){
 const used=new Set(factoryVisitors(m,f).map(v=>v.factoryVisit.slot));let slot=0;
 for(;slot<128;slot++){
  const point=waitPoint(m,f,slot);
  if(!used.has(slot)&&m.nav.lineClear(point,point)
   &&m.state.units.every(v=>v===u||v.hp<=0||insideFactory(v)||Math.hypot(v.x-point.x,v.y-point.y)>m.config.worldScale*5.5))break;
 }
 if(slot===128){slot=0;while(used.has(slot))slot++;}
 resetDrive(u);
 return u.factoryVisit={factoryId:f.id,phase:'approach',slot,queued:m.state.time,factory:{id:f.id,x:f.x,y:f.y,rotation:f.rotation,halfWidth:f.halfWidth,halfDepth:f.halfDepth,kind:f.kind,owner:f.owner,completed:true}};
}
function* driveTo(m,u,goal,dt,current){
 if(!u.path.length&&!u.detour&&!u.yieldReturn&&Math.hypot(u.x-goal.x,u.y-goal.y)<2){u.driveSpeed=0;return true;}
 if(!u.path.length&&!u.detour&&m.state.time>=(u.factoryVisit.retryAt??0)){
  const path=yield* m.vehiclePathSteps(u,goal,{fallback:false,maxGoalDistance:2});if(!current())return false;
  if(path){u.path=path;u.task={type:'move',...goal};u.routeOrder={revision:2,type:'retreat',request:{...goal},destination:{...goal}};}
  else u.factoryVisit.retryAt=m.state.time+1;
 }
 if(u.path.length||u.detour||u.yieldReturn)yield* m.moveSteps(u,dt);
 return current()&&!u.path.length&&!u.detour&&!u.yieldReturn&&Math.hypot(u.x-goal.x,u.y-goal.y)<2;
}
function* dockStep(m,u,f,goal,heading,dt,current){
 const scale=m.config.worldScale,turn=angleDelta(heading,u.heading),distance=Math.hypot(goal.x-u.x,goal.y-u.y);
 const angle=u.heading+Math.sign(turn)*Math.min(Math.abs(turn),dt*.85);
 const travel=Math.abs(turn)>.10?0:Math.min(distance,scale*3*dt);
 const next={...u,x:u.x+(goal.x-u.x)/Math.max(.001,distance)*travel,y:u.y+(goal.y-u.y)/Math.max(.001,distance)*travel,heading:angle};
 const sweep=vehicleSweep(u,next,scale,m.field),solids=m.nav.nearbySolids(u,distance+scale*6).filter(b=>b.id!==f.id),blockers=new Set();
 if(!vehicleGroundSafe(vehicleEnvelope(next,scale,m.field),.52)||!m.nav.clearSolidSweep(sweep,solids))return false;
 if(!clearOfVehicles(u,next,m.state.units.filter(v=>!insideFactory(v)),scale,false,u,m.field,blockers,sweep)){
  u.driveSpeed=0;
  if(blockers.size&&m.state.time>=(f.garageClearAt??0)){
   f.garageClearAt=m.state.time+1;
   if(m.clearFactoryApronSteps)yield* m.clearFactoryApronSteps(f,u,blockers,current);
   else m.clearFactoryApron(f,u,blockers);
  }
  return false;
 }
 if(!current())return false;
 u.x=next.x;u.y=next.y;u.heading=next.heading;u.driveSpeed=travel/Math.max(dt,.001);u.wheelDistance=(u.wheelDistance??0)+travel;u.steering=0;
 return distance<.2*scale&&Math.abs(turn)<.05;
}
export function* updateFactoryVisit(m,u,f,dt){
 const visit=u.factoryVisit??createVisit(m,u,f),retreat=u.combatRetreat;
 const current=()=>u.hp>0&&u.factoryVisit===visit;
 if(f.id!==visit.factoryId){resetDrive(u);delete u.factoryVisit;return false;}
 const door=factoryPoint(m,f,0,-18),bay=factoryPoint(m,f,0,-3);
 if(!f.hp&&['approach','waiting','gate'].includes(visit.phase)){resetDrive(u);delete u.factoryVisit;return false;}
 if(visit.phase==='approach'){
  const point=factoryWaitingPoint(m,f,u);
  if(!point){u.driveSpeed=0;if(retreat){retreat.status='blocked';retreat.service='waiting-apron-space';}return true;}
  if(retreat){retreat.status='moving';retreat.phase='home';retreat.destination=point;}
  if(yield* driveTo(m,u,point,dt,current)){visit.phase='waiting';resetDrive(u);}
 }
 const owner=gateOwner(m,f);
 if(visit.phase==='waiting'){
  if(retreat){retreat.status='servicing';retreat.service='waiting-entry';}
  if(owner===u){visit.phase='gate';resetDrive(u);}
 }
 if(visit.phase==='gate'){
  if(retreat){retreat.status='moving';retreat.destination=door;}
  if(yield* driveTo(m,u,door,dt,current)){visit.phase='entering';resetDrive(u);}
 }
 if(visit.phase==='entering'){
  if(retreat){retreat.status='servicing';retreat.service='entering';}
  if(yield* dockStep(m,u,f,bay,f.rotation??0,dt,current)){
   visit.phase='inside';visit.arrived=m.state.time;resetDrive(u);delete f.garageGate;
   m.emit('factory-admitted',{unit:u.id,factory:f.id});
  }
 }else if(insideFactory(u)){
  u.driveSpeed=0;
  if(retreat)retreat.status='servicing';
  if((u.hp>=u.maxHp||f.hp<=0)&&owner===u){visit.phase='leaving';resetDrive(u);}
 }
 if(visit.phase==='leaving'){
  if(retreat){retreat.status='servicing';retreat.service='leaving';}
  if(yield* dockStep(m,u,f,door,(f.rotation??0)+Math.PI,dt,current)){
   resetDrive(u);visit.phase='departure';
  }
 }
 if(visit.phase==='departure'){
  const park=factoryWaitingPoint(m,f,u);
  if(!park){u.driveSpeed=0;if(retreat)retreat.service='waiting-apron-space';return true;}
  if(yield* driveTo(m,u,park,dt,current)){
   resetDrive(u);delete u.factoryVisit;delete f.garageGate;
   if(retreat){retreat.status='arrived';retreat.phase='home';retreat.destination={x:u.x,y:u.y};retreat.service='complete';}
   if(retreat&&!retreat.forced&&u.hp>=u.maxHp){
    const order=retreatReturnOrder(m,u);
    // Returning one repaired member must not overwrite its whole group's order.
    if(order&&(m.commandPlanner??=new CommandPlanner(m)).submit([u.id],order.action,order.target).ok)delete u.combatRetreat;
   }
   m.emit('factory-released',{unit:u.id,factory:f.id});
  }
 }
 return true;
}
