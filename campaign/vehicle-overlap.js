import {vehicleEnvelope} from './vehicle-collision.js';
import {isInfantry} from './scav-unit-profiles.js';
import {navigationDecision} from './navigation-state.js';

// Traffic can use an oval, but its inscribed corners do not contain a van's
// actual body. Recover existing visible interpenetration using the full body.
export const bodyEnvelope=(unit,scale,field)=>({...vehicleEnvelope(unit,scale,field),ellipse:false});
export function bodyContact(a,b){
 const dx=b.x-a.x,dy=b.y-a.y;let best={gap:-Infinity,nx:1,ny:0};
 const radius=(p,x,y)=>p.width*Math.abs(p.c*x+p.s*y)+p.depth*Math.abs(p.c*y-p.s*x);
 for(const [x,y] of [[a.c,a.s],[-a.s,a.c],[b.c,b.s],[-b.s,b.c]]){
  const projection=dx*x+dy*y,gap=Math.abs(projection)-radius(a,x,y)-radius(b,x,y),sign=projection<0?-1:1;
  if(gap>best.gap)best={gap,nx:x*sign,ny:y*sign};
 }return best;
}
const inDoor=u=>['entering','inside','leaving'].includes(u.factoryVisit?.phase);
const bodyCollisionRequired=(a,b)=>!inDoor(a)&&!inDoor(b)&&!(a.owner==='rai'&&b.owner==='rai'
 &&a.trafficOnScreen===false&&b.trafficOnScreen===false&&!isInfantry(a)&&!isInfantry(b));

