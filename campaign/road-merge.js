import {roadTrafficRank,compareRoadTrafficRanks} from './traffic-priority.js';
import {vehicleEnvelope,vehicleSweep} from './vehicle-collision.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

// Retreating vehicles use the shoulder before an encounter occurs. Attackers
// use the centre when opposing retreat traffic is nearby. Published routes and
// collision checks remain unchanged.
function opposingRetreatLane(mission,unit,road,target,scale){
 const retreating=!!unit.combatRetreat,attacking=['attack','attack-move'].includes(unit.task?.type)||!!unit.combatDeployment;
 if(!retreating&&!attacking)return null;
 const roads=mission.nav.roads,seg=road.segment,dx=target.x-unit.x,dy=target.y-unit.y,d=Math.hypot(dx,dy);
 if(d<scale*8)return null;
 const alignment=(dx*seg.ux+dy*seg.uy)/d;
 const targetRoad=retreating?roads.nearest(target):null;
 const along=targetRoad?.segment?.pathId===seg.pathId
  ?targetRoad.segment.progress+targetRoad.along-seg.progress-road.along:null;
 if(!(Math.abs(along??0)>scale*2)&&Math.abs(alignment)<.55)return null;
 const direction=Math.sign(Math.abs(along??0)>scale*2?along:alignment),ux=seg.ux*direction,uy=seg.uy*direction,range=scale*40;
 const opponent=retreating||mission.nearbyUnits(unit,range).find(other=>{
  if(other.id===unit.id||other.owner!==unit.owner||other.hp<=0||!other.path?.length)return false;
  if(!other.combatRetreat)return false;
  const near=roads.nearest(other,scale*8);
  if(!near||near.segment.pathId!==seg.pathId)return false;
  const next=other.path.find(p=>distance(other,p)>scale*4)??other.path.at(-1);
  const od=Math.hypot(next.x-other.x,next.y-other.y);
  if(od<1||((next.x-other.x)*ux+(next.y-other.y)*uy)/od>-.55)return false;
  const ahead=(other.x-unit.x)*ux+(other.y-unit.y)*uy;
  return ahead>-scale*6&&ahead<range;
 });
 if(!opponent)return null;
 const segments=roads.routes.get(seg.pathId),progress=seg.progress+road.along;
 const end=segments.at(-1),length=end.progress+end.length;
 const remaining=Math.min(d*.8,scale*14);
 const shape=vehicleEnvelope(unit,scale,mission.field);
 // Keep one side while following the road; choosing from the current lateral
 // position would switch sides while a turning car crosses the centre line.
 const preferred=retreating?(unit.combatRetreat.shoulderSide??1):0;
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
   return lane;
  }
 }
 return null;
}

export function roadDrivingLane(mission,unit,point,scale){
 const roads=mission.nav.roads,start=roads.nearest(unit,scale*8);
 if(!start||!roads.nearest(point))return null;
 let target=point;
 // A short intermediate centre-line point must not switch lane keeping off.
 // Look along this accepted road leg only; an explicit exit into the field
 // ends the lookahead and retains the player's off-road route.
 if(start)for(const next of unit.path){
  const at=roads.nearest(next);
  if(!at||at.segment.pathId!==start.segment.pathId)break;
  target=next;if(!unit.combatRetreat&&distance(unit,next)>=40)break;
 }
 const lane=opposingRetreatLane(mission,unit,start,target,scale)??roads.rightLane(unit,target,scale);
 return lane;
}

export function deferRoadMerge(mission,unit,intent,scale){
 const lane=intent.roadLane;
 // The shoulder is narrower and bends alongside the road. Limit speed so a
 // retreating car can follow it instead of oscillating across the centre.
 if(lane?.retreatShoulder){
  if(unit.combatRetreat)unit.combatRetreat.shoulderSide=lane.retreatSide;
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
