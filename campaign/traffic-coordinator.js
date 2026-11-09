import {vehicleEnvelope,footprintSupport,vehicleSweep} from './vehicle-collision.js';
import {updatePassageReservations} from './passage-reservations.js';
import {vehicleDynamics} from './vehicle-dynamics.js';
import {checkManeuver} from './vehicle-motion.js';

export const TRAFFIC_LIMITS={groupSize:100,zoneSize:256,horizon:3,leases:1024};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const cross=(a,b)=>a.x*b.y-a.y*b.x;
const dot=(a,b)=>a.x*b.x+a.y*b.y;

function crossingReleased(lease,byId,scale,field){
 const zone=lease.zone,winner=byId.get(lease.winner);
 if(!zone||!winner)return !winner;
 const shape=vehicleEnvelope(winner,scale,field),side=(shape.x-zone.x)*zone.nx+(shape.y-zone.y)*zone.ny;
 const clearance=footprintSupport(shape,zone.nx,zone.ny)+zone.width;
 if(side*zone.exitSign>clearance)return true;
 if(zone.ux!==undefined){
  const transverse=(shape.x-zone.x)*-zone.uy+(shape.y-zone.y)*zone.ux;
  if(Math.abs(transverse)>footprintSupport(shape,-zone.uy,zone.ux)+zone.ownerWidth+scale*.055)return true;
 }
 // A cancelled/replaced route outside the occupied crossing no longer owns
 // its old approach. Cancellation while a body is inside does not erase it.
 const goal=winner.path?.at(-1),waypoint=winner.path?.[0];
 const changed=!goal||goal.x!==zone.goalX||goal.y!==zone.goalY
  ||zone.waypointX!==undefined&&(waypoint?.x!==zone.waypointX||waypoint?.y!==zone.waypointY);
 return changed&&Math.abs(side)>clearance;
}

function grantCrossing(lease,winner,other,along,scale,now){
 const nx=-other.course.y,ny=other.course.x,goal=winner.unit.path.at(-1),waypoint=winner.unit.path[0];
 lease.grantedAt??=now;
 lease.zone={x:winner.unit.x+winner.course.x*along,y:winner.unit.y+winner.course.y*along,nx,ny,
  width:footprintSupport(other.shape,nx,ny)+scale*.45,exitSign:Math.sign(winner.course.x*nx+winner.course.y*ny),
  ux:winner.course.x,uy:winner.course.y,ownerWidth:footprintSupport(winner.shape,-winner.course.y,winner.course.x),
  goalX:goal.x,goalY:goal.y,waypointX:waypoint.x,waypointY:waypoint.y};
}

