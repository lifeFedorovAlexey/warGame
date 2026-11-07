import {RoadTraffic, asphaltBonus, gradeSpeed} from './road-traffic.js';
import {sweepAvoidsFootprint, vehicleSweep} from './vehicle-collision.js';

const climbableGrade = .52;

// A* on a cached terrain grid. Dynamic building footprints are rasterized once
// per structural change; movement never falls back to teleporting.
export class TerrainNavigator{
 constructor(field,{cell=8,bounds=[0,0,127,127]}={}){
  this.field=field;this.cell=cell;this.clearance=11+cell/2;this.size=Math.round(field.extent/cell)+1;this.bounds=bounds;const count=this.size*this.size;this.heights=new Float32Array(count);this.walkable=new Uint8Array(count);this.occupied=new Uint8Array(count);this.edgeCache=new Uint8Array(count*8);this.searchId=0;this.closed=new Uint32Array(count);this.visited=new Uint32Array(count);this.cost=new Float32Array(count);this.parent=new Int32Array(count);
  this.roads=new RoadTraffic(field);this.pavedFactors=new Float32Array(count);this.solids=[];
  for(let row=0;row<this.size;row++)for(let col=0;col<this.size;col++){const p=this.position(col,row),id=row*this.size+col,g=field.gradientAt(p.x,p.y);this.heights[id]=field.heightAt(p.x,p.y);this.walkable[id]=Math.hypot(g.x,g.y)<.55?1:0;}
 }
 position(col,row){return{x:col*this.cell-this.field.half,y:this.field.half-row*this.cell};}
 grid(x,y){return [Math.max(0,Math.min(this.size-1,Math.round((x+this.field.half)/this.cell))),Math.max(0,Math.min(this.size-1,Math.round((this.field.half-y)/this.cell)))];}
 allowed(col,row){const gx=col*this.cell/32,gy=row*this.cell/32,b=this.bounds;return col>=0&&row>=0&&col<this.size&&row<this.size&&gx>=b[0]&&gy>=b[1]&&gx<=b[2]&&gy<=b[3]&&this.walkable[row*this.size+col]&&!this.occupied[row*this.size+col];}
 rebuild(structures){this.occupied.fill(0);this.solids=structures.filter(item=>item.hp>0);for(const item of this.solids){const [cx,cy]=this.grid(item.x,item.y),rx=Math.ceil((item.halfWidth+this.clearance)/this.cell),ry=Math.ceil((item.halfDepth+this.clearance)/this.cell);for(let row=cy-ry;row<=cy+ry;row++)for(let col=cx-rx;col<=cx+rx;col++){if(row<0||col<0||row>=this.size||col>=this.size)continue;const p=this.position(col,row);if(Math.abs(p.x-item.x)<item.halfWidth+this.clearance&&Math.abs(p.y-item.y)<item.halfDepth+this.clearance)this.occupied[row*this.size+col]=1;}}}
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
    if(direction>0?from[along]>=low-staging||to[along]<=high+staging:
     from[along]<=high+staging||to[along]>=low-staging)continue;
    const left=a[side]<b[side]?a:b,right=left===a?b:a;
    const gapStart=left[side]+left[span],gapEnd=right[side]-right[span],width=gapEnd-gapStart;
    if(width<scale*2.8||width>scale*8.1||Math.min(left[span],right[span])<scale*6)continue;
    const transverse=(gapStart+gapEnd)/2;
    const entrance={[along]:direction>0?low-staging:high+staging,[side]:transverse};
    const exit={[along]:direction>0?high+staging:low-staging,[side]:transverse};
    const length=Math.hypot(from.x-entrance.x,from.y-entrance.y)+high-low+2*staging+Math.hypot(exit.x-to.x,exit.y-to.y);
    if(length>=bestLength||length>direct*1.3)continue;
    const heading=Math.atan2(entrance.x-exit.x,exit.y-entrance.y);
    if(!this.lineClear(entrance,exit,false,true,climbableGrade,true))continue;
    const sweep=vehicleSweep({...entrance,heading},{...exit,heading},scale,this.field);
    if(!this.clearSolidSweep(sweep,this.solids))continue;
    best={entrance,exit,along,direction,heading,mouth:direction>0?high:low,admit:(direction>0?low:high)+direction*scale*6};
    bestLength=length;
   }
  }
  return best;
 }
 nearest(x,y,maxRadius=12){const [cx,cy]=this.grid(x,y);for(let r=0;r<=maxRadius;r++){let best=null,distance=Infinity;for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){if(r&&Math.max(Math.abs(dx),Math.abs(dy))!==r)continue;const col=cx+dx,row=cy+dy;if(!this.allowed(col,row))continue;const p=this.position(col,row),d=Math.hypot(p.x-x,p.y-y);if(d<distance){distance=d;best={...p,col,row};}}if(best)return best;}return null;}
 lineClear(a,b,terrainOnly=false,leaveGridEdge=false,maximumGrade=climbableGrade,physical=false){
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
   if(terrainOnly)return this.walkable[row*this.size+col];
   if(physical){
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
 pavingFactor(id){
  if(!this.pavedFactors[id]){
   const p=this.position(id%this.size,Math.floor(id/this.size));
   this.pavedFactors[id]=this.roads.factor(p.x,p.y);
  }
  return this.pavedFactors[id];
 }
 travelCost(a,b){
  const distance=Math.hypot(b.x-a.x,b.y-a.y);
  if(distance<.001)return 0;
  const steps=Math.ceil(distance/6),step=distance/steps;
  let previous=this.field.heightAt(a.x,a.y),total=0;
  for(let index=1;index<=steps;index++){
   const t=index/steps,middle=(index-.5)/steps;
   const height=this.field.heightAt(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t);
   const asphalt=this.roads.factor(a.x+(b.x-a.x)*middle,a.y+(b.y-a.y)*middle);
   total+=step/(asphalt*gradeSpeed((height-previous)/step));
   previous=height;
  }
  return total;
 }
 findPath(from,to,{maxGoalDistance=Infinity}={}){
  const gx=(to.x+this.field.half)/32,gy=(this.field.half-to.y)/32,bounds=this.bounds;if(gx<bounds[0]||gy<bounds[1]||gx>bounds[2]||gy>bounds[3])return null;
  const end=this.nearest(to.x,to.y);if(!end)return null;
  const direct=this.lineClear(from,to,false,true)?[{x:to.x,y:to.y}]:null;
  const roads=this.roads.buckets.size>0, directCost=roads&&direct?this.travelCost(from,to):Infinity;
  if(direct&&(!roads||!this.roads.worthChecking(from,to,directCost)))return direct;
  const [cx,cy]=this.grid(from.x,from.y),starts=[];for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const col=cx+dx,row=cy+dy;if(!this.allowed(col,row))continue;const p=this.position(col,row);if(this.lineClear(from,p,false,true))starts.push({...p,col,row});}if(!starts.length)return direct;
  const n=this.size,endIds=new Set(),maxEndDistance=Math.min(maxGoalDistance,Math.hypot(end.x-to.x,end.y-to.y)+this.cell*1.5);for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const col=end.col+dx,row=end.row+dy,p=this.position(col,row);if(this.allowed(col,row)&&Math.hypot(p.x-to.x,p.y-to.y)<=maxEndDistance)endIds.add(row*n+col);}if(!endIds.size)return direct;
  const stamp=++this.searchId,heap=[];let destination=null;
  const push=(id,priority)=>{let i=heap.length;heap.push({id,priority});while(i){const p=(i-1)>>1;if(heap[p].priority<=priority)break;heap[i]=heap[p];i=p;}heap[i]={id,priority};};
  const pop=()=>{const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let child=i*2+1;if(child+1<heap.length&&heap[child+1].priority<heap[child].priority)child++;if(heap[child].priority>=last.priority)break;heap[i]=heap[child];i=child;}heap[i]=last;}return first.id;};
  const bestSpeed=roads?(1+asphaltBonus)*1.18:1;
  const heuristic=(col,row)=>Math.max(0,(Math.hypot(col-end.col,row-end.row)*this.cell-maxEndDistance)/bestSpeed);
  for(const start of starts){const source=start.row*n+start.col,cost=roads?this.travelCost(from,start):Math.hypot(start.x-from.x,start.y-from.y);this.cost[source]=cost;this.parent[source]=-1;this.visited[source]=stamp;push(source,cost+heuristic(start.col,start.row));}let expanded=0,found=false;
  while(heap.length&&expanded++<100000){const id=pop();if(this.closed[id]===stamp)continue;this.closed[id]=stamp;if(endIds.has(id)){destination=id;found=true;break;}const col=id%n,row=Math.floor(id/n);
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
    const edgeCost=roads?distance/(gradeSpeed(grade)*(this.pavingFactor(id)+this.pavingFactor(next))*.5):distance*(1+grade*grade*18);
    const cost=this.cost[id]+edgeCost;
    if(this.visited[next]!==stamp||cost<this.cost[next]){this.visited[next]=stamp;this.cost[next]=cost;this.parent[next]=id;push(next,cost+heuristic(x,y));}
   }
  }
  if(!found)return direct;
  const path=[];
  for(let id=destination;id!==-1;id=this.parent[id])path.push(this.position(id%n,Math.floor(id/n)));
  path.reverse();
  const endPoint=path.at(-1);
  if(Math.hypot(endPoint.x-to.x,endPoint.y-to.y)>.01&&this.lineClear(endPoint,to))path.push({x:to.x,y:to.y});
  const simplified=[];
  let anchor=from,index=0,total=0;
  while(index<path.length){
   let next=index,cost=roads?this.travelCost(anchor,path[index]):0;
   while(next+1<path.length&&this.lineClear(anchor,path[next+1])){
    const travel=roads?this.travelCost(anchor,path[next+1]):0;
    if(roads&&travel>cost+this.travelCost(path[next],path[next+1])+.04*this.cell)break;
    next++;cost=travel;
   }
   simplified.push(path[next]);anchor=path[next];index=next+1;total+=cost;
  }
  return direct&&total>=directCost*.98?direct:simplified;
 }
}
