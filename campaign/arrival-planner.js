import {vehicleEnvelope,vehicleClearance,vehicleObstacle} from './vehicle-collision.js';
import {UnitSpatialIndex} from './unit-spatial-index.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

// A group owns one expanding parking area. Static feasibility is checked
// before any route search; already accepted destinations never move when a
// later member needs another slot. Runtime-only, rebuilt from saved intents.
export class ArrivalPlanner{
 constructor(mission,units,target,{forward,right,spacing=24,reserved=[]}={}){
  this.mission=mission;this.nav=mission.nav;this.units=new Set(units.map(u=>u.id));
  this.target=target;this.forward=forward;this.right=right;this.spacing=spacing;
  this.radius=Math.ceil(Math.sqrt(units.length))+5;this.points=[];this.ring=-1;this.staticCache=new Map();
  this.obstruction=this.nav.solids.find(s=>Math.abs(target.x-s.x)<s.halfWidth&&Math.abs(target.y-s.y)<s.halfDepth);
  this.anchor=this.nav.terrainAllowed(target.x,target.y)?this.nav.nearest(target.x,target.y,3):null;
  this.connected=new Set();
  this.claims=new UnitSpatialIndex(64);this.bodies=new UnitSpatialIndex(64);this.time=null;
  this.maximumRadius=Math.max(...units.map(u=>{const box=vehicleEnvelope(u,mission.config.worldScale,mission.field);return Math.hypot(box.width,box.depth);}));
  for(const point of reserved)this.claims.insert({...point,heading:Math.atan2(-forward.x,forward.y),kind:units[0].kind,hp:1});
 }
 refresh(){
  const m=this.mission;if(this.time===m.state.time)return;
  this.time=m.state.time;const bodies=[];
  for(const unit of m.state.units){
   if(!vehicleObstacle(unit))continue;
   bodies.push(unit);
   if(!this.units.has(unit.id)&&unit.routeOrder?.destination&&distance(unit,unit.routeOrder.destination)>1)
    bodies.push({...unit,...unit.routeOrder.destination});
  }
  this.bodies.rebuild(bodies);
 }
 free(unit,point,heading){
  this.refresh();const m=this.mission,scale=m.config.worldScale,pose={...point,heading,kind:unit.kind};
  const envelope=vehicleEnvelope(pose,scale,m.field),radius=this.maximumRadius+Math.hypot(envelope.width,envelope.depth)+scale;
  for(const other of [...this.claims.query(point,radius),...this.bodies.query(point,radius)])
   if(other.id!==unit.id&&vehicleClearance(pose,other,scale,m.field)<scale*.1)return false;
  return true;
 }
 staticFree(unit,point,heading){
  const key=[point.x,point.y,heading,unit.kind].join(',');if(this.staticCache.has(key))return this.staticCache.get(key);
  const m=this.mission,pose={...point,heading,kind:unit.kind,owner:unit.owner};
  const allowed=this.nav.allowed(...this.nav.grid(point.x,point.y))&&this.nav.terrainAllowed(point.x,point.y)
   &&m.vehicleMotionClear(pose,pose,pose,.52,undefined,[]);
  this.staticCache.set(key,allowed);return allowed;
 }
 *grow(){
  this.ring++;
  for(let row=-this.ring;row<=this.ring;row++)for(let col=-this.ring;col<=this.ring;col++){
   if(Math.max(Math.abs(row),Math.abs(col))!==this.ring)continue;
   this.points.push({x:this.target.x+(this.right.x*col+this.forward.x*row)*this.spacing,
    y:this.target.y+(this.right.y*col+this.forward.y*row)*this.spacing});
   if(performance.now()>=(this.nav.workDeadline??Infinity))yield;
  }
 }
 *connect(unit){
  if(this.connected.has(unit.id))return true;
  const m=this.mission,nav=this.nav;
  if(!this.anchor){m.commandJob.failures[unit.id]={reason:'destination-terrain-forbidden',blockerId:null};return false;}
  const anchor={...this.anchor,heading:unit.heading,kind:unit.kind,owner:unit.owner};
  // Search from the destination component first. A small isolated destination
  // then exhausts once, instead of exploring the large outside world for
  // every possible parking candidate. Costs still use the ordinary navigator.
  let path;
  if(!nav.terrainAllowed(unit.x,unit.y))path=yield* m.vehiclePathSteps(unit,anchor,{maxGoalDistance:.01,fallback:false});
  else{
   const backwards=yield* nav.findPathSteps(anchor,unit,{maxGoalDistance:.01,escapeSteepStart:false,occupancyKey:''});
   if(backwards?.length)path=[...backwards.slice(0,-1).reverse(),{x:anchor.x,y:anchor.y}];
  }
  if(!path){
   m.commandJob.failures[unit.id]={reason:nav.lastExhaustedReachability?'route-unreachable':'static-route-not-found',blockerId:null};
   return false;
  }
  this.connected.add(unit.id);
  // Store the forward corridor as well: subsequent individual destinations
  // can reuse it with independently checked exact entry/exit connectors.
  const corridors=nav.corridors??=[];
  corridors.unshift({from:{x:unit.x,y:unit.y},to:{x:anchor.x,y:anchor.y},kind:unit.kind??'',scale:nav.vehicleScale,
   bounds:nav.bounds.join(','),topologyRevision:nav.topologyRevision,regions:nav.pathRegions(unit,path),occupancyKey:'',path});
  if(corridors.length>64)corridors.pop();
  return true;
 }
 *path(unit,desired,{roadOnly=false,allowed=()=>true,pathOptions={}}={}){
  const m=this.mission,heading=Math.atan2(-this.forward.x,this.forward.y),seen=new Set();let reachable=null,feasible=0,outside=0;
  if(this.obstruction){m.commandJob.failures[unit.id]={reason:'destination-occupied',blockerId:this.obstruction.id};return null;}
  if(!(yield* this.connect(unit)))return null;
  const tryPoint=function*(pool,point){
   const key=point.x+','+point.y;if(seen.has(key))return null;seen.add(key);
   if(performance.now()>=(pool.nav.workDeadline??Infinity))yield;
   if(!allowed(point)||roadOnly&&pool.nav.roads.coverage(point.x,point.y)<.58
    ||!pool.free(unit,point,heading)||!pool.staticFree(unit,point,heading))return null;
   feasible++;
   const [col,row]=pool.nav.grid(point.x,point.y),id=row*pool.nav.size+col;
   if(reachable&&!(reachable[id>>>5]&(1<<(id&31)))){outside++;return null;}
   const path=yield* m.vehiclePathSteps(unit,point,{...pathOptions,maxGoalDistance:.01,fallback:false});
   if(!path){reachable=pool.nav.lastExhaustedReachability??reachable;return null;}
   const end=path.at(-1),previous=path.length>1?path.at(-2):unit;
   const arrivalHeading=distance(previous,end)>.01?Math.atan2(previous.x-end.x,end.y-previous.y):unit.heading;
   if(distance(end,point)>.01||!pool.free(unit,end,arrivalHeading)||!pool.staticFree(unit,end,arrivalHeading))return null;
   pool.claims.insert({...end,id:unit.id,heading:arrivalHeading,kind:unit.kind,hp:1});
   return path;
  };
  const direct=yield* tryPoint(this,desired);if(direct)return direct;
  // Near rows are cheap to discover and are shared across all later members.
  // Expand only if this member cannot use the already prepared parking area.
  let first=0;
  for(;;){
   if(performance.now()>=(this.nav.workDeadline??Infinity))yield;
   const points=this.points.slice(first).sort((a,b)=>distance(a,desired)-distance(b,desired));
   for(const point of points){const path=yield* tryPoint(this,point);if(path)return path;}
   if(this.ring>=this.radius)break;
   first=this.points.length;yield* this.grow();
  }
  const obstruction=this.nav.solids.find(s=>Math.abs(this.target.x-s.x)<s.halfWidth&&Math.abs(this.target.y-s.y)<s.halfDepth);
  // connect() already proved this unit can reach the target component. A
  // shortage of available slots must never relabel that component unreachable.
  m.commandJob.failures[unit.id]={reason:obstruction?'destination-occupied':'no-free-parking-in-area',blockerId:obstruction?.id??null};
  return null;
 }
}
