import {RoadTraffic, asphaltBonus, gradeSpeed, surfaceTravelCost} from './road-traffic.js';
import {sweepAvoidsFootprint, vehicleSweep} from './vehicle-collision.js';
import {buildTerrainPassability} from './terrain-passability.js';

const climbableGrade = .52;
const edgeCheckTimes=[0,1,.25,.75];
const completeSteps=iterator=>{let step;do{step=iterator.next();}while(!step.done);return step.value;};

// A* on a cached terrain grid. Dynamic building footprints are rasterized once
// per structural change; movement never falls back to teleporting.
export class TerrainNavigator{
 constructor(field,{cell=8,bounds=[0,0,127,127],vehicleScale=4.5}={}){
  this.vehicleScale=vehicleScale;
  this.field=field;this.cell=cell;this.clearance=11+cell/2;this.size=Math.round(field.extent/cell)+1;this.bounds=bounds;const count=this.size*this.size;this.heights=new Float32Array(count);this.walkable=new Uint8Array(count);this.occupied=new Uint8Array(count);this.edgeCache=new Uint8Array(count*8);this.searchId=0;this.closed=new Uint32Array(count);this.visited=new Uint32Array(count);this.cost=new Float32Array(count);this.parent=new Int32Array(count);
  this.roads=new RoadTraffic(field);this.surfaceCosts=new Float32Array(count);this.pavedTripCosts=new Float32Array(count);this.slopes=new Float32Array(count);this.solids=[];
  this.topologyRevision=0;this.topologyBounds=bounds.join(',');this.regionVersions=new Map();this.footprintCounts=new Uint16Array(count);this.staticFootprints=new Map();
  this.terrainAllowed=buildTerrainPassability(field,this.roads);
  for(let row=0;row<this.size;row++)for(let col=0;col<this.size;col++){const p=this.position(col,row),id=row*this.size+col,g=field.gradientAt(p.x,p.y);this.heights[id]=field.heightAt(p.x,p.y);this.slopes[id]=Math.hypot(g.x,g.y);this.walkable[id]=this.slopes[id]<.55&&this.terrainAllowed(p.x,p.y)?1:0;}
 }
 position(col,row){return{x:col*this.cell-this.field.half,y:this.field.half-row*this.cell};}
 grid(x,y){return [Math.max(0,Math.min(this.size-1,Math.round((x+this.field.half)/this.cell))),Math.max(0,Math.min(this.size-1,Math.round((this.field.half-y)/this.cell)))];}
 allowed(col,row){const gx=col*this.cell/32,gy=row*this.cell/32,b=this.bounds;return col>=0&&row>=0&&col<this.size&&row<this.size&&gx>=b[0]&&gy>=b[1]&&gx<=b[2]&&gy<=b[3]&&this.walkable[row*this.size+col]&&!this.occupied[row*this.size+col];}
 rebuild(structures){
  const access=structures.filter(b=>b.hp>0&&b.accessRoads?.length),roadKey=JSON.stringify([this.field.localRoads??[],access.map(b=>b.accessRoads)]);
  if(roadKey!==this.factoryRoadKey){this.factoryRoadKey=roadKey;this.roads=new RoadTraffic(this.field,[...(this.field.localRoads??[]),...access.flatMap(b=>b.accessRoads)]);this.surfaceCosts.fill(0);this.pavedTripCosts.fill(0);this.pathCache?.clear();this.pathCacheRegions?.clear();this.pathCachePoints=0;}
  const previous=this.staticFootprints,next=new Map(),changed=new Set(),counts=this.footprintCounts;
  this.solids=structures.filter(item=>item.hp>0||item.damage?.wreck);
  const mark=cells=>{for(const id of cells)changed.add(Math.floor((id%this.size)/16)+','+Math.floor(Math.floor(id/this.size)/16));};
  const remove=record=>{for(const id of record.cells){counts[id]--;this.occupied[id]=counts[id]>0?1:0;}mark(record.cells);};
  for(const item of this.solids){
   const key=item.id??item,signature=[item.x,item.y,item.halfWidth,item.halfDepth,this.clearance].join('|'),old=previous.get(key);
   if(old?.signature===signature){next.set(key,old);continue;}
   if(old)remove(old);
   const cells=[],[cx,cy]=this.grid(item.x,item.y),rx=Math.ceil((item.halfWidth+this.clearance)/this.cell),ry=Math.ceil((item.halfDepth+this.clearance)/this.cell);
   for(let row=Math.max(0,cy-ry);row<=Math.min(this.size-1,cy+ry);row++)for(let col=Math.max(0,cx-rx);col<=Math.min(this.size-1,cx+rx);col++){
    const p=this.position(col,row);
    if(Math.abs(p.x-item.x)>=item.halfWidth+this.clearance||Math.abs(p.y-item.y)>=item.halfDepth+this.clearance)continue;
    const id=row*this.size+col;cells.push(id);counts[id]++;this.occupied[id]=1;
   }
   next.set(key,{signature,cells});mark(cells);
  }
  for(const [key,record] of previous)if(!next.has(key))remove(record);
  this.staticFootprints=next;this.lastChangedRegions=[...changed];
  const boundsChanged=this.topologyBounds!==this.bounds.join(',');this.topologyBounds=this.bounds.join(',');
  if(changed.size||boundsChanged){
   this.topologyRevision++;
   for(const key of changed)this.regionVersions.set(key,(this.regionVersions.get(key)??0)+1);
  }
 }
 pathRegions(from,path){
  const regions=new Map(),put=(x,y)=>{const [col,row]=this.grid(x,y),key=Math.floor(col/16)+','+Math.floor(row/16);regions.set(key,this.regionVersions.get(key)??0);};
  let a=from;
  for(const b of path){
   const times=[0,1],cross=(q0,q1)=>{if(Math.abs(q1-q0)<1e-9)return;for(let k=Math.ceil(Math.min(q0,q1));k<Math.max(q0,q1);k++){const t=(k-q0)/(q1-q0);if(t>0&&t<1)times.push(t);}};
   cross(((a.x+this.field.half)/this.cell+.5)/16,((b.x+this.field.half)/this.cell+.5)/16);
   cross(((this.field.half-a.y)/this.cell+.5)/16,((this.field.half-b.y)/this.cell+.5)/16);
   times.sort((x,y)=>x-y);
   let previous=0;
   for(const t of times){for(const p of [t,(previous+t)/2])put(a.x+(b.x-a.x)*p,a.y+(b.y-a.y)*p);previous=t;}
   a=b;
  }
  return regions;
 }
 regionsUnchanged(regions){if(!regions)return false;for(const [key,version] of regions)if((this.regionVersions.get(key)??0)!==version)return false;return true;}
 createSearchContext(){
  // Terrain and immutable edge/surface caches are shared. A suspended command
  // search must not overwrite the movement search's heap or predecessor tree.
  const context=Object.create(this),count=this.size*this.size;
  Object.assign(context,{baseNavigator:this,occupied:new Uint8Array(count),closed:new Uint32Array(count),
   visited:new Uint32Array(count),cost:new Float32Array(count),parent:new Int32Array(count),
   heapIds:new Int32Array(4096),heapPriorities:new Float64Array(4096),searchId:0,
   pathCache:new Map(),pathCacheRegions:new Map(),pathCachePoints:0,corridors:[],sharedCorridors:true,beforeSynchronousSearch:null,workDeadline:Infinity,topologyRevision:-1});
  context.refreshContext();return context;
 }
 refreshContext(){
  const base=this.baseNavigator;if(!base)return;
  this.topologyRevision=base.topologyRevision;this.occupied.set(base.occupied);this.solids=base.solids;this.bounds=base.bounds.slice();
 }
 *reuseCorridor(from,to,options){
  if(options.terrainEscape||options.acceptEnd&&!options.acceptEnd(to)||Math.hypot(to.x-from.x,to.y-from.y)<this.cell*12)return null;
  if(this.lineClear(from,to,false,true)){
   const paved=this.roads.nearPavement(from)&&this.roads.nearPavement(to);
   if(!this.roads.buckets.size||!this.roads.worthChecking(from,to,this.travelCost(from,to,paved),paved))return null;
  }
  // A formation can span hundreds of world metres. Distance is only a
  // shortlist bound; both exact connectors still pass the terrain/building
  // checks below, so nearby members need not repeat the same global search.
  const maximum=Math.max(this.cell*16,Math.min(this.cell*64,Math.hypot(to.x-from.x,to.y-from.y)*.65));
  const candidates=(this.corridors??[]).filter(c=>c.kind===(from.kind??'')&&c.scale===this.vehicleScale&&c.bounds===this.bounds.join(',')
   &&Math.hypot(c.from.x-from.x,c.from.y-from.y)<=maximum&&Math.hypot(c.to.x-to.x,c.to.y-to.y)<=maximum)
   .sort((a,b)=>Math.hypot(a.from.x-from.x,a.from.y-from.y)+Math.hypot(a.to.x-to.x,a.to.y-to.y)
    -Math.hypot(b.from.x-from.x,b.from.y-from.y)-Math.hypot(b.to.x-to.x,b.to.y-to.y)).slice(0,4);
  for(const corridor of candidates){
   const unchanged=this.regionsUnchanged(corridor.regions)&&corridor.occupancyKey===options.occupancyKey;
   // A cached corridor is only a candidate. Validate its exact connectors and
   // every retained segment against this request's current occupancy/terrain.
   for(let entry=0;entry<Math.min(4,corridor.path.length);entry++){
    if(!this.lineClear(from,corridor.path[entry],false,true))continue;
    let previous=from;const path=[];
    for(let i=entry;i<corridor.path.length;i++){
     const point=corridor.path[i];
     // The exact entry connector was checked immediately above. Only changed
     // interior segments need another check; rechecking the connector doubled
     // work for every member using the same validated corridor.
     if(i>entry&&!unchanged&&!this.lineClear(previous,point))break;
     path.push({...point});previous=point;
     if(i>=corridor.path.length-3&&this.lineClear(previous,to)){
      if(Math.hypot(previous.x-to.x,previous.y-to.y)>.01)path.push({x:to.x,y:to.y});
      this.corridorHits=(this.corridorHits??0)+1;return path;
     }
     if(performance.now()>=(this.workDeadline??Infinity))yield;
    }
    // The final iteration already checked the exact exit connector.
   }
   if(performance.now()>=(this.workDeadline??Infinity))yield;
  }
  return null;
 }
 nearbySolids(point,radius){
  return this.solids.filter(item=>Math.abs(point.x-item.x)<item.halfWidth+radius&&Math.abs(point.y-item.y)<item.halfDepth+radius);
 }
 clearSolidSweep(sweep,solids){
  return solids.every(item=>sweepAvoidsFootprint(sweep,item));
 }
 passageBetween(from,to,scale){
  let best=null,bestLength=Infinity;
  const direct=Math.hypot(to.x-from.x,to.y-from.y),staging=scale*4.6;
  for(const [along,side,depth,span] of [['x','y','halfWidth','halfDepth'],['y','x','halfDepth','halfWidth']]){
   const direction=Math.sign(to[along]-from[along]);
   if(!direction)continue;
   for(let i=0;i<this.solids.length;i++)for(let j=i+1;j<this.solids.length;j++){
    const a=this.solids[i],b=this.solids[j];
    const low=Math.max(a[along]-a[depth],b[along]-b[depth]);
    const high=Math.min(a[along]+a[depth],b[along]+b[depth]);
    if(high-low<scale*8)continue;
    if(direction>0?to[along]<=high+staging:to[along]>=low-staging)continue;
    const left=a[side]<b[side]?a:b,right=left===a?b:a;
    const gapStart=left[side]+left[span],gapEnd=right[side]-right[span],width=gapEnd-gapStart;
    if(width<scale*2.8||width>scale*8.1||Math.min(left[span],right[span])<scale*6)continue;
    const transverse=(gapStart+gapEnd)/2;
    const inside=from[along]>low-staging&&from[along]<high+staging&&Math.abs(from[side]-transverse)<width/2;
    if(!inside&&(direction>0?from[along]>=low-staging:from[along]<=high+staging))continue;
    const entrance=inside?{x:from.x,y:from.y}:{[along]:direction>0?low-staging:high+staging,[side]:transverse};
    const exit={[along]:direction>0?high+staging:low-staging,[side]:transverse};
    const length=Math.hypot(from.x-entrance.x,from.y-entrance.y)+Math.hypot(exit.x-entrance.x,exit.y-entrance.y)+Math.hypot(exit.x-to.x,exit.y-to.y);
    if(length>=bestLength||length>direct*1.3)continue;
    const heading=Math.atan2(entrance.x-exit.x,exit.y-entrance.y);
    if(!this.lineClear(entrance,exit,false,true,climbableGrade,true))continue;
    // An already parked occupant may leave the conservative raster margin,
    // but its actual pose and complete swept hull must fit the same throat.
    const sweep=vehicleSweep({...entrance,heading:inside?from.heading??heading:heading,kind:from.kind},{...exit,heading,kind:from.kind},scale,this.field);
    if(!this.clearSolidSweep(sweep,this.solids))continue;
    best={entrance,exit,along,direction,heading,mouth:direction>0?high:low,admit:(direction>0?low:high)+direction*scale*6,
     throat:{along,side,low,high,centre:transverse,width}};
    bestLength=length;
   }
  }
  return best;
 }
 nearest(x,y,maxRadius=12){const [cx,cy]=this.grid(x,y);for(let r=0;r<=maxRadius;r++){let best=null,distance=Infinity;for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){if(r&&Math.max(Math.abs(dx),Math.abs(dy))!==r)continue;const col=cx+dx,row=cy+dy;if(!this.allowed(col,row))continue;const p=this.position(col,row),d=Math.hypot(p.x-x,p.y-y);if(d<distance){distance=d;best={...p,col,row};}}if(best)return best;}return null;}
 terrainGridEdgeClear(a,b,maximumGrade){
  const field=this.field,half=field.half,cell=this.cell,dx=b.x-a.x,dy=b.y-a.y;
  // On matching triangle/grid vertices, all eight neighbouring edges split
  // only at t=.5. Retain exactly the old endpoint and interval-midpoint tests.
  for(const t of edgeCheckTimes){
   const x=a.x+dx*t,y=a.y+dy*t;
   if(!this.terrainAllowed(x,y))return false;
   const col=Math.round((x+half)/cell),row=Math.round((half-y)/cell);
   if(!this.walkable[row*this.size+col])return false;
  }
  const length=Math.max(1e-7,Math.hypot(dx,dy)/2),first=field.heightAt(a.x,a.y),middle=field.heightAt(a.x+dx*.5,a.y+dy*.5);
  if(Math.abs(middle-first)/length>maximumGrade+.00001)return false;
  return !(Math.abs(field.heightAt(b.x,b.y)-middle)/length>maximumGrade+.00001);
 }
 lineClear(a,b,terrainOnly=false,leaveGridEdge=false,maximumGrade=climbableGrade,physical=false,checkOccupancy=false,terrainEscape=null){
  if(terrainOnly&&!leaveGridEdge&&!physical&&!checkOccupancy&&!terrainEscape&&this.field.renderCell===this.cell
   &&this.field.renderSize===this.size&&this.field.extent===(this.size-1)*this.cell&&this.field.half===this.field.extent/2){
   const half=this.field.half,cell=this.cell,ac=(a.x+half)/cell,ar=(half-a.y)/cell,bc=(b.x+half)/cell,br=(half-b.y)/cell;
   if(Number.isInteger(ac)&&Number.isInteger(ar)&&Number.isInteger(bc)&&Number.isInteger(br)
    &&ac>=0&&ar>=0&&bc>=0&&br>=0&&ac<this.size&&ar<this.size&&bc<this.size&&br<this.size
    &&Math.max(Math.abs(ac-bc),Math.abs(ar-br))===1
    &&a.x===ac*cell-half&&a.y===half-ar*cell&&b.x===bc*cell-half&&b.y===half-br*cell)
    return this.terrainGridEdgeClear(a,b,maximumGrade);
  }
  const length=Math.hypot(b.x-a.x,b.y-a.y),times=[0,1],half=this.field.half,cell=this.field.renderCell??this.cell;
  if([a,b].some(point=>Math.abs(point.x)>half||Math.abs(point.y)>half))return false;
  // Height is affine within each heightfield triangle. Split exactly at its X,
  // Y and diagonal boundaries: fixed-distance samples can miss a thin slope.
  const cross=(q0,q1)=>{if(Math.abs(q1-q0)<1e-10)return;for(let k=Math.ceil(Math.min(q0,q1));k<Math.max(q0,q1);k++){const t=(k-q0)/(q1-q0);if(t>1e-9&&t<1-1e-9)times.push(t);}};
  cross((a.x+half)/cell,(b.x+half)/cell);cross((half-a.y)/cell,(half-b.y)/cell);cross((a.x-a.y+half*2)/cell,(b.x-b.y+half*2)/cell);
  cross((a.x+half)/this.cell+.5,(b.x+half)/this.cell+.5);cross((half-a.y)/this.cell+.5,(half-b.y)/this.cell+.5);times.sort((x,y)=>x-y);
  const [startCol,startRow]=this.grid(a.x,a.y),startId=startRow*this.size+startCol;
  const gx=(a.x+half)/32,gy=(half-a.y)/32,bounds=this.bounds;
  const mayLeave=leaveGridEdge&&(physical||!this.occupied[startId])&&gx>=bounds[0]&&gx<=bounds[2]&&gy>=bounds[1]&&gy<=bounds[3];
  const allowed=t=>{
   const x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t,[col,row]=this.grid(x,y);
   // Applies to smoothing, road lanes, parking and physical recovery alike.
   if(!this.terrainAllowed(x,y)){
    // Explicit evacuation of an already-invalid saved pose. It cannot be
    // started from legal ground or renewed along a ridge. A small fixed rise
    // permits reversing to turn before descending from the old saved pose.
    if(!terrainEscape||this.terrainAllowed(a.x,a.y)||Math.hypot(x-terrainEscape.x,y-terrainEscape.y)>terrainEscape.radius
      ||this.field.heightAt(x,y)>terrainEscape.height+(terrainEscape.maxRise??.5))return false;
   }
   if(terrainOnly)return this.walkable[row*this.size+col];
   if(physical){
    if(checkOccupancy&&this.occupied[row*this.size+col])return false;
    const xg=(x+half)/32,yg=(half-y)/32;
    if(xg<bounds[0]||xg>bounds[2]||yg<bounds[1]||yg>bounds[3])return false;
    const gradient=this.field.gradientAt(x,y);
    return Math.hypot(gradient.x,gradient.y)<Math.max(.76,maximumGrade*1.38);
   }
   if(this.allowed(col,row))return true;
   if(!mayLeave||col!==startCol||row!==startRow)return false;
   // A rounded grid sample can fall just outside drivable terrain even when the
   // exact continuous position is flat. Let an existing vehicle leave that cell.
   const gradient=this.field.gradientAt(x,y);
   return Math.hypot(gradient.x,gradient.y)<Math.max(.60,maximumGrade*1.32);
  };
  if(!allowed(0)||!allowed(1))return false;
  let previous=0,height=this.field.heightAt(a.x,a.y);for(const t of times){if(t-previous<1e-8)continue;if(!allowed((previous+t)/2))return false;const h=this.field.heightAt(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t);if(Math.abs(h-height)/Math.max(1e-7,length*(t-previous))>maximumGrade+.00001)return false;previous=t;height=h;}return true;
 }
 surfaceCost(id,pavedTrip){
  const cache=pavedTrip?this.pavedTripCosts:this.surfaceCosts;
  if(!cache[id]){
   const p=this.position(id%this.size,Math.floor(id/this.size));
   cache[id]=surfaceTravelCost(this.roads.coverage(p.x,p.y),this.slopes[id],pavedTrip);
  }
  return cache[id];
 }
 travelCost(a,b,pavedTrip=false){
  const distance=Math.hypot(b.x-a.x,b.y-a.y);
  if(distance<.001)return 0;
  const steps=Math.ceil(distance/6),step=distance/steps;
  let previous=this.field.heightAt(a.x,a.y),total=0;
  for(let index=1;index<=steps;index++){
   const t=index/steps,middle=(index-.5)/steps;
   const height=this.field.heightAt(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t);
   const x=a.x+(b.x-a.x)*middle,y=a.y+(b.y-a.y)*middle,gradient=this.field.gradientAt(x,y);
   const surface=surfaceTravelCost(this.roads.coverage(x,y),Math.hypot(gradient.x,gradient.y),pavedTrip);
   total+=step*surface/gradeSpeed((height-previous)/step);
   previous=height;
  }
  return total;
 }
 findPath(...args){this.beforeSynchronousSearch?.();return completeSteps(this.findPathSteps(...args));}
 *findPathSteps(from,to,{maxGoalDistance=Infinity,escapeSteepStart=false,occupancyKey='',terrainEscape=null,acceptEnd=null,acceptEndKey='',sharedRoute=null}={}){
  // Exact requests only: no quantisation of start, goal or dynamic obstacles.
  // Callers receive their own waypoint array because driving consumes it.
  this.lastExhaustedReachability=null;
  const cache=this.pathCache??=new Map(),key=[from.x,from.y,from.heading??0,from.kind??'',this.vehicleScale,to.x,to.y,maxGoalDistance,escapeSteepStart,terrainEscape?.x,terrainEscape?.y,terrainEscape?.height,terrainEscape?.radius,terrainEscape?.maxRise,...this.bounds,acceptEndKey].join('|')+'|'+occupancyKey;
  const metadata=this.pathCacheRegions??=new Map();
  if(cache.has(key)){
   const path=cache.get(key),dependency=metadata.get(key);
   if(path?this.regionsUnchanged(dependency?.regions):dependency?.revision===this.topologyRevision){
    cache.delete(key);cache.set(key,path);if(!path)this.lastExhaustedReachability=dependency?.unreachableProof??null;
    return path?.map(p=>({...p}))??null;
   }
   this.pathCachePoints-=(path?.length??0);cache.delete(key);metadata.delete(key);
  }
  const reachabilityKey=[from.x,from.y,from.heading??0,from.kind??'',this.vehicleScale,escapeSteepStart,terrainEscape?.x,terrainEscape?.y,terrainEscape?.height,terrainEscape?.radius,terrainEscape?.maxRise,...this.bounds,this.topologyRevision].join('|')+'|'+occupancyKey;
  const options={maxGoalDistance,escapeSteepStart,terrainEscape,reachabilityKey,acceptEnd,occupancyKey,sharedRoute};
  const reused=this.sharedCorridors?(yield* this.reuseCorridor(from,to,options)):null;
  const path=reused??(yield* this.computePathSteps(from,to,options));
  if(!path)this.lastExhaustedReachability=this.exhaustedReachability?.get(reachabilityKey)??this.lastExhaustedReachability;
  cache.set(key,path?.map(p=>({...p}))??null);this.pathCachePoints=(this.pathCachePoints??0)+(path?.length??0);
  const regions=path?this.pathRegions(from,path):null;
  metadata.set(key,{revision:this.topologyRevision,regions,unreachableProof:path?null:this.lastExhaustedReachability});
  while(cache.size>1024||this.pathCachePoints>16384){const first=cache.keys().next().value;this.pathCachePoints-=cache.get(first)?.length??0;cache.delete(first);metadata.delete(first);}
  if(this.sharedCorridors&&!reused&&path?.length>1&&!terrainEscape){
   const corridors=this.corridors??=[];
   corridors.unshift({from:{x:from.x,y:from.y},to:{x:to.x,y:to.y},kind:from.kind??'',scale:this.vehicleScale,bounds:this.bounds.join(','),
    topologyRevision:this.topologyRevision,regions,occupancyKey,path:path.map(p=>({...p}))});
   if(corridors.length>64)corridors.pop();
  }
  return path;
 }
 computePath(...args){this.beforeSynchronousSearch?.();return completeSteps(this.computePathSteps(...args));}
 *computePathSteps(from,to,{maxGoalDistance=Infinity,escapeSteepStart=false,terrainEscape=null,reachabilityKey=null,acceptEnd=null,occupancyKey='',sharedRoute=null}={}){
  const gx=(to.x+this.field.half)/32,gy=(this.field.half-to.y)/32,bounds=this.bounds;if(gx<bounds[0]||gy<bounds[1]||gx>bounds[2]||gy>bounds[3])return null;
  const end=this.nearest(to.x,to.y);if(!end)return null;
  const goalAccepted=!acceptEnd||acceptEnd(to);
  const direct=goalAccepted&&this.lineClear(from,to,false,true)?[{x:to.x,y:to.y}]:null;
  const roads=this.roads.buckets.size>0;
  const pavedTrip=roads&&this.roads.nearPavement(from)&&this.roads.nearPavement(to);
  const directCost=roads&&direct?this.travelCost(from,to,pavedTrip):Infinity;
  if(direct&&(!roads||!this.roads.worthChecking(from,to,directCost,pavedTrip)))return direct;
  // A large command may provide an already settled static tree. Try that
  // only after cheap direct/corridor reuse, before allocating another A*.
  if(sharedRoute&&goalAccepted&&!terrainEscape&&!occupancyKey&&maxGoalDistance<=.01){
   const shared=yield* sharedRoute(from,to);if(shared)return shared;
  }
  const [cx,cy]=this.grid(from.x,from.y),entries=[];
  const entryRadius=terrainEscape?Math.ceil(terrainEscape.radius/this.cell):2;
  for(let dy=-entryRadius;dy<=entryRadius;dy++)for(let dx=-entryRadius;dx<=entryRadius;dx++){
   const col=cx+dx,row=cy+dy;
   if(this.allowed(col,row))entries.push({...this.position(col,row),col,row});
  }
  let starts=entries.filter(point=>this.lineClear(from,point,false,true));
  const startId=cy*this.size+cx;
  // A vehicle can have wheel support even when its centre is on a steep cell.
  // Let it reach the nearby grid using the same grade limits as vehicle motion.
  if(escapeSteepStart&&!starts.length&&!this.walkable[startId]&&!this.occupied[startId]){
   starts=entries.filter(point=>this.lineClear(from,point,false,true,climbableGrade,true,true,terrainEscape));
  }
  if(!starts.length&&this.occupied[startId]){
   // Building clearance is a planning margin, not a wall. A car parked in
   // that margin must be able to leave through a physically clear corridor.
   const heading=from.heading??0,start={...from,heading};
   starts=entries.filter(point=>this.lineClear(from,point,false,true,climbableGrade,true)
    &&this.clearSolidSweep(vehicleSweep(start,{...point,heading,kind:from.kind},this.vehicleScale,this.field),this.nearbySolids(point,40)));
  }
  if(!starts.length)return direct;
  const n=this.size,endIds=new Set(),exact=maxGoalDistance<=.01,maxEndDistance=exact?this.cell*1.5:Math.min(maxGoalDistance,Math.hypot(end.x-to.x,end.y-to.y)+this.cell*1.5);
  for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
   const col=end.col+dx,row=end.row+dy,p=this.position(col,row);
   if(this.allowed(col,row)&&Math.hypot(p.x-to.x,p.y-to.y)<=maxEndDistance&&(!exact||goalAccepted&&this.lineClear(p,to))
    &&(!acceptEnd||acceptEnd(p)||goalAccepted&&this.lineClear(p,to)))endIds.add(row*n+col);
  }
  if(!endIds.size)return direct;
  // Connectivity is independent of road costs and the requested destination.
  // An exhausted static search also answers other starts whose complete set
  // of valid entry cells belongs to that proven component. Dynamic detours
  // and terrain-escape connectors cannot share this proof.
  const staticSearch=this.sharedCorridors&&!occupancyKey&&!terrainEscape;
  const component=staticSearch&&this.staticComponents?.find(proof=>proof.revision===this.topologyRevision
   &&proof.bounds===this.bounds.join(',')&&starts.every(p=>{const id=p.row*n+p.col;return proof.reachable[id>>>5]&(1<<(id&31));}));
  const exhausted=(reachabilityKey&&this.exhaustedReachability?.get(reachabilityKey))??component?.reachable;
  if(exhausted&&![...endIds].some(id=>exhausted[id>>>5]&(1<<(id&31)))){
   this.lastExhaustedReachability=exhausted;this.reachabilityRejects=(this.reachabilityRejects??0)+1;return direct;
  }
  const stamp=++this.searchId;let destination=null,heapLength=0;
  let ids=this.heapIds??=new Int32Array(4096),priorities=this.heapPriorities??=new Float64Array(4096);
  const push=(id,priority)=>{
   if(heapLength===ids.length){const nextIds=new Int32Array(ids.length*2),nextPriorities=new Float64Array(ids.length*2);nextIds.set(ids);nextPriorities.set(priorities);ids=this.heapIds=nextIds;priorities=this.heapPriorities=nextPriorities;}
   let i=heapLength++;while(i){const p=(i-1)>>1;if(priorities[p]<=priority)break;ids[i]=ids[p];priorities[i]=priorities[p];i=p;}ids[i]=id;priorities[i]=priority;
  };
  const pop=()=>{const first=ids[0],last=ids[--heapLength],priority=priorities[heapLength];if(heapLength){let i=0;while(i*2+1<heapLength){let child=i*2+1;if(child+1<heapLength&&priorities[child+1]<priorities[child])child++;if(priorities[child]>=priority)break;ids[i]=ids[child];priorities[i]=priorities[child];i=child;}ids[i]=last;priorities[i]=priority;}return first;};
  const bestSpeed=roads?(1+asphaltBonus)*1.18:1;
  const heuristic=(col,row)=>Math.max(0,(Math.hypot(col-end.col,row-end.row)*this.cell-maxEndDistance)/bestSpeed);
  for(const start of starts){const source=start.row*n+start.col,cost=roads?this.travelCost(from,start,pavedTrip):Math.hypot(start.x-from.x,start.y-from.y);this.cost[source]=cost;this.parent[source]=-1;this.visited[source]=stamp;push(source,cost+heuristic(start.col,start.row));}let expanded=0,found=false;
  while(heapLength&&expanded++<100000){if(expanded%32===0&&performance.now()>=(this.workDeadline??Infinity))yield;const id=pop();if(this.closed[id]===stamp)continue;this.closed[id]=stamp;if(endIds.has(id)){destination=id;found=true;break;}const col=id%n,row=Math.floor(id/n),surface=roads?this.surfaceCost(id,pavedTrip):0;
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    if(!dx&&!dy)continue;
    const x=col+dx,y=row+dy,next=y*n+x;
    if(!this.allowed(x,y)||this.closed[next]===stamp||dx&&dy&&(!this.allowed(col+dx,row)||!this.allowed(col,row+dy)))continue;
    const distance=this.cell*Math.hypot(dx,dy),grade=(this.heights[next]-this.heights[id])/distance;
    if(Math.abs(grade)>climbableGrade)continue;
    let direction=(dy+1)*3+dx+1;if(direction>4)direction--;
    const edge=id*8+direction;
    if(!this.edgeCache[edge])this.edgeCache[edge]=this.lineClear(this.position(col,row),this.position(x,y),true)?1:2;
    if(this.edgeCache[edge]!==1)continue;
    const edgeCost=roads?distance*(surface+this.surfaceCost(next,pavedTrip))*.5/gradeSpeed(grade):distance*(1+grade*grade*18);
    const cost=this.cost[id]+edgeCost;
    if(this.visited[next]!==stamp||cost<this.cost[next]){this.visited[next]=stamp;this.cost[next]=cost;this.parent[next]=id;push(next,cost+heuristic(x,y));}
   }
  }
  if(!found){
   // An exhausted search proves the entire reachable component for this exact
   // start and occupancy. Nearby rejected parking candidates need no new A*.
   // The expansion limit is not such a proof and is never cached as one.
   if(reachabilityKey&&!heapLength&&expanded<100000){
    const reachable=new Uint32Array(Math.ceil(this.closed.length/32));
    for(let id=0;id<this.closed.length;id++){
     if(this.closed[id]===stamp)reachable[id>>>5]|=1<<(id&31);
     if(id%4096===0&&performance.now()>=(this.workDeadline??Infinity))yield;
    }
    const cache=this.exhaustedReachability??=new Map();cache.set(reachabilityKey,reachable);
    if(cache.size>32)cache.delete(cache.keys().next().value);
    if(staticSearch){
     const components=this.staticComponents??=[];
     components.unshift({revision:this.topologyRevision,bounds:this.bounds.join(','),reachable});
     if(components.length>16)components.pop();
    }
   }
   return direct;
  }
  const path=[];
  for(let id=destination;id!==-1;id=this.parent[id])path.push(this.position(id%n,Math.floor(id/n)));
  path.reverse();
  const endPoint=path.at(-1);
  if(goalAccepted&&Math.hypot(endPoint.x-to.x,endPoint.y-to.y)>.01&&this.lineClear(endPoint,to))path.push({x:to.x,y:to.y});
  const simplified=[];
  let anchor=from,index=0,total=0;
  while(index<path.length){
   if(performance.now()>=(this.workDeadline??Infinity))yield;
   let next=index,cost=roads?this.travelCost(anchor,path[index],pavedTrip):0;
   while(next+1<path.length&&this.lineClear(anchor,path[next+1])){
    if(performance.now()>=(this.workDeadline??Infinity))yield;
    const travel=roads?this.travelCost(anchor,path[next+1],pavedTrip):0;
    if(roads&&travel>cost+this.travelCost(path[next],path[next+1],pavedTrip)+.04*this.cell)break;
    next++;cost=travel;
   }
   simplified.push(path[next]);anchor=path[next];index=next+1;total+=cost;
  }
  return direct&&total>=directCost*.98?direct:simplified;
 }
}
