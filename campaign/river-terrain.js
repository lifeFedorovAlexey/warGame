import {damLayout} from './dam-layout.js';
// Shared geography for both missions. Grid coordinates are the game's native
// north-up coordinates; the concept camera never rotates the authored map.
const controls=[[8.42,59.69],[9.8,62],[14,64],[20.5,64.4],[22.4,68],[24,73],[25.6,79.5],[26.2,82],[29,84.2],[34,84.5],[39,84.5],[44,86],[49,89],[54.5,92]];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function nearestOnLine(points,x,y){
 let best={distance:Infinity};
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy),t=clamp(((x-a.x)*dx+(y-a.y)*dy)/(length*length),0,1),px=a.x+dx*t,py=a.y+dy*t,distance=Math.hypot(x-px,y-py);
  if(distance<best.distance)best={distance,x:px,y:py,z:a.z+(b.z-a.z)*t,along:a.along+(b.along-a.along)*t,nx:-dy/length,ny:dx/length,index:i,t};
 }
 return best;
}
export function installRiverTerrain(field,roads){
 if(field.river||field.m02Authoring)return field.river;
 let points=controls.map(field.gridToWorld);
 for(let pass=0;pass<2;pass++){
  const smooth=[points[0]];
  for(let i=1;i<points.length;i++)for(const t of [.25,.75])smooth.push({x:points[i-1].x*(1-t)+points[i].x*t,y:points[i-1].y*(1-t)+points[i].y*t});
  smooth.push(points.at(-1));points=smooth;
 }
 let length=0;points.forEach((p,i)=>{if(i)length+=Math.hypot(p.x-points[i-1].x,p.y-points[i-1].y);p.along=length;});
 points.forEach(p=>p.z=3.9-14*p.along/length);
 const sample=(x,y)=>nearestOnLine(points,x,y),bridges=[];
 for(const road of roads){
  let start=-1;
  for(let i=0;i<=road.points.length;i++){
   const on=i<road.points.length&&sample(road.points[i].x,road.points[i].y).distance<78;
   if(on&&start<0)start=Math.max(0,i-1);
   if(!on&&start>=0){
    const path=road.points.slice(start,Math.min(i+1,road.points.length));start=-1;
    if(!path.some(p=>sample(p.x,p.y).distance<18))continue;
    let travelled=0;
    const deck=path.map((p,j)=>{if(j)travelled+=Math.hypot(p.x-path[j-1].x,p.y-path[j-1].y);return {...p,z:field.heightAt(p.x,p.y)+.22,along:travelled};});
    bridges.push({id:'river-bridge-'+bridges.length,road:road.id,width:Math.max(road.width,28),points:deck,length:travelled,bounds:[Math.min(...deck.map(p=>p.x)),Math.min(...deck.map(p=>p.y)),Math.max(...deck.map(p=>p.x)),Math.max(...deck.map(p=>p.y))]});
   }
  }
 }
 function deckAt(x,y,margin=0){
  for(const bridge of bridges){
   const [l,b,r,t]=bridge.bounds,pad=bridge.width/2+Math.max(0,margin);
   if(x<l-pad||x>r+pad||y<b-pad||y>t+pad)continue;
   const q=nearestOnLine(bridge.points,x,y);
   // Flat end caps, so support cannot extend into water beyond an abutment.
   if(q.distance<=bridge.width/2+margin&&q.along>.05&&q.along<bridge.length-.05)return {...q,bridge};
  }
  return null;
 }
 const outer=67,inner=21,blockedRadius=43;
 const bounds=[Math.min(...points.map(p=>p.x))-outer,Math.min(...points.map(p=>p.y))-outer,Math.max(...points.map(p=>p.x))+outer,Math.max(...points.map(p=>p.y))+outer];
 const within=(x,y,pad=0)=>x>=bounds[0]-pad&&x<=bounds[2]+pad&&y>=bounds[1]-pad&&y<=bounds[3]+pad;
 const {renderSize:n,renderCell:cell,renderSamples:samples,half}=field;
 // Surveyed southern apron of the existing Alpha dam. Grade it before the
 // river cut so every relocated penstock and catch pool sits above ground.
 const dam=damLayout(field,{startGrid:[14.5,53.5],worldScale:4.5}),apron=[];
 for(let row=0;row<n;row++)for(let col=0;col<n;col++){
  const x=col*cell-half,y=half-row*cell,lx=(y-dam.y)/dam.scale,ly=-(x-dam.x)/dam.scale;
  const outside=Math.hypot(Math.max(-46-lx,0,lx+20),Math.max(-30-ly,0,ly+8));if(outside>=4)continue;
  // Reserve the neighbouring power-station footprint and its graded shoulder.
  if(lx>-21&&ly<-29)continue;
  const t=outside/4,weight=1-t*t*(3-2*t),id=row*n+col;
  samples[id]=samples[id]*(1-weight)+(dam.z-.35)*weight;apron.push([id,samples[id]]);if(field.fineMask)field.fineMask[id]=1;
 }
 for(let row=Math.max(0,Math.floor((half-bounds[3])/cell));row<=Math.min(n-1,Math.ceil((half-bounds[1])/cell));row++)for(let col=Math.max(0,Math.floor((bounds[0]+half)/cell));col<=Math.min(n-1,Math.ceil((bounds[2]+half)/cell));col++){
  const x=col*cell-half,y=half-row*cell,q=sample(x,y);if(q.distance>=outer)continue;
  const id=row*n+col,native=samples[id],depth=5+Math.min(1,q.along/160)*15;
  const t=clamp((q.distance-inner)/(outer-inner),0,1),rim=Math.max(native,q.z+7),terrace=t<.50?t*1.6:.8+(t-.50)*.4;
  samples[id]=(q.z-depth)*(1-terrace)+rim*terrace;
  if(t>.92)samples[id]=samples[id]*(1-(t-.92)/.08)+native*((t-.92)/.08);
  if(field.fineMask)field.fineMask[id]=1;
 }
 // The cliff rim must not rise back through the engineered outfall apron.
 for(const [id,height] of apron)samples[id]=Math.min(samples[id],height);
 const terrainHeightAt=field.heightAt,terrainGradientAt=field.gradientAt;
 const forbidden=(x,y)=>within(x,y)&&sample(x,y).distance<blockedRadius&&!deckAt(x,y,-1.2);
 const walls=[],step=8;
 for(let y=Math.floor(bounds[1]/step)*step;y<=bounds[3];y+=step){let begin=null;
  for(let x=Math.floor(bounds[0]/step)*step;x<=bounds[2]+step;x+=step){
   const blocked=x<=bounds[2]&&forbidden(x+step/2,y+step/2);
   if(blocked&&begin===null)begin=x;
   if(!blocked&&begin!==null){walls.push({id:'river-bank:'+walls.length,x:(begin+x)/2,y:y+step/2,halfWidth:(x-begin)/2,halfDepth:step/2});begin=null;}
  }
 }
 field.river={version:1,points,length,bridges,bounds,outer,inner,blockedRadius,sample,deckAt,within,forbidden,walls,terrainHeightAt};
 field.heightAt=(x,y)=>within(x,y)?deckAt(x,y)?.z??terrainHeightAt(x,y):terrainHeightAt(x,y);
 field.gradientAt=(x,y)=>within(x,y)&&deckAt(x,y,1)?{x:(field.heightAt(x+.1,y)-field.heightAt(x-.1,y))/.2,y:(field.heightAt(x,y+.1)-field.heightAt(x,y-.1))/.2}:terrainGradientAt(x,y);
 return field.river;
}
