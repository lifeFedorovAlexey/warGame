import {roadTrafficRank,compareRoadTrafficRanks} from './traffic-priority.js';
import {vehicleEnvelope,vehicleSweep,sweepClearsVehicle,trafficCollisionRequired} from './vehicle-collision.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

// Evaluate occupied approaches only when choosing a side, or after a real
// wait. A moving neighbour must not make every control preview swap shoulders.
function occupiedShoulder(mission,unit,lane,scale){
 const end={...lane,kind:unit.kind,heading:Math.atan2(-lane.ux,lane.uy)},sweep=vehicleSweep(unit,end,scale,mission.field);
 return mission.nearbyUnits(unit,distance(unit,lane)+scale*6).some(other=>other.id!==unit.id&&other.hp>0
  &&trafficCollisionRequired(unit,other)&&!sweepClearsVehicle(sweep,vehicleEnvelope(other,scale,mission.field),scale*.15));
}

// Retreating vehicles choose a free nearby shoulder; attack traffic keeps the
// centre. The chosen side survives transient motion in the opposite stream.
function opposingRetreatLane(mission,unit,road,target,targetRoad,scale){
 const retreating=!!unit.combatRetreat,attacking=['attack','attack-move'].includes(unit.task?.type)||!!unit.combatDeployment;
 if(!retreating&&!attacking)return null;
 const roads=mission.nav.roads,seg=road.segment,dx=target.x-unit.x,dy=target.y-unit.y,d=Math.hypot(dx,dy);
 if(d<scale*8)return null;
 const alignment=(dx*seg.ux+dy*seg.uy)/d;
 const along=retreating&&targetRoad.segment.pathId===seg.pathId
  ?targetRoad.segment.progress+targetRoad.along-seg.progress-road.along:null;
 if(!(Math.abs(along??0)>scale*2)&&Math.abs(alignment)<.55)return null;
 const direction=Math.sign(Math.abs(along??0)>scale*2?along:alignment),ux=seg.ux*direction,uy=seg.uy*direction;
 const segments=roads.routes.get(seg.pathId),progress=seg.progress+road.along;
 const end=segments.at(-1),length=end.progress+end.length;
 const remaining=Math.min(d*.8,scale*14);
 const shape=vehicleEnvelope(unit,scale,mission.field);
 // Keep one side while following the road; choosing from the current lateral
 // position would switch sides while a turning car crosses the centre line.
 const retreat=unit.combatRetreat,across=(unit.x-road.x)*uy-(unit.y-road.y)*ux;
 const sameRoad=retreat&&(retreat.shoulderPath==null||retreat.shoulderPath===seg.pathId);
 const stored=sameRoad&&retreat.shoulderSide?retreat.shoulderSide*(retreat.shoulderDirection&&retreat.shoulderDirection!==direction?-1:1):null;
 const preferred=retreating?(stored||Math.sign(across)||1):0;
 const reconsider=retreating&&(!stored||(unit.navigation?.waitSeconds??0)>=1.5);
 let occupied=null;
 for(const side of retreating?[preferred,-preferred]:[0]){
  // A long chord can cross an obstacle on a bend even when the nearby part
  // of this shoulder is clear. Try a shorter lookahead before changing sides.
  for(const fraction of retreating?[1,.65,.4]:[1]){
   const at=Math.max(0,Math.min(length,progress+direction*remaining*fraction));
   if(Math.abs(at-progress)<scale*2)continue;
   const part=segments.find(s=>at>=s.progress&&at<=s.progress+s.length);
   if(!part)continue;
   const partAlong=at-part.progress,t=partAlong/part.length;
   const width=(part.a.width??part.path.width)*(1-t)+(part.b.width??part.path.width)*t;
   const centre={x:part.a.x+part.ux*partAlong,y:part.a.y+part.uy*partAlong};
   const fx=part.ux*direction,fy=part.uy*direction;
   // Leave enough margin for the whole hull and steering drift on bends.
   const offset=retreating?width/2+shape.width+scale*2.5:0;
   const lane={x:centre.x+fy*offset*side,y:centre.y-fx*offset*side,ux:fx,uy:fy,
    path:seg.pathId,direction,progress:progress*direction,retreatShoulder:retreating,retreatSide:retreating?side:0};
   const pose={...lane,kind:unit.kind,heading:Math.atan2(-fx,fy)};
   if(!mission.nav.lineClear(unit,lane,false,true)||!mission.nav.clearSolidSweep(vehicleSweep(pose,pose,scale,mission.field),mission.nav.nearbySolids(lane,scale*4)))continue;
   if(!reconsider||!occupiedShoulder(mission,unit,lane,scale))return lane;
   occupied??=lane;break;
  }
 }
 return occupied;
}

