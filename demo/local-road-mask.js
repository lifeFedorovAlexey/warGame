// Signed-distance data for extra paved approaches, blended by roadSurface()
// exactly like the map's original asphalt. It is not a physical surface.
export function createLocalRoadMask(T){
  const empty=new T.DataTexture(new Uint8Array(4),1,1,T.RGBAFormat);empty.needsUpdate=true;
  const bounds={value:new T.Vector4(0,0,1,1)},texture={value:empty},enabled={value:0};
  let pixels,size=1024,area;
  function setRoads(paths){
    const segments=[];
    for(const road of paths)for(let i=1;i<road.points.length;i++){
      const a=road.points[i-1],b=road.points[i];segments.push({a,b,ra:(a.width??road.width)/2,rb:(b.width??road.width)/2});
    }
    if(!segments.length){enabled.value=0;return;}
    const padding=32,minX=Math.min(...segments.flatMap(s=>[s.a.x,s.b.x]))-padding,minY=Math.min(...segments.flatMap(s=>[s.a.y,s.b.y]))-padding;
    const maxX=Math.max(...segments.flatMap(s=>[s.a.x,s.b.x]))+padding,maxY=Math.max(...segments.flatMap(s=>[s.a.y,s.b.y]))+padding;
    area={x:minX,y:minY,w:maxX-minX,h:maxY-minY};pixels=new Uint8Array(size*size*4);
    const rect=paths.find(p=>p.replaceRect)?.replaceRect;
    if(rect)for(let iy=0;iy<size;iy++)for(let ix=0;ix<size;ix++){
      const x=minX+(ix+.5)/size*area.w,y=minY+(iy+.5)/size*area.h;
      const distance=Math.min(x-rect[0],y-rect[1],rect[2]-x,rect[3]-y);
      pixels[(iy*size+ix)*4+1]=Math.round(Math.max(0,Math.min(1,distance/18))*255);
    }
    const clamp=(v)=>Math.max(0,Math.min(size-1,v));
    for(const {a,b,ra,rb} of segments){
      const margin=Math.max(ra,rb)+12,dx=b.x-a.x,dy=b.y-a.y,length2=dx*dx+dy*dy;
      const x0=clamp(Math.floor((Math.min(a.x,b.x)-margin-minX)/area.w*size)),x1=clamp(Math.ceil((Math.max(a.x,b.x)+margin-minX)/area.w*size));
      const y0=clamp(Math.floor((Math.min(a.y,b.y)-margin-minY)/area.h*size)),y1=clamp(Math.ceil((Math.max(a.y,b.y)+margin-minY)/area.h*size));
      for(let iy=y0;iy<=y1;iy++)for(let ix=x0;ix<=x1;ix++){
        const x=minX+(ix+.5)/size*area.w,y=minY+(iy+.5)/size*area.h;
        const t=length2?Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/length2)):0;
        const inward=ra+(rb-ra)*t-Math.hypot(x-a.x-t*dx,y-a.y-t*dy),value=Math.round(Math.max(0,Math.min(1,inward/24+.5))*255),index=(iy*size+ix)*4;
        pixels[index]=Math.max(pixels[index],value);
      }
    }
    const next=new T.DataTexture(pixels,size,size,T.RGBAFormat);next.minFilter=next.magFilter=T.LinearFilter;next.needsUpdate=true;
    texture.value.dispose();texture.value=next;bounds.value.set(area.x,area.y,area.w,area.h);enabled.value=1;
  }
  function blendAt(x,y,original=0){
    if(!enabled.value||x<area.x||y<area.y||x>=area.x+area.w||y>=area.y+area.h)return original;
    const ix=Math.floor((x-area.x)/area.w*size),iy=Math.floor((y-area.y)/area.h*size),index=(iy*size+ix)*4,inward=(pixels[index]/255-.5)*24;
    return Math.max(original*(1-pixels[index+1]/255),Math.max(0,Math.min(1,(inward+2)/4)));
  }
  return {uniforms:{localRoadBounds:bounds,localRoadMask:texture,localRoadEnabled:enabled},setRoads,blendAt};
}

export const localRoadGLSL=`
uniform sampler2D localRoadMask;
uniform vec4 localRoadBounds;
uniform float localRoadEnabled;
float localRoadReplacement(vec2 p){
 if(localRoadEnabled<.5)return 0.;
 vec2 uv=(p-localRoadBounds.xy)/localRoadBounds.zw;
 if(uv.x<0.||uv.y<0.||uv.x>1.||uv.y>1.)return 0.;
 return texture2D(localRoadMask,uv).g;
}
float withLocalRoad(vec2 p,float inward){
 if(localRoadEnabled<.5)return inward;
 vec2 uv=(p-localRoadBounds.xy)/localRoadBounds.zw;
 if(uv.x<0.||uv.y<0.||uv.x>1.||uv.y>1.)return inward;
 vec2 local=texture2D(localRoadMask,uv).rg;
 return max(mix(inward,-12.,local.g),(local.r-.5)*24.);
}
`;
