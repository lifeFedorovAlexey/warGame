export const CROSSWALK={length:18.9,stripe:2.1,pitch:4.2,clearance:6};

// Place complete crossings on straight approaches, outside every junction's
// asphalt footprint. Work in the road's own coordinates so side streets use
// the same dimensions and setbacks as the main street.
export function planRoadCrossings(road,network,preferred){
 const [a,b]=road.points,dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
 if(length<.01)return [];
 const ux=dx/length,uy=dy/length,half=CROSSWALK.length/2,pad=half+CROSSWALK.clearance;
 let spaces=length>2*pad?[[pad,length-pad]]:[];
 const cut=(lo,hi)=>{spaces=spaces.flatMap(([l,h])=>hi<=l||lo>=h?[[l,h]]:[...(lo>l?[[l,lo]]:[]),...(hi<h?[[hi,h]]:[])]);};
 const local=p=>({along:(p.x-a.x)*ux+(p.y-a.y)*uy,across:-(p.x-a.x)*uy+(p.y-a.y)*ux});
 for(const other of network){
  if(other===road)continue;
  for(let i=1;i<other.points.length;i++){
   const p=local(other.points[i-1]),q=local(other.points[i]),r=Math.max(other.width??0,other.points[i-1].width??0,other.points[i].width??0)/2;
   const band=road.width/2+r,side=q.across-p.across;
   let lo=0,hi=1;
   if(Math.abs(side)<1e-8){if(Math.abs(p.across)>band)continue;}
   else {
    const t0=(-band-p.across)/side,t1=(band-p.across)/side;
    lo=Math.max(0,Math.min(t0,t1));hi=Math.min(1,Math.max(t0,t1));if(lo>hi)continue;
   }
   const x=p.along+(q.along-p.along)*lo,y=p.along+(q.along-p.along)*hi;
   cut(Math.min(x,y)-r-pad,Math.max(x,y)+r+pad);
  }
 }
 const result=[];
 for(const wanted of preferred){
  const candidates=spaces.map(([l,h])=>Math.max(l,Math.min(h,wanted)));
  candidates.sort((x,y)=>Math.abs(x-wanted)-Math.abs(y-wanted)||x-y);
  if(!candidates.length)continue;
  const along=candidates[0];result.push({x:a.x+ux*along,y:a.y+uy*along,angle:Math.atan2(dy,dx),along});
  cut(along-CROSSWALK.length-CROSSWALK.clearance,along+CROSSWALK.length+CROSSWALK.clearance);
 }
 return result;
}
