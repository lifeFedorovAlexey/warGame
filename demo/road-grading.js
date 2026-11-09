// Narrow cut/fill around surveyed road centre lines. Mesa interiors stay unchanged.
export function applyRoadGrades(field,roads){
 field.roadNetwork=roads;
 if(!roads.grading?.enabled)return {changedVertices:0,maxChangeMetres:0};
 const original=field.renderSamples.slice(),bins=new Map(),bucket=64,maxChange=roads.grading.maxChangeMetres??4;
 for(const path of roads.paths)for(let i=0;i<path.points.length-1;i++){
  const a=path.points[i],b=path.points[i+1],half=((a.width??path.width)+(b.width??path.width))/4,radius=half+20,segment={a,b,half};
  for(let y=Math.floor((Math.min(a.y,b.y)-radius)/bucket);y<=Math.floor((Math.max(a.y,b.y)+radius)/bucket);y++)for(let x=Math.floor((Math.min(a.x,b.x)-radius)/bucket);x<=Math.floor((Math.max(a.x,b.x)+radius)/bucket);x++){const key=x+','+y;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(segment);}
 }
 for(const node of roads.nodes??[])if(node.degree>2||node.base){const radius=node.apronRadius??28,pad={pad:true,base:node.base,x:node.x,y:node.y,z:node.z??field.heightAt(node.x,node.y),gx:node.planeX??0,gy:node.planeY??0,radius};for(let y=Math.floor((node.y-radius-20)/bucket);y<=Math.floor((node.y+radius+20)/bucket);y++)for(let x=Math.floor((node.x-radius-20)/bucket);x<=Math.floor((node.x+radius+20)/bucket);x++){const key=x+','+y;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(pad);}}
 let changedVertices=0,maxChangeMetres=0;
 for(let row=0;row<field.renderSize;row++)for(let col=0;col<field.renderSize;col++){
  const x=col*field.renderCell-field.half,y=field.half-row*field.renderCell,index=row*field.renderSize+col,list=bins.get(Math.floor(x/bucket)+','+Math.floor(y/bucket));if(!list)continue;
  let nearest=Infinity,target=original[index],half=13,padBlend=0,padTarget=0,roadWeight=0,weightedTarget=0;
  for(const segment of list){if(segment.pad){const distance=Math.hypot(x-segment.x,y-segment.y),u=Math.max(0,Math.min(1,(distance-segment.radius+4)/(segment.base?4:24))),blend=1-u*u*(3-2*u);padBlend+=blend;padTarget+=(segment.z+segment.gx*(x-segment.x)+segment.gy*(y-segment.y)-.005*distance)*blend;continue;}const {a,b,half:width}=segment,dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1))),px=a.x+dx*t,py=a.y+dy*t,distance=Math.hypot(x-px,y-py);const localTarget=a.z+(b.z-a.z)*t-.015*Math.min(distance,width),sigma=Math.max(18,width*.95),weight=Math.exp(-distance*distance/(sigma*sigma));roadWeight+=weight;weightedTarget+=localTarget*weight;if(distance<nearest){nearest=distance;target=localTarget;half=width;}}
  if(roadWeight>1e-8)target=weightedTarget/roadWeight;if(nearest>half+20&&!padBlend)continue;if(field.fineMask)field.fineMask[index]=1;const u=Math.max(0,Math.min(1,(nearest-half)/20)),blend=1-u*u*(3-2*u),roadTarget=original[index]+(target-original[index])*blend,desired=padBlend?roadTarget+(padTarget/padBlend-roadTarget)*Math.min(1,padBlend):roadTarget,change=Math.max(-maxChange,Math.min(maxChange,desired-original[index]));
  const applied=Math.max(0,original[index]+change)-original[index];field.renderSamples[index]=original[index]+applied;if(Math.abs(applied)>.001){changedVertices++;maxChangeMetres=Math.max(maxChangeMetres,Math.abs(applied));}
 }
 // Authored construction pads are levelled after the road grading, so the
 // visible ground and placement sampling use the same finished surface.
 let padVertices=0;
 for(const pad of field.preparedPads??[]){
  const blend=pad.blendMetres,landform=pad.landform;
  // The rectangle remains the construction reserve, not the silhouette of a
  // cut into the hill. An authored rounded basin blends into existing relief.
  const [cx,cy]=landform?.centre??[0,0],[rx,ry]=landform?.radii??[1,1];
  const envelope=1.06+blend/Math.min(rx,ry);
  const [left,bottom,right,top]=landform?[cx-rx*envelope+blend,cy-ry*envelope+blend,cx+rx*envelope-blend,cy+ry*envelope-blend]:pad.rect;
  const c0=Math.max(0,Math.floor((left-blend+field.half)/field.renderCell)),c1=Math.min(field.renderSize-1,Math.ceil((right+blend+field.half)/field.renderCell));
  const r0=Math.max(0,Math.floor((field.half-top-blend)/field.renderCell)),r1=Math.min(field.renderSize-1,Math.ceil((field.half-bottom+blend)/field.renderCell));
  for(let row=r0;row<=r1;row++)for(let col=c0;col<=c1;col++){
   const x=col*field.renderCell-field.half,y=field.half-row*field.renderCell,index=row*field.renderSize+col;
   let outside=Math.hypot(Math.max(left-x,0,x-right),Math.max(bottom-y,0,y-top));
   if(landform){
    const nx=(x-cx)/rx,ny=(y-cy)/ry,angle=Math.atan2(ny,nx);
    const contour=1+.04*Math.sin(angle*3+.7)+.02*Math.sin(angle*5-1.1);
    outside=Math.max(0,Math.hypot(nx,ny)-contour)*Math.min(rx,ry);
   }
   const t=Math.min(1,outside/blend),weight=1-t*t*(3-2*t);
   if(weight<=0)continue;
   field.renderSamples[index]+=(pad.height-field.renderSamples[index])*weight;
   if(field.fineMask)field.fineMask[index]=1;padVertices++;
  }
 }
 return {changedVertices,maxChangeMetres,maxAllowedChangeMetres:maxChange,padVertices};
}
