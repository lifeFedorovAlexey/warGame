const cellSize=64;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

// Exact projections on an immutable polyline. The index belongs to geometry,
// not a mission: terrain, bridges and other bounded line queries share it.
export function createPolylineQuery(points){
 const segments=[],buckets=new Map();let serial=0;
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
  if(!length)continue;
  const segment={a,b,dx,dy,length,index:i,left:Math.min(a.x,b.x),right:Math.max(a.x,b.x),bottom:Math.min(a.y,b.y),top:Math.max(a.y,b.y)};
  segments.push(segment);
  for(let y=Math.floor(segment.bottom/cellSize);y<=Math.floor(segment.top/cellSize);y++)
  for(let x=Math.floor(segment.left/cellSize);x<=Math.floor(segment.right/cellSize);x++){
   const key=x+','+y,list=buckets.get(key)??[];list.push(segment);buckets.set(key,list);
  }
 }
 function nearest(x,y,radius=Infinity){
  let best=null,shortest=radius;const query=++serial;
  const visit=segment=>{
   if(segment.query===query)return;segment.query=query;
   if(x<segment.left-shortest||x>segment.right+shortest||y<segment.bottom-shortest||y>segment.top+shortest)return;
   const {a,b,dx,dy,length,index}=segment;
   const t=clamp(((x-a.x)*dx+(y-a.y)*dy)/(length*length),0,1),px=a.x+dx*t,py=a.y+dy*t,distance=Math.hypot(x-px,y-py);
   if(distance>shortest||best&&distance===shortest&&index>=best.index)return;
   shortest=distance;best={distance,x:px,y:py,z:a.z+(b.z-a.z)*t,along:a.along+(b.along-a.along)*t,nx:-dy/length,ny:dx/length,index,t};
  };
  if(Number.isFinite(radius)){
   for(let row=Math.floor((y-radius)/cellSize);row<=Math.floor((y+radius)/cellSize);row++)
   for(let col=Math.floor((x-radius)/cellSize);col<=Math.floor((x+radius)/cellSize);col++)
   for(const segment of buckets.get(col+','+row)??[])visit(segment);
  }else for(const segment of segments)visit(segment);
  return best;
 }
 // Navigation repeatedly checks identical edge endpoints and quarter points.
 // Hashing selects a cache slot only; exact coordinates/radius validate hits.
 // Collisions cause recomputation, never rounded water/ground classifications.
 const capacity=16384;let xs,ys,radii,values;
 function withinDistance(x,y,radius){
  if(!values){xs=new Float64Array(capacity);ys=new Float64Array(capacity);radii=new Float64Array(capacity);values=new Uint8Array(capacity);}
  let hash=Math.imul(Math.floor(x*256),0x9e3779b1)^Math.imul(Math.floor(y*256),0x85ebca6b)^Math.imul(Math.floor(radius*256),0xc2b2ae35);
  hash=Math.imul(hash^(hash>>>16),0x7feb352d);const slot=(hash^(hash>>>15))&(capacity-1);
  if(values[slot]&&xs[slot]===x&&ys[slot]===y&&radii[slot]===radius)return values[slot]===2;
  const inside=(nearest(x,y,radius)?.distance??Infinity)<radius;
  xs[slot]=x;ys[slot]=y;radii[slot]=radius;values[slot]=inside?2:1;return inside;
 }
 return {nearest,withinDistance};
}
