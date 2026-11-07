import {vehicleEnvelope,footprintSupport} from './vehicle-collision.js';
import {updatePassageReservations} from './passage-reservations.js';

export const TRAFFIC_LIMITS={groupSize:100,zoneSize:256,horizon:3,leases:1024};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const cross=(a,b)=>a.x*b.y-a.y*b.x;
const dot=(a,b)=>a.x*b.x+a.y*b.y;

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
  const living=state.units.filter(u=>u.hp>0),byId=new Map(living.map(u=>[u.id,u]));
  this.passageDecisions=updatePassageReservations(mission,living);
  const leases=new Map(saved.leases.filter(l=>l.expires>now&&byId.has(l.a)&&byId.has(l.b)).map(l=>[l.key,l]));
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
   if(!u.path?.length||u.builderWorking||u.detour||u.trafficHold)continue;
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
    const committedA=da<=ca+(a.unit.driveSpeed??0)**2/44,committedB=db<=cb+(b.unit.driveSpeed??0)**2/44;
    const waitA=now-(saved.waiting[a.unit.id]??now),waitB=now-(saved.waiting[b.unit.id]??now);
    const scoreA=(committedA?100:0)+waitA*2-Math.max(0,enterA),scoreB=(committedB?100:0)+waitB*2-Math.max(0,enterB);
    const winner=scoreA===scoreB?(a.unit.id<b.unit.id?a:b):scoreA>scoreB?a:b;
    lease={key,a:a.unit.id,b:b.unit.id,winner:winner.unit.id,expires:now+4};leases.set(key,lease);
   }
   crossings.push({a,b,da,db,ca,cb,lease});
  }
  // A pairwise winner is only a proposal. Reconcile every proposal into one
  // acyclic precedence graph, including the physical order within a convoy.
  // Otherwise four approaches can each wait forever for the next approach.
  const successors=new Map();
  const precedes=(from,to)=>{
   const pending=[from],seen=new Set(pending);
   for(let i=0;i<pending.length;i++)for(const id of successors.get(pending[i])??[]){
    if(id===to)return true;if(!seen.has(id)){seen.add(id);pending.push(id);}
   }
   return false;
  };
  const before=(leader,follower)=>{if(!successors.has(leader))successors.set(leader,new Set());successors.get(leader).add(follower);};
  for(const [leader,tail] of followers)for(const follower of tail)if(!precedes(follower,leader))before(leader,follower);
  let cyclesPrevented=0;
  for(const {a,b,da,db,ca,cb,lease,merge} of crossings){
   let winner=lease.winner,loserId=winner===a.unit.id?b.unit.id:a.unit.id;
   if(precedes(loserId,winner)){[winner,loserId]=[loserId,winner];lease.winner=winner;cyclesPrevented++;}
   before(winner,loserId);
   const loser=loserId===a.unit.id?a:b,along=loser===a?da:db,clearance=loser===a?ca:cb;
   // Already inside: finish clearing the junction. Stopping there would
   // block its owner and cause a permanent deadlock.
   if(along<0&&!merge)continue;
   const limit=Math.max(0,Math.sqrt(44*Math.max(0,along-clearance)+2.2**2)-2.2);
   if(limit<(this.decisions.get(loser.unit.id)?.limit??Infinity))this.decisions.set(loser.unit.id,{limit,yieldTo:lease.winner,coordinator:this.groups.find(g=>g.units.includes(loser.unit.id))?.leaderId});
  }
  // A tail waiting behind a junction queue is not stuck. Propagate that fact
  // along the convoy, including across dispatcher-zone boundaries.
  const queue=[...this.decisions.keys(),...[...this.passageDecisions].filter(([id,d])=>!d.admitted).map(([id])=>id)];for(const id of queue)this.queues.add(id);
  for(let i=0;i<queue.length;i++)for(const id of followers.get(queue[i])??[])if(!this.queues.has(id)){this.queues.add(id);queue.push(id);}
  const waiting={};
  for(const [id,d] of this.decisions)if(d.limit<config.units[byId.get(id).kind].speed*.65)waiting[id]=saved.waiting[id]??now;
  saved.waiting=waiting;saved.leases=[...leases.values()].slice(-TRAFFIC_LIMITS.leases);
  this.statistics={groups:this.groups.length,largestGroup:Math.max(0,...this.groups.map(g=>g.units.length)),controlled:living.length,pairs,conflicts,yielding:this.decisions.size,cyclesPrevented,cpuMs:performance.now()-started};
 }
}
