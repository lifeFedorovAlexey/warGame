import {buildTerrainPassability} from './terrain-passability.js';
// Model metres; the aircraft and protected plot share this single footprint.
export const KOROVNIK = Object.freeze({capacity:10, width:36, length:64, grid:[20.75,60], heading:Math.PI/2});
export function transportSite(field,config){
 const scale=config.worldScale??4.5;
 return {...field.gridToWorld(field.transportGrid??KOROVNIK.grid),heading:field.transportHeading??KOROVNIK.heading,scale,
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
 if(field.mapId==='m03'||field.korovnikGrading||!field.renderSamples)return;
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
 // Remove only the former level boundaries inside the graded apron. Without
 // this, invisible original cliff walls would remain across the flat slabs.
 for(const navigation of new Set([field.navigation,field.missionTerrain?.navigation,field.missionTerrain?.southernNavigation].filter(Boolean))){
  const openings=[];
  for(const wall of buildTerrainPassability({...field,navigation}).walls){
   const vertical=wall.halfWidth<.1,axis=vertical?'x':'y',other=vertical?'y':'x',extent=vertical?'halfDepth':'halfWidth',fixedExtent=vertical?pad.halfWidth:pad.halfDepth;
   if(Math.abs(wall[axis]-pad[axis])>fixedExtent+8)continue;
   const low=Math.max(wall[other]-wall[extent],pad[other]-pad[extent]-8),high=Math.min(wall[other]+wall[extent],pad[other]+pad[extent]+8);
   if(high>low)openings.push({axis,at:wall[axis],low,high,road:'mu26-apron'});
  }
  navigation.transitions=[...navigation.transitions,...openings];navigation.version+='-mu26';
 }
 field.korovnikGrading={height,maximum,site:pad};
}
