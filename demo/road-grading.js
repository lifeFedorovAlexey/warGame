// Narrow cut/fill around surveyed road centre lines. Mesa interiors stay unchanged.
export function applyRoadGrades(field,roads){
 if(!roads.grading?.enabled)return {changedVertices:0,maxChangeMetres:0};
 const original=field.renderSamples.slice(),bins=new Map(),bucket=64,maxChange=roads.grading.maxChangeMetres??4;
 for(const path of roads.paths)for(let i=0;i<path.points.length-1;i++){
  const a=path.points[i],b=path.points[i+1],radius=path.width/2+20,segment={a,b,half:path.width/2};
  for(let y=Math.floor((Math.min(a.y,b.y)-radius)/bucket);y<=Math.floor((Math.max(a.y,b.y)+radius)/bucket);y++)for(let x=Math.floor((Math.min(a.x,b.x)-radius)/bucket);x<=Math.floor((Math.max(a.x,b.x)+radius)/bucket);x++){const key=x+','+y;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(segment);}
 }
 let changedVertices=0,maxChangeMetres=0;
 for(let row=0;row<field.renderSize;row++)for(let col=0;col<field.renderSize;col++){
  const x=col*field.renderCell-field.half,y=field.half-row*field.renderCell,index=row*field.renderSize+col,list=bins.get(Math.floor(x/bucket)+','+Math.floor(y/bucket));if(!list)continue;
  let nearest=Infinity,target=original[index],half=13;
  for(const {a,b,half:width} of list){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1))),px=a.x+dx*t,py=a.y+dy*t,distance=Math.hypot(x-px,y-py);if(distance<nearest){nearest=distance;target=a.z+(b.z-a.z)*t-.015*Math.min(distance,width);half=width;}}
  if(nearest>half+20)continue;const u=Math.max(0,Math.min(1,(nearest-half)/20)),blend=1-u*u*(3-2*u),change=Math.max(-maxChange,Math.min(maxChange,target-original[index]))*blend;
  field.renderSamples[index]=original[index]+change;if(Math.abs(change)>.001){changedVertices++;maxChangeMetres=Math.max(maxChangeMetres,Math.abs(change));}
 }
 return {changedVertices,maxChangeMetres,maxAllowedChangeMetres:maxChange};
}
