// Shape the playable terrain once, before road grading and collision sampling.
// Broad flat interiors remain level; only the neighbourhood of existing relief changes.
export function shapeMesaRims(field){
 const n=field.renderSize,source=field.renderSamples.slice(),blurred=new Float32Array(source.length),horizontal=new Float32Array(source.length),kernel=[1,4,6,4,1];
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){let value=0;for(let k=-2;k<=2;k++)value+=source[y*n+clamp(x+k,0,n-1)]*kernel[k+2];horizontal[y*n+x]=value/16;}
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){let value=0;for(let k=-2;k<=2;k++)value+=horizontal[clamp(y+k,0,n-1)*n+x]*kernel[k+2];blurred[y*n+x]=value/16;}
 const hash=(x,y)=>{const v=Math.sin(x*127.1+y*311.7)*43758.5453;return v-Math.floor(v);};
 function noise(x,y){const ix=Math.floor(x),iy=Math.floor(y),u=smooth(0,1,x-ix),v=smooth(0,1,y-iy);return (hash(ix,iy)*(1-u)+hash(ix+1,iy)*u)*(1-v)+(hash(ix,iy+1)*(1-u)+hash(ix+1,iy+1)*u)*v;}
 function sample(x,y){x=clamp(x,0,n-1.000001);y=clamp(y,0,n-1.000001);const ix=Math.floor(x),iy=Math.floor(y),u=x-ix,v=y-iy;return (blurred[iy*n+ix]*(1-u)+blurred[iy*n+ix+1]*u)*(1-v)+(blurred[(iy+1)*n+ix]*(1-u)+blurred[(iy+1)*n+ix+1]*u)*v;}
 let changedVertices=0,maxChangeMetres=0,flatInteriorVertices=0;
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const i=y*n+x,h=source[i];let low=h,high=h;
  for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const v=source[clamp(y+dy,0,n-1)*n+clamp(x+dx,0,n-1)];low=Math.min(low,v);high=Math.max(high,v);}
  if(high-low<.01){flatInteriorVertices++;continue;}
  const wx=x*field.renderCell,wy=y*field.renderCell,mask=smooth(.2,4,high-low),wxOffset=(noise(wx/230,wy/230)-.5)*22/field.renderCell,wyOffset=(noise(wx/260+23,wy/260-19)-.5)*22/field.renderCell;
  // Keep the shared outer boundary exact so a surrounding landscape can join it.
  const border=smooth(0,3,Math.min(x,y,n-1-x,n-1-y));
  const target=sample(x+wxOffset,y+wyOffset),change=clamp((target-h)*.84,-6,6)*mask*border;
  field.renderSamples[i]=h+change;if(Math.abs(change)>.001){changedVertices++;maxChangeMetres=Math.max(maxChangeMetres,Math.abs(change));}
 }
 // Explicit local visual profiles follow authored level rims. They do not
 // determine passability; navigation continues to use its level walls/gates.
 let profiledVertices=0;
 for(const profile of field.terrainProfiles??[]){
  const segments=[];let total=0;
  for(let i=1;i<profile.points.length;i++){
   const a=profile.points[i-1],b=profile.points[i],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
   segments.push({a,dx,dy,length,start:total});total+=length;
  }
  const radius=profile.blendMetres,points=profile.points;
  const x0=clamp(Math.floor((Math.min(...points.map(p=>p[0]))-radius+field.half)/field.renderCell),0,n-1);
  const x1=clamp(Math.ceil((Math.max(...points.map(p=>p[0]))+radius+field.half)/field.renderCell),0,n-1);
  const y0=clamp(Math.floor((field.half-Math.max(...points.map(p=>p[1]))-radius)/field.renderCell),0,n-1);
  const y1=clamp(Math.ceil((field.half-Math.min(...points.map(p=>p[1]))+radius)/field.renderCell),0,n-1);
  for(let row=y0;row<=y1;row++)for(let col=x0;col<=x1;col++){
   const x=col*field.renderCell-field.half,y=field.half-row*field.renderCell;let closest=null,gap=Infinity;
   for(const segment of segments){
    const {a,dx,dy,length}=segment,t=clamp(((x-a[0])*dx+(y-a[1])*dy)/(length*length),0,1);
    const ox=x-a[0]-dx*t,oy=y-a[1]-dy*t,d=Math.hypot(ox,oy);
    if(d<gap){gap=d;closest={side:(dx*oy-dy*ox)/length,along:segment.start+t*length};}
   }
   if(gap>=radius)continue;
   const half=profile.slopeWidthMetres/2;
   const weight=(1-smooth(half,radius,gap))*smooth(0,profile.endBlendMetres,closest.along)
    *smooth(0,profile.endBlendMetres,total-closest.along);
   const height=profile.bottom+(profile.top-profile.bottom)*smooth(-half,half,closest.side),i=row*n+col;
   field.renderSamples[i]+=(height-field.renderSamples[i])*weight;if(weight>.001)profiledVertices++;
  }
 }
 return {changedVertices,maxChangeMetres,maxAllowedChangeMetres:6,flatInteriorVertices,profiledVertices};
}
