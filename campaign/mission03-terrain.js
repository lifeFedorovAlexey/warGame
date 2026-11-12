import {createHeightfield} from '../demo/map-route.js';
import source from '../assets/campaign/alpha/mission03/original-map.js';
export const m03Grid=grid=>[grid[0]+source.offset[0],grid[1]+source.offset[1]];
export const m03Point=grid=>({x:(grid[0]+source.offset[0])*32-2032,y:2032-(grid[1]+source.offset[1])*32});
export const m03Source=source;
export const m03Landing=m03Grid(source.labels.area_1.pos1.map((v,i)=>(v+source.labels.area_1.pos2[i])/256));
export const m03Artifact=m03Point(source.labels.position_3.pos.map(v=>v/128));
export const m03Ruins=source.features.filter(v=>/Warehouse|Ruin|ruin|HUT/.test(v.kind)).map(v=>{
 const p=m03Point(v.grid),large=/Warehouse2|Tech/.test(v.kind);return [p.x,p.y,large?44:22,large?30:21,/Warehouse|HUT/.test(v.kind)];
});
// Original geography defines the three passages. Surface dressing uses the
// campaign's worn gravel courts, without copying isolated asphalt tiles.
export const m03Roads=[];
export function createM03Field(){
 const samples=[];for(let y=0;y<128;y++)for(let x=0;x<128;x++){
  const sx=Math.max(0,Math.min(source.width-1,x-source.offset[0])),sy=Math.max(0,Math.min(source.height-1,y-source.offset[1]));
  const d=Math.hypot(x-source.offset[0]-sx,y-source.offset[1]-sy),t=Math.min(1,d/12),blend=t*t*(3-2*t),edge=source.heights[sy*source.width+sx];
  // Outside the original map only, fade into a natural distant continuation.
  // Repeating the boundary column made every ridge stretch across the horizon.
  const distant=55+18*Math.sin(x*.19+y*.11)+13*Math.cos(y*.23-x*.09);
  samples.push(edge*(1-blend)+distant*blend);
 }
 const field=createHeightfield({size:128,cellMetres:32,heightUnitMetres:source.heightUnitMetres,samples});
 Object.assign(field,{mapId:'m03',m02Roads:[],roadNetwork:{paths:m03Roads},localRoads:m03Roads,missionBaseRoads:m03Roads,transportGrid:m03Landing,transportHeading:Math.PI/2,sourceMap:source.source});
 // Only the aircraft apron is levelled; source heights remain intact.
 const p=field.gridToWorld(m03Landing),z=field.heightAt(p.x,p.y);let maxCut=0;
 for(let y=0;y<field.renderSize;y++)for(let x=0;x<field.renderSize;x++){
  const wx=x*16-field.half,wy=field.half-y*16,d=Math.hypot(Math.max(0,Math.abs(wx-p.x)-148),Math.max(0,Math.abs(wy-p.y)-85));
  if(d>=24)continue;const t=d/24,i=y*field.renderSize+x,cut=(z-field.renderSamples[i])*(1-t*t*(3-2*t));field.renderSamples[i]+=cut;maxCut=Math.max(maxCut,Math.abs(cut));
 }
 field.korovnikGrading={height:z,maximum:maxCut,site:p};
 field.terrainObstacles=[];
 // Bake cliff occupancy once. The shared navigator remains independent of
 // render-time slope sampling and uses its normal physical wall sweeps.
 for(let row=0;row<source.height*4-4;row++){
  let start=-1;
  for(let col=0;col<=source.width*4-4;col++){
   const q=m03Point([(col+.5)/4,(row+.5)/4]),g=field.gradientAt(q.x,q.y),type=source.terrainTypes[Math.floor(row/4)*source.width+Math.floor(col/4)];
   const blocked=col<source.width*4-4&&(type===8||Math.hypot(g.x,g.y)>.65)&&!(Math.abs(q.x-p.x)<160&&Math.abs(q.y-p.y)<98);
   if(blocked&&start<0)start=col;
   if(!blocked&&start>=0){const a=m03Point([start/4,row/4]),b=m03Point([col/4,(row+1)/4]);field.terrainObstacles.push({id:'m03-cliff-'+row+'-'+start,x:(a.x+b.x)/2,y:(a.y+b.y)/2,halfWidth:(b.x-a.x)/2,halfDepth:4});start=-1;}
  }
 }
 field.m03Ruins=m03Ruins.flatMap(([x,y,w,d,closed])=>closed?[{id:`store-${x}-${y}`,x,y,halfWidth:w/2+1.2,halfDepth:d/2+1.2,hp:1,environment:true}]:[...[-1,1].map(s=>({id:`ruin-${x}-${y}-${s}`,x:x+s*w/2,y,halfWidth:1.2,halfDepth:d/2,hp:1,environment:true})),{id:`ruin-${x}-${y}-back`,x,y:y+d/2,halfWidth:w/2,halfDepth:1.2,hp:1,environment:true}]);
 return field;
}
