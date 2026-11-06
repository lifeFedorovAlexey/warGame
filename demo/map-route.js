// Source samples remain intact; monotone refinement rounds mesa rims while preserving flat cells.
export function createHeightfield(data){
 const {size,cellMetres:cell,heightUnitMetres:unit,samples}=data,extent=(size-1)*cell,half=extent/2,renderSize=(size-1)*2+1,renderCell=cell/2;
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),source=(x,y)=>samples[clamp(y,0,size-1)*size+clamp(x,0,size-1)]*unit;
 function cubic(a,b,c,d,t){const delta=c-b;if(Math.abs(delta)<1e-10)return b;const m0=(b-a)*delta>0?2*(b-a)*delta/(b-a+delta):0,m1=delta*(d-c)>0?2*delta*(d-c)/(delta+d-c):0;return (2*t*t*t-3*t*t+1)*b+(t*t*t-2*t*t+t)*m0+(-2*t*t*t+3*t*t)*c+(t*t*t-t*t)*m1;}
 function refine(gx,gy){const x=Math.floor(gx),y=Math.floor(gy),u=gx-x,v=gy-y,rows=[];for(let j=-1;j<=2;j++)rows.push(cubic(source(x-1,y+j),source(x,y+j),source(x+1,y+j),source(x+2,y+j),u));return cubic(...rows,v);}
 const renderSamples=new Float32Array(renderSize*renderSize);for(let y=0;y<renderSize;y++)for(let x=0;x<renderSize;x++)renderSamples[y*renderSize+x]=refine(x/2,y/2);
 function heightAt(x,y){
  const gx=clamp((x+half)/renderCell,0,renderSize-1.000001),gy=clamp((half-y)/renderCell,0,renderSize-1.000001),ix=Math.floor(gx),iy=Math.floor(gy),u=gx-ix,v=gy-iy;
  const a=renderSamples[iy*renderSize+ix],b=renderSamples[iy*renderSize+ix+1],c=renderSamples[(iy+1)*renderSize+ix],d=renderSamples[(iy+1)*renderSize+ix+1];
  return u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);
 }
 function gridToWorld(g){return {x:g[0]*cell-half,y:half-g[1]*cell};}
 function gradientAt(x,y){const e=.1;return {x:(heightAt(x+e,y)-heightAt(x-e,y))/(2*e),y:(heightAt(x,y+e)-heightAt(x,y-e))/(2*e)};}
 return {...data,extent,half,renderSize,renderCell,renderSamples,heightAt,gradientAt,gridToWorld,worldToGrid:(x,y)=>[(x+half)/cell,(half-y)/cell]};
}