// A changed physical queue may invalidate a future crossing promise. It can
// be renegotiated only after both participants stop and its owner is outside.
// An empty intersection may be released; an intersection occupied solely by
// the waiting participant may be handed to it to finish clearing. A third
// body's footprint/stopping sweep forbids either operation. Occupied owner
// rights never expire, including when that owner has received Stop.
function crossingReschedule(lease,mission,byId,scale){
 const z=lease.zone,a=byId.get(lease.a),b=byId.get(lease.b);
 if(!z||z.ux===undefined||!a||!b||(a.driveSpeed??0)>.001||(b.driveSpeed??0)>.001)return null;
 const loser=lease.winner===lease.a?lease.b:lease.a;let occupant=null;
 const ownX=-z.uy,ownY=z.ux,width=z.ownerWidth+scale*.45;
 const intersects=(shape,padding=0)=>Math.abs((shape.x-z.x)*z.nx+(shape.y-z.y)*z.ny)<=z.width+footprintSupport(shape,z.nx,z.ny)+padding
  &&Math.abs((shape.x-z.x)*ownX+(shape.y-z.y)*ownY)<=width+footprintSupport(shape,ownX,ownY)+padding;
 const radius=(z.width+width)/Math.max(.01,Math.abs(z.nx*ownY-z.ny*ownX));
 for(const unit of byId.values()){
  const dynamics=vehicleDynamics(unit),speed=unit.driveSpeed??0,dt=mission.config.simulationStep??.1;
  const stopping=speed*dt+speed*speed/(2*dynamics.braking),shape=vehicleEnvelope(unit,scale,mission.field);
  if(Math.hypot(shape.x-z.x,shape.y-z.y)>radius+Math.hypot(shape.width,shape.depth)+stopping)continue;
  if(intersects(shape)){
   // An already-entered loser must be allowed to clear ahead of a stopped
   // owner outside. This is an occupancy-preserving transfer, not an empty
   // zone. A stopped owner or any third body forbids renegotiation.
   if(unit.id!==loser)return null;
   occupant=loser;continue;
  }
  if(stopping>.001){
   const direction=unit.reversing?-1:1,curve=Math.tan(unit.steering??0)*direction;
   const clear=checkManeuver(unit,[{direction,curve,remaining:stopping}],scale,(from,to)=>{
    const sweep=vehicleSweep(from,to,scale,mission.field);
    const poses=[sweep.start,sweep.middle,sweep.end];
    // Test the union of support intervals over the complete small sweep.
    // Three isolated OBB tests could miss a short corner crossing between
    // samples; this conservative swept projection cannot declare it empty.
    const overlaps=(x,y,half)=>{
     const low=Math.min(...poses.map(p=>(p.x-z.x)*x+(p.y-z.y)*y-footprintSupport(p,x,y)))-sweep.padding;
     const high=Math.max(...poses.map(p=>(p.x-z.x)*x+(p.y-z.y)*y+footprintSupport(p,x,y)))+sweep.padding;
     return low<=half&&high>=-half;
    };
    return !(overlaps(z.nx,z.ny,z.width)&&overlaps(ownX,ownY,width));
   });
   if(!clear)return null;
  }
 }
 return {occupant};
}

// Nearly parallel routes can converge laterally. Following distance alone
// only notices their bodies after the side clearance has nearly vanished.
// Intersect the four translating OBB intervals over the same short horizon;
// equal-speed independent lanes never acquire a conflict from this check.
function parallelMerge(a,b,scale,horizon){
 const speedA=a.unit.driveSpeed??0,speedB=b.unit.driveSpeed??0;
 const vx=-Math.sin(b.unit.heading)*speedB+Math.sin(a.unit.heading)*speedA;
 const vy=Math.cos(b.unit.heading)*speedB-Math.cos(a.unit.heading)*speedA;
 const dx=b.shape.x-a.shape.x,dy=b.shape.y-a.shape.y;
 let enter=0,exit=Math.min(horizon,a.length/Math.max(1,speedA),b.length/Math.max(1,speedB));
 for(const shape of [a.shape,b.shape])for(const [x,y] of [[shape.c,shape.s],[-shape.s,shape.c]]){
  const separation=dx*x+dy*y,relative=vx*x+vy*y;
  const radius=footprintSupport(a.shape,x,y)+footprintSupport(b.shape,x,y)+scale*.055+.02;
  if(Math.abs(relative)<1e-7){if(Math.abs(separation)>radius)return null;continue;}
  const first=(-radius-separation)/relative,last=(radius-separation)/relative;
  enter=Math.max(enter,Math.min(first,last));exit=Math.min(exit,Math.max(first,last));
  if(enter>exit)return null;
 }
 const length=Math.hypot(a.course.x+b.course.x,a.course.y+b.course.y);
 const course={x:(a.course.x+b.course.x)/length,y:(a.course.y+b.course.y)/length};
 return {along:dx*course.x+dy*course.y,
  clearance:footprintSupport(a.shape,course.x,course.y)+footprintSupport(b.shape,course.x,course.y)+scale*.055+.02};
}