export function roadDrivingLane(mission,unit,point,scale){
 const roads=mission.nav.roads,start=roads.nearest(unit,scale*8);
 const routeMargin=unit.combatRetreat?scale*8:0;
 if(!start)return null;
 const pointRoad=roads.nearestWaypoint(point,routeMargin);
 if(!pointRoad)return null;
 let target=point,targetRoad=pointRoad;
 // A short intermediate centre-line point must not switch lane keeping off.
 // Look along this accepted road leg only; an explicit exit into the field
 // ends the lookahead and retains the player's off-road route.
 for(const next of unit.path){
  const at=next===point?pointRoad:roads.nearestWaypoint(next,routeMargin);
  if(!at||at.segment.pathId!==start.segment.pathId)break;
  target=next;targetRoad=at;
  if(!unit.combatRetreat&&distance(unit,next)>=40)break;
 }
 const lane=opposingRetreatLane(mission,unit,start,target,targetRoad,scale)??roads.rightLane(unit,target,scale);
 return lane;
}

export function deferRoadMerge(mission,unit,intent,scale){
 const lane=intent.roadLane;
 // The shoulder is narrower and bends alongside the road. Limit speed so a
 // retreating car can follow it instead of oscillating across the centre.
 if(lane?.retreatShoulder){
  if(unit.combatRetreat)Object.assign(unit.combatRetreat,{shoulderSide:lane.retreatSide,shoulderPath:lane.path,shoulderDirection:lane.direction});
  intent={...intent,trafficLimit:Math.min(intent.trafficLimit,scale*5)};
 }
 if(!lane||unit.reversing||-Math.sin(unit.heading)*lane.ux+Math.cos(unit.heading)*lane.uy<.9)return intent;
 const roads=mission.nav.roads;
 const own=Math.abs((lane.x-unit.x)*lane.uy-(lane.y-unit.y)*lane.ux);
 const rank=roadTrafficRank(unit,lane.progress,roads.nearest(unit,scale*7),lane.direction,scale);
 let leader=null,nearest=Infinity,separating=false;
 for(const other of mission.nearbyUnits(unit,scale*13)){
  if(other===unit||other.hp<=0||other.owner!==unit.owner||!other.path.length||other.reversing)continue;
  const otherLane=roadDrivingLane(mission,other,other.path[0],scale);
  if(!otherLane||otherLane.path!==lane.path||otherLane.direction!==lane.direction)continue;
  if(!!lane.retreatShoulder!==!!otherLane.retreatShoulder||lane.retreatShoulder&&lane.retreatSide!==otherLane.retreatSide)continue;
  const alignment=-Math.sin(other.heading)*lane.ux+Math.cos(other.heading)*lane.uy;
  const across=Math.abs((other.x-unit.x)*lane.uy-(other.y-unit.y)*lane.ux),along=otherLane.progress-lane.progress;
  const otherOffset=Math.abs((otherLane.x-other.x)*lane.uy-(otherLane.y-other.y)*lane.ux);
  if(alignment<.9||across<scale*.5||Math.abs(along)>scale*7||Math.max(own,otherOffset)<scale*.2)continue;
  // Cars on either side of the future lane need a longitudinal gap before
  // either steers into it. The winner keeps rolling at normal speed; only
  // the yielder limits its speed, so equal lateral offsets cannot deadlock.
  separating=true;
  let lease=unit.mergeTraffic?.[other.id];
  if(!lease||lease.path!==lane.path||lease.direction!==lane.direction||lease.expires<mission.state.time){
   const otherRank=roadTrafficRank(other,otherLane.progress,roads.nearest(other,scale*7),lane.direction,scale);
   const winner=compareRoadTrafficRanks(rank,otherRank)<=0?unit:other;
   lease={leader:winner.id,path:lane.path,direction:lane.direction,expires:mission.state.time+1.8};
   // This runs during the shared intent pass, before either vehicle moves.
   // Recomputing the tie after one moves can create reciprocal waiting.
   (unit.mergeTraffic??={})[other.id]=lease;
   (other.mergeTraffic??={})[unit.id]={...lease};
  }
  if(lease.leader===other.id&&Math.abs(along)<nearest){leader=other;nearest=Math.abs(along);}
 }
 // A passed intermediate connector is dispensable only when the next
 // segment is checked against the same terrain and building policy.
 while(unit.path.length>1){
  const first=unit.path[0],next=unit.path[1];
  if((first.x-unit.x)*lane.ux+(first.y-unit.y)*lane.uy>=0
   ||(next.x-unit.x)*lane.ux+(next.y-unit.y)*lane.uy<=0
   ||!mission.nav.lineClear(unit,next,false,true))break;
  unit.path.shift();
 }
 if(!separating)return intent;
 const waypoint={x:unit.x+lane.ux*39,y:unit.y+lane.uy*39};
 if(!mission.nav.lineClear(unit,waypoint,false,true))return intent;
 // Keep the current lateral track while the higher-priority car opens a
 // real longitudinal gap. Following still brakes against actual bodies.
 return {...intent,waypoint,roadLane:null,course:{x:lane.ux,y:lane.uy},mergeSeparating:true,mergeYieldTo:leader?.id??null,
  trafficLimit:Math.min(intent.trafficLimit,leader?Math.max(4,(leader.driveSpeed??0)*.8):Infinity)};
}