// A camera returning to off-screen pass-through traffic can reveal overlaps.
// Solve only existing penetration. Corrections are bounded physical translation
// over this simulation step, retaining terrain and static corridor boundaries.
export function* resolveVehicleOverlapsSteps(mission,dt,onMoved=()=>{}){
 const scale=mission.config.worldScale,maximum=scale*1.2*dt,skin=scale*.3;
 if(!(maximum>0))return;
 const stats=mission.overlapStatistics??={steps:0,moved:0,blocked:0,maxSliceMs:0,maxCorrection:0};
 let sliceAt=performance.now();
 const account=()=>{stats.maxSliceMs=Math.max(stats.maxSliceMs,performance.now()-sliceAt);};
 const bodies=mission.state.units.filter(u=>u.hp>0&&!['entering','inside','leaving'].includes(u.factoryVisit?.phase)),poses=new Map(),pairs=[],solids=[],penetrating=new Set();
 const world=mission.state,topology=mission.nav.topologyRevision,unitCount=world.units.length;
 const levelAt=(x,y)=>mission.nav.terrainAllowed.levelAt?.(x,y)??(mission.nav.terrainAllowed(x,y)?0:-1);
 const entry=u=>{let p=poses.get(u);if(!p){p={unit:u,x:u.x,y:u.y,heading:u.heading,kind:u.kind,
  ox:u.x,oy:u.y,visible:u.trafficOnScreen,mobile:!isInfantry(u)};poses.set(u,p);}return p;};
 for(const unit of bodies){
  if(isInfantry(unit))continue;
  if(performance.now()>=mission.nav.workDeadline){account();yield;sliceAt=performance.now();}
  const a=entry(unit),shape=bodyEnvelope(a,scale,mission.field),radius=Math.hypot(shape.width,shape.depth)+Math.hypot(shape.x-a.x,shape.y-a.y);
  for(const other of mission.unitIndex.query(unit,radius+mission.unitIndex.maxBodyRadius*scale*Math.SQRT2+maximum*2)){
   if(other===unit||other.hp<=0||!bodyCollisionRequired(unit,other)||!isInfantry(other)&&other.id<unit.id)continue;
   const b=entry(other),otherShape=bodyEnvelope(b,scale,mission.field);
   if(Math.hypot(a.x-b.x,a.y-b.y)>radius+Math.hypot(otherShape.width,otherShape.depth)+maximum*2)continue;
   const contact=bodyContact(shape,otherShape);
   const recovering=contact.gap<-.001||(a.unit.overlapRecovery||b.unit.overlapRecovery)&&contact.gap<skin-.005;
   pairs.push({a,b,...contact,minimum:recovering?skin:0});
   if(recovering){penetrating.add(a);penetrating.add(b);}
  }
  for(const solid of mission.nav.nearbySolids(unit,radius+maximum)){
   const box={x:solid.x,y:solid.y,width:solid.halfWidth,depth:solid.halfDepth,c:1,s:0};
   const contact=bodyContact(shape,box);
   solids.push({a,solid,box,...contact,minimum:contact.gap<-.001?.02:0});
   if(contact.gap<-.001)penetrating.add(a);
  }
 }
 for(const p of poses.values())if(p.unit.overlapRecovery&&!penetrating.has(p)){
  mission.emit('navigation-overlap-finished',{unit:p.unit.id,x:p.x,y:p.y,seconds:mission.state.time-p.unit.overlapRecovery.since});
  delete p.unit.overlapRecovery;
 }
 if(!penetrating.size){account();return;}
 stats.steps++;
 const limit=(p,x,y)=>{
  if(!p.mobile)return;
  p.x=x;p.y=y;
 };
 for(let iteration=0;iteration<8;iteration++){
  for(const {a,b,minimum,gap,nx,ny} of pairs){
   if(performance.now()>=mission.nav.workDeadline){account();yield;sliceAt=performance.now();}
   // Hold the original contact side while separating. Recomputing the normal
   // after a large virtual correction can swap two cars' order, proposing an
   // impossible path through one another even when the final poses are clear.
   const depth=minimum-gap-nx*((b.x-b.ox)-(a.x-a.ox))-ny*((b.y-b.oy)-(a.y-a.oy));
   if(!(depth>1e-5)||!Number.isFinite(depth))continue;
   const share=b.mobile?.5:1;
   limit(a,a.x-nx*depth*share,a.y-ny*depth*share);
   if(b.mobile)limit(b,b.x+nx*depth*.5,b.y+ny*depth*.5);
  }
  for(const {a,minimum,gap,nx,ny} of solids){
   if(performance.now()>=mission.nav.workDeadline){account();yield;sliceAt=performance.now();}
   const depth=minimum-gap+nx*(a.x-a.ox)+ny*(a.y-a.oy);
   if(depth>1e-5&&Number.isFinite(depth))limit(a,a.x-nx*depth,a.y-ny*depth);
  }
 }
 const moved=[...poses.values()].filter(p=>p.mobile&&Math.hypot(p.x-p.ox,p.y-p.oy)>1e-5);
 // Solve the coupled arrangement first, then shorten every correction by
 // one common fraction. Per-body clamping inside the solver makes a dense
 // row translate together indefinitely without reducing its intersections.
 const fractionLimit=Math.min(1,maximum/Math.max(maximum,...moved.map(p=>Math.hypot(p.x-p.ox,p.y-p.oy))));
 let accepted=0;
 // Validate the entire relative translation, not just endpoint poses. A
 // neighbour pushed by a correction is checked in this same joint solution.
 for(const fraction of [fractionLimit,fractionLimit*.5,fractionLimit*.25,fractionLimit*.125]){
  let safe=true;
  for(const p of moved){
   const end={x:p.ox+(p.x-p.ox)*fraction,y:p.oy+(p.y-p.oy)*fraction};
   if(!mission.inBounds(end.x,end.y)||levelAt(end.x,end.y)!==levelAt(p.ox,p.oy)){safe=false;break;}
  }
  if(!safe)continue;
  for(const {a,b,gap,nx,ny} of pairs){
   if(a.x===a.ox&&a.y===a.oy&&b.x===b.ox&&b.y===b.oy)continue;
   if(performance.now()>=mission.nav.workDeadline){account();yield;sliceAt=performance.now();}
   // Headings are fixed throughout this correction. The separating plane
   // is linear over the entire relative translation, so testing its end
   // proves that we neither deepen the overlap nor cross a clear neighbour.
   const endGap=gap+(nx*((b.x-b.ox)-(a.x-a.ox))+ny*((b.y-b.oy)-(a.y-a.oy)))*fraction;
   if(endGap<Math.min(gap,0)-1e-6){safe=false;break;}
  }
  if(!safe)continue;
  for(const {a,gap,nx,ny} of solids){
   if(a.x===a.ox&&a.y===a.oy)continue;
   if(performance.now()>=mission.nav.workDeadline){account();yield;sliceAt=performance.now();}
   const endGap=gap-(nx*(a.x-a.ox)+ny*(a.y-a.oy))*fraction;
   if(endGap<Math.min(gap,0)-1e-6){safe=false;break;}
  }
  if(safe){accepted=fraction;break;}
 }
 if(!accepted||!moved.length){
  // No correction will run: release movement ownership so an ordinary
  // collision-checked exit can clear the contact instead of waiting forever.
  for(const p of poses.values())if(p.unit.overlapRecovery)p.unit.overlapRecovery.active=false;
  stats.blocked++;account();return;
 }
 if(mission.state!==world||mission.nav.topologyRevision!==topology||world.units.length!==unitCount
  ||[...poses.values()].some(p=>p.unit.hp<=0||p.unit.kind!==p.kind||p.unit.x!==p.ox||p.unit.y!==p.oy
  ||p.unit.heading!==p.heading||p.unit.trafficOnScreen!==p.visible)){account();return;}
 for(const p of moved){
  const unit=p.unit,dx=(p.x-p.ox)*accepted,dy=(p.y-p.oy)*accepted;
  if(!unit.overlapRecovery){unit.overlapRecovery={since:mission.state.time};mission.emit('navigation-overlap-started',{unit:unit.id,x:unit.x,y:unit.y});}
  unit.overlapRecovery.active=true;
  unit.x+=dx;unit.y+=dy;unit.driveSpeed=0;
  // Pose-relative borrowed arcs no longer describe the externally displaced
  // body. Keep its command/home; let the existing recovery rejoin it live.
  if(!unit.jointTraffic){delete unit.detour;delete unit.traffic;delete unit.trafficHold;}
  if(unit.yieldReturn){unit.yieldReturn.failedReturn=true;unit.yieldReturn.phase='waiting';unit.yieldReturn.legs=[];}
  mission.unitIndex.update(unit);stats.moved++;stats.maxCorrection=Math.max(stats.maxCorrection,Math.hypot(dx,dy));
  navigationDecision(unit,'MANEUVERING','overlap-separation',null,'resolve-overlap');
 }
 onMoved();account();
}