// Shared right of way, decided before any unit moves. A coordinator is a role,
// not a spawned vehicle. Pair leases cross zone boundaries and survive saves.
export class TrafficCoordinator{
 constructor(){this.groups=[];this.decisions=new Map();this.passageDecisions=new Map();this.queues=new Set();this.intents=new Map();this.statistics={};}
 limit(unit){return Math.min(this.decisions.get(unit.id)?.limit??Infinity,this.intents.get(unit.id)?.trafficLimit??Infinity,this.passageDecisions.get(unit.id)?.limit??Infinity);}
 queueing(unit){return this.queues.has(unit.id);}
 update(mission){
  const started=performance.now(),{state,config,field}=mission,now=state.time,scale=config.worldScale;
  const saved=state.trafficControl??={version:1,leases:[],waiting:{}};
  const living=state.units.filter(u=>u.hp>0&&u.factoryVisit?.phase!=='inside'),byId=new Map(living.map(u=>[u.id,u]));
  this.passageDecisions=updatePassageReservations(mission,living);
  const leases=new Map(saved.leases.filter(l=>byId.has(l.a)&&byId.has(l.b)
   &&(l.zone?!crossingReleased(l,byId,scale,field):l.expires>now)).map(l=>[l.key,l]));
  this.decisions.clear();this.queues.clear();this.intents.clear();this.groups.length=0;
  const zones=new Map();
  for(const u of living){
   const commander=byId.get(u.commanderId),assigned=commander?.owner===u.owner?commander:null;
   const key=u.owner+':'+(assigned?'commander:'+assigned.id:Math.floor(u.x/TRAFFIC_LIMITS.zoneSize)+':'+Math.floor(u.y/TRAFFIC_LIMITS.zoneSize));
   if(!zones.has(key))zones.set(key,[]);zones.get(key).push(u);
  }
  for(const [zone,units] of zones){
   units.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
   const commander=units.find(u=>u.kind==='command')??byId.get(units[0]?.commanderId);
   for(let i=0;i<units.length;i+=TRAFFIC_LIMITS.groupSize){
    const group=units.slice(i,i+TRAFFIC_LIMITS.groupSize);
    this.groups.push({id:zone+':'+i,leaderId:commander?.id??group[0].id,virtual:!commander,units:group.map(u=>u.id)});
   }
  }
  const plans=new Map();
  for(const u of living){
   if(!u.path?.length||u.builderWorking||u.detour||u.trafficHold||u.traffic?.cycle&&u.traffic.phase==='parked')continue;
   const target=u.path[0],d=distance(target,u);if(d<.1)continue;
   const direct={x:(target.x-u.x)/d,y:(target.y-u.y)/d};
   const intent=mission.drivingIntent(u,target,direct,scale),course=intent.course;this.intents.set(u.id,intent);
   // Local turning/parking is handled by the swept manoeuvre solver. Do not
   // reserve a straight trajectory for a car which is currently reversing.
   if(u.reversing||dot({x:-Math.sin(u.heading),y:Math.cos(u.heading)},course)<.65)continue;
   const shape=vehicleEnvelope(u,scale,field),speed=Math.max(4,u.driveSpeed??0,config.units[u.kind].speed*.45);
   plans.set(u.id,{unit:u,course,shape,speed,length:d});
  }
  let pairs=0,conflicts=0;const followers=new Map(),crossings=[];
  for(const a of plans.values())for(const other of mission.unitIndex.query(a.unit,110)){
   if(other.owner!==a.unit.owner||other.id<=a.unit.id)continue;
   const b=plans.get(other.id);if(!b)continue;pairs++;
   const admissionA=this.passageDecisions.get(a.unit.id),admissionB=this.passageDecisions.get(b.unit.id);
   // Admission already owns the shared throat and its exit. A waiting
   // entrance may not reserve a hypothetical crossing over that owner's
   // exit. Its actual stationary body still participates in all sweeps and
   // headway checks; this removes only the incompatible future trajectory.
   if(admissionA&&admissionB&&admissionA.key===admissionB.key&&(!admissionA.admitted||!admissionB.admitted))continue;
   const parallel=dot(a.course,b.course),den=cross(a.course,b.course);
   // Following and opposing parallel lanes use lane keeping/headway. They
   // must not contend for a junction reservation indefinitely.
   if(parallel>.82){
    const dx=b.shape.x-a.shape.x,dy=b.shape.y-a.shape.y,along=dx*a.course.x+dy*a.course.y;
    const across=Math.abs(dx*a.course.y-dy*a.course.x);
    if(Math.abs(along)<scale*13&&across<scale*2.2){
     const leader=along>0?b:a,follower=along>0?a:b;
     if(!followers.has(leader.unit.id))followers.set(leader.unit.id,[]);followers.get(leader.unit.id).push(follower.unit.id);
    }
    // Existing same-file headway owns already overlapping lateral corridors.
    const merge=across>=scale*2.2?parallelMerge(a,b,scale,TRAFFIC_LIMITS.horizon):null;
    if(merge){
     const key=[a.unit.id,b.unit.id].sort().join('|');let lease=leases.get(key);
     if(!lease){
      const winner=merge.along===0?(a.unit.id<b.unit.id?a:b):merge.along>0?b:a;
      lease={key,a:a.unit.id,b:b.unit.id,winner:winner.unit.id,expires:now+4};leases.set(key,lease);
     }
     conflicts++;crossings.push({a,b,da:merge.along,db:-merge.along,ca:merge.clearance,cb:merge.clearance,lease,merge:true});
    }
    continue;
   }
   if(parallel<-.97||Math.abs(den)<.06)continue;
   const delta={x:b.unit.x-a.unit.x,y:b.unit.y-a.unit.y},da=cross(delta,b.course)/den,db=cross(delta,a.course)/den;
   // Distance along each approach occupied by the other swept lane. The
   // division by sin(angle) matters at shallow/obtuse crossings; projection
   // onto our own direction alone underestimates that zone.
   const ca=(footprintSupport(a.shape,-b.course.y,b.course.x)+footprintSupport(b.shape,-b.course.y,b.course.x))/Math.abs(den)+scale*.45;
   const cb=(footprintSupport(a.shape,-a.course.y,a.course.x)+footprintSupport(b.shape,-a.course.y,a.course.x))/Math.abs(den)+scale*.45;
   if(da< -ca||db< -cb||da>Math.min(a.length+ca,a.speed*TRAFFIC_LIMITS.horizon+ca)||db>Math.min(b.length+cb,b.speed*TRAFFIC_LIMITS.horizon+cb))continue;
   const enterA=(da-ca)/a.speed,exitA=(da+ca)/a.speed,enterB=(db-cb)/b.speed,exitB=(db+cb)/b.speed;
   if(Math.max(enterA,enterB)>Math.min(exitA,exitB)+.25)continue;
   conflicts++;
   const key=[a.unit.id,b.unit.id].sort().join('|');let lease=leases.get(key);
   if(!lease){
    const committedA=da<=ca+(a.unit.driveSpeed??0)**2/(2*vehicleDynamics(a.unit).braking);
    const committedB=db<=cb+(b.unit.driveSpeed??0)**2/(2*vehicleDynamics(b.unit).braking);
    const waitA=now-(saved.waiting[a.unit.id]??now),waitB=now-(saved.waiting[b.unit.id]??now);
    const scoreA=(committedA?100:0)+waitA*2-Math.max(0,enterA),scoreB=(committedB?100:0)+waitB*2-Math.max(0,enterB);
    const winner=scoreA===scoreB?(a.unit.id<b.unit.id?a:b):scoreA>scoreB?a:b;
    lease={key,a:a.unit.id,b:b.unit.id,winner:winner.unit.id,expires:now+4};leases.set(key,lease);
   }
   crossings.push({a,b,da,db,ca,cb,lease});
  }
  // Retain already-issued crossing precedence until the owner's complete
  // body clears the opposing lane. Rebuilding a DAG from scratch could flip
  // a granted pair while both vehicles were already braking towards it.
  const successors=new Map();
  const precedes=(from,to)=>{
   const pending=[from],seen=new Set(pending);
   for(let i=0;i<pending.length;i++)for(const id of successors.get(pending[i])??[]){
    if(id===to)return true;if(!seen.has(id)){seen.add(id);pending.push(id);}
   }
   return false;
  };
  const before=(leader,follower)=>{if(!successors.has(leader))successors.set(leader,new Set());successors.get(leader).add(follower);};
  // A body ahead of a convoy is a mandatory dependency, even if a previous
  // promise would form a cycle with it. Dropping that edge only concealed
  // the real deadlock from the graph while headway still stopped the tail.
  for(const [leader,tail] of followers)for(const follower of tail)before(leader,follower);
  const withdrawn=[],transferred=[];let occupiedCycles=0;
  for(const lease of [...leases.values()].filter(l=>l.zone).sort((a,b)=>a.grantedAt-b.grantedAt||a.key.localeCompare(b.key))){
   const loser=lease.winner===lease.a?lease.b:lease.a;
   if(precedes(loser,lease.winner)){
    const proof=crossingReschedule(lease,mission,byId,scale);
    if(proof){
     if(!proof.occupant){
      withdrawn.push({key:lease.key,winner:lease.winner,reason:'unoccupied-physical-cycle'});
      delete lease.zone;delete lease.grantedAt;lease.expires=now;
      continue;
     }
     const pair=crossings.find(c=>c.lease===lease&&!c.merge);
     if(pair){
      const winner=proof.occupant===pair.a.unit.id?pair.a:pair.b,other=winner===pair.a?pair.b:pair.a;
      transferred.push({key:lease.key,from:lease.winner,to:winner.unit.id,reason:'physical-occupant-clearing'});
      lease.winner=winner.unit.id;lease.grantedAt=now;
      grantCrossing(lease,winner,other,winner===pair.a?pair.da:pair.db,scale,now);
      before(winner.unit.id,other.unit.id);continue;
     }
    }
    occupiedCycles++;
   }
   before(lease.winner,loser);
  }
  let cyclesPrevented=0;
  for(const {a,b,da,db,ca,cb,lease,merge} of crossings){
   let winner=lease.winner,loserId=winner===a.unit.id?b.unit.id:a.unit.id;
   if(!lease.zone&&precedes(loserId,winner)){[winner,loserId]=[loserId,winner];lease.winner=winner;cyclesPrevented++;}
   before(winner,loserId);
   if(!merge&&!lease.zone)grantCrossing(lease,winner===a.unit.id?a:b,winner===a.unit.id?b:a,winner===a.unit.id?da:db,scale,now);
   const loser=loserId===a.unit.id?a:b,along=loser===a?da:db,clearance=loser===a?ca:cb;
   // Already inside: finish clearing the junction. Stopping there would
   // block its owner and cause a permanent deadlock.
   if(along<0&&!merge)continue;
   const braking=vehicleDynamics(loser.unit).braking,reaction=braking*(config.simulationStep??.1);
   const limit=Math.max(0,Math.sqrt(2*braking*Math.max(0,along-clearance)+reaction**2)-reaction);
   if(limit<(this.decisions.get(loser.unit.id)?.limit??Infinity))this.decisions.set(loser.unit.id,{limit,yieldTo:lease.winner,coordinator:this.groups.find(g=>g.units.includes(loser.unit.id))?.leaderId});
  }
  // A tail waiting behind a junction queue is not stuck. Propagate that fact
  // along the convoy, including across dispatcher-zone boundaries.
  const queue=[...this.decisions.keys(),...[...this.passageDecisions].filter(([id,d])=>!d.admitted).map(([id])=>id)];for(const id of queue)this.queues.add(id);
  for(let i=0;i<queue.length;i++)for(const id of followers.get(queue[i])??[])if(!this.queues.has(id)){this.queues.add(id);queue.push(id);}
  const waiting={};
  for(const [id,d] of this.decisions)if(d.limit<config.units[byId.get(id).kind].speed*.65)waiting[id]=saved.waiting[id]??now;
  saved.waiting=waiting;saved.leases=[...leases.values()].slice(-TRAFFIC_LIMITS.leases);
  this.statistics={groups:this.groups.length,largestGroup:Math.max(0,...this.groups.map(g=>g.units.length)),controlled:living.length,pairs,conflicts,yielding:this.decisions.size,cyclesPrevented,withdrawn,transferred,occupiedCycles,cpuMs:performance.now()-started};
 }
}
