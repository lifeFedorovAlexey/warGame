import {navigationDecision} from './navigation-state.js';
import {vehicleEnvelope,vehicleSweep,clearOfVehicles,vehicleGroundSafe} from './vehicle-collision.js';
import {angleDelta} from './builder-kinematics.js';
import {vehicleDynamics} from './vehicle-dynamics.js';
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
 const visitors=factoryVisitors(m,f),current=visitors.find(u=>['gate','entering'].includes(u.factoryVisit.phase));
 if(current&&!insideFactory(current)){f.garageGate=current.id;return current;}
 const arriving=visitors.filter(u=>['waiting','approach'].includes(u.factoryVisit.phase)&&!(u.factoryVisit.gateRetryAt>m.state.time)).sort((a,b)=>a.factoryVisit.queued-b.factoryVisit.queued||a.id.localeCompare(b.id));
 const owner=arriving[0];f.garageGate=owner?.id;return owner;
}
function exitOwner(m,f){
 const visitors=factoryVisitors(m,f),current=visitors.find(u=>['leaving','departure'].includes(u.factoryVisit.phase));
 const ready=visitors.filter(u=>insideFactory(u)&&(u.hp>=u.maxHp||f.hp<=0)).sort((a,b)=>a.factoryVisit.arrived-b.factoryVisit.arrived);
 const owner=current??ready[0];f.garageExit=owner?.id;return owner;
}
function waitPoint(m,f,index){
 const side=index%2?1:-1,column=Math.floor(index/2)%3,row=Math.floor(index/6);
 return factoryPoint(m,f,side*(12+column*12),-30-row*12);
}
function terrainSegmentClear(terrain,field,a,b){
 if(terrain.clearSegment)return terrain.clearSegment(a,b);
 // The slope-grid navigator exposes a point predicate; authored level maps
 // additionally expose exact wall/segment intersections. Honour either map.
 const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/Math.min(8,(field.cellMetres??32)/4)));
 for(let i=0;i<=steps;i++)if(!terrain(a.x+(b.x-a.x)*i/steps,a.y+(b.y-a.y)*i/steps))return false;
 return true;
}
export function factoryWaitingPoint(m,f,u){
 const visit=u.factoryVisit,scale=m.config.worldScale,terrain=m.nav.terrainAllowed;
 const geometry=[m.nav.topologyRevision,f.x,f.y,f.rotation??0,visit.phase==='departure'?'exit':'entry'].join(':');
 const departure=visit.phase==='departure',poseAt=p=>({...u,...p,heading:f.rotation??0});
 const exitSpace=p=>{const pose=poseAt(p);return clearOfVehicles(u,pose,m.state.units,scale,false,pose,m.field);};
 if(visit.waitGeometry===geometry&&visit.waitingPoint&&(!departure||u.path.length||exitSpace(visit.waitingPoint)))return visit.waitingPoint;
 if(departure&&!visit.waitingPoint&&m.state.time<(visit.retryAt??0))return null;
 const level=terrain.levelAt?.(f.x,f.y),direction=departure?1:-1,door=factoryPoint(m,f,0,direction*18);
 const claimed=m.state.units.filter(other=>other!==u&&other.hp>0&&other.factoryVisit).map(other=>other.factoryVisit.waitingPoint).filter(Boolean);
 const occupancy=JSON.stringify(claimed);
 if(visit.rejectedOccupancy!==occupancy){visit.rejectedOccupancy=occupancy;delete visit.rejectedWaitPoints;}
 if(!departure&&visit.waitGeometry===geometry&&!visit.waitingPoint&&visit.waitOccupancy===occupancy)return null;
 let point=null;
 for(let offset=0;offset<(departure?248:120);offset++){
  const index=(visit.slot+offset)%120,side=index%2?1:-1,column=Math.floor(index/2)%3,row=Math.floor(index/6);
  const angle=(offset-120)%16*Math.PI/8,ring=28+Math.floor((offset-120)/16)*8;
  const p=departure&&offset>=120?factoryPoint(m,f,Math.cos(angle)*ring,Math.sin(angle)*ring)
   :factoryPoint(m,f,side*(departure?9+column*7:12+column*12),direction*(departure?23+row*7:30+row*12));
  if(visit.rejectedWaitPoints?.includes(p.x+','+p.y))continue;
  if(!m.inBounds(p.x,p.y)||terrain.levelAt?.(p.x,p.y)!==level||!terrainSegmentClear(terrain,m.field,f,p)||!terrainSegmentClear(terrain,m.field,door,p))continue;
  if(claimed.some(other=>Math.hypot(p.x-other.x,p.y-other.y)<scale*10))continue;
  // Waiting is outside the building, on its connected level; neither the
  // radius of service nor the visual terrain admits a bay across a ridge.
  const pose={...p,kind:u.kind,heading:f.rotation??0};
  if(!vehicleGroundSafe(vehicleEnvelope(pose,scale,m.field),.52))continue;
  if(!m.nav.clearSolidSweep(vehicleSweep(pose,pose,scale),m.nav.nearbySolids(p,scale*6)))continue;
  if(departure&&!exitSpace(p))continue;
  point=p;break;
 }
 const previous=visit.waitingPoint??u.routeOrder?.destination;
 if(['approach','departure'].includes(visit.phase)&&previous
  &&(!point||Math.hypot(previous.x-point.x,previous.y-point.y)>.01)){
  resetDrive(u);delete visit.retryAt;
  m.emit('navigation-retreat-destination-rejected',{unit:u.id,factory:f.id,destination:previous,replacement:point,reason:'outside-factory-apron'});
 }
 visit.waitGeometry=geometry;visit.waitingPoint=point;visit.waitOccupancy=point?null:occupancy;
 if(departure&&!point)visit.retryAt=m.state.time+.25;
 return point;
}
function createVisit(m,u,f){
 const used=new Set(factoryVisitors(m,f).map(v=>v.factoryVisit.slot));let slot=0;
 for(;slot<128;slot++){
  const point=waitPoint(m,f,slot);
  if(!used.has(slot)&&m.nav.lineClear(point,point)
   &&m.state.units.every(v=>v===u||v.hp<=0||insideFactory(v)||Math.hypot(v.x-point.x,v.y-point.y)>m.config.worldScale*5.5))break;
 }
 if(slot===128){slot=0;while(used.has(slot))slot++;}
 resetDrive(u);
 return u.factoryVisit={garageVersion:2,factoryId:f.id,phase:'approach',slot,queued:m.state.time,factory:{id:f.id,x:f.x,y:f.y,rotation:f.rotation,halfWidth:f.halfWidth,halfDepth:f.halfDepth,kind:f.kind,owner:f.owner,completed:true}};
}
function* driveTo(m,u,goal,dt,current){
 if(!u.path.length&&!u.detour&&!u.yieldReturn&&Math.hypot(u.x-goal.x,u.y-goal.y)<2){u.driveSpeed=0;return true;}
 if(!u.path.length&&!u.detour&&m.state.time>=(u.factoryVisit.retryAt??0)){
  navigationDecision(u,'GLOBAL_REPLAN','factory-route-pending',null,'find-factory-route');
  // Exact endpoints use a checked connector from the nearby grid. A two-unit
  // candidate radius can exclude every grid node for an otherwise legal bay.
  const path=yield* m.vehiclePathSteps(u,goal,{fallback:false,maxGoalDistance:.01});if(!current())return false;
  if(path){u.path=path;u.task={type:'move',...goal};u.routeOrder={revision:2,type:'retreat',request:{...goal},destination:{...goal}};}
  else {
   const visit=u.factoryVisit;visit.retryAt=m.state.time+.25;
   if(['approach','departure'].includes(visit.phase)){
    (visit.rejectedWaitPoints??=[]).push(goal.x+','+goal.y);delete visit.waitingPoint;delete visit.waitGeometry;
   }else if(visit.phase==='gate'){
    visit.phase='approach';visit.gateRetryAt=m.state.time+.5;
   }
  }
 }
 if(u.path.length||u.detour||u.yieldReturn)yield* m.moveSteps(u,dt);
 else navigationDecision(u,'BLOCKED','factory-route-unavailable',null,'retry-factory-route');
 return current()&&!u.path.length&&!u.detour&&!u.yieldReturn&&Math.hypot(u.x-goal.x,u.y-goal.y)<2;
}
function* dockStep(m,u,f,goal,heading,dt,current){
 const scale=m.config.worldScale,turn=angleDelta(heading,u.heading),distance=Math.hypot(goal.x-u.x,goal.y-u.y);
 const angle=u.heading+Math.sign(turn)*Math.min(Math.abs(turn),dt*(vehicleDynamics(u).pivotRate??.85));
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
 // Old saves may contain a repaired car at the former front exit. Feed it
 // through the hall once, instead of making it circle through the entry queue.
 if(visit.garageVersion!==2){
  visit.garageVersion=2;
  const a=f.rotation??0,along=-(u.x-f.x)*Math.sin(a)+(u.y-f.y)*Math.cos(a);
  if(visit.phase==='departure'&&along<0){
   for(const other of factoryVisitors(m,f))if(other!==u&&other.factoryVisit.phase==='gate'){other.factoryVisit.phase='waiting';resetDrive(other);}
   visit.phase='entering';resetDrive(u);delete visit.waitingPoint;delete visit.waitGeometry;
  }else if(['approach','waiting','gate'].includes(visit.phase)){
   visit.phase='approach';resetDrive(u);delete visit.waitingPoint;delete visit.waitGeometry;
  }
 }
 const current=()=>u.hp>0&&u.factoryVisit===visit;
 if(f.id!==visit.factoryId){resetDrive(u);delete u.factoryVisit;return false;}
 const door=factoryPoint(m,f,0,-18),exit=factoryPoint(m,f,0,18),bay=factoryPoint(m,f,0,-3);
 if(!f.hp&&['approach','waiting','gate'].includes(visit.phase)){resetDrive(u);delete u.factoryVisit;return false;}
 const owner=gateOwner(m,f),outgoing=exitOwner(m,f);
 if(visit.phase==='approach'&&owner===u){visit.phase='gate';resetDrive(u);}
 if(visit.phase==='approach'){
  const point=factoryWaitingPoint(m,f,u);
  if(!point){u.driveSpeed=0;if(retreat){retreat.status='blocked';retreat.service='waiting-apron-space';}return true;}
  if(retreat){retreat.status='moving';retreat.phase='home';retreat.destination=point;}
  if(yield* driveTo(m,u,point,dt,current)){visit.phase='waiting';resetDrive(u);}
 }
 if(visit.phase==='waiting'){
  if(retreat){retreat.status='servicing';retreat.service='waiting-entry';}
  navigationDecision(u,'WAITING_RESERVATION','factory-entrance-occupied',owner?.id??null,'enter-factory');
  if(owner===u){visit.phase='gate';resetDrive(u);}
 }
 if(visit.phase==='gate'){
  if(retreat){retreat.status='moving';retreat.destination=door;}
  // Finish the accepted approach while a replacement is being searched, but
  // do not hide its live pose inside the factory before that order resolves.
  if((yield* driveTo(m,u,door,dt,current))&&!u.proposedOrder){visit.phase='entering';resetDrive(u);}
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
  navigationDecision(u,'IDLE','inside-factory',null,u.hp<u.maxHp?'wait-for-repair':'leave-factory');
  if((u.hp>=u.maxHp||f.hp<=0)&&outgoing===u){
   const visible={...u,factoryVisit:{...visit,phase:'leaving'}};
   if(clearOfVehicles(visible,visible,m.state.units.filter(v=>v!==u&&!insideFactory(v)),m.config.worldScale,true,visible,m.field)){visit.phase='leaving';resetDrive(u);}
  }
 }
 if(visit.phase==='leaving'){
  if(retreat){retreat.status='servicing';retreat.service='leaving';}
  if(yield* dockStep(m,u,f,exit,f.rotation??0,dt,current)){
   resetDrive(u);visit.phase='departure';delete visit.waitingPoint;delete visit.waitGeometry;
  }
 }
 if(visit.phase==='departure'){
  const park=factoryWaitingPoint(m,f,u);
  if(!park){u.driveSpeed=0;if(retreat)retreat.service='waiting-apron-space';return true;}
  if(yield* driveTo(m,u,park,dt,current)){
   resetDrive(u);delete u.factoryVisit;delete f.garageExit;
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
