// A* on a cached terrain grid. Dynamic building footprints are rasterized once
// per structural change; movement never falls back to teleporting.
export class TerrainNavigator{
 constructor(field,{cell=8,bounds=[0,0,127,127]}={}){
  this.field=field;this.cell=cell;this.clearance=11+cell/2;this.size=Math.round(field.extent/cell)+1;this.bounds=bounds;const count=this.size*this.size;this.heights=new Float32Array(count);this.walkable=new Uint8Array(count);this.occupied=new Uint8Array(count);this.edgeCache=new Uint8Array(count*8);this.searchId=0;this.closed=new Uint32Array(count);this.visited=new Uint32Array(count);this.cost=new Float32Array(count);this.parent=new Int32Array(count);
  for(let row=0;row<this.size;row++)for(let col=0;col<this.size;col++){const p=this.position(col,row),id=row*this.size+col,g=field.gradientAt(p.x,p.y);this.heights[id]=field.heightAt(p.x,p.y);this.walkable[id]=Math.hypot(g.x,g.y)<.55?1:0;}
 }
 position(col,row){return{x:col*this.cell-this.field.half,y:this.field.half-row*this.cell};}
 grid(x,y){return [Math.max(0,Math.min(this.size-1,Math.round((x+this.field.half)/this.cell))),Math.max(0,Math.min(this.size-1,Math.round((this.field.half-y)/this.cell)))];}
 allowed(col,row){const gx=col*this.cell/32,gy=row*this.cell/32,b=this.bounds;return col>=0&&row>=0&&col<this.size&&row<this.size&&gx>=b[0]&&gy>=b[1]&&gx<=b[2]&&gy<=b[3]&&this.walkable[row*this.size+col]&&!this.occupied[row*this.size+col];}
 rebuild(structures){this.occupied.fill(0);for(const item of structures){if(item.hp<=0)continue;const [cx,cy]=this.grid(item.x,item.y),rx=Math.ceil((item.halfWidth+this.clearance)/this.cell),ry=Math.ceil((item.halfDepth+this.clearance)/this.cell);for(let row=cy-ry;row<=cy+ry;row++)for(let col=cx-rx;col<=cx+rx;col++){if(row<0||col<0||row>=this.size||col>=this.size)continue;const p=this.position(col,row);if(Math.abs(p.x-item.x)<item.halfWidth+this.clearance&&Math.abs(p.y-item.y)<item.halfDepth+this.clearance)this.occupied[row*this.size+col]=1;}}}
 nearest(x,y,maxRadius=12){const [cx,cy]=this.grid(x,y);for(let r=0;r<=maxRadius;r++){let best=null,distance=Infinity;for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){if(r&&Math.max(Math.abs(dx),Math.abs(dy))!==r)continue;const col=cx+dx,row=cy+dy;if(!this.allowed(col,row))continue;const p=this.position(col,row),d=Math.hypot(p.x-x,p.y-y);if(d<distance){distance=d;best={...p,col,row};}}if(best)return best;}return null;}
 lineClear(a,b,terrainOnly=false){
  const length=Math.hypot(b.x-a.x,b.y-a.y),times=[0,1],half=this.field.half,cell=this.field.renderCell??this.cell;
  // Height is affine within each heightfield triangle. Split exactly at its X,
  // Y and diagonal boundaries: fixed-distance samples can miss a thin slope.
  const cross=(q0,q1)=>{if(Math.abs(q1-q0)<1e-10)return;for(let k=Math.ceil(Math.min(q0,q1));k<Math.max(q0,q1);k++){const t=(k-q0)/(q1-q0);if(t>1e-9&&t<1-1e-9)times.push(t);}};
  cross((a.x+half)/cell,(b.x+half)/cell);cross((half-a.y)/cell,(half-b.y)/cell);cross((a.x-a.y+half*2)/cell,(b.x-b.y+half*2)/cell);
  cross((a.x+half)/this.cell+.5,(b.x+half)/this.cell+.5);cross((half-a.y)/this.cell+.5,(half-b.y)/this.cell+.5);times.sort((x,y)=>x-y);
  const allowed=t=>{const [col,row]=this.grid(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t);return terrainOnly?this.walkable[row*this.size+col]:this.allowed(col,row);};if(!allowed(0)||!allowed(1))return false;
  let previous=0,height=this.field.heightAt(a.x,a.y);for(const t of times){if(t-previous<1e-8)continue;if(!allowed((previous+t)/2))return false;const h=this.field.heightAt(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t);if(Math.abs(h-height)/Math.max(1e-7,length*(t-previous))>.32001)return false;previous=t;height=h;}return true;
 }
 findPath(from,to,{maxGoalDistance=Infinity}={}){
  const gx=(to.x+this.field.half)/32,gy=(this.field.half-to.y)/32,bounds=this.bounds;if(gx<bounds[0]||gy<bounds[1]||gx>bounds[2]||gy>bounds[3])return null;
  const end=this.nearest(to.x,to.y);if(!end)return null;if(this.lineClear(from,to))return[{x:to.x,y:to.y}];
  const [cx,cy]=this.grid(from.x,from.y),starts=[];for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const col=cx+dx,row=cy+dy;if(!this.allowed(col,row))continue;const p=this.position(col,row);if(this.lineClear(from,p))starts.push({...p,col,row});}if(!starts.length)return null;
  const n=this.size,endIds=new Set(),maxEndDistance=Math.min(maxGoalDistance,Math.hypot(end.x-to.x,end.y-to.y)+this.cell*1.5);for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const col=end.col+dx,row=end.row+dy,p=this.position(col,row);if(this.allowed(col,row)&&Math.hypot(p.x-to.x,p.y-to.y)<=maxEndDistance)endIds.add(row*n+col);}if(!endIds.size)return null;
  const stamp=++this.searchId,heap=[];let destination=null;
  const push=(id,priority)=>{let i=heap.length;heap.push({id,priority});while(i){const p=(i-1)>>1;if(heap[p].priority<=priority)break;heap[i]=heap[p];i=p;}heap[i]={id,priority};};
  const pop=()=>{const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let child=i*2+1;if(child+1<heap.length&&heap[child+1].priority<heap[child].priority)child++;if(heap[child].priority>=last.priority)break;heap[i]=heap[child];i=child;}heap[i]=last;}return first.id;};
  for(const start of starts){const source=start.row*n+start.col,cost=Math.hypot(start.x-from.x,start.y-from.y);this.cost[source]=cost;this.parent[source]=-1;this.visited[source]=stamp;push(source,cost+Math.hypot(start.x-to.x,start.y-to.y));}let expanded=0,found=false;
  while(heap.length&&expanded++<100000){const id=pop();if(this.closed[id]===stamp)continue;this.closed[id]=stamp;if(endIds.has(id)){destination=id;found=true;break;}const col=id%n,row=Math.floor(id/n);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const x=col+dx,y=row+dy,next=y*n+x;if(!this.allowed(x,y)||this.closed[next]===stamp)continue;if(dx&&dy&&(!this.allowed(col+dx,row)||!this.allowed(col,row+dy)))continue;const distance=this.cell*Math.hypot(dx,dy),grade=Math.abs(this.heights[next]-this.heights[id])/distance;if(grade>.30)continue;let direction=(dy+1)*3+dx+1;if(direction>4)direction--;const edge=id*8+direction;if(!this.edgeCache[edge])this.edgeCache[edge]=this.lineClear(this.position(col,row),this.position(x,y),true)?1:2;if(this.edgeCache[edge]!==1)continue;const cost=this.cost[id]+distance*(1+grade*grade*18);if(this.visited[next]!==stamp||cost<this.cost[next]){this.visited[next]=stamp;this.cost[next]=cost;this.parent[next]=id;push(next,cost+Math.hypot(x-end.col,y-end.row)*this.cell);}}
  }
  if(!found)return null;const path=[];for(let id=destination;id!==-1;id=this.parent[id])path.push(this.position(id%n,Math.floor(id/n)));path.reverse();const simplified=[];let anchor=from,index=0;while(index<path.length){let next=index;while(next+1<path.length&&this.lineClear(anchor,path[next+1]))next++;simplified.push(path[next]);anchor=path[next];index=next+1;}return simplified;
 }
}
