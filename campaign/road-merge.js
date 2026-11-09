import {roadTrafficRank,compareRoadTrafficRanks} from './traffic-priority.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

export function roadDrivingLane(mission,unit,point,scale){
 const roads=mission.nav.roads,start=roads.nearest(unit);
 if(!start||!roads.nearest(point))return null;
 let target=point;
 // A short intermediate centre-line point must not switch lane keeping off.
 // Look along this accepted road leg only; an explicit exit into the field
 // ends the lookahead and retains the player's off-road route.
 if(start)for(const next of unit.path){
  const at=roads.nearest(next);
  if(!at||at.segment.pathId!==start.segment.pathId)break;
  target=next;if(distance(unit,next)>=40)break;
 }
 const lane=roads.rightLane(unit,target,scale);
 return lane;
}

export function deferRoadMerge(mission,unit,intent,scale){
 const lane=intent.roadLane;
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
