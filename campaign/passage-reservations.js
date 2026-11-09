import {vehicleEnvelope,footprintSupport,vehicleSweep,trafficCollisionRequired} from './vehicle-collision.js';

const maximumBatch=4;
const keyFor=t=>[t.along,t.low,t.high,t.centre,t.width].join(':');
const axis=(shape,t)=>t.along==='x'?{centre:shape.x,radius:footprintSupport(shape,1,0),side:shape.y,sideRadius:footprintSupport(shape,0,1)}:
 {centre:shape.y,radius:footprintSupport(shape,0,1),side:shape.x,sideRadius:footprintSupport(shape,1,0)};

// A waiting entrance may move out of the way, but its complete swept body
// must stay outside the admitted stream's throat and turning apron.
export function passageWaitClear(mission,unit,from,to){
 const decision=mission.trafficCoordinator.passageDecisions.get(unit.id),t=unit.passage?.throat;
 if(!decision||decision.admitted||!t)return true;
 if(decision.yieldTo&&!trafficCollisionRequired(unit,mission.entity(decision.yieldTo)))return true;
 const scale=mission.config.worldScale,skin=scale*.055+.02,sweep=vehicleSweep(from,to,scale,mission.field);
 const clearance=shape=>{const a=axis(shape,t);return decision.direction>0
  ?t.low-decision.apron-skin-a.centre-a.radius:a.centre-a.radius-t.high-decision.apron-skin;};
 const initial=clearance(sweep.start),middle=clearance(sweep.middle),end=clearance(sweep.end);
 return Math.min(middle,end)>=Math.min(0,initial)-.00001&&(initial>=0||end>initial+.000001);
}

