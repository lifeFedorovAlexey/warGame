import {vehicleEnvelope,vehicleSweep,vehicleGroundSafe} from './vehicle-collision.js';
import {canFillBefore,reuseArrivalPath} from './arrival-slots.js';
import {projectedTrafficView} from './traffic-context.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const incoming=u=>['approach','waiting','gate'].includes(u.factoryVisit?.phase);
const movable=u=>!u.pendingOrder&&!u.proposedOrder&&!u.detour&&!u.yieldReturn&&!u.jointTraffic&&!u.traffic&&!u.trafficHold&&!u.passage;
const candidates=new WeakMap(),validity=new WeakMap(),failures=new WeakMap();
export function factoryPoint(m,f,x,y){const a=f.rotation??0,c=Math.cos(a),s=Math.sin(a),scale=m.config.worldScale;return{x:f.x+(x*c-y*s)*scale,y:f.y+(x*s+y*c)*scale};}
export function terrainSegmentClear(terrain,field,a,b){
  if(terrain.clearSegment)return terrain.clearSegment(a,b);
  const steps=Math.max(1,Math.ceil(distance(a,b)/Math.min(8,(field.cellMetres??32)/4)));
  for(let i=0;i<=steps;i++)if(!terrain(a.x+(b.x-a.x)*i/steps,a.y+(b.y-a.y)*i/steps))return false;
  return true;
}
function geometryKey(m,f){return [f.x,f.y,f.rotation??0,m.config.worldScale].join(':');}
function staticPosition(m,f,unit,point){
  let checks=validity.get(point);
  if(!checks||checks.nav!==m.nav||checks.revision!==m.nav.topologyRevision){checks={nav:m.nav,revision:m.nav.topologyRevision,kinds:new Map()};validity.set(point,checks);}
  if(checks.kinds.has(unit.kind))return checks.kinds.get(unit.kind);
  const scale=m.config.worldScale,terrain=m.nav.terrainAllowed,door=factoryPoint(m,f,0,-18),pose={...unit,...point,heading:f.rotation??0};
  const valid=m.inBounds(point.x,point.y)&&terrain.levelAt?.(point.x,point.y)===terrain.levelAt?.(f.x,f.y)
    &&terrainSegmentClear(terrain,m.field,f,point)&&terrainSegmentClear(terrain,m.field,door,point)
    &&vehicleGroundSafe(vehicleEnvelope(pose,scale,m.field),.52)
    &&m.nav.clearSolidSweep(vehicleSweep(pose,pose,scale),m.nav.nearbySolids(point,scale*6));
  checks.kinds.set(unit.kind,valid);
  if(!valid)point.blockedRevision=m.nav.topologyRevision;
  return valid;
}
function queueCandidates(m,f,geometry){
  let cached=candidates.get(f);if(cached?.geometry===geometry)return cached.points;
  const points=[],door=factoryPoint(m,f,0,-18),rows=Math.ceil(m.field.extent/(m.config.worldScale*10));
  for(let row=0;row<rows;row++)for(let column=0;column<3;column++)for(const side of [-1,1])
    points.push(factoryPoint(m,f,side*(9+column*10),-23-row*10));
  points.sort((a,b)=>distance(a,door)-distance(b,door));
  candidates.set(f,{geometry,points});return points;
}

