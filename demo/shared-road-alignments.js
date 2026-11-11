// Survey corrections shared by terrain grading, route planning and asphalt.
// Keep the through-road tangent at the east yard and the western bridge straight.
export function alignSharedRoads(field,roads){
 if(roads.sharedAlignments||!roads.paths.some(r=>r.id==='junction-1--junction-7-2'))return;
 const smooth=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
 const trunkIds=['junction-1--junction-7-2','junction-3--junction-7-8'];
 for(const road of roads.paths){
  if(!trunkIds.includes(road.id)&&road.id!=='junction-7--west-south-18')continue;
  road.points=road.points.map(p=>{
   let [x,y]=field.worldToGrid(p.x,p.y);
   let width=p.width??road.width;
   if(trunkIds.includes(road.id)){const w=smooth(71.5,74,y)*(1-smooth(84,86,y));x+=(38.65-x)*w;width+=(road.width-width)*w;}
   else {x+=1.15*smooth(34,37.5,x);y+=(80.5-y)*smooth(19,22,x)*(1-smooth(29,32,x));}
   return {...p,width,...field.gridToWorld([x,y])};
  });
 }
 const junction=roads.nodes?.find(p=>p.id==='junction-7');if(junction)Object.assign(junction,field.gridToWorld([38.65,76.5]));
 const rect=([l,t,r,b])=>{const a=field.gridToWorld([l,t]),z=field.gridToWorld([r,b]);return [a.x,z.y,z.x,a.y];};
 roads.sharedAlignments=[{rect:rect([36.8,71.3,40.1,86.2]),feather:2},{rect:rect([19,78.9,32.2,81.7]),feather:2}];
 field.sharedRoadAlignments=roads.sharedAlignments;
}

export function sharedRoadSurfaces(field){
 if(!field.sharedRoadAlignments)return [];
 const ids=['junction-1--junction-7-2','junction-3--junction-7-8','junction-7--west-south-18'];
 const roads=field.roadNetwork.paths.filter(r=>ids.includes(r.id));
 return roads.map((road,i)=>({...road,cutSourcePaint:true,...(i===0?{replaceAreas:field.sharedRoadAlignments}:{} )}));
}
