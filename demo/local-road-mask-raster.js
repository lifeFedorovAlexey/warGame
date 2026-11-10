// Rasterize prepared road segments on the mask's exact texel grid.
export function rasterizeLocalRoads(data,size,area,segments,replacements,xs,ys){
  const {x:minX,y:minY}=area;
  const clamp=(v)=>Math.max(0,Math.min(size-1,v));
  // Independent yards can replace different parts of the source asphalt.
  // Keep the original base-yard feather, but permit precise cuts hidden
  // beneath a new carriageway. The same channel removes the old paint.
  for(const {rect,feather=18,preserveRoads=[]} of replacements){
    const x0=clamp(Math.floor((rect[0]-minX)/area.w*size)),x1=clamp(Math.ceil((rect[2]-minX)/area.w*size));
    const y0=clamp(Math.floor((rect[1]-minY)/area.h*size)),y1=clamp(Math.ceil((rect[3]-minY)/area.h*size));
    const stride=x1-x0+1;
    let protection;
    // A preserved segment only affects pixels within its radius plus the
    // two-metre feather. Rasterize those rectangles instead of scanning
    // every preserved segment for every pixel in the entire yard.
    for(const road of preserveRoads)for(let i=1;i<road.points.length;i++){
      const a=road.points[i-1],b=road.points[i],r=(road.width??26)/2+1,margin=r+2;
      const left=Math.max(x0,Math.floor((Math.min(a.x,b.x)-margin-minX)/area.w*size));
      const right=Math.min(x1,Math.ceil((Math.max(a.x,b.x)+margin-minX)/area.w*size));
      const low=Math.max(y0,Math.floor((Math.min(a.y,b.y)-margin-minY)/area.h*size));
      const high=Math.min(y1,Math.ceil((Math.max(a.y,b.y)+margin-minY)/area.h*size));
      if(left>right||low>high)continue;
      protection??=new Float64Array(stride*(y1-y0+1)).fill(1);
      const dx=b.x-a.x,dy=b.y-a.y,length2=dx*dx+dy*dy||1;
      for(let iy=low;iy<=high;iy++)for(let ix=left;ix<=right;ix++){
        const x=xs[ix]-a.x,y=ys[iy]-a.y,t=Math.max(0,Math.min(1,(x*dx+y*dy)/length2));
        const p=(iy-y0)*stride+ix-x0;
        protection[p]=Math.min(protection[p],Math.max(0,Math.min(1,(Math.hypot(x-t*dx,y-t*dy)-r)/2)));
      }
    }
    for(let iy=y0;iy<=y1;iy++)for(let ix=x0;ix<=x1;ix++){
      const x=xs[ix],y=ys[iy],distance=Math.min(x-rect[0],y-rect[1],rect[2]-x,rect[3]-y),index=(iy*size+ix)*4+1;
      const preserve=protection?protection[(iy-y0)*stride+ix-x0]:1;
      data[index]=Math.max(data[index],Math.round(Math.max(0,Math.min(1,distance/feather))*preserve*255));
    }
  }
  for(const {a,b,ra,rb,caps=[],cutSourcePaint} of segments){
    const margin=Math.max(ra,rb)+12,dx=b.x-a.x,dy=b.y-a.y,length2=dx*dx+dy*dy;
    const x0=clamp(Math.floor((Math.min(a.x,b.x)-margin-minX)/area.w*size)),x1=clamp(Math.ceil((Math.max(a.x,b.x)+margin-minX)/area.w*size));
    const y0=clamp(Math.floor((Math.min(a.y,b.y)-margin-minY)/area.h*size)),y1=clamp(Math.ceil((Math.max(a.y,b.y)+margin-minY)/area.h*size));
    for(let iy=y0;iy<=y1;iy++)for(let ix=x0;ix<=x1;ix++){
      const x=xs[ix],y=ys[iy];
      const raw=length2?((x-a.x)*dx+(y-a.y)*dy)/length2:0,t=Math.max(0,Math.min(1,raw));
      let inward=ra+(rb-ra)*t-Math.hypot(x-a.x-t*dx,y-a.y-t*dy);
      // Clip neighbouring sampled segments too: clipping only the last
      // segment leaves its predecessor's round cap protruding past the end.
      for(const cap of caps)if((x-cap.x)**2+(y-cap.y)**2<cap.radius**2)inward=Math.min(inward,(x-cap.x)*cap.dx+(y-cap.y)*cap.dy);
      const value=Math.round(Math.max(0,Math.min(1,inward/24+.5))*255),index=(iy*size+ix)*4;
      data[index]=Math.max(data[index],value);
      if(cutSourcePaint)data[index+2]=Math.max(data[index+2],value);
    }
  }
}
