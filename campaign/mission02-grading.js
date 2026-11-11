import {siteCourts} from '../assets/campaign/alpha/mission02/site-plan.js';

// Small engineered terraces under the yards. Navigation, wheels, foundations
// and paving all sample this same surface; the imported source samples stay intact.
export function gradeM02Courts(field){
 if(field.m02CourtsGrading)return field.m02CourtsGrading;
 const original=field.renderSamples.slice(),blend=32,maxAllowedChangeMetres=14;
 const sites=siteCourts.map(site=>{
  const rects=(site.terraces??site.tiles).map(r=>{const a=field.gridToWorld(r.slice(0,2)),b=field.gridToWorld(r.slice(2));return [a.x,b.y,b.x,a.y];});
  const heights=[];for(const [left,bottom,right,top] of rects)for(let y=bottom;y<=top;y+=12)for(let x=left;x<=right;x+=12)heights.push(field.heightAt(x,y));
  heights.sort((a,b)=>a-b);return {rects,height:heights[Math.floor(heights.length/2)]};
 });
 let changedVertices=0,maxChangeMetres=0;
 for(let row=0;row<field.renderSize;row++)for(let col=0;col<field.renderSize;col++){
  const x=col*field.renderCell-field.half,y=field.half-row*field.renderCell,index=row*field.renderSize+col;
  for(const site of sites){
   const outside=Math.min(...site.rects.map(([l,b,r,t])=>Math.hypot(Math.max(l-x,0,x-r),Math.max(b-y,0,y-t))));
   if(outside>=blend)continue;
   const u=outside/blend,weight=1-u*u*(3-2*u),change=Math.max(-maxAllowedChangeMetres,Math.min(maxAllowedChangeMetres,(site.height-original[index])*weight));
   field.renderSamples[index]=original[index]+change;if(field.fineMask)field.fineMask[index]=1;
   if(Math.abs(change)>.001){changedVertices++;maxChangeMetres=Math.max(maxChangeMetres,Math.abs(change));}break;
  }
 }
 return field.m02CourtsGrading={changedVertices,maxChangeMetres,maxAllowedChangeMetres};
}
