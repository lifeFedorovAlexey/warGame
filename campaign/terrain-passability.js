// Authored gameplay topology: three level IDs and explicit openings between
// them. Elevation and surface slope are deliberately absent from this module.
export function buildTerrainPassability(field){
 const layout=field.navigation,half=field.half;
 const size=layout?.size??1,cell=layout?.cellMetres??field.extent;
 const levels=new Uint8Array(size*size),walls=[],buckets=new Map(),gates=new Map();
 if(layout){
  if(layout.rows.length!==size)throw new Error('Invalid navigation level map');
  layout.rows.forEach((row,y)=>{
   let x=0;for(const run of row.split(',')){
    const [count,level]=run.split(':').map(Number);
    if(!Number.isInteger(count)||count<1||!Number.isInteger(level)||level<0||level>2||x+count>size)throw new Error('Invalid navigation level row');
    levels.fill(level,y*size+x,y*size+x+count);x+=count;
   }
   if(x!==size)throw new Error('Incomplete navigation level row');
  });
  for(const gate of layout.transitions){
   const key=gate.axis+':'+gate.at,list=gates.get(key)??[];list.push(gate);gates.set(key,list);
  }
  for(const list of gates.values())list.sort((a,b)=>a.low-b.low);
 }
 const index=(x,y)=>{
  const col=Math.floor((x+half)/cell),row=Math.floor((half-y)/cell);
  return col<0||row<0||col>=size||row>=size?-1:row*size+col;
 };
 function addWall(axis,at,low,high){
  if(high-low<.001)return;
  const vertical=axis==='x',wall={id:'level-wall:'+walls.length,
   x:vertical?at:(low+high)/2,y:vertical?(low+high)/2:at,
   halfWidth:vertical?.01:(high-low)/2,halfDepth:vertical?(high-low)/2:.01};
  walls.push(wall);
  for(let y=Math.floor((wall.y-wall.halfDepth)/64);y<=Math.floor((wall.y+wall.halfDepth)/64);y++)
   for(let x=Math.floor((wall.x-wall.halfWidth)/64);x<=Math.floor((wall.x+wall.halfWidth)/64);x++){
    const key=x+','+y,list=buckets.get(key)??[];list.push(wall);buckets.set(key,list);
   }
 }
 function boundary(axis,at,low,high){
  let cursor=low;
  for(const gate of gates.get(axis+':'+at)??[]){
   if(gate.high<=cursor||gate.low>=high)continue;
   addWall(axis,at,cursor,Math.min(high,gate.low));cursor=Math.max(cursor,gate.high);
   if(cursor>=high)return;
  }
  addWall(axis,at,cursor,high);
 }
 if(layout)for(const axis of ['x','y'])for(let fixed=1;fixed<size;fixed++){
  let start=-1;
  for(let varying=0;varying<=size;varying++){
   const different=varying<size&&(axis==='x'
    ?levels[varying*size+fixed-1]!==levels[varying*size+fixed]
    :levels[(fixed-1)*size+varying]!==levels[fixed*size+varying]);
   if(different&&start<0)start=varying;
   if(!different&&start>=0){
    if(axis==='x')boundary(axis,fixed*cell-half,half-varying*cell,half-start*cell);
    else boundary(axis,half-fixed*cell,start*cell-half,varying*cell-half);
    start=-1;
   }
  }
 }
 // Imported maps can supply impassable source cliff cells. They participate
 // in the same segment and vehicle sweep checks as authored level walls.
 for(const item of field.terrainObstacles??[]){
  const wall={...item};walls.push(wall);
  for(let y=Math.floor((wall.y-wall.halfDepth)/64);y<=Math.floor((wall.y+wall.halfDepth)/64);y++)
   for(let x=Math.floor((wall.x-wall.halfWidth)/64);x<=Math.floor((wall.x+wall.halfWidth)/64);x++){
    const key=x+','+y,list=buckets.get(key)??[];list.push(wall);buckets.set(key,list);
   }
 }
 function nearby(a,b=a,padding=0){
  const found=new Set(),left=Math.min(a.x,b.x)-padding,right=Math.max(a.x,b.x)+padding,
   bottom=Math.min(a.y,b.y)-padding,top=Math.max(a.y,b.y)+padding;
  for(let y=Math.floor(bottom/64);y<=Math.floor(top/64);y++)for(let x=Math.floor(left/64);x<=Math.floor(right/64);x++)
   for(const wall of buckets.get(x+','+y)??[])if(wall.x+wall.halfWidth>=left&&wall.x-wall.halfWidth<=right
    &&wall.y+wall.halfDepth>=bottom&&wall.y-wall.halfDepth<=top)found.add(wall);
  return [...found];
 }
 function clearSegment(a,b,padding=0){
  if(index(a.x,a.y)<0||index(b.x,b.y)<0)return false;
  for(const wall of nearby(a,b,padding)){
   let enter=0,exit=1;
   for(const [key,extent] of [['x',wall.halfWidth+padding],['y',wall.halfDepth+padding]]){
    const start=a[key]-wall[key],delta=b[key]-a[key];
    if(Math.abs(delta)<1e-9){if(Math.abs(start)>extent){enter=Infinity;break;}continue;}
    const t0=(-extent-start)/delta,t1=(extent-start)/delta;
    enter=Math.max(enter,Math.min(t0,t1));exit=Math.min(exit,Math.max(t0,t1));
   }
   if(enter<=exit)return false;
  }
  return true;
 }
 const allowed=(x,y)=>index(x,y)>=0;
 return Object.assign(allowed,{version:layout?.version??'single-level',levelAt:(x,y)=>{const i=index(x,y);return i<0?null:levels[i];},
  clearSegment,nearbyWalls:nearby,walls,transitions:layout?.transitions??[]});
}
