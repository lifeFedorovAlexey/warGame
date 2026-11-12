import {m03SurfaceAt} from './mission03-surface-layout.js';
// The existing terrain shader and scanned materials, with masks derived from
// this map's own elevations and original surface types (not Alpha's masks).
export function m03SurfaceMaps(T,field){
 const size=1024,canvases=Array.from({length:7},()=>{const c=document.createElement('canvas');c.width=c.height=size;return c;}),contexts=canvases.map(c=>c.getContext('2d')),images=contexts.map(c=>c.createImageData(size,size));
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const gx=x/(size-1)*127,gy=y/(size-1)*127,{weights,color}=m03SurfaceAt(field,gx,gy);
  const ranked=weights.map((w,i)=>({w,i})).sort((a,b)=>b.w-a.w),j=(y*size+x)*4;
  for(let k=0;k<4;k++)images[k].data.set([...weights.slice(k*3,k*3+3).map(v=>Math.round(v*255)),255],j);
  images[4].data.set([...color,255],j);
  images[5].data.set([ranked[0].i,ranked[1].i,Math.round(255*ranked[1].w/(ranked[0].w+ranked[1].w)),255],j);
  // Original paved tiles locate an old settlement, not separate square roads.
  // The shared yard renderer draws continuous, worn gravel courts instead.
  images[6].data.set([0,0,0,255],j);
 }
 const textures=canvases.map((c,i)=>{contexts[i].putImageData(images[i],0,0);const t=new T.CanvasTexture(c);t.minFilter=t.magFilter=T.LinearFilter;return t;});
 return {controls:textures.slice(0,4),macro:textures[4],selection:textures[5],roadDetail:textures[6]};
}
