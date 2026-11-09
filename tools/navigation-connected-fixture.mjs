import {TerrainNavigator} from '../campaign/navigation.js';

// Benchmark setup only. This navigator owns all terrain/edge/search caches;
// selecting a reachable fixture must not warm the navigator being measured.
export function connectedSpawnFilter(mission,goal){
 const began=performance.now(),nav=new TerrainNavigator(mission.field,{cell:mission.nav.cell,
  bounds:mission.state.bounds.slice(),vehicleScale:mission.config.worldScale});
 nav.rebuild(mission.state.buildings.filter(b=>!b.clearing));
 const anchor=nav.nearest(goal.x,goal.y),size=nav.size,seen=new Uint8Array(size*size),queue=new Int32Array(seen.length);
 if(!anchor||!nav.lineClear(anchor,goal,false,true))throw Error('Connected fixture target has no legal grid connector');
 let head=0,tail=1;queue[0]=anchor.row*size+anchor.col;seen[queue[0]]=1;
 while(head<tail){
  const id=queue[head++],col=id%size,row=Math.floor(id/size),a=nav.position(col,row);
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   if(!dx&&!dy)continue;
   const x=col+dx,y=row+dy,next=y*size+x;
   if(!nav.allowed(x,y)||seen[next]||dx&&dy&&(!nav.allowed(col+dx,row)||!nav.allowed(col,row+dy)))continue;
   if(!nav.lineClear(a,nav.position(x,y),true))continue;
   seen[next]=1;queue[tail++]=next;
  }
 }
 return {metadata:{mode:'connected',setupMs:performance.now()-began,reachableGridNodes:tail,
  anchor:{x:anchor.x,y:anchor.y},separateSetupNavigator:true,spacing:32,heading:0},
  accepts(point){const [col,row]=nav.grid(point.x,point.y);return !!seen[row*size+col]&&nav.lineClear(point,nav.position(col,row),false,true);}};
}
