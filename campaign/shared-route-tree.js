
// One lazy reverse Dijkstra tree per compatible destination/cost profile.
// Physics and exact vehicle poses remain outside this static grid search.
export class SharedRouteTree{
 constructor(nav,goal,pavedTrip){
  this.nav=nav;this.goal={x:goal.x,y:goal.y};this.pavedTrip=pavedTrip;this.bounds=nav.bounds.join(',');
  const count=nav.size*nav.size;
  this.state=new Uint8Array(count);this.cost=new Float64Array(count);this.next=new Int32Array(count);
  this.ids=new Int32Array(4096);this.priorities=new Float64Array(4096);this.length=0;
  this.regions=new Map();this.expanded=0;this.queries=0;this.proof=null;
  this.segmentCosts=new Map();this.costCacheHits=0;
  this.segmentClearance=new Map();this.clearanceCacheHits=0;
  const [col,row]=nav.grid(goal.x,goal.y);this.root=row*nav.size+col;
  this.state[this.root]=1;this.next[this.root]=-1;this.mark(col,row);this.push(this.root,0);
 }
 mark(col,row){const key=Math.floor(col/16)+','+Math.floor(row/16);if(!this.regions.has(key))this.regions.set(key,this.nav.regionVersions.get(key)??0);}
 valid(){return this.bounds===this.nav.bounds.join(',')&&this.nav.regionsUnchanged(this.regions);}
 get bytes(){return this.state.byteLength+this.cost.byteLength+this.next.byteLength+this.ids.byteLength+this.priorities.byteLength+(this.proof?.byteLength??0);}
 push(id,priority){
  if(this.length===this.ids.length){
   const capacity=Math.min(this.state.length*8,this.ids.length*2);
   if(capacity<=this.ids.length)throw Error('Static route frontier exceeded finite grid-edge bound');
   const ids=new Int32Array(capacity),priorities=new Float64Array(capacity);ids.set(this.ids);priorities.set(this.priorities);this.ids=ids;this.priorities=priorities;
  }
  let index=this.length++;
  while(index){const parent=(index-1)>>1;if(this.priorities[parent]<=priority)break;this.ids[index]=this.ids[parent];this.priorities[index]=this.priorities[parent];index=parent;}
  this.ids[index]=id;this.priorities[index]=priority;
 }
 pop(){
  const id=this.ids[0],last=this.ids[--this.length],priority=this.priorities[this.length];
  if(this.length){let index=0;while(index*2+1<this.length){let child=index*2+1;if(child+1<this.length&&this.priorities[child+1]<this.priorities[child])child++;
   if(this.priorities[child]>=priority)break;this.ids[index]=this.ids[child];this.priorities[index]=this.priorities[child];index=child;}
   this.ids[index]=last;this.priorities[index]=priority;
  }return id;
 }
 *branch(from){
  const nav=this.nav,n=nav.size,[cx,cy]=nav.grid(from.x,from.y),entries=new Map();this.queries++;
  nav.lastExhaustedReachability=null;
  if(!nav.allowed(cx,cy)||!nav.terrainAllowed(from.x,from.y))return null;
  for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
   const col=cx+dx,row=cy+dy;if(!nav.allowed(col,row))continue;
   const point=nav.position(col,row);if(!nav.lineClear(from,point,false,true))continue;
   entries.set(row*n+col,nav.roads.buckets.size?nav.travelCost(from,point,this.pavedTrip):Math.hypot(from.x-point.x,from.y-point.y));
  }
  if(!entries.size)return null;
  let best=Infinity,source=-1;
  const accept=id=>{if(!entries.has(id))return;const cost=this.cost[id]+entries.get(id);if(cost<best){best=cost;source=id;}};
  for(const id of entries.keys())if(this.state[id]===2)accept(id);
  while(this.length&&this.priorities[0]<best){
   if(this.expanded%32===0&&performance.now()>=(nav.workDeadline??Infinity))yield;
   const id=this.pop();if(this.state[id]===2)continue;
   this.state[id]=2;this.expanded++;accept(id);
   const col=id%n,row=Math.floor(id/n),roads=!!nav.roads.buckets.size,surface=roads?nav.surfaceCost(id,this.pavedTrip):0;this.mark(col,row);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    if(!dx&&!dy)continue;
    const x=col+dx,y=row+dy,next=y*n+x;
    // Track blocked boundary cells too: removal of an adjacent footprint can
    // open a shorter route and must invalidate this tree's settled distances.
    if(x>=0&&y>=0&&x<n&&y<n&&((x>>4)!==(col>>4)||(y>>4)!==(row>>4)))this.mark(x,y);
    if(!nav.allowed(x,y)||this.state[next]===2||dx&&dy&&(!nav.allowed(col+dx,row)||!nav.allowed(col,row+dy)))continue;
    const length=nav.cell*Math.hypot(dx,dy);
    let direction=(dy+1)*3+dx+1;if(direction>4)direction--;
    const edge=id*8+direction;
    if(!nav.edgeCache[edge])nav.edgeCache[edge]=nav.lineClear(nav.position(col,row),nav.position(x,y),true)?1:2;
    if(nav.edgeCache[edge]!==1)continue;
    const edgeCost=roads?length*(nav.surfaceCost(next,this.pavedTrip)+surface)*.5:length;
    const cost=this.cost[id]+edgeCost;
    if(!this.state[next]||cost<this.cost[next]){this.state[next]=1;this.cost[next]=cost;this.next[next]=id;this.push(next,cost);}
   }
  }
  if(source<0){
   if(!this.length){
    if(!this.proof){this.proof=new Uint32Array(Math.ceil(this.state.length/32));
     for(let i=0;i<this.state.length;i++){if(this.state[i]===2)this.proof[i>>>5]|=1<<(i&31);if(i%4096===0&&performance.now()>=(nav.workDeadline??Infinity))yield;}}
    nav.lastExhaustedReachability=this.proof;
   }
   return null;
  }
  const path=[];for(let id=source;id!==-1;id=this.next[id])path.push(id);
  return path;
 }
 position(id){return this.nav.position(id%this.nav.size,Math.floor(id/this.nav.size));}
 segmentKey(from,to){
  const nav=this.nav,n=nav.size,ax=(from.x+nav.field.half)/nav.cell,ay=(nav.field.half-from.y)/nav.cell,
   bx=(to.x+nav.field.half)/nav.cell,by=(nav.field.half-to.y)/nav.cell;
  return Number.isInteger(ax)&&Number.isInteger(ay)&&Number.isInteger(bx)&&Number.isInteger(by)?(ay*n+ax)*n*n+by*n+bx:null;
 }
 travelCost(from,to){
  const nav=this.nav,key=this.segmentKey(from,to);
  // Shared branches repeatedly smooth the same grid segments. Cache exact
  // directed costs only; continuous endpoint connectors are always recomputed.
  if(key===null)return nav.travelCost(from,to,this.pavedTrip);
  if(this.segmentCosts.has(key)){this.costCacheHits++;return this.segmentCosts.get(key);}
  const cost=nav.travelCost(from,to,this.pavedTrip);this.segmentCosts.set(key,cost);
  if(this.segmentCosts.size>8192)this.segmentCosts.delete(this.segmentCosts.keys().next().value);
  return cost;
 }
 clearSegment(from,to){
  const key=this.segmentKey(from,to);if(key===null)return this.nav.lineClear(from,to);
  if(this.segmentClearance.has(key)){this.clearanceCacheHits++;return this.segmentClearance.get(key);}
  const clear=this.nav.lineClear(from,to);
  // A smoothing chord can cross a region outside its grid branch. Both
  // successful and rejected cached chords depend on EVERY crossed region.
  for(const [region,version] of this.nav.pathRegions(from,[to]))if(!this.regions.has(region))this.regions.set(region,version);
  this.segmentClearance.set(key,clear);
  if(this.segmentClearance.size>8192)this.segmentClearance.delete(this.segmentClearance.keys().next().value);
  return clear;
 }
 *route(from){
  const branch=yield* this.branch(from);if(!branch)return null;
  return yield* this.simplify(from,branch.map(id=>this.position(id)));
 }
 *between(from,to){
  const left=yield* this.branch(from);if(!left)return null;
  const right=yield* this.branch(to);if(!right)return null;
  const indices=new Map(left.map((id,index)=>[id,index]));let joined=0;
  while(!indices.has(right[joined]))joined++;
  // Both chains strictly descend positive tree costs to the same root. Join
  // at their first common ancestor, not at the root: no duplicate loop/backtrack.
  const ids=left.slice(0,indices.get(right[joined])+1);
  let previous=this.position(right[joined]);
  for(let index=joined-1;index>=0;index--){
   if(performance.now()>=(this.nav.workDeadline??Infinity))yield;
   const point=this.position(right[index]);
   // The target chain was settled for target -> root. Check root -> target
   // edges again: today's absolute-grade passability is symmetric, whereas
   // road/slope COST is directional and is recomputed below during smoothing.
   if(!this.nav.lineClear(previous,point))return null;
   ids.push(right[index]);previous=point;
  }
  if(!this.nav.lineClear(previous,to))return null;
  const path=ids.map(id=>this.position(id));
  if(Math.hypot(previous.x-to.x,previous.y-to.y)>.001)path.push({x:to.x,y:to.y});
  return yield* this.simplify(from,path);
 }
 *simplify(from,path){
  const nav=this.nav,roads=!!nav.roads.buckets.size,result=[];let anchor=from,index=0;
  while(index<path.length){
   if(performance.now()>=(nav.workDeadline??Infinity))yield;
   let next=index,cost=roads?this.travelCost(anchor,path[index]):0;
   while(next+1<path.length&&this.clearSegment(anchor,path[next+1])){
    if(performance.now()>=(nav.workDeadline??Infinity))yield;
    const travel=roads?this.travelCost(anchor,path[next+1]):0;
    if(roads&&travel>cost+this.travelCost(path[next],path[next+1])+.04*nav.cell)break;
    next++;cost=travel;
   }
   result.push(path[next]);anchor=path[next];index=next+1;
  }
  return result;
 }
}

export function sharedRouteTree(nav,goal,pavedTrip){
 const cache=nav.sharedRouteTrees??=new Map(),key=[goal.x,goal.y,pavedTrip,nav.vehicleScale,...nav.bounds].join('|');
 let tree=cache.get(key);
 if(!tree?.valid())tree=new SharedRouteTree(nav,goal,pavedTrip);
 cache.delete(key);cache.set(key,tree);
 // Two road-cost profiles; a new group/destination evicts old scratch state.
 while(cache.size>2)cache.delete(cache.keys().next().value);
 return tree;
}
