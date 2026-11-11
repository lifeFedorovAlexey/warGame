import {campBaseLayout} from './scav-base-layout.js';
import {originalCampOpenings} from './mission01-terrain.js';

// Authored service lanes in the existing flat yards. They belong to the map,
// so destroying a camp does not remove its streets. No simulation per frame.
const lanes={
 'nw-pocket':[
  [20,[[112,0],[48,0],[48,64],[-60,64]]],
 ],
 'nw-west':[
  [24,[[83.2,-94],[83.2,-142]]],
  [18,[[77,-42],[0,-40]]],
  [16,[[65,71],[20,42],[-43,39]]],
 ],
 'nw-east':[
  [20,[[24,-65],[40,-40],[40,44],[-40,44]]],
 ],
 'west-south':[
  [18,[[-32,41],[0,44],[40,44],[40,-32],[67,-32]]],
  [14,[[-108,-70],[-32,-70]]],
 ],
};

// Tangent circular fillets keep the inside pavement edge round too. The old
// tight quadratic bends pinched into sharp elbows on these wide service lanes.
function rounded(points,width=20){
 const out=[points[0]],line=p=>{const a=out.at(-1),n=Math.max(1,Math.ceil(Math.hypot(p.x-a.x,p.y-a.y)/3));for(let j=1;j<=n;j++)out.push({x:a.x+(p.x-a.x)*j/n,y:a.y+(p.y-a.y)*j/n});};
 for(let i=1;i<points.length-1;i++){
  const a=points[i-1],b=points[i],c=points[i+1],ab=Math.hypot(b.x-a.x,b.y-a.y),bc=Math.hypot(c.x-b.x,c.y-b.y);
  const u={x:(b.x-a.x)/ab,y:(b.y-a.y)/ab},v={x:(c.x-b.x)/bc,y:(c.y-b.y)/bc};
  const turn=Math.atan2(u.x*v.y-u.y*v.x,u.x*v.x+u.y*v.y);
  if(Math.abs(turn)<.001){line(b);continue;}
  const tangent=Math.tan(Math.abs(turn)/2),trim=Math.min(width*1.25*tangent,ab*.45,bc*.45),radius=trim/tangent,side=Math.sign(turn);
  const p={x:b.x-u.x*trim,y:b.y-u.y*trim},centre={x:p.x-u.y*radius*side,y:p.y+u.x*radius*side};line(p);
  const start=Math.atan2(p.y-centre.y,p.x-centre.x),steps=Math.max(4,Math.ceil(Math.abs(turn)*radius/2));
  for(let j=1;j<=steps;j++){const angle=start+turn*j/steps;out.push({x:centre.x+Math.cos(angle)*radius,y:centre.y+Math.sin(angle)*radius});}
 }
 line(points.at(-1));return out;
}

export function scavBaseRoads(field,config){
 if(config.m01LayoutVersion===3)return originalCampRoads(field,config);
 const result=[];
 for(const data of config.camps){
  const camp={...data,...field.gridToWorld(data.grid)},layout=campBaseLayout(camp);if(!layout)continue;
  for(const [index,[width,points]] of (lanes[camp.id]??[]).entries())result.push({id:camp.id+'-yard-'+index,campId:camp.id,width,points:rounded(points.map(([x,y])=>({x:camp.x+x,y:camp.y+y})),width)});
  // The northern fort is beside a through-road. A short straight spur reaches
  // its gate; it does not wrap around the fort or distort the main carriageway.
  if(camp.id==='nw-east'){
   const {gate,normal:n}=layout;let best=null;
   for(const road of field.roadNetwork?.paths??[])for(let i=1;i<road.points.length;i++){
    const a=road.points[i-1],b=road.points[i],dx=b.x-a.x,dy=b.y-a.y,cross=n.x*dy-n.y*dx;if(Math.abs(cross)<1e-8)continue;
    const ax=a.x-gate.x,ay=a.y-gate.y,t=(ax*dy-ay*dx)/cross,u=(ax*n.y-ay*n.x)/cross;
    if(t<0||t>180||u<0||u>1)continue;
    if(!best||t<best.t)best={x:gate.x+n.x*t,y:gate.y+n.y*t,t};
   }
   if(best)result.push({id:camp.id+'-approach',campId:camp.id,width:20,points:rounded([best,gate])});
  }
 }
 return result;
}

