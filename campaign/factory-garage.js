import {navigationDecision} from './navigation-state.js';
import {vehicleEnvelope,vehicleSweep,clearOfVehicles,vehicleGroundSafe,footprintSupport} from './vehicle-collision.js';
import {angleDelta} from './builder-kinematics.js';
import {vehicleDynamics} from './vehicle-dynamics.js';
import {CommandPlanner} from './command-planner.js';
import {retreatReturnOrder} from './factory-repair.js';
import {corridorBlocker,invalidateTrafficCorridors} from './traffic-corridor.js';

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
function exitOwner(m,f){
 const visitors=factoryVisitors(m,f),current=visitors.find(u=>['leaving','departure'].includes(u.factoryVisit.phase));
 const ready=visitors.filter(u=>insideFactory(u)&&(u.hp>=u.maxHp||f.hp<=0)).sort((a,b)=>a.factoryVisit.arrived-b.factoryVisit.arrived);
 const owner=current??ready[0];f.garageExit=owner?.id;return owner;
}
function terrainSegmentClear(terrain,field,a,b){
 if(terrain.clearSegment)return terrain.clearSegment(a,b);
 // The slope-grid navigator exposes a point predicate; authored level maps
 // additionally expose exact wall/segment intersections. Honour either map.
 const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/Math.min(8,(field.cellMetres??32)/4)));
 for(let i=0;i<=steps;i++)if(!terrain(a.x+(b.x-a.x)*i/steps,a.y+(b.y-a.y)*i/steps))return false;
 return true;
}
function factoryExitParkingPoint(m,f,u){
 const visit=u.factoryVisit,scale=m.config.worldScale,terrain=m.nav.terrainAllowed;
 const direction=visit.frontDeparture?-1:1,door=factoryPoint(m,f,0,direction*18);
 const geometry=[m.nav.topologyRevision,f.x,f.y,f.rotation??0,'exit',direction].join(':');
 const poseAt=p=>({...u,...p,heading:f.rotation??0});
 const exitSpace=p=>{const pose=poseAt(p);return clearOfVehicles(u,pose,m.state.units,scale,false,pose,m.field);};
 if(visit.waitGeometry===geometry&&visit.waitingPoint&&(u.path.length||exitSpace(visit.waitingPoint)))return visit.waitingPoint;
 if(!visit.waitingPoint&&m.state.time<(visit.retryAt??0))return null;
 const level=terrain.levelAt?.(f.x,f.y);
 const claimed=m.state.units.filter(other=>other!==u&&other.hp>0&&other.factoryVisit).map(other=>other.factoryVisit.waitingPoint).filter(Boolean);
 const occupancy=JSON.stringify(claimed);
 if(visit.rejectedOccupancy!==occupancy){visit.rejectedOccupancy=occupancy;delete visit.rejectedWaitPoints;}
 let point=null;
 for(let offset=0;offset<248;offset++){
  const index=(visit.slot+offset)%120,side=index%2?1:-1,column=Math.floor(index/2)%3,row=Math.floor(index/6);
  const angle=(offset-120)%16*Math.PI/8,ring=28+Math.floor((offset-120)/16)*8;
  const p=offset>=120?factoryPoint(m,f,Math.cos(angle)*ring,Math.sin(angle)*ring)
   :factoryPoint(m,f,side*(9+column*7),direction*(23+row*7));
  if(visit.rejectedWaitPoints?.includes(p.x+','+p.y))continue;
  if(claimed.some(other=>Math.hypot(p.x-other.x,p.y-other.y)<scale*10))continue;
  if(!m.inBounds(p.x,p.y)||terrain.levelAt?.(p.x,p.y)!==level||!terrainSegmentClear(terrain,m.field,f,p)||!terrainSegmentClear(terrain,m.field,door,p))continue;
  // The parking point must belong to the same connected apron.
  const pose={...p,kind:u.kind,heading:f.rotation??0};
  if(!vehicleGroundSafe(vehicleEnvelope(pose,scale,m.field),.52))continue;
  if(!m.nav.clearSolidSweep(vehicleSweep(pose,pose,scale),m.nav.nearbySolids(p,scale*6)))continue;
  if(!exitSpace(p))continue;
  point=p;break;
 }
 const previous=visit.waitingPoint??u.routeOrder?.destination;
 if(previous&&(!point||Math.hypot(previous.x-point.x,previous.y-point.y)>.01)){
  resetDrive(u);delete visit.retryAt;
  m.emit('navigation-retreat-destination-rejected',{unit:u.id,factory:f.id,destination:previous,replacement:point,reason:'outside-factory-apron'});
 }
 visit.waitGeometry=geometry;visit.waitingPoint=point;
 if(!point)visit.retryAt=m.state.time+.25;
 return point;
}
function createVisit(m,u,f){
 const used=new Set(factoryVisitors(m,f).map(v=>v.factoryVisit.slot));let slot=0;
 while(used.has(slot))slot++;
 resetDrive(u);
 return u.factoryVisit={garageVersion:2,factoryId:f.id,phase:'approach',slot,queued:m.state.time,factory:{id:f.id,x:f.x,y:f.y,rotation:f.rotation,halfWidth:f.halfWidth,halfDepth:f.halfDepth,kind:f.kind,owner:f.owner,completed:true}};
}
function* driveTo(m,u,goal,dt,current,approaching=false){
 if(!u.path.length&&!u.detour&&!u.yieldReturn&&Math.hypot(u.x-goal.x,u.y-goal.y)<2){u.driveSpeed=0;return true;}
 if(!u.path.length&&!u.detour&&m.state.time>=(u.factoryVisit.retryAt??0)){
  navigationDecision(u,'GLOBAL_REPLAN','factory-route-pending',null,'find-factory-route');
  // Exact endpoints use a checked connector from the nearby grid. A two-unit
  // candidate radius can exclude every grid node for an otherwise legal bay.
  // A parked car can block the goal raster. An inbound route may still lead
  // up to it, since the live swept controller keeps physical separation.
  const path=yield* m.vehiclePathSteps(u,goal,{fallback:approaching,maxGoalDistance:.01});if(!current())return false;
  if(path){u.path=path;u.task={type:'move',...goal};u.routeOrder={revision:2,type:'retreat',request:{...goal},destination:{...goal}};}
  else {
   const visit=u.factoryVisit;visit.retryAt=m.state.time+.25;
   if(visit.phase==='departure'){
    (visit.rejectedWaitPoints??=[]).push(goal.x+','+goal.y);delete visit.waitingPoint;delete visit.waitGeometry;
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
 const reversing=(goal.x-u.x)*Math.sin(heading)-(goal.y-u.y)*Math.cos(heading)>0;
 u.x=next.x;u.y=next.y;u.heading=next.heading;u.driveSpeed=travel/Math.max(dt,.001);
 u.wheelDistance=(u.wheelDistance??0)+(reversing?-travel:travel);u.reversing=reversing;u.steering=0;
 return distance<.2*scale&&Math.abs(turn)<.05;
}
function entryCorridor(u,bay,heading){
 const start={x:u.x,y:u.y,heading:u.heading,kind:u.kind},rotated={...start,heading},end={...bay,heading,kind:u.kind};
 return [{from:start,to:rotated},{from:rotated,to:end}];
}
function checkedEntryCorridor(m,u,f,bay,blockers){
 const scale=m.config.worldScale,a=f.rotation??0,c=Math.cos(a),s=Math.sin(a);
 const lateral=(u.x-f.x)*c+(u.y-f.y)*s,forward=(u.y-f.y)*c-(u.x-f.x)*s;
 if(forward> -f.halfDepth||forward< -26*scale)return;
 const heading=Math.atan2(u.x-bay.x,bay.y-u.y);
 if(Math.abs(angleDelta(heading,a))>.5)return;
 const atWall=lateral*(f.halfDepth-3*scale)/(-forward-3*scale);
 const solids=m.nav.nearbySolids(u,Math.hypot(bay.x-u.x,bay.y-u.y)+scale*6).filter(b=>b.id!==f.id);
 if(!terrainSegmentClear(m.nav.terrainAllowed,m.field,u,bay))return;
 const backwards=heading+Math.PI;
 const headings=Math.abs(angleDelta(heading,u.heading))>Math.PI/2?[backwards,heading]:[heading,backwards];
 for(const orientation of headings){
  const corridor=entryCorridor(u,bay,orientation),[{from:start,to:rotated},{to:end}]=corridor;
  // Fit the projected body through the shutter before claiming its sweep.
  if(Math.abs(atWall)+footprintSupport(vehicleEnvelope(rotated,scale,m.field),c,s)>2.8*scale)continue;
  const turn=vehicleSweep(u,rotated,scale,m.field),drive=vehicleSweep(rotated,end,scale,m.field);
  if(!m.nav.clearSolidSweep(turn,solids)||!m.nav.clearSolidSweep(drive,solids)
   ||corridorBlocker(m,u,start,rotated)||corridorBlocker(m,u,rotated,end))continue;
  if(clearOfVehicles(u,rotated,m.state.units,scale,false,u,m.field,blockers,turn)
   &&clearOfVehicles(u,end,m.state.units,scale,false,rotated,m.field,blockers,drive))return corridor;
 }
}
export function tryEnterFactory(m,u,f,blockers){
 const visit=u.factoryVisit;
 if(f?.kind!=='factory'||f.owner!==u.owner||!f.completed||!f.hp
  ||visit?.phase!=='approach'||u.proposedOrder||u.pendingOrder||u.detour||u.yieldReturn||u.jointTraffic||u.traffic
  ||u.trafficHold||u.overlapRecovery&&u.overlapRecovery.active!==false||m.state.time<(visit.entryRetryAt??0))return false;
 const bay=factoryPoint(m,f,0,-3),scale=m.config.worldScale;
 if(Math.hypot(u.x-bay.x,u.y-bay.y)>scale*26
  ||factoryVisitors(m,f).some(other=>other.factoryVisit.phase==='entering'))return false;
 const corridor=checkedEntryCorridor(m,u,f,bay,blockers);
 if(!corridor)return false;
 visit.phase='entering';visit.entryHeading=corridor[1].to.heading;visit.entryCorridor=corridor;
 f.garageGate=u.id;resetDrive(u);invalidateTrafficCorridors(m);
 return true;
}
export function* updateFactoryVisit(m,u,f,dt){
 const visit=u.factoryVisit??createVisit(m,u,f),retreat=u.combatRetreat;
 const door=factoryPoint(m,f,0,-18),exit=factoryPoint(m,f,0,18),bay=factoryPoint(m,f,0,-3);
 // Migrate cars at the former front exit through the hall if the return
 // sweep is free. Otherwise finish their original departure from the front.
 if(visit.garageVersion!==2){
  visit.garageVersion=2;
  const a=f.rotation??0,along=-(u.x-f.x)*Math.sin(a)+(u.y-f.y)*Math.cos(a);
  if(visit.phase==='departure'&&along<0){
   const heading=Math.abs(angleDelta(a,u.heading))>Math.PI/2?a+Math.PI:a;
   const corridor=entryCorridor(u,bay,heading),[{to:rotated},{to:end}]=corridor;
   const scale=m.config.worldScale;
   if(clearOfVehicles(u,rotated,m.state.units,scale,false,u,m.field)
    &&clearOfVehicles(u,end,m.state.units,scale,false,rotated,m.field)){
    visit.phase='entering';visit.entryHeading=heading;visit.entryCorridor=corridor;
    invalidateTrafficCorridors(m);
   }else visit.frontDeparture=true;
   resetDrive(u);delete visit.waitingPoint;delete visit.waitGeometry;
  }else if(['approach','waiting','gate'].includes(visit.phase)){
   visit.phase='approach';resetDrive(u);delete visit.waitingPoint;delete visit.waitGeometry;
  }
 }
 const current=()=>u.hp>0&&u.factoryVisit===visit;
 if(f.id!==visit.factoryId){resetDrive(u);delete u.factoryVisit;return false;}
 if(!f.hp&&['approach','waiting','gate'].includes(visit.phase)){resetDrive(u);delete u.factoryVisit;return false;}
 const entering=factoryVisitors(m,f).find(other=>other.factoryVisit.phase==='entering');
 f.garageGate=entering?.id;
 const outgoing=exitOwner(m,f);
 if(['approach','waiting','gate'].includes(visit.phase)){
  if(visit.phase==='waiting'||visit.waitGeometry||visit.waitingPoint){
   resetDrive(u);delete visit.retryAt;delete visit.waitingPoint;delete visit.waitGeometry;
   delete visit.waitOccupancy;delete visit.rejectedOccupancy;delete visit.rejectedWaitPoints;
  }
  visit.phase='approach';
  delete visit.gateRetryAt;
  if(retreat){retreat.status='moving';retreat.phase='home';retreat.destination=door;}
  // Finish the accepted approach while a replacement is being searched, but
  // do not hide its live pose inside the factory before that order resolves.
  const clearApron=!entering&&Math.hypot(u.x-door.x,u.y-door.y)<2
   &&u.navigation?.waitSeconds>=.5&&m.state.time>=(f.garageClearAt??0);
  const blockers=clearApron?new Set():undefined;
  if(!tryEnterFactory(m,u,f,blockers)&&(yield* driveTo(m,u,door,dt,current,true))){
   if(entering)navigationDecision(u,'YIELDING','factory-door-in-use',entering.id,'follow-through-door');
   else if(blockers?.size&&m.clearFactoryApronSteps){
    f.garageClearAt=m.state.time+1;
    navigationDecision(u,'BLOCKED','factory-entry-clearance',[...blockers].map(other=>other.id),'clear-doorway');
    yield* m.clearFactoryApronSteps(f,{...u,heading:f.rotation??0},blockers,current,true);
   }
  }
 }
 if(visit.phase==='entering'){
  if(retreat){retreat.status='servicing';retreat.service='entering';}
  const {x,y,heading}=u;
  if(yield* dockStep(m,u,f,bay,visit.entryHeading??f.rotation??0,dt,current)){
   visit.phase='inside';visit.arrived=m.state.time;delete visit.entryCorridor;delete visit.entryBlockedAt;
   resetDrive(u);delete f.garageGate;
   m.emit('factory-admitted',{unit:u.id,factory:f.id});
  }else if(current()&&visit.entryCorridor){
   if(x!==u.x||y!==u.y||heading!==u.heading)delete visit.entryBlockedAt;
   else {
    visit.entryBlockedAt??=m.state.time;
    const a=f.rotation??0,along=(u.y-f.y)*Math.cos(a)-(u.x-f.x)*Math.sin(a);
    // A new obstruction can invalidate a checked approach while still
    // outside. Release the corridor so traffic can clear it and retry.
    if(along<=-f.halfDepth&&m.state.time-visit.entryBlockedAt>=.5){
     visit.phase='approach';visit.entryRetryAt=m.state.time+.5;
     delete visit.entryCorridor;delete visit.entryHeading;delete visit.entryBlockedAt;delete f.garageGate;
    }
   }
  }
 }else if(insideFactory(u)){
  u.driveSpeed=0;
  if(retreat)retreat.status='servicing';
  navigationDecision(u,'IDLE','inside-factory',null,u.hp<u.maxHp?'wait-for-repair':'leave-factory');
  // Entry and departure share the interior turn at the bay. Let a vehicle
  // already in that turn clear it before bringing another hull out of storage.
  if((u.hp>=u.maxHp||f.hp<=0)&&outgoing===u&&!entering){
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
  const park=factoryExitParkingPoint(m,f,u);
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
