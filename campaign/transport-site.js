// Model metres; the aircraft and protected plot share this single footprint.
export const KOROVNIK = Object.freeze({capacity:10, width:36, length:64, grid:[15,60], heading:Math.PI/2});
export function transportSite(field,config){
 const scale=config.worldScale??4.5;
 return {...field.gridToWorld(KOROVNIK.grid),heading:KOROVNIK.heading,scale,
  halfWidth:KOROVNIK.length*scale/2,halfDepth:KOROVNIK.width*scale/2};
}
export function transportPoint(site,x,y,z=0){
 const c=Math.cos(site.heading),s=Math.sin(site.heading);
 return {x:site.x+(x*c-y*s)*site.scale,y:site.y+(x*s+y*c)*site.scale,z:z*site.scale};
}
export function transportReservation(field,config,site){
 const pad=transportSite(field,config);
 return Math.abs(site.x-pad.x)<site.halfWidth+pad.halfWidth&&Math.abs(site.y-pad.y)<site.halfDepth+pad.halfDepth;
}
// Grade before the terrain mesh and navigation are constructed. This is an
// engineered earth apron, not a floating slab over the original hills.
export function prepareTransportSite(field){
 if(field.korovnikGrading||!field.renderSamples)return;
 const pad=transportSite(field,{worldScale:4.5}),height=field.heightAt(pad.x,pad.y),blend=26;
 let maximum=0;
 for(let row=0;row<field.renderSize;row++)for(let col=0;col<field.renderSize;col++){
  const x=col*field.renderCell-field.half,y=field.half-row*field.renderCell;
  const outside=Math.hypot(Math.max(0,Math.abs(x-pad.x)-pad.halfWidth-4),Math.max(0,Math.abs(y-pad.y)-pad.halfDepth-4));
  if(outside>=blend)continue;
  const i=row*field.renderSize+col,t=outside/blend,w=1-t*t*(3-2*t),old=field.renderSamples[i];
  field.renderSamples[i]=old+(height-old)*w;maximum=Math.max(maximum,Math.abs(field.renderSamples[i]-old));
  if(field.fineMask)field.fineMask[i]=1;
 }
 field.korovnikGrading={height,maximum};
}
