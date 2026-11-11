import {baseApproachRoads} from './base-roads.js';

export const factoryAccessVersion=2;
const cache=new WeakMap(),distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function accessPoint(site,scale,x,y){const a=site.rotation??0,c=Math.cos(a),s=Math.sin(a);return{x:site.x+(x*c-y*s)*scale,y:site.y+(x*s+y*c)*scale};}
export function roadIntersectsSite(road,site,padding=0){
 const r=road.width/2+padding;
 return road.points.slice(1).some((b,i)=>segmentBox(road.points[i],b,site,r));
}
function segmentBox(a,b,box,pad){
 let lo=0,hi=1;
 for(const [axis,size] of [['x','halfWidth'],['y','halfDepth']]){
  const d=b[axis]-a[axis],min=box[axis]-box[size]-pad,max=box[axis]+box[size]+pad;
  if(Math.abs(d)<1e-8){if(a[axis]<=min||a[axis]>=max)return false;continue;}
  let p=(min-a[axis])/d,q=(max-a[axis])/d;if(p>q)[p,q]=[q,p];lo=Math.max(lo,p);hi=Math.min(hi,q);if(lo>=hi)return false;
 }
 return true;
}
export function factoryRoadNetwork(mission){
 const authored=mission.field.localRoads??[],local=authored.some(r=>r.kind==='street')||!mission.config.baseSites?.length
  ?authored:[...baseApproachRoads(mission.field,mission.config),...authored];
 const replacement=local.find(r=>r.replaceRect)?.replaceRect,surveyed=[];
 // The terrain mask erases this old alignment. Joining it produced visible stubs.
 for(const road of mission.field.roadNetwork?.paths??[]){
  let points=[];
  const flush=()=>{if(points.length>1)surveyed.push({...road,points});points=[];};
  for(let i=1;i<road.points.length;i++){
   const a=road.points[i-1],b=road.points[i],x=(a.x+b.x)/2,y=(a.y+b.y)/2;
   if(replacement&&x>replacement[0]&&y>replacement[1]&&x<replacement[2]&&y<replacement[3]){flush();continue;}
   if(!points.length)points.push(a);points.push(b);
  }
  flush();
 }
 return [...local.filter(r=>!['factory','lab','generator','derrick'].includes(r.kind)),...surveyed,
  ...mission.state.buildings.filter(b=>b.hp>0&&b.kind==='factory').flatMap(b=>(b.accessRoads??[]).map(road=>({...road,factoryId:b.id})))];
}
function rounded(raw,radius,minRadius){
 const points=[];
 for(const p of raw){
  if(points.length&&distance(points.at(-1),p)<.01)continue;
  if(points.length>1){
   const a=points.at(-2),b=points.at(-1),cross=(b.x-a.x)*(p.y-b.y)-(b.y-a.y)*(p.x-b.x);
   if(Math.abs(cross)<.01){if((b.x-a.x)*(p.x-b.x)+(b.y-a.y)*(p.y-b.y)<0)return null;points.pop();}
  }
  points.push(p);
 }
 const result=[points[0]];
 for(let i=1;i<points.length-1;i++){
  const a=points[i-1],b=points[i],c=points[i+1],ab=distance(a,b),bc=distance(b,c),ux=(b.x-a.x)/ab,uy=(b.y-a.y)/ab,vx=(c.x-b.x)/bc,vy=(c.y-b.y)/bc;
  const angle=Math.atan2(ux*vy-uy*vx,ux*vx+uy*vy);if(Math.abs(angle)<.01){result.push(b);continue;}
  const tangent=Math.tan(Math.abs(angle)/2),trim=Math.min(radius*tangent,ab*.48,bc*.48),r=trim/tangent;
  if(r<minRadius)return null;
  const p={x:b.x-ux*trim,y:b.y-uy*trim},sign=Math.sign(angle),centre={x:p.x-uy*r*sign,y:p.y+ux*r*sign},start=Math.atan2(p.y-centre.y,p.x-centre.x);
  const steps=Math.max(4,Math.ceil(r*Math.abs(angle)/3));
  for(let j=0;j<=steps;j++){const t=start+angle*j/steps;result.push({x:centre.x+Math.cos(t)*r,y:centre.y+Math.sin(t)*r});}
 }
 result.push(points.at(-1));return result;
}
// Bounded event-time planning, cached for repeated placement previews. The
// width is checked, not only a centre line; roads never change terrain rules.
export function planFactoryAccess(mission,site){
 const {field,config}=mission,scale=config.worldScale,width=scale*6,radius=width/2;
 const structures=mission.state.buildings.filter(b=>b.id!==site.id&&(b.hp>0||b.damage?.wreck));
 const signature=[site.x,site.y,site.rotation,mission.nav.topologyRevision,mission.fogRevision,
  ...structures.flatMap(b=>[b.id,b.x,b.y,b.hp>0,(b.accessRoads??[]).length])].join('|');
 let memo=cache.get(mission);if(!memo)cache.set(mission,memo=new Map());if(memo.has(signature))return memo.get(signature);
 const obstacles=[site,...structures],roads=factoryRoadNetwork(mission).filter(r=>!site.id||r.factoryId!==site.id),terrain=mission.nav.terrainAllowed;
 const connections=roads.filter(r=>!r.factoryId);
 if(roads.some(road=>roadIntersectsSite(road,site)))return remember({ok:false,reason:'Нельзя строить завод на дороге',roads:[]});
 const clear=(a,b,ignoreFactory=false)=>{
  if(terrain.clearSegment&&!terrain.clearSegment(a,b,radius))return false;
  if((ignoreFactory?structures:obstacles).some(s=>segmentBox(a,b,s,radius+.5)))return false;
  const n=Math.max(1,Math.ceil(distance(a,b)/8)),dx=b.x-a.x,dy=b.y-a.y,len=Math.max(.001,distance(a,b));
  for(let i=0;i<=n;i++)for(const side of [-1,0,1]){
   const x=a.x+dx*i/n-dy/len*radius*side,y=a.y+dy*i/n+dx/len*radius*side;
   if(!mission.inBounds(x,y)||!mission.exploredAt(x,y)||!terrain.clearSegment&&!terrain(x,y))return false;
   const g=field.gradientAt(x,y);if(Math.hypot(g.x,g.y)>(config.maxRoadGrade??.52))return false;
   if(config.oilFields.some(grid=>{const p=field.gridToWorld(grid);return Math.hypot(p.x-x,p.y-y)<scale*5+5;}))return false;
  }
  return true;
 };
 const access=[];
 for(const side of [-1,1]){
  const door=accessPoint(site,scale,0,side*config.buildings.factory.realSizeMetres[1]*.79/2),apron=accessPoint(site,scale,0,side*18);
  const axis={x:(apron.x-site.x)/(scale*18),y:(apron.y-site.y)/(scale*18)},lateral={x:axis.y,y:-axis.x};
  if(!clear(door,apron,true))return remember({ok:false,reason:side<0?'Для въезда завода нет места':'Для выезда завода нет места',roads:access});
  let direct=null;
  for(const road of connections)for(let i=1;i<road.points.length;i++){
   const a=road.points[i-1],b=road.points[i],dx=b.x-a.x,dy=b.y-a.y,cross=dx*axis.y-dy*axis.x;if(Math.abs(cross)<.001)continue;
   const t=-((a.x-door.x)*axis.y-(a.y-door.y)*axis.x)/cross;if(t<0||t>1)continue;
   const join={x:a.x+dx*t,y:a.y+dy*t},along=(join.x-door.x)*axis.x+(join.y-door.y)*axis.y;
   if(along<distance(door,apron)||along>scale*140||direct&&along>=distance(door,direct))continue;
   if(clear(apron,join))direct=join;
  }
  // Stop at the first street crossing, even when it lies before the old start point.
  if(direct){access.push({kind:'factory-access',direction:side<0?'entry':'exit',width,points:[door,direct]});continue;}
  const turnRadius=scale*5,depth=config.buildings.factory.footprintMetres[1]*scale/2;
  const start={x:site.x+axis.x*(depth+radius+turnRadius+3),y:site.y+axis.y*(depth+radius+turnRadius+3)};
  const offset=config.buildings.factory.footprintMetres[0]*scale/2+radius+turnRadius*.3+6;
  const origins=[start,...[-1,1].map(sign=>({x:start.x+lateral.x*offset*sign,y:start.y+lateral.y*offset*sign}))];
  const candidates=[];
  for(const road of connections)for(let i=1;i<road.points.length;i++)for(const origin of origins){
   const a=road.points[i-1],b=road.points[i],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(len<1)continue;
   const t=Math.max(0,Math.min(1,((origin.x-a.x)*dx+(origin.y-a.y)*dy)/(len*len))),join={x:a.x+dx*t,y:a.y+dy*t};
   if(distance(start,join)>scale*140||candidates.some(c=>distance(c.join,join)<12))continue;
   const sign=((start.x-join.x)*(-dy)+(start.y-join.y)*dx)>=0?1:-1,approach=Math.max(road.width/2+6,scale*6);
   const pre={x:join.x-dy/len*sign*approach,y:join.y+dx/len*sign*approach};
   if(clear(pre,join))candidates.push({join,pre,cost:distance(start,pre)+approach});
  }
  candidates.sort((a,b)=>a.cost-b.cost);let best=null,bestLength=Infinity;
  for(const target of candidates.slice(0,24)){
   const across=(target.pre.x-start.x)*lateral.x+(target.pre.y-start.y)*lateral.y;
   const along=(target.pre.x-start.x)*axis.x+(target.pre.y-start.y)*axis.y;
   const corners=[{x:start.x+lateral.x*across,y:start.y+lateral.y*across},
    {x:start.x+axis.x*along,y:start.y+axis.y*along}];
   for(const corner of corners)for(const r of [turnRadius,scale*4]){
    const points=rounded([door,start,corner,target.pre,target.join],r,radius+4);if(!points)continue;
    const valid=points.slice(1).every((b,i)=>clear(points[i],b,i===0));
    if(valid){const length=points.slice(1).reduce((sum,p,i)=>sum+distance(points[i],p),0);if(length<bestLength){bestLength=length;best={kind:'factory-access',direction:side<0?'entry':'exit',width,points};}}
   }
  }
  if(!best)return remember({ok:false,reason:'Нет места для двух подъездов — поверните завод',roads:access});
  access.push(best);
 }
 return remember({ok:true,roads:access});
 function remember(value){if(memo.size>=32)memo.delete(memo.keys().next().value);memo.set(signature,value);return value;}
}

// Refresh saved asphalt, not vehicle poses. Keep a legacy route if the occupied
// site cannot be rebuilt safely; it can be reviewed again after topology changes.
export function refreshFactoryAccess(mission){
 const factories=mission.state.buildings.filter(b=>b.hp>0&&b.kind==='factory'&&b.accessRoadVersion!==factoryAccessVersion);
 const saved=new Map(factories.map(b=>[b,b.accessRoads]));
 for(const building of factories)building.accessRoads=[];
 for(const building of factories){
  const result=planFactoryAccess(mission,building);
  if(result.ok){building.accessRoads=result.roads;building.accessRoadVersion=factoryAccessVersion;delete building.accessRoadFailure;}
  else {building.accessRoads=saved.get(building)??[];building.accessRoadFailure=result.reason;}
 }
 return factories.length;
}
