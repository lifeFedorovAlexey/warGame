// Sharpen only existing steep faces. Every triangle suitable for foundations
// (including the factory's .28 limit) and its one-cell shoulder stays exact.
// Road and compound grading runs afterwards on this same physical surface.
export function shapeRockEscarpments(field){
 const n=field.renderSize,cell=field.renderCell,source=field.renderSamples.slice(),protectedVertices=new Uint8Array(source.length);
 const smooth=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
 for(let row=0;row<n-1;row++)for(let col=0;col<n-1;col++){
  const i=row*n+col,a=source[i],b=source[i+1],c=source[i+n],d=source[i+n+1];
  if(Math.min(Math.hypot(b-a,c-a),Math.hypot(d-c,d-b))/cell>.30)continue;
  for(let y=Math.max(0,row-1);y<=Math.min(n-1,row+2);y++)for(let x=Math.max(0,col-1);x<=Math.min(n-1,col+2);x++)protectedVertices[y*n+x]=1;
 }
 let changed=0,maxChange=0;
 for(let row=2;row<n-2;row++)for(let col=2;col<n-2;col++){
  const i=row*n+col;if(protectedVertices[i])continue;
  const h=source[i],x=col*cell,y=row*cell;
  const slope=Math.hypot(source[i+1]-source[i-1],source[i+n]-source[i-n])/(2*cell);
  const weight=smooth(.32,.65,slope)*smooth(8,20,h);
  // Broad bedding with gently varying elevation, rather than uniform steps.
  const shift=Math.sin(x/93+y/157)*1.7+Math.sin(y/71-x/181)*.9,band=(h+shift)/11,base=Math.floor(band),phase=band-base;
  const target=(base+smooth(.29,.71,phase))*11-shift,change=(target-h)*weight;
  if(Math.abs(change)<.001)continue;
  field.renderSamples[i]=h+change;field.fineMask[i]=1;changed++;maxChange=Math.max(maxChange,Math.abs(change));
 }
 field.rockEscarpments={changed,maxChange};return field.rockEscarpments;
}
