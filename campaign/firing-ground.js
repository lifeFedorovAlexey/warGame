import {vehicleEnvelope} from './vehicle-collision.js';
import {isInfantry} from './scav-unit-profiles.js';

// Off-road parking requires a level platform. An engineered road can climb:
// its whole hull must stay on pavement, under the normal driving grade.
export const maxFiringGrade=.12;
const samples=[[0,0],[1,0],[-1,0],[0,1],[0,-1],
  [Math.SQRT1_2,Math.SQRT1_2],[-Math.SQRT1_2,Math.SQRT1_2],
  [Math.SQRT1_2,-Math.SQRT1_2],[-Math.SQRT1_2,-Math.SQRT1_2]];
const caches=new WeakMap();
export function firingGroundAllowed(mission,unit,point=unit,heading=point.heading??unit.heading??0){
  const field=mission.field;
  if(isInfantry(unit.kind)||!field?.heightAt)return true;
  let cache=caches.get(field);
  const revision=mission.nav?.terrainAllowed,roads=mission.nav?.roads;
  if(!cache||cache.height!==field.heightAt||cache.gradient!==field.gradientAt||cache.revision!==revision||cache.roads!==roads){
    cache={height:field.heightAt,gradient:field.gradientAt,revision,roads,poses:new Map()};caches.set(field,cache);
  }
  const scale=mission.config.worldScale,key=[unit.kind,scale,point.x,point.y,heading].join('|');
  if(cache.poses.has(key))return cache.poses.get(key);
  const box=vehicleEnvelope({...unit,...point,heading},scale,field),z=field.heightAt(box.x,box.y);
  let allowed=Number.isFinite(z),grade=0;const footprint=[];
  for(const [sx,sy] of samples){
    const dx=sx*box.width,dy=sy*box.depth,x=box.x+dx*box.c-dy*box.s,y=box.y+dx*box.s+dy*box.c;
    const h=field.heightAt(x,y),g=field.gradientAt?.(x,y);
    if(!Number.isFinite(h)||g&&(!Number.isFinite(g.x)||!Number.isFinite(g.y))){allowed=false;break;}
    grade=Math.max(grade,g?Math.hypot(g.x,g.y):0,Math.hypot(dx,dy)>0?Math.abs(h-z)/Math.hypot(dx,dy):0);
    footprint.push({x,y});
  }
  if(grade>maxFiringGrade)allowed=allowed&&grade<=.52&&!!roads
    &&footprint.every(p=>roads.coverage(p.x,p.y)>=.58);
  if(cache.poses.size>=4096)cache.poses.delete(cache.poses.keys().next().value);
  cache.poses.set(key,allowed);return allowed;
}
