import {SCAV_PROFILES} from './scav-unit-profiles.js';
import {vehicleSizeScale} from './vehicle-dynamics.js';

const modular = [
  [1.177, -.008, 2.417, .75, .75],
  [1.177, .065, 2.138, 1.875, .827],
];
const fieldCar = [[1.03, -.075, 2.18, .43, .47], [.96, -.06, 2.10, 1.48, .78]];
// Search rollouts create many short-lived pose objects, often at the same
// physical position (braking, stopped controls and repeated candidate prefixes).
// Cache geometry by exact pose values rather than retaining one WeakMap entry
// per temporary object. Hash collisions only evict; equality proves every hit.
const envelopeCache = new Array(16384);
const liveEnvelopes = new WeakMap();
export const collisionStatistics={queries:0,axisSeparated:0,penetrationQueries:0,poseGapCacheHits:0,radiusSeparated:0};
const exactPoseGaps=new WeakMap(),solidEnvelopes=new WeakMap();
const thresholdPoseGaps=new WeakMap();
const skin = .055;
// Owner-requested close-passing tolerance for every vehicle assembly.
// Rendering keeps the full model size; people keep their existing footprint.
export const VEHICLE_COLLISION_SCALE = .9;
export const vehicleLocalBoxes = kind => SCAV_PROFILES[kind]?.boxes ?? (kind === 'command' || kind === 'raider' ? fieldCar : modular);
// XY extrema measured from the rendered LOD0 chassis/body meshes, before the
// instance scale and the common collision reduction below.
const modelBounds={
 modular:[-1.161099911,-2.410000086,1.161099911,2.394432306],
 command:[-.94,-2.255500078,.94,2.108999968],raider:[-.94,-2.095000029,.94,2.108999968],
 'scav-zaporozhets':[-.865,-1.860000014,.865,2.010000001],
 'scav-firetruck':[-1.350000024,-3.664999962,1.350000024,3.75],
 'scav-bus':[-1.375,-3.759999991,1.375,3.775000095]
};
const dimensions=new Map();
function localFootprint(kind){
 let result=dimensions.get(kind);if(result)return result;
 let bounds=modelBounds[kind]??modelBounds.modular;
 const ellipse=!SCAV_PROFILES[kind]?.infantry;
 if(!ellipse){const boxes=vehicleLocalBoxes(kind);bounds=[-Math.max(...boxes.map(b=>b[0])),Math.min(...boxes.map(b=>b[1]-b[2])),Math.max(...boxes.map(b=>b[0])),Math.max(...boxes.map(b=>b[1]+b[2]))];}
 const factor=vehicleSizeScale(kind),[left,back,right,front]=bounds;
 const collisionScale=ellipse?VEHICLE_COLLISION_SCALE:1;
 result={ellipse,x:(left+right)*factor/2,y:(back+front)*factor/2,width:(right-left)*factor/2*collisionScale,depth:(front-back)*factor/2*collisionScale};
 dimensions.set(kind,result);return result;
}
export function vehicleRadiusBound(kind,scale){
 const p=localFootprint(kind);
 return (Math.hypot(p.x,p.y)+(p.ellipse?Math.max(p.width,p.depth):Math.hypot(p.width,p.depth)))*scale;
}
// Death releases driving space; retained visual wrecks are not traffic obstacles.
export const vehicleObstacle = unit => unit.hp > 0&&unit.factoryVisit?.phase!=='inside';
const alliedVehicles=(a,b)=>a?.owner==='rai'&&b?.owner==='rai'&&!SCAV_PROFILES[a.kind]?.infantry&&!SCAV_PROFILES[b.kind]?.infantry;
const factoryTransfer=u=>{
 const phase=u.factoryVisit?.phase;
 return phase==='approach'||phase==='waiting'||phase==='gate'||phase==='entering'||phase==='inside'||phase==='leaving'||phase==='departure';
};
export const jamPassThroughAllowed=(a,b)=>alliedVehicles(a,b)&&!factoryTransfer(a)&&!factoryTransfer(b);
const hasPassage=(a,b)=>a.trafficPassThrough?.revision===a.commandRevision
 &&a.trafficPassThrough?.pairs.some(pair=>pair.id===b.id);