export function createMapRoute(field,data){
 const rawGrid=data.pointsGrid.map(field.gridToWorld);
 const raw=rawGrid.filter((b,i)=>{const a=rawGrid[(i+rawGrid.length-1)%rawGrid.length],c=rawGrid[(i+1)%rawGrid.length];return Math.abs((b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x))>.01;});
 const points=[];
 const add=p=>{if(!points.length||Math.hypot(p.x-points.at(-1).x,p.y-points.at(-1).y)>.001)points.push({x:p.x,y:p.y,z:field.heightAt(p.x,p.y)});};
 const mix=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
 const corners=raw.map((b,i)=>{
  const a=raw[(i+raw.length-1)%raw.length],c=raw[(i+1)%raw.length],la=Math.hypot(b.x-a.x,b.y-a.y),lb=Math.hypot(c.x-b.x,c.y-b.y),dx=(b.x-a.x)/la,dy=(b.y-a.y)/la,ex=(c.x-b.x)/lb,ey=(c.y-b.y)/lb;
  const angle=Math.atan2(dx*ey-dy*ex,dx*ex+dy*ey),t=Math.min(76,la*.48,lb*.48,32*Math.tan(Math.abs(angle)/2));
  const entry=mix(b,a,t/la),exit=mix(b,c,t/lb),radius=Math.abs(angle)>.001?t/Math.tan(Math.abs(angle)/2):0,sign=Math.sign(angle);
  const center={x:entry.x-dy*radius*sign,y:entry.y+dx*radius*sign};
  return {entry,center,exit,angle,radius};
 });
 for(let i=0;i<corners.length;i++){
  const c=corners[i],next=corners[(i+1)%corners.length];
  if(c.radius>.01){const start=Math.atan2(c.entry.y-c.center.y,c.entry.x-c.center.x),steps=Math.max(2,Math.ceil(c.radius*Math.abs(c.angle)));for(let j=0;j<=steps;j++){const a=start+c.angle*j/steps;add({x:c.center.x+c.radius*Math.cos(a),y:c.center.y+c.radius*Math.sin(a)});}}
  else add(c.entry);
  const steps=Math.ceil(Math.hypot(next.entry.x-c.exit.x,next.entry.y-c.exit.y)/2);
  for(let j=1;j<=steps;j++)add(mix(c.exit,next.entry,j/steps));
 }
 if(Math.hypot(points.at(-1).x-points[0].x,points.at(-1).y-points[0].y)<.001)points.pop();
 // Gentle meanders only in broad driveable areas. Narrow passes keep their corridor.
 const original=points.map(p=>({...p})),margins=points.map((p,i)=>{
  const a=points[(i+points.length-1)%points.length],b=points[(i+1)%points.length],u={x:p.x-a.x,y:p.y-a.y},v={x:b.x-p.x,y:b.y-p.y};
  const angle=Math.abs(Math.atan2(u.x*v.y-u.y*v.x,u.x*v.x+u.y*v.y));if(angle>.012)return 0;
  for(const dx of [-22,0,22])for(const dy of [-22,0,22]){const g=field.gradientAt(p.x+dx,p.y+dy);if(Math.hypot(g.x,g.y)>.30)return 0;}
  return 1000;
 });
 for(let pass=0;pass<2;pass++)for(let k=0;k<points.length*2;k++){const i=k%points.length,j=(i+points.length-1)%points.length;margins[i]=Math.min(margins[i],margins[j]+Math.hypot(points[i].x-points[j].x,points[i].y-points[j].y));}
 for(let k=points.length*2-1;k>=0;k--){const i=k%points.length,j=(i+1)%points.length;margins[i]=Math.min(margins[i],margins[j]+Math.hypot(points[i].x-points[j].x,points[i].y-points[j].y));}
 let travelled=0;
 for(let i=0;i<points.length;i++){const a=original[(i+points.length-1)%points.length],b=original[(i+1)%points.length],p=original[i],length=Math.hypot(b.x-a.x,b.y-a.y),t=Math.min(1,margins[i]/55),fade=t*t*(3-2*t),offset=(Math.sin(travelled/47)*7+Math.sin(travelled/103+1.8)*4)*fade;points[i].x=p.x-(b.y-a.y)/length*offset;points[i].y=p.y+(b.x-a.x)/length*offset;points[i].z=field.heightAt(points[i].x,points[i].y);travelled+=Math.hypot(p.x-a.x,p.y-a.y);}
 const distances=[0];for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];distances.push(distances.at(-1)+Math.hypot(b.x-a.x,b.y-a.y));}
 const length=distances.at(-1);
 const tangents=points.map((p,i)=>{const a=points[(i+points.length-1)%points.length],b=points[(i+1)%points.length];return Math.atan2(-(b.x-a.x),b.y-a.y);});
 function sample(distance){
  const d=((distance%length)+length)%length;let lo=0,hi=points.length;
  while(lo+1<hi){const m=(lo+hi)>>1;if(distances[m]<=d)lo=m;else hi=m;}
  const a=points[lo],b=points[(lo+1)%points.length],t=(d-distances[lo])/(distances[lo+1]-distances[lo]),x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;
  return {x,y,z:field.heightAt(x,y),heading:tangents[lo]+Math.atan2(Math.sin(tangents[(lo+1)%points.length]-tangents[lo]),Math.cos(tangents[(lo+1)%points.length]-tangents[lo]))*t,distance:d,index:lo};
 }
 const stops=data.stops.map(s=>{const p=field.gridToWorld(s.grid);let index=0,best=Infinity;points.forEach((q,i)=>{const d=(p.x-q.x)**2+(p.y-q.y)**2;if(d<best){best=d;index=i;}});return {...s,distance:distances[index],...sample(distances[index])};});
 function curvature(distance){const a=sample(distance-2).heading,b=sample(distance+2).heading;return Math.atan2(Math.sin(b-a),Math.cos(b-a))/4;}
 return {points,distances,length,sample,curvature,stops};
}