function originalCampRoads(field,config){
 const p=field.gridToWorld;
 const source=field.m01SourceNetworks?.network??field.missionTerrain?.network??field.roadNetwork;
 const junction=grid=>{const target=p(grid),road=source?.paths?.find(r=>r.id==='nw-east--nw-west-13');return road?road.points.reduce((best,q)=>Math.hypot(q.x-target.x,q.y-target.y)<Math.hypot(best.x-target.x,best.y-target.y)?q:best):target;};
 const plans=[
  ['outpost-approach','nw-pocket',22,[[41.3,40.8],[37.5,40.8],[33.5,40.5],[28.5,40.5],[28.5,39]]],
  ['outpost-yard','nw-pocket',20,[[28.5,39],[28.5,37],[29.5,37]]],
  ['east-approach','nw-west',24,[[31,21.35],[38,22],[39.5,22],[39.5,20.5]]],
  ['east-yard','nw-west',20,[[39.5,20.5],[40,19.8],[40,17.7]]],
  ['northwest-approach','nw-east',24,[[15.4,18.7],[12.5,18.7],[12.5,16.25]]],
  ['northwest-yard','nw-east',20,[[12.5,16.25],[12.5,13.8],[13,13.8]]],
  ['hq-approach','west-south',24,[[17,24.5],[17.4,26],[16.5,27],[16.5,28.5]]],
  ['hq-yard','west-south',20,[[16.5,28.5],[16.5,29.35],[19,29.35],[19,30.2]]],
 ];
 return plans.map(([name,campId,width,grid])=>{
  const points=grid.map(p);if(['east-approach','northwest-approach','hq-approach'].includes(name))points[0]=junction(grid[0]);
  if(name==='outpost-approach'){
   const trunk=source.paths.find(r=>r.id==='junction-1--junction-6-3'),target=points[0];
   points[0]=trunk.points.reduce((best,q)=>Math.hypot(q.x-target.x,q.y-target.y)<Math.hypot(best.x-target.x,best.y-target.y)?q:best);
  }
  const road={id:'m01-original-'+name,campId,m01LayoutVersion:3,width,points:rounded(points,width)};
  if(name==='outpost-approach'){
   const a=p([34.5,36]),b=p([42.5,43.4]);road.cutSourcePaint=true;
   road.replaceAreas=[{rect:[a.x,b.y,b.x,a.y],feather:2,preserveRoads:source.paths.filter(r=>['junction-1--junction-6-3','nw-east--junction-6-12'].includes(r.id))}];
  }
  if(name==='hq-approach'){
   const sourceRoad=source?.paths?.find(r=>r.id==='nw-east--nw-west-13'),start=points[0];
   const prefix=sourceRoad?{...sourceRoad,points:sourceRoad.points.slice(0,sourceRoad.points.indexOf(start)+1)}:null;
   let distance=0;road.points.forEach((q,i)=>{if(i)distance+=Math.hypot(q.x-road.points[i-1].x,q.y-road.points[i-1].y);q.width=width+((start.width??sourceRoad?.width??width)-width)*Math.max(0,1-distance/48);});
   const a=p([15,24]),b=p([20.5,35.5]);road.cutSourcePaint=true;road.replaceAreas=[{rect:[a.x,b.y,b.x,a.y],feather:2,preserveRoads:prefix?[prefix]:[]}];
  }
  return road;
 });
}

export function syncScavBaseRoads(field,config){
 if(field.m01RoadLayoutVersion===config.m01LayoutVersion)return false;
 const terrain=field.missionTerrain;
 if(terrain){
  field.m01SourceNetworks??={network:terrain.network,southernNetwork:terrain.southernNetwork};
  const trim=network=>({...network,paths:network.paths.filter(road=>road.id!=='junction-6--nw-pocket-17').map(road=>{
   if(road.id!=='nw-east--nw-west-13')return road;
   const point=field.gridToWorld([17,24.5]);let end=0;
   for(let i=1;i<road.points.length;i++)if(Math.hypot(road.points[i].x-point.x,road.points[i].y-point.y)<Math.hypot(road.points[end].x-point.x,road.points[end].y-point.y))end=i;
   return {...road,to:undefined,points:road.points.slice(0,end+1)};
  })});
  for(const key of ['network','southernNetwork'])terrain[key]=config.m01LayoutVersion===3?trim(field.m01SourceNetworks[key]):field.m01SourceNetworks[key];
  field.roadNetwork=terrain.southern?terrain.southernNetwork:terrain.network;
 }
 const base=field.missionBaseRoads??field.localRoads??[];
 const independent=base.filter(r=>!r.campId&&!r.id?.startsWith('m01-original-')&&!r.id?.startsWith('m02-'));
 field.missionBaseRoads=[...independent,...scavBaseRoads(field,config)];
 if(terrain){
  field.m01SourceNavigations??={navigation:terrain.navigation,southernNavigation:terrain.southernNavigation};
  const transitions=config.m01LayoutVersion===3?originalCampOpenings(field,config,field.missionBaseRoads.filter(r=>r.m01LayoutVersion===3),field.m01SourceNavigations.navigation):[];
  for(const key of ['navigation','southernNavigation']){
   const source=field.m01SourceNavigations[key];
   terrain[key]=config.m01LayoutVersion===3?{...source,version:source.version+'-m01-original-v3',transitions:[...source.transitions,...transitions]}:source;
  }
  field.navigation=terrain.southern?terrain.southernNavigation:terrain.navigation;
 }
 field.m01RoadLayoutVersion=config.m01LayoutVersion;return true;
}