export function trafficCollisionRequired(a,b){
 if(a?.factoryVisit?.phase==='inside'||b?.factoryVisit?.phase==='inside')return false;
 if(!alliedVehicles(a,b))return true;
 return !(hasPassage(a,b)||hasPassage(b,a))||factoryTransfer(a)||factoryTransfer(b);
}

export function vehicleEnvelope(unit, scale, field) {
 const heading=unit.heading??0,kind=unit.kind,x=unit.x,y=unit.y;
 // Named live entities keep their last envelope even if temporary forecasts
 // evict its hash slot. Anonymous integration poses use the bounded cache.
 if(unit.id){const live=liveEnvelopes.get(unit);
  if(live&&live.poseX===x&&live.poseY===y&&live.heading===heading&&live.scale===scale&&live.kind===kind)return live;}
 let hash=Math.imul(Math.floor(x*256),0x9e3779b1)^Math.imul(Math.floor(y*256),0x85ebca6b)^Math.imul(Math.floor(heading*4096),0xc2b2ae35);
 hash=Math.imul(hash^(hash>>>16),0x7feb352d);const slot=(hash^(hash>>>15))&(envelopeCache.length-1),entry=envelopeCache[slot];
 if(entry&&entry.poseX===x&&entry.poseY===y&&entry.heading===heading&&entry.scale===scale&&entry.kind===kind){if(unit.id)liveEnvelopes.set(unit,entry);return entry;}
 const p=localFootprint(kind),c=Math.cos(heading),s=Math.sin(heading);
 const envelope={x:x+(p.x*c-p.y*s)*scale,y:y+(p.x*s+p.y*c)*scale,
  width:p.width*scale,depth:p.depth*scale,c,s,ellipse:p.ellipse,pitch:0,roll:0,poseX:x,poseY:y,heading,scale,kind,
  boundingRadius:(p.ellipse?Math.max(p.width,p.depth):Math.hypot(p.width,p.depth))*scale};
 envelopeCache[slot]=envelope;if(unit.id)liveEnvelopes.set(unit,envelope);return envelope;
}
export function footprintSupport(shape,x,y){
 if(shape.radius!==undefined)return shape.radius*Math.hypot(x,y);
 const a=shape.c*x+shape.s*y,b=shape.c*y-shape.s*x;
 return shape.ellipse?Math.hypot(shape.width*a,shape.depth*b):shape.width*Math.abs(a)+shape.depth*Math.abs(b);
}
// Exact support of an ellipse (not the four axes of its enclosing rectangle).
// A swept shape is the convex hull of sampled poses plus the arc allowance.
export function footprintPoint(shape,x,y){
 if(shape.start){
  let best,projection=-Infinity;
  for(const pose of [shape.start,shape.middle,shape.end]){const p=footprintPoint(pose,x,y),d=p.x*x+p.y*y;if(d>projection){projection=d;best=p;}}
  const length=Math.hypot(x,y)||1;return {x:best.x+x*shape.padding/length,y:best.y+y*shape.padding/length};
 }
 if(shape.radius!==undefined){const length=Math.hypot(x,y)||1;return {x:shape.x+shape.radius*x/length,y:shape.y+shape.radius*y/length};}
 let a=shape.c*x+shape.s*y,b=shape.c*y-shape.s*x;
 if(shape.ellipse){const r=Math.hypot(shape.width*a,shape.depth*b)||1;a=shape.width*shape.width*a/r;b=shape.depth*shape.depth*b/r;}
 else{a=Math.sign(a)*shape.width;b=Math.sign(b)*shape.depth;}
 return {x:shape.x+shape.c*a-shape.s*b,y:shape.y+shape.s*a+shape.c*b};
}
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function penetration(simplex,support){
 collisionStatistics.penetrationQueries++;
 // EPA supplies a signed gap for releasing an overlap from an old save.
 const points=[...simplex,...[[1,0],[0,1],[-1,0],[0,-1]].map(([x,y])=>support(x,y))].sort((a,b)=>a.x-b.x||a.y-b.y);
 const lower=[],upper=[];
 for(const p of points){while(lower.length>1&&cross(lower.at(-2),lower.at(-1),p)<=1e-12)lower.pop();lower.push(p);}
 for(const p of points.slice().reverse()){while(upper.length>1&&cross(upper.at(-2),upper.at(-1),p)<=1e-12)upper.pop();upper.push(p);}
 const polygon=lower.slice(0,-1).concat(upper.slice(0,-1));let best={gap:-Infinity,nx:1,ny:0};
 if(polygon.length<3)return {gap:0,nx:1,ny:0};
 for(let iteration=0;iteration<32;iteration++){
  let edge=-1,distance=Infinity,nx=1,ny=0;
  for(let i=0;i<polygon.length;i++){
   const a=polygon[i],b=polygon[(i+1)%polygon.length],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);if(length<1e-12)continue;
   const x=dy/length,y=-dx/length,d=a.x*x+a.y*y;
   if(d<distance){edge=i;distance=d;nx=x;ny=y;}
  }
  if(edge<0)return {gap:0,nx:1,ny:0};
  const point=support(nx,ny),extent=point.x*nx+point.y*ny;
  if(-extent>best.gap)best={gap:-extent,nx:-nx,ny:-ny};
  if(extent-distance<1e-5||polygon.some(p=>Math.hypot(p.x-point.x,p.y-point.y)<1e-9))return best;
  polygon.splice(edge+1,0,point);
 }
 return best;
}
export function footprintContact(a,b,separation=Infinity){
 collisionStatistics.queries++;
 const ac=a.middle??a,bc=b.middle??b;
 const support=(x,y)=>{const p=footprintPoint(b,x,y),q=footprintPoint(a,-x,-y);return {x:p.x-q.x,y:p.y-q.y};};
 let dx=bc.x-ac.x,dy=bc.y-ac.y,length=Math.hypot(dx,dy);if(length<1e-9){dx=1;dy=0;length=1;}
 let simplex=[support(-dx/length,-dy/length)],closest=simplex[0];
 let best={gap:(closest.x*dx+closest.y*dy)/length,nx:dx/length,ny:dy/length};
 if(best.gap>=separation){collisionStatistics.axisSeparated++;return best;}
 // Bounded GJK. A positive returned gap is always a separating-plane proof.
 // Exhausting the numerical iteration budget never admits an unproved gap.
 for(let iteration=0;iteration<24;iteration++){
  const distance=Math.hypot(closest.x,closest.y);
  if(distance<1e-8)return Number.isFinite(separation)?{gap:-Infinity,nx:best.nx,ny:best.ny}:penetration(simplex,support);
  const nx=closest.x/distance,ny=closest.y/distance,p=support(-nx,-ny),gap=p.x*nx+p.y*ny;
  if(gap>best.gap)best={gap,nx,ny};
  if(best.gap>=separation||distance-gap<1e-6||simplex.some(q=>Math.hypot(q.x-p.x,q.y-p.y)<1e-10))return best;
  simplex.push(p);
  if(simplex.length===3){
   const [u,v,w]=simplex,origin={x:0,y:0},d=cross(u,v,w);
   if(Math.abs(d)>1e-14&&cross(u,v,origin)*d>=0&&cross(v,w,origin)*d>=0&&cross(w,u,origin)*d>=0)return Number.isFinite(separation)?{gap:-Infinity,nx,ny}:penetration(simplex,support);
  }
  let nearest=Infinity,keep,next;
  for(let i=0;i<simplex.length-1;i++)for(let j=i+1;j<simplex.length;j++){
   const u=simplex[i],v=simplex[j],x=v.x-u.x,y=v.y-u.y,den=x*x+y*y,t=den?Math.max(0,Math.min(1,-(u.x*x+u.y*y)/den)):0;
   const point={x:u.x+t*x,y:u.y+t*y},squared=point.x*point.x+point.y*point.y;
   if(squared<nearest){nearest=squared;next=point;keep=t<=0?[u]:t>=1?[v]:[u,v];}
  }
  simplex=keep;closest=next;
 }
 return best;
}
export const footprintGap=(a,b,separation=Infinity)=>footprintContact(a,b,separation).gap;
// These pose envelopes are immutable: movement creates a new envelope. Only
// Keep exact distances and threshold proofs separate. A threshold proof is
// reusable only with the very same threshold, never as an exact distance.
// Both keys are weak so completed search poses cannot accumulate here.
function poseGap(a,b,separation=Infinity){
 if(separation!==Infinity){
  let pairs=thresholdPoseGaps.get(a);const known=pairs?.get(b);
  if(known?.separation===separation){collisionStatistics.thresholdCacheHits=(collisionStatistics.thresholdCacheHits??0)+1;return known.gap;}
  const gap=footprintGap(a,b,separation);
  if(!pairs){pairs=new WeakMap();thresholdPoseGaps.set(a,pairs);}pairs.set(b,{separation,gap});return gap;
 }
 let pairs=exactPoseGaps.get(a);const known=pairs?.get(b);
 if(known!==undefined){collisionStatistics.poseGapCacheHits++;return known;}
 const gap=footprintGap(a,b);
 if(!pairs){pairs=new WeakMap();exactPoseGaps.set(a,pairs);}pairs.set(b,gap);return gap;
}
export function envelopeClearance(a,b,separation=Infinity){
 if(Number.isFinite(separation)){
  const ar=a.boundingRadius??(a.ellipse?Math.max(a.width,a.depth):Math.hypot(a.width,a.depth));
  const br=b.boundingRadius??(b.ellipse?Math.max(b.width,b.depth):Math.hypot(b.width,b.depth));
  const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy),bound=length-ar-br;
  if(bound>=separation){collisionStatistics.radiusSeparated++;return bound;}
  // Same separating plane as the first GJK iteration, without allocating
  // support points/simplexes or pair-cache entries for already clear bodies.
  // This remains a lower bound; close/overlapping shapes use the full solver.
  if(length>1e-9){
   const nx=dx/length,ny=dy/length,gap=length-footprintSupport(a,nx,ny)-footprintSupport(b,nx,ny);
   if(gap>=separation+1e-9){collisionStatistics.centreSeparated=(collisionStatistics.centreSeparated??0)+1;return gap;}
  }
 }
 return poseGap(a,b,separation);
}
export function vehicleClearance(a,b,scale,field,separation=Infinity){
 return envelopeClearance(vehicleEnvelope(a,scale,field),vehicleEnvelope(b,scale,field),separation);
}
export function vehicleSweep(from,to,scale,field){
 const start=vehicleEnvelope(from,scale,field),end=vehicleEnvelope(to,scale,field),delta=(to.heading??0)-(from.heading??0),turn=Math.atan2(Math.sin(delta),Math.cos(delta));
 const middle=vehicleEnvelope({x:(from.x+to.x)/2,y:(from.y+to.y)/2,kind:to.kind??from.kind,heading:(from.heading??0)+turn/2},scale,field);
 const radius=Math.max(vehicleRadiusBound(from.kind,scale),vehicleRadiusBound(to.kind??from.kind,scale));
 // Cover centre curvature and each body's arc between the three samples.
 const padding=.012+.5*Math.hypot(to.x-from.x,to.y-from.y)*Math.tan(Math.abs(turn)/4)+radius*(1-Math.cos(turn/4));
 return {start,middle,end,padding};
}
export const sweepGap=(sweep,obstacle,separation=Infinity)=>footprintGap(sweep,obstacle,separation);
// Translate a pose against a finite reserved sweep. Conservative advancement
// uses the same ellipse distance and returns early on numerical uncertainty.
export function footprintCast(shape,course,length,obstacle,skin=0){
 let travelled=0;
 for(let iteration=0;iteration<24;iteration++){
  const pose={...shape,x:shape.x+course.x*travelled,y:shape.y+course.y*travelled};
  const {gap,nx,ny}=footprintContact(pose,obstacle);
  if(gap<=skin+1e-5)return travelled;
  const closing=course.x*nx+course.y*ny;if(closing<=1e-10)return Infinity;
  travelled+=(gap-skin)/closing;if(travelled>length)return Infinity;
 }
 return travelled;
}