// Shared admission for physically single-file corridors. A lease covers a
// bounded batch, and is retired by observed body clearance, never by expiry.
export function updatePassageReservations(mission,living){
 const {state,config,field}=mission,scale=config.worldScale,skin=scale*.055+.02,decisions=new Map(),groups=new Map();
 const previous=new Map((state.trafficControl.passages??[]).map(p=>[p.key,p]));
 const byId=new Map(living.map(u=>[u.id,u]));
 for(const unit of living){
  const gate=unit.passage,t=gate?.throat;if(!t||!unit.path.length)continue;
  const key=keyFor(t);if(!groups.has(key))groups.set(key,{key,throat:t,requests:[]});
  groups.get(key).requests.push(unit);
 }
 // A cancelled order does not erase a vehicle which is still in the passage.
 for(const p of previous.values())if(!groups.has(p.key))groups.set(p.key,{key:p.key,throat:p.throat,requests:[]});
 const saved=[];
 for(const group of groups.values()){
  const {key,throat:t,requests}=group;
  const queueWidth=Math.max(0,...requests.map(u=>vehicleEnvelope(u,scale,field).width),previous.get(key)?.queueWidth??0);
  if(t.width>=queueWidth*4+skin*2)continue;
  const turnRadius=2.6*scale/Math.tan(.67);
  const apron=Math.max(0,...requests.map(u=>{const shape=vehicleEnvelope(u,scale,field);
   return shape.depth+2*turnRadius+Math.hypot(shape.width,shape.depth)+skin;}),previous.get(key)?.apron??0);
  const middle=t.along==='x'?{x:(t.low+t.high)/2,y:t.centre}:{x:t.centre,y:(t.low+t.high)/2};
  const occupied=mission.unitIndex.query(middle,(t.high-t.low)/2+apron+scale*6).filter(u=>{
   if(u.hp<=0)return false;
   const a=axis(vehicleEnvelope(u,scale,field),t);
   return a.centre+a.radius>t.low-apron-skin&&a.centre-a.radius<t.high+apron+skin
    &&Math.abs(a.side-t.centre)<queueWidth+a.sideRadius+skin;
  });
  const lease=previous.get(key)??{key,throat:t,direction:0,admitted:[],count:0,waiting:{},lastDirection:0};
  lease.apron=apron;lease.queueWidth=queueWidth;
  for(const u of requests)if(!lease.admitted.includes(u.id))lease.waiting[u.id]??=state.time;
  for(const id of Object.keys(lease.waiting))if(!requests.some(u=>u.id===id))delete lease.waiting[id];
  lease.admitted=lease.admitted.filter(id=>{
   const u=byId.get(id);if(!u)return false;
   const a=axis(vehicleEnvelope(u,scale,field),t);
   const crossed=lease.direction>0?a.centre-a.radius>t.high+skin:a.centre+a.radius<t.low-skin;
   const exited=crossed&&!occupied.includes(u);
   if(exited){delete lease.waiting[id];return false;}
   return occupied.includes(u)||u.passage?.throat&&keyFor(u.passage.throat)===key&&u.path.length;
  });
  // Loading/issuing an order inside a corridor cannot wait for that same
  // corridor to become empty. Its actual occupant owns the first departure;
  // no vehicle from the other entrance is admitted until that body exits.
  const committed=requests.filter(u=>occupied.includes(u));
  const currentRequests=requests.filter(u=>lease.admitted.includes(u.id));
  if(lease.admitted.length&&currentRequests.length&&currentRequests.every(u=>u.passage.direction!==lease.direction)
   &&new Set(currentRequests.map(u=>u.passage.direction)).size===1){
   // Stop/reissue may reverse the only committed flow. Retain occupancy and
   // change its departure direction, rather than admitting an opposing flow.
   lease.direction=currentRequests[0].passage.direction;
  }
  if(!lease.admitted.length&&committed.length){
   committed.sort((a,b)=>{
    const aa=axis(vehicleEnvelope(a,scale,field),t),bb=axis(vehicleEnvelope(b,scale,field),t);
    const inside=q=>q.centre+q.radius>t.low&&q.centre-q.radius<t.high;
    return inside(bb)-inside(aa)||(lease.waiting[a.id]-lease.waiting[b.id])||a.id.localeCompare(b.id);
   });
   lease.direction=committed[0].passage.direction;lease.lastDirection=lease.direction;
   lease.admitted=committed.filter(u=>u.passage.direction===lease.direction).map(u=>u.id);
   lease.count=lease.admitted.length;
   for(const id of lease.admitted)delete lease.waiting[id];
  }
  if(lease.admitted.length&&lease.count<maximumBatch){
   const tail=requests.filter(u=>u.passage.direction===lease.direction&&!lease.admitted.includes(u.id)
    &&(u[t.along]-(lease.direction>0?t.low:t.high))*lease.direction<0)
    .sort((a,b)=>(b[t.along]-a[t.along])*lease.direction||a.id.localeCompare(b.id));
   for(const u of tail.slice(0,maximumBatch-lease.count)){lease.admitted.push(u.id);lease.count++;delete lease.waiting[u.id];}
  }
  if(!lease.admitted.length&&!occupied.length){
   const candidates=requests.filter(u=>{
    const a=axis(vehicleEnvelope(u,scale,field),t),direction=u.passage.direction;
    return direction>0?a.centre-a.radius<=t.high+skin:a.centre+a.radius>=t.low-skin;
   }).sort((a,b)=>(lease.waiting[a.id]-lease.waiting[b.id])
    ||(a.passage.direction===lease.lastDirection)-(b.passage.direction===lease.lastDirection)||a.id.localeCompare(b.id));
   if(candidates.length){
    const opposite=lease.count>=maximumBatch?candidates.find(u=>u.passage.direction!==lease.lastDirection):null;
    lease.direction=(opposite??candidates[0]).passage.direction;lease.lastDirection=lease.direction;lease.count=0;
    const flow=candidates.filter(u=>u.passage.direction===lease.direction).sort((a,b)=>(b[t.along]-a[t.along])*lease.direction||a.id.localeCompare(b.id));
    for(const u of flow.slice(0,maximumBatch)){lease.admitted.push(u.id);lease.count++;delete lease.waiting[u.id];}
   }else lease.direction=0;
  }
  for(const unit of requests){
   const shape=vehicleEnvelope(unit,scale,field),a=axis(shape,t),direction=unit.passage.direction;
   const exited=direction>0?a.centre-a.radius>t.high+skin:a.centre+a.radius<t.low-skin;
   const relevant=[...occupied,...requests].some(other=>other!==unit&&trafficCollisionRequired(unit,other));
   const admitted=!relevant||exited||lease.admitted.includes(unit.id);
   // Leave enough real apron for the exiting car's Ackermann turn and its
   // rotating body, not merely the centre point beyond the bridge mouth.
   const stopAt=direction>0?t.low-apron-a.radius-skin:t.high+apron+a.radius+skin;
   const gap=(stopAt-unit[t.along])*direction,reaction=22*(config.simulationStep??.1);
   decisions.set(unit.id,{key,admitted,inside:occupied.includes(unit),direction,stopAt,apron,
    yieldTo:lease.admitted[0]??occupied[0]?.id??null,
    limit:admitted?Infinity:Math.max(0,Math.sqrt(44*Math.max(0,gap)+reaction*reaction)-reaction)});
  }
  if(requests.length||lease.admitted.length)saved.push(lease);
 }
 state.trafficControl.passages=saved;return decisions;
}
