// Offline import of original cam1b positions; source heights are unchanged.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {makeField,makeMission} from './m02-fixture.mjs';
import {TerrainNavigator} from '../campaign/navigation.js';
import {siteRoads,siteCourts} from '../assets/campaign/alpha/mission02/site-plan.js';
import {m02StructurePlan} from '../campaign/mission02-base-layout.js';
const f=makeField();f.m02Authoring=true;
const m=makeMission(f),scale=m.config.worldScale;
f.navigation={...f.navigation,transitions:f.navigation.transitions.filter(t=>!t.road?.startsWith('m02-'))};
m.state.buildings=[];m.state.units=[];m.state.bounds=[0,0,53,127];
const source=JSON.parse(fs.readFileSync('references/terrain/alpha/original-cam1b/cam1b-struct.bjo.json','utf8'));
const layout={version:2,compoundVersion:3,bounds:m.state.bounds,bases:[],entrance:[],entranceGrid:[38.5,68.5],entranceGuards:[[37.5,70],[39.5,70]],observer:{grid:[37.5,71.875],exitGrid:[50,108]},oilFields:[[28.3,110]]};
const definitions=[['east_factory',43,[35.5,79.5]],['hill_factory',3434,[10.5,76]],['sensor_outpost',3236,[30,90]],['energy_hub',97,[30.5,107.5]]];
const kinds={A0BaBaFactory:'scav-factory',A0BaBaGunTower:'mg-tower',A0BaBaBunker:'bunker',A0BaBaFlameTower:'scav-flame-tower',A0CannonTower:'scav-cannon-tower','Sys-SensoTower01':'scav-sensor',A0PowerGenerator:'generator',A0BaBaPowerGenerator:'scav-generator',A0ResourceExtractor:'derrick'};
const area=row=>row.owner===6?'east_factory':row.grid[1]<80||[3252,3425].includes(row.id)?'hill_factory':row.grid[1]<97?'sensor_outpost':'energy_hub';
for(const [id,carrier] of definitions)layout.bases.push({id,grid:source.find(s=>s.id===carrier).grid,gateGrid:siteCourts.find(s=>s.id===id).gate,structures:[],rallyGrids:[],guardGrids:[]});
for(const row of source){
 const kind=kinds[row.kind];if(!kind)continue;
 const baseId=area(row),base=layout.bases.find(b=>b.id===baseId),carrier=['scav-factory','scav-sensor','generator'].includes(kind);
 const item=m02StructurePlan({id:carrier?`m02.${baseId}.${kind}${kind==='generator'?1:0}`:`m02.original.${row.id}`,sourceId:row.id,kind,grid:row.grid,pickupGrid:row.grid,resource:kind==='derrick'},m.config);
 if(row.id===97)item.rotation=Math.PI;
 if([989,990].includes(row.id)){item.id='m02.entrance.bunker'+layout.entrance.length;layout.entrance.push(item);}else base.structures.push(item);
 const b=m.addStructure(item.kind,'scavs',f.gridToWorld(item.grid),{id:item.id,rotation:item.rotation??0,...(item.halfWidth?{halfWidth:item.halfWidth,halfDepth:item.halfDepth}:{})});
 if(kind==='mg-tower')b.halfWidth=b.halfDepth=2.55*scale;
 item.halfWidth=b.halfWidth;item.halfDepth=b.halfDepth;
}
const solids=m.state.buildings;
const roads={version:3,maxGradeChange:Math.max(...siteRoads.map(r=>r.maxCut??6)),paths:[],transitions:[],sourceRoadEnds:[],sourceRoadStarts:[],sourceRoadSpans:[]};
const p=grid=>f.gridToWorld(grid);
function rounded(points,radius){
 const out=[points[0]];
 const line=q=>{const a=out.at(-1),n=Math.max(1,Math.ceil(Math.hypot(q.x-a.x,q.y-a.y)/3));for(let i=1;i<=n;i++)out.push({x:a.x+(q.x-a.x)*i/n,y:a.y+(q.y-a.y)*i/n});};
 for(let i=1;i<points.length-1;i++){
  const a=points[i-1],b=points[i],c=points[i+1],ab=Math.hypot(b.x-a.x,b.y-a.y),bc=Math.hypot(c.x-b.x,c.y-b.y),u={x:(b.x-a.x)/ab,y:(b.y-a.y)/ab},v={x:(c.x-b.x)/bc,y:(c.y-b.y)/bc};
  const turn=Math.atan2(u.x*v.y-u.y*v.x,u.x*v.x+u.y*v.y);
  if(Math.abs(turn)<.001){line(b);continue;}
  const tangent=Math.tan(Math.abs(turn)/2),trim=Math.min(radius*tangent,ab*.4,bc*.4),r=trim/tangent,side=Math.sign(turn),entry={x:b.x-u.x*trim,y:b.y-u.y*trim},center={x:entry.x-u.y*r*side,y:entry.y+u.x*r*side};
  line(entry);const start=Math.atan2(entry.y-center.y,entry.x-center.x),steps=Math.max(4,Math.ceil(Math.abs(turn)*r/3));
  for(let k=1;k<=steps;k++){const a=start+turn*k/steps;out.push({x:center.x+Math.cos(a)*r,y:center.y+Math.sin(a)*r});}
 }
 line(points.at(-1));return out;
}
for(const spec of siteRoads){
 const controls=spec.grid.map(p);
 if(spec.sourceSpan){
  const road=f.roadNetwork.paths.find(r=>r.id===spec.sourceSpan),indices=[];
  for(const end of [0,controls.length-1]){
   const q=controls[end];let index=0;
   for(let i=1;i<road.points.length;i++)if(Math.hypot(road.points[i].x-q.x,road.points[i].y-q.y)<Math.hypot(road.points[index].x-q.x,road.points[index].y-q.y))index=i;
   controls[end]={...road.points[index]};indices.push(index);
  }
  assert(indices[0]<indices[1],spec.id+' source span direction');
  roads.sourceRoadSpans.push({id:road.id,fromIndex:indices[0],toIndex:indices[1],road:'m02-'+spec.id});
 }
 for(const index of [0,controls.length-1])if((index===0?spec.startAt:spec.endAt)==='existing-road'){
  const q=controls[index];let nearest=null;
  for(const road of f.roadNetwork.paths)for(let i=1;i<road.points.length;i++){
   const a=road.points[i-1],b=road.points[i],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((q.x-a.x)*dx+(q.y-a.y)*dy)/(dx*dx+dy*dy||1))),point={x:a.x+dx*t,y:a.y+dy*t},d=Math.hypot(point.x-q.x,point.y-q.y);
   if(!nearest||d<nearest.d)nearest={point,d};
  }
  assert(nearest?.d<32,spec.id+' existing-road junction');controls[index]=nearest.point;
 }
 const points=rounded(controls,spec.radius),grade=spec.grade??.20;
 const h=points.map(q=>f.heightAt(q.x,q.y)),cut=spec.maxCut??6,low=h.map(z=>z-cut),high=h.map(z=>z+cut),distance=points.map((q,i)=>i?Math.hypot(q.x-points[i-1].x,q.y-points[i-1].y):0);
 low[0]=high[0]=h[0];low[low.length-1]=high[high.length-1]=h.at(-1);
 for(let pass=0;pass<3;pass++){
  for(let i=1;i<h.length;i++){low[i]=Math.max(low[i],low[i-1]-grade*distance[i]);high[i]=Math.min(high[i],high[i-1]+grade*distance[i]);}
  for(let i=h.length-2;i>=0;i--){low[i]=Math.max(low[i],low[i+1]-grade*distance[i+1]);high[i]=Math.min(high[i],high[i+1]+grade*distance[i+1]);}
 }
 assert(low.every((z,i)=>z<=high[i]+1e-6),spec.id+' road grading');
 points[0].z=h[0];for(let i=1;i<h.length;i++)points[i].z=Math.max(low[i],Math.min(high[i],Math.max(points[i-1].z-grade*distance[i],Math.min(points[i-1].z+grade*distance[i],h[i]))));
 const replaceAreas=(spec.replaceGrids??(spec.replaceGrid?[spec.replaceGrid]:[])).map(rect=>{
  const a=p(rect.slice(0,2)),b=p(rect.slice(2));return {rect:[a.x,b.y,b.x,a.y],feather:2};
 });
 if(spec.preserveSource)replaceAreas[0].preserveRoads=spec.preserveSource.map(id=>{
  const road=f.roadNetwork.paths.find(r=>r.id===id),[l,b,r,t]=replaceAreas[0].rect;
  return {width:road.width,points:road.points.filter(p=>p.x>l-32&&p.x<r+32&&p.y>b-32&&p.y<t+32)};
 });
 if(spec.endWidth){let distance=0;for(let i=points.length-1;i>=0;i--){if(i<points.length-1)distance+=Math.hypot(points[i].x-points[i+1].x,points[i].y-points[i+1].y);points[i].width=spec.width+(spec.endWidth-spec.width)*Math.max(0,1-distance/40);}}
 roads.paths.push({id:'m02-'+spec.id,site:spec.site,width:spec.width,startCap:'round',endCap:spec.endCap??'butt',cutSourcePaint:true,...(replaceAreas?{replaceAreas}:{}),points});
 for(const [trim,output] of [[spec.sourceEnd,roads.sourceRoadEnds],[spec.sourceStart,roads.sourceRoadStarts]])if(trim){
  const source=f.roadNetwork.paths.find(r=>r.id===trim.id),x=p([trim.gridX,0]).x;
  const i=source.points.findIndex((a,i)=>i<source.points.length-1&&(a.x-x)*(source.points[i+1].x-x)<=0);
  assert(i>=0,spec.id+' source road connection');
  const a=source.points[i],b=source.points[i+1],t=(x-a.x)/(b.x-a.x);
  output.push({id:source.id,afterIndex:i,point:{x,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t}});
 }
}
// Artifact/service stops remain next to their actual doors, independently of
// the road planner. No placement algorithm draws a second parallel driveway.
for(const base of layout.bases)for(const item of base.structures.filter(s=>['scav-factory','scav-sensor','generator','derrick'].includes(s.kind))){
 const b=solids.find(b=>b.id===item.id),target={x:b.x,y:b.y+(item.rotation?1:-1)*(b.halfDepth+34)};
 item.pickupGrid=f.worldToGrid(target.x,target.y);
}
// The very same corridors make openings in the authored level boundaries.
const levels=new Uint8Array(f.navigation.size**2),n=f.navigation.size;
f.navigation.rows.forEach((row,y)=>{let x=0;for(const run of row.split(',')){const [count,level]=run.split(':').map(Number);levels.fill(level,y*n+x,y*n+x+count);x+=count;}});
const distance=(p,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-dx*t,p.y-a.y-dy*t);};
const buckets=new Map();for(const road of roads.paths)for(let i=1;i<road.points.length;i++){
 const a=road.points[i-1],b=road.points[i],r=road.width/2+8;
 for(let y=Math.floor((Math.min(a.y,b.y)-r)/64);y<=Math.floor((Math.max(a.y,b.y)+r)/64);y++)for(let x=Math.floor((Math.min(a.x,b.x)-r)/64);x<=Math.floor((Math.max(a.x,b.x)+r)/64);x++){const key=x+','+y;const list=buckets.get(key)??[];list.push({road,a,b});buckets.set(key,list);}
}
for(const axis of ['x','y'])for(let fixed=1;fixed<n;fixed++)for(let v=0;v<n;v++){
 if(axis==='x'?levels[v*n+fixed-1]===levels[v*n+fixed]:levels[(fixed-1)*n+v]===levels[fixed*n+v])continue;
 const at=axis==='x'?fixed*8-f.half:f.half-fixed*8,low=axis==='x'?f.half-(v+1)*8:v*8-f.half,point=axis==='x'?{x:at,y:low+4}:{x:low+4,y:at};
 const hit=(buckets.get(Math.floor(point.x/64)+','+Math.floor(point.y/64))??[]).find(({road,a,b})=>distance(point,a,b)<road.width/2+8);
 if(hit)roads.transitions.push({axis,at,low,high:low+8,road:hit.road.id});
}
f.navigation={...f.navigation,transitions:[...f.navigation.transitions,...roads.transitions]};f.localRoads=roads.paths;
m.nav=new TerrainNavigator(f,{bounds:layout.bounds,vehicleScale:scale});m.rebuildNavigation();
const start=p(m.config.startGrid),pose=q=>({...q,kind:'bukhanka',owner:'scavs',heading:0}),clear=q=>m.vehicleMotionClear(pose(q),pose(q),pose(q));
for(const base of layout.bases){
 const center=p(base.gateGrid),slots=[];
 for(let dy=-160;dy<=160;dy+=32)for(let dx=-160;dx<=160;dx+=32){const q={x:center.x+dx,y:center.y+dy};if(clear(q)&&m.nav.findPath(start,q)?.length)slots.push({...q,score:dx*dx+dy*dy});}
 slots.sort((a,b)=>a.score-b.score||a.x-b.x||a.y-b.y);assert(slots.length>=17,base.id+' assembly');
 base.gateGrid=f.worldToGrid(slots[0].x,slots[0].y);base.rallyGrids=slots.slice(0,12).map(q=>f.worldToGrid(q.x,q.y));base.guardGrids=slots.slice(12,17).map(q=>f.worldToGrid(q.x,q.y));
 for(const item of base.structures.filter(s=>['scav-factory','scav-sensor','generator','derrick'].includes(s.kind))){const q=p(item.pickupGrid);assert(clear(q)&&m.nav.findPath(start,q)?.length,item.id+' pickup');}
}
for(const key of ['grid','exitGrid']){const q=p(layout.observer[key]);assert(clear(q)&&m.nav.findPath(start,q)?.length,'observer '+key);}
fs.writeFileSync('assets/campaign/alpha/mission02/layout.js','// Original cam1b identities with approved compound placement; tools/import-m02-map.mjs.\nexport default '+JSON.stringify(layout,null,2)+';\n');
fs.writeFileSync('assets/campaign/alpha/mission02/roads.js','// Surveyed Alpha corridors shared by rendering and collision.\nexport default '+JSON.stringify(roads)+';\n');
console.log(JSON.stringify({bases:layout.bases.map(b=>({id:b.id,structures:b.structures.length})),roads:roads.paths.length,openings:roads.transitions.length}));