export function sweepAvoidsFootprint(sweep, obstacle, minimum = .1) {
  let box=solidEnvelopes.get(obstacle);
  if(!box||box.x!==obstacle.x||box.y!==obstacle.y||box.width!==obstacle.halfWidth||box.depth!==obstacle.halfDepth){
    box={x:obstacle.x,y:obstacle.y,width:obstacle.halfWidth,depth:obstacle.halfDepth,c:1,s:0};
    solidEnvelopes.set(obstacle,box);
  }
  if (sweepGap(sweep, box, minimum) >= minimum) return true;
  // Saves made with a different footprint can start in penetration. Permit only
  // movement which releases that penetration and never deepens it.
  if(poseGap(sweep.start,box,minimum+sweep.padding)>=minimum+sweep.padding)return false;
  const start = poseGap(sweep.start, box);
  return start < minimum + sweep.padding && sweepGap(sweep,box)>=start-sweep.padding-.001 && poseGap(sweep.middle, box) >= start - .001
    && poseGap(sweep.end, box) > start + .002;
}

// Used when the caller already owns a prepared sweep and one exact envelope.
// Keep penetration recovery identical to the general multi-vehicle query.
export function sweepClearsVehicle(sweep,obstacle,minimum){
  if(sweepGap(sweep,obstacle,minimum)>=minimum)return true;
  if(poseGap(sweep.start,obstacle,minimum+sweep.padding)>=minimum+sweep.padding)return false;
  const initial=poseGap(sweep.start,obstacle);
  if(initial>=minimum+sweep.padding||sweepGap(sweep,obstacle)<initial-sweep.padding-.0005)return false;
  const middle=poseGap(sweep.middle,obstacle),final=poseGap(sweep.end,obstacle);
  if(initial<minimum+sweep.padding&&middle>=initial-.000001&&final>initial+.000001)return true;
  // Legacy parallel interpenetration may retain its side gap until the ends
  // clear. Ground-following pitch and roll slightly vary the projected gap.
  const tolerance=initial<0?.0005:.000001;
  return initial<minimum+sweep.padding&&middle>=initial-tolerance&&final>=initial-tolerance
    &&Math.abs(sweep.start.c*sweep.end.s-sweep.start.s*sweep.end.c)<.000001;
}

