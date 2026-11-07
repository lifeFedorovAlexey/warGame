import {gradeSpeed} from './road-traffic.js';

// One lazy reverse Dijkstra tree per compatible destination/cost profile.
// Physics and exact vehicle poses remain outside this static grid search.
export class SharedRouteTree{
 constructor(nav,goal,pavedTrip){
  this.nav=nav;this.goal={x:goal.x,y:goal.y};this.pavedTrip=pavedTrip;this.bounds=nav.bounds.join(',');
  const count=nav.size*nav.size;
  this.state=new Uint8Array(count);this.cost=new Float64Array(count);this.next=new Int32Array(count);
  this.ids=new Int32Array(4096);this.priorities=new Float64Array(4096);this.length=0;
  this.regions=new Map();this.expanded=0;this.queries=0;this.proof=null;
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
 *route(from){
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
    const length=nav.cell*Math.hypot(dx,dy),grade=(nav.heights[id]-nav.heights[next])/length;
    if(Math.abs(grade)>.52)continue;
    let direction=(dy+1)*3+dx+1;if(direction>4)direction--;
    const edge=id*8+direction;
    if(!nav.edgeCache[edge])nav.edgeCache[edge]=nav.lineClear(nav.position(col,row),nav.position(x,y),true)?1:2;
    if(nav.edgeCache[edge]!==1)continue;
    // Reverse relaxation uses the FORWARD predecessor -> current grade.
    // Uphill and downhill have different costs; reversing that sign is wrong.
    const edgeCost=roads?length*(nav.surfaceCost(next,this.pavedTrip)+surface)*.5/gradeSpeed(grade)
     :length*(1+grade*grade*18);
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
  const path=[];for(let id=source;id!==-1;id=this.next[id])path.push(nav.position(id%n,Math.floor(id/n)));
  return yield* this.simplify(from,path);
 }
 *simplify(from,path){
  const nav=this.nav,roads=!!nav.roads.buckets.size,result=[];let anchor=from,index=0;
  while(index<path.length){
   if(performance.now()>=(nav.workDeadline??Infinity))yield;
   let next=index,cost=roads?nav.travelCost(anchor,path[index],this.pavedTrip):0;
   while(next+1<path.length&&nav.lineClear(anchor,path[next+1])){
    if(performance.now()>=(nav.workDeadline??Infinity))yield;
    const travel=roads?nav.travelCost(anchor,path[next+1],this.pavedTrip):0;
    if(roads&&travel>cost+nav.travelCost(path[next],path[next+1],this.pavedTrip)+.04*nav.cell)break;
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
