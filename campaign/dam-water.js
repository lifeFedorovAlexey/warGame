// Small tileable wave normals. No changing geometry or per-frame allocations.
export function damWaterNormals(T){
 const size=128,height=new Float32Array(size*size),pixels=new Uint8Array(size*size*4),tau=Math.PI*2;
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const u=x/size*tau,v=y/size*tau;
  height[y*size+x]=Math.sin(u*2+Math.sin(v*2))*.5+Math.sin(u*5+v*3)*.24+Math.sin(v*6-u*2)*.2;
 }
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const dx=(height[y*size+(x+1)%size]-height[y*size+(x+size-1)%size])*3,dy=(height[((y+1)%size)*size+x]-height[((y+size-1)%size)*size+x])*3,length=Math.hypot(dx,dy,1),i=(y*size+x)*4;
  pixels[i]=128-dx/length*127;pixels[i+1]=128-dy/length*127;pixels[i+2]=128+127/length;pixels[i+3]=255;
 }
 const map=new T.DataTexture(pixels,size,size);map.wrapS=map.wrapT=T.RepeatWrapping;map.minFilter=T.LinearMipmapLinearFilter;map.magFilter=T.LinearFilter;map.generateMipmaps=true;map.repeat.set(.23,.23);map.needsUpdate=true;return map;
}