export function clearOfVehicles(unit, next, units, scale, strict = false, previous = unit, field, blockers, prepared) {
  const minimum = skin * scale;
  const current = next.kind || !unit?.kind ? next : {...next, kind: unit.kind};
  const before = previous?.kind || !unit?.kind ? previous : {...previous, kind: unit.kind};
  const broadFrom=!strict&&before?before:current;
  const ownRadius=Math.max(vehicleRadiusBound(current.kind,scale),vehicleRadiusBound(broadFrom.kind,scale));
  const angle=(current.heading??0)-(broadFrom.heading??0),turn=Math.atan2(Math.sin(angle),Math.cos(angle));
  const padding=minimum+(prepared?.padding??(.012+ownRadius*(1-Math.cos(turn/4))+
    .5*Math.hypot(current.x-broadFrom.x,current.y-broadFrom.y)*Math.tan(Math.abs(turn)/4)));
  const xmin=Math.min(broadFrom.x,current.x),xmax=Math.max(broadFrom.x,current.x),ymin=Math.min(broadFrom.y,current.y),ymax=Math.max(broadFrom.y,current.y);
  let sweep = prepared, end;
  let clear = true;
  for (const other of units) {
    // Search poses retain the physical vehicle ID. A projected copy of that
    // same car is not an obstacle to its own return from a yielding position.
    if (other === unit || unit?.id&&other.id===unit.id || !vehicleObstacle(other)||!trafficCollisionRequired(unit??current,other))continue;
    const range=ownRadius+vehicleRadiusBound(other.kind,scale)+padding;
    if(other.x<xmin-range||other.x>xmax+range||other.y<ymin-range||other.y>ymax+range)continue;
    const obstacle = vehicleEnvelope(other, scale, field);
    end ??= sweep?.end ?? vehicleEnvelope(current, scale, field);
    if (strict || !before || before === current) {
      if (poseGap(end, obstacle, minimum) >= minimum) continue;
    } else {
      sweep ??= vehicleSweep(before, current, scale, field);
      if(sweepClearsVehicle(sweep,obstacle,minimum))continue;
    }
    clear = false;
    if (!blockers) return false;
    blockers.add(other);
  }
  return clear;
}

export function vehicleGroundSafe(envelope, grade) {
  const recovery = grade > .52;
  return Math.abs(Math.tan(envelope.pitch)) <= (recovery ? .95 : .81)
    && Math.abs(Math.tan(envelope.roll)) <= (recovery ? .78 : .65);
}
