import {firingSlots,firingPose} from './firing-positions.js';
import {firingGroundAllowed} from './firing-ground.js';

const caches=new WeakMap(),distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export const firingAreaRevision=1;
// Geometry belongs to the target area, not to an arriving car. Moving bodies,
// fog and reservations are checked by the caller against the live world.
export function* firingAreaSlotsSteps(mission,unit,angle,anchor,target=anchor){
  const nav=mission.nav,field=mission.field,scale=mission.config.worldScale,range=mission.unitSpec(unit).range;
  let cache=caches.get(nav);
  if(!cache||cache.buildings!==mission.state.buildings||cache.revision!==nav.topologyRevision||cache.height!==field.heightAt
    ||cache.gradient!==field.gradientAt||cache.roads!==nav.roads||cache.sight!==mission.lineOfSight){
    cache={buildings:mission.state.buildings,revision:nav.topologyRevision,height:field.heightAt,gradient:field.gradientAt,
      roads:nav.roads,sight:mission.lineOfSight,areas:new Map()};caches.set(nav,cache);
  }
  // Construction can grow an opaque volume without changing its footprint.
  // Sample changes once per tick and invalidate only areas it can occlude.
  if(cache.time!==mission.state.time){
    cache.time=mission.state.time;
    const construction=new Map(mission.state.buildings.filter(b=>b.hp>0&&!b.completed)
      .map(b=>[b.id,{x:b.x,y:b.y,progress:b.progress,radius:Math.hypot(b.halfWidth??0,b.halfDepth??0)}]));
    const changed=[];
    for(const [id,b] of construction)if(cache.construction?.get(id)?.progress!==b.progress)changed.push(b);
    for(const [id,b] of cache.construction??[])if(!construction.has(id))changed.push(b);
    for(const [key,area] of cache.areas)if(changed.some(b=>distance(b,area.anchor)<=area.range+b.radius))cache.areas.delete(key);
    cache.construction=construction;
  }
  const key=[unit.kind,scale,range,angle,anchor.x,anchor.y,target.id,target.kind,target.x,target.y,target.groundHeight].join('|');
  if(cache.areas.has(key))return cache.areas.get(key).slots;
  const slots=firingSlots(mission.unitSpec(unit),scale,angle,anchor),packed=[],spacing=scale*7;
  const allowed=point=>{
    if(!mission.inBounds(point.x,point.y))return false;
    // A static probe must not inherit a live car's terrain escape or passage.
    const pose=firingPose({kind:unit.kind},point,target);
    return firingGroundAllowed(mission,pose)&&mission.vehicleTerrainSweep(pose,pose,pose)!==false&&mission.lineOfSight(pose,target);
  };
  // Preserve old reservation indices in saves. Invalid template points do not
  // consume space: the area scan can fill the road between those circles.
  for(const point of slots){yield;if(allowed(point))packed.push(point);}
  const step=Math.min(nav.cell,scale*2),outer=range*.97,inner=range*.38,samples=[];
  for(let y=Math.ceil((anchor.y-outer)/step)*step;y<=anchor.y+outer;y+=step)
    for(let x=Math.ceil((anchor.x-outer)/step)*step;x<=anchor.x+outer;x+=step){
      const radius=Math.hypot(x-anchor.x,y-anchor.y);
      if(radius>=inner&&radius<=outer)samples.push({x,y,radius});
    }
  samples.sort((a,b)=>a.radius-b.radius||a.y-b.y||a.x-b.x);
  for(const [index,point] of samples.entries()){
    if(index%8===0)yield;
    if(packed.some(other=>distance(point,other)<spacing)||!allowed(point))continue;
    const slot={x:point.x,y:point.y};slots.push(slot);packed.push(slot);
  }
  if(cache.areas.size>=128)cache.areas.delete(cache.areas.keys().next().value);
  cache.areas.set(key,{slots,anchor:{x:anchor.x,y:anchor.y},range});return slots;
}
