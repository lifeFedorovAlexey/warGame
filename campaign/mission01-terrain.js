import {buildTerrainPassability} from './terrain-passability.js';
import {campBaseLayout} from './scav-base-layout.js';

// The imported topology still contains the old camps' level boundaries.
// Open only the surveyed yards and their service lanes; all other cliffs stay.
// Both the route planner and swept vehicle hulls use these same openings.
export function originalCampOpenings(field,config,roads,navigation){
 // Keep already surveyed clearing space accessible when a new fence is more
 // compact; old saves may still have a building in the former yard corner.
 const yards=config.camps.map(c=>campBaseLayout({...c,...field.gridToWorld(c.grid),
  ...(c.siteLayout?.navigationBox?{siteLayout:{...c.siteLayout,box:c.siteLayout.navigationBox}}:{})}).bounds);
 const segments=roads.flatMap(r=>r.points.slice(1).map((b,i)=>({a:r.points[i],b,radius:Math.max(r.points[i].width??r.width,b.width??r.width)/2+18})));
 const inside=(x,y)=>yards.some(([l,b,r,t])=>x>=l&&x<=r&&y>=b&&y<=t)||segments.some(({a,b,radius})=>{
  if(x<Math.min(a.x,b.x)-radius||x>Math.max(a.x,b.x)+radius||y<Math.min(a.y,b.y)-radius||y>Math.max(a.y,b.y)+radius)return false;
  const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1)));
  return Math.hypot(x-a.x-dx*t,y-a.y-dy*t)<=radius;
 });
 const transitions=[];
 for(const wall of buildTerrainPassability({...field,navigation}).walls){
  const vertical=wall.halfWidth<.1,axis=vertical?'x':'y',at=wall[axis],low=vertical?wall.y-wall.halfDepth:wall.x-wall.halfWidth,high=vertical?wall.y+wall.halfDepth:wall.x+wall.halfWidth;
  for(let start=low;start<high;start+=8){const end=Math.min(high,start+8),mid=(start+end)/2;
   if(inside(vertical?at:mid,vertical?mid:at))transitions.push({axis,at,low:start,high:end,road:'m01-original-yards'});
  }
 }
 return transitions;
}
