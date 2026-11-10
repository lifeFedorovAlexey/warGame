import {rasterizeLocalRoads} from './local-road-mask-raster.js';

// Signed-distance data for extra paved approaches, blended by roadSurface()
// exactly like the map's original asphalt. It is not a physical surface.
export function createLocalRoadMask(T){
  const empty=new T.DataTexture(new Uint8Array(4),1,1,T.RGBAFormat);empty.needsUpdate=true;
  const bounds={value:new T.Vector4(0,0,1,1)},texture={value:empty},enabled={value:0};
  const size=1024;
  let pixels,area,staticMask;
  function setRoads(paths,staticCount=0){
    const segments=[];
    for(const [index,road] of paths.entries())for(let i=1;i<road.points.length;i++){
      const a=road.points[i-1],b=road.points[i];
      segments.push({a,b,ra:(a.width??road.width)/2,rb:(b.width??road.width)/2,fixed:index<staticCount});
    }
    const replaceIndex=paths.findIndex(road=>road.replaceRect);
    const replacements=replaceIndex<0?[]:[{rect:paths[replaceIndex].replaceRect,fixed:replaceIndex<staticCount}];
    if(!segments.length){enabled.value=0;return;}
    const padding=32,minX=Math.min(...segments.flatMap(s=>[s.a.x,s.b.x]))-padding,minY=Math.min(...segments.flatMap(s=>[s.a.y,s.b.y]))-padding;
    const maxX=Math.max(...segments.flatMap(s=>[s.a.x,s.b.x]))+padding,maxY=Math.max(...segments.flatMap(s=>[s.a.y,s.b.y]))+padding;
    area={x:minX,y:minY,w:maxX-minX,h:maxY-minY};
    pixels??=new Uint8Array(size*size*4);
    const xs=Float64Array.from({length:size},(_,i)=>minX+(i+.5)/size*area.w);
    const ys=Float64Array.from({length:size},(_,i)=>minY+(i+.5)/size*area.h);
    // The three channels compose by maximum at a given projection. Keep the
    // static layer intact so adding or deleting a driveway never rerasterizes it.
    if(staticCount){
      const key=JSON.stringify([area,paths.slice(0,staticCount)]);
      if(staticMask?.key!==key){
        const data=staticMask?.data??new Uint8Array(pixels.length);
        data.fill(0);
        rasterizeLocalRoads(data,size,area,segments.filter(s=>s.fixed),replacements.filter(r=>r.fixed),xs,ys);
        staticMask={key,data};
      }
      pixels.set(staticMask.data);
      rasterizeLocalRoads(pixels,size,area,segments.filter(s=>!s.fixed),replacements.filter(r=>!r.fixed),xs,ys);
    }else{
      pixels.fill(0);
      rasterizeLocalRoads(pixels,size,area,segments,replacements,xs,ys);
    }
    if(texture.value===empty){
      texture.value=new T.DataTexture(pixels,size,size,T.RGBAFormat);
      texture.value.minFilter=texture.value.magFilter=T.LinearFilter;
      empty.dispose();
    }else texture.value.image.data=pixels;
    texture.value.needsUpdate=true;bounds.value.set(area.x,area.y,area.w,area.h);enabled.value=1;
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
float localRoadPaintReplacement(vec2 p){
 if(localRoadEnabled<.5)return 0.;
 vec2 uv=(p-localRoadBounds.xy)/localRoadBounds.zw;
 if(uv.x<0.||uv.y<0.||uv.x>1.||uv.y>1.)return 0.;
 vec3 local=texture2D(localRoadMask,uv).rgb;
 return max(local.g,smoothstep(.46,.54,local.b));
}
float withLocalRoad(vec2 p,float inward){
 if(localRoadEnabled<.5)return inward;
 vec2 uv=(p-localRoadBounds.xy)/localRoadBounds.zw;
 if(uv.x<0.||uv.y<0.||uv.x>1.||uv.y>1.)return inward;
 vec2 local=texture2D(localRoadMask,uv).rg;
 return max(mix(inward,-12.,local.g),(local.r-.5)*24.);
}
`;
