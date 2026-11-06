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
 return {changedVertices,maxChangeMetres,maxAllowedChangeMetres:6,flatInteriorVertices};
}
