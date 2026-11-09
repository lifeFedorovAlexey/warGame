// Shared ordering for road parking slots and the actual merge into their lane.
// Fixed longitudinal bands make this a transitive sort, unlike pairwise
// "within epsilon" comparisons. They do not quantise vehicle positions.
export function trafficPriorityHash(unit){
 let hash=19452;
 for(const char of unit.id)hash=Math.imul(hash^char.charCodeAt(0),0x45d9f3b);
 return (hash^(hash>>>16))>>>0;
}
export const roadLaneOffset=(width,scale)=>Math.max(0,Math.min(width*.25,width/2-scale*1.30));
export function roadTrafficRank(unit,progress,road,direction,scale){
 let laneDistance=Infinity;
 if(road){
  const lateral=((unit.x-road.x)*road.segment.uy-(unit.y-road.y)*road.segment.ux)*direction;
  laneDistance=Math.abs(lateral-roadLaneOffset(road.width,scale));
 }
 return {band:Number.isFinite(progress)?Math.floor(progress/(scale*.24)):-Infinity,
  laneDistance,tie:trafficPriorityHash(unit)};
}
export function compareRoadTrafficRanks(a,b){
 if(a.band!==b.band)return a.band>b.band?-1:1;
 if(a.laneDistance!==b.laneDistance)return a.laneDistance<b.laneDistance?-1:1;
 return a.tie-b.tie;
}
