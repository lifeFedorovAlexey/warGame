// A finer collision grid is needed only for road profiles. Samples away from
// road grading lie exactly on the original coarse triangles.
export function refineRoadHeightfield(source){
 const renderSize=(source.renderSize-1)*2+1,renderCell=source.renderCell/2,renderSamples=new Float32Array(renderSize*renderSize);
 for(let y=0;y<renderSize;y++)for(let x=0;x<renderSize;x++)renderSamples[y*renderSize+x]=source.heightAt(x*renderCell-source.half,source.half-y*renderCell);
 const field={...source,renderSize,renderCell,renderSamples,coarseSize:source.renderSize,fineMask:new Uint8Array(renderSamples.length)};
 field.heightAt=(x,y)=>{const gx=Math.max(0,Math.min(renderSize-1.000001,(x+field.half)/renderCell)),gy=Math.max(0,Math.min(renderSize-1.000001,(field.half-y)/renderCell)),ix=Math.floor(gx),iy=Math.floor(gy),u=gx-ix,v=gy-iy,a=renderSamples[iy*renderSize+ix],b=renderSamples[iy*renderSize+ix+1],c=renderSamples[(iy+1)*renderSize+ix],d=renderSamples[(iy+1)*renderSize+ix+1];return u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);};
 field.gradientAt=(x,y)=>({x:(field.heightAt(x+.1,y)-field.heightAt(x-.1,y))/.2,y:(field.heightAt(x,y+.1)-field.heightAt(x,y-.1))/.2});
 return field;
}
