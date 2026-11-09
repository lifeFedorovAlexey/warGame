import {campBaseLayout} from './scav-base-layout.js';

// Authored service lanes in the existing flat yards. They belong to the map,
// so destroying a camp does not remove its streets. No simulation per frame.
const lanes={
 'nw-pocket':[
  [20,[[112,0],[48,0],[48,64],[-60,65]]],
  [14,[[12,64],[0,36]]],
 ],
 'nw-west':[
  [24,[[83.2,-94],[83.2,-142]]],
  [18,[[77,-42],[0,-40]]],
  [16,[[65,71],[20,42],[-43,39]]],
 ],
 'nw-east':[
  [20,[[24,-65],[40,-40],[40,34],[-40,44]]],
  [14,[[40,34],[60,34]]],
  [14,[[40,0],[65,0]]],
 ],
 'west-south':[
  [18,[[-32,41],[0,44],[40,44],[40,-32],[67,-32]]],
  [14,[[-108,-70],[-32,-70]]],
 ],
};

// Cut corners with quadratic arcs, without Catmull-Rom overshoot into buildings.
function rounded(points){
 const out=[points[0]],line=p=>{const a=out.at(-1),n=Math.max(1,Math.ceil(Math.hypot(p.x-a.x,p.y-a.y)/3));for(let j=1;j<=n;j++)out.push({x:a.x+(p.x-a.x)*j/n,y:a.y+(p.y-a.y)*j/n});};
 for(let i=1;i<points.length-1;i++){
  const a=points[i-1],b=points[i],c=points[i+1],ab=Math.hypot(b.x-a.x,b.y-a.y),bc=Math.hypot(c.x-b.x,c.y-b.y),r=Math.min(12,ab*.3,bc*.3);
  const p={x:b.x+(a.x-b.x)*r/ab,y:b.y+(a.y-b.y)*r/ab},q={x:b.x+(c.x-b.x)*r/bc,y:b.y+(c.y-b.y)*r/bc};line(p);
  for(let j=1;j<=8;j++){const t=j/8,s=1-t;out.push({x:s*s*p.x+2*s*t*b.x+t*t*q.x,y:s*s*p.y+2*s*t*b.y+t*t*q.y});}
 }
 line(points.at(-1));return out;
}

export function scavBaseRoads(field,config){
 const result=[];
 for(const data of config.camps){
  const camp={...data,...field.gridToWorld(data.grid)},layout=campBaseLayout(camp);if(!layout)continue;
  for(const [index,[width,points]] of (lanes[camp.id]??[]).entries())result.push({id:camp.id+'-yard-'+index,campId:camp.id,width,points:rounded(points.map(([x,y])=>({x:camp.x+x,y:camp.y+y})))});
  // The northern fort is beside a through-road. A short straight spur reaches
  // its gate; it does not wrap around the fort or distort the main carriageway.
  if(camp.id==='nw-east'){
   const {gate,normal:n}=layout;let best=null;
   for(const road of field.roadNetwork?.paths??[])for(let i=1;i<road.points.length;i++){
    const a=road.points[i-1],b=road.points[i],dx=b.x-a.x,dy=b.y-a.y,cross=n.x*dy-n.y*dx;if(Math.abs(cross)<1e-8)continue;
    const ax=a.x-gate.x,ay=a.y-gate.y,t=(ax*dy-ay*dx)/cross,u=(ax*n.y-ay*n.x)/cross;
    if(t<0||t>180||u<0||u>1)continue;
    if(!best||t<best.t)best={x:gate.x+n.x*t,y:gate.y+n.y*t,t};
   }
   if(best)result.push({id:camp.id+'-approach',campId:camp.id,width:20,points:rounded([best,gate])});
  }
 }
 return result;
}