// Save the actual points on the factory. A changed headcount grows/shrinks
// the tail; it never moves or renumbers the positions still being used.
export function* prepareFactoryQueue(m,f,visitors){
  const geometry=geometryKey(m,f),world=m.state;
  let queue=f.repairWaiting;
  if(queue?.geometry!==geometry){
    queue=f.repairWaiting={geometry,points:[],scan:0};
    for(const u of visitors)if(incoming(u)){delete u.factoryVisit.waitingPoint;delete u.factoryVisit.waitSlot;}
  }
  const assigned=m.state.units.filter(u=>u.hp>0&&u.owner===f.owner&&(incoming(u)&&u.factoryVisit.factoryId===f.id
    ||!u.factoryVisit&&u.combatRetreat?.home?.id===f.id&&u.combatRetreat.service!=='complete'));
  const pinned=visitors.filter(u=>u.factoryVisit.phase==='waiting'&&Number.isInteger(u.factoryVisit.waitSlot))
    .reduce((last,u)=>Math.max(last,u.factoryVisit.waitSlot+1),0);
  // Construction can obstruct an individual point. Keep every other point
  // and append replacement capacity instead of regenerating the whole apron.
  const blocked=queue.points.filter(p=>p.blockedRevision===m.nav.topologyRevision).length;
  const count=Math.max(assigned.length+(assigned.length?blocked:0),pinned);
  if(queue.points.length>count){queue.points.length=count;queue.scan=queue.points.at(-1)?.candidateIndex+1||0;}
  if(queue.points.length>=count)return queue;
  const options=queueCandidates(m,f,geometry),unit=assigned[0]??visitors[0];if(!unit)return queue;
  while(queue.points.length<count&&queue.scan<options.length){
    yield;
    if(m.state!==world||f.repairWaiting!==queue||geometryKey(m,f)!==geometry||f.hp<=0)return null;
    const candidateIndex=queue.scan++,point={...options[candidateIndex],candidateIndex};
    if(staticPosition(m,f,unit,point))queue.points.push(point);
  }
  return queue;
}
function assignPoint(m,unit,point,index,path){
  const visit=unit.factoryVisit;visit.waitSlot=index;visit.waitingPoint={x:point.x,y:point.y};
  delete visit.retryAt;delete visit.rejectedWaitPoints;
  unit.path=path??[];unit.task={type:'move',x:point.x,y:point.y};
  unit.routeOrder={revision:2,type:'retreat',request:{x:point.x,y:point.y},destination:{x:point.x,y:point.y}};
  delete unit.driveWatch;delete unit.failedArcs;
  failures.delete(unit);
  if(unit.combatRetreat)unit.combatRetreat.destination={x:point.x,y:point.y};
}
export function* factoryWaitingPoint(m,f,unit,current){
  const visit=unit.factoryVisit,queue=f.repairWaiting,scale=m.config.worldScale;
  let old=visit.waitingPoint;
  if(!queue)return null;
  if(old&&Number.isInteger(visit.waitSlot)&&!staticPosition(m,f,unit,queue.points[visit.waitSlot])){
    delete visit.waitingPoint;delete visit.waitSlot;unit.path=[];old=null;
  }
  // Finish an accepted leg before looking for a nearer vacancy.
  const door=factoryPoint(m,f,0,-18);
  if(old&&distance(unit,old)>scale*3&&distance(unit,door)>distance(old,door)+scale*2)return old;
  if(!movable(unit))return old??null;
  const oldIndex=Number.isInteger(visit.waitSlot)?visit.waitSlot:queue.points.length;
  const relevant=new Set(m.nearbyUnits(unit,scale*24).filter(other=>distance(unit,other)<=scale*24));
  for(const other of m.state.units)if(other.hp>0&&other.factoryVisit?.waitingPoint&&distance(unit,other.factoryVisit.waitingPoint)<=scale*24)relevant.add(other);
  const key=JSON.stringify([m.nav.topologyRevision,queue.points.length,unit.x,unit.y,unit.heading,oldIndex,visit.rejectedWaitPoints,
    [...relevant].sort((a,b)=>a.id.localeCompare(b.id)).map(u=>[u.id,u.x,u.y,u.heading,u.hp>0,u.factoryVisit?.phase,u.factoryVisit?.waitingPoint,
      u.pendingOrder?.revision,!!u.proposedOrder,!!u.detour,!!u.yieldReturn,!!u.jointTraffic,!!u.traffic,!!u.trafficHold])]);
  const failure=failures.get(unit);if(failure?.key===key&&failure.queue===queue)return old??null;
  for(let index=0;index<oldIndex;index++){
    if(index%8===0)yield;
    if(!current()||f.repairWaiting!==queue||!movable(unit))return old??null;
    const point=queue.points[index];
    if(old&&distance(unit,point)>scale*16)continue;
    if(visit.rejectedWaitPoints?.includes(point.x+','+point.y)||!staticPosition(m,f,unit,point))continue;
    const claims=m.state.units.filter(other=>other!==unit&&other.hp>0&&other.factoryVisit?.phase==='waiting'
      &&other.factoryVisit.waitingPoint&&distance(other.factoryVisit.waitingPoint,point)<scale*5.3);
    if(claims.length>1)continue;
    const donor=claims[0];
    if(donor&&(!old||donor.factoryVisit.factoryId!==f.id||!movable(donor)||!canFillBefore(unit,donor,point,scale)))continue;
    const pose={...unit,x:point.x,y:point.y,heading:f.rotation??0};
    if(!m.vehicleMotionClear(unit,pose,pose))continue;
    let path=null,donorPath=null;
    if(old){
      // A local advance must have a free swept connector; the regular car
      // controller, not this assignment, performs every physical movement.
      if(!m.vehicleMotionClear(unit,unit,pose))continue;
      path=[{x:point.x,y:point.y}];
    }
    if(donor){
      const view=projectedTrafficView(m,new Map([[unit.id,pose]])),back={...donor,...old,heading:f.rotation??0};
      if(!staticPosition(m,f,donor,queue.points[oldIndex])||!view.vehicleMotionClear(donor,back,back))continue;
      donorPath=reuseArrivalPath(m,donor,old,scale);if(!donorPath?.length)continue;
    }
    assignPoint(m,unit,point,index,path);
    if(donor)assignPoint(m,donor,old,oldIndex,donorPath);
    m.trafficCoordinator?.intentChanged();
    m.recordTrafficDiagnostic?.({event:'factory-queue-filled',ids:[unit.id,...(donor?[donor.id]:[])],factory:f.id,slot:index});
    return visit.waitingPoint;
  }
  if(current())failures.set(unit,{key,queue});
  if(old)return old;
  return null;
}
