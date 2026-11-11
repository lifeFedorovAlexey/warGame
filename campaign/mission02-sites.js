import {siteCourts} from '../assets/campaign/alpha/mission02/site-plan.js';

// Road paint only. The shared scav-yard renderer supplies worn gravel and
// small foundations. Equipment is attached to actual destructible buildings.
export function createMission02Sites(T,field,addFog){
 const root=new T.Group();root.name='m02_planned_yards';root.visible=false;
 const material=new T.MeshBasicMaterial({color:'#b3a17a',transparent:true,opacity:.45,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});addFog(material);
 const roads=field.m02Roads,sourceRoads=(field.missionTerrain?.southernNetwork??field.roadNetwork)?.paths??[];
 const ends=roads.flatMap(r=>[r.points[0],r.points.at(-1)]);
 const segments=[...roads,...sourceRoads].flatMap(road=>road.points.slice(1).map((b,i)=>({road,a:road.points[i],b})));
 const courts=siteCourts.map(site=>{const a=field.gridToWorld(site.rect.slice(0,2)),b=field.gridToWorld(site.rect.slice(2));return[a.x,b.y,b.x,a.y];});
 function atJunction(x,y,road){
  if(ends.some(e=>Math.hypot(e.x-x,e.y-y)<28))return true;
  return segments.some(({road:other,a,b})=>{
   if(road===other)return false;const radius=(road.width+other.width)/2+7;
   if(x<Math.min(a.x,b.x)-radius||x>Math.max(a.x,b.x)+radius||y<Math.min(a.y,b.y)-radius||y>Math.max(a.y,b.y)+radius)return false;
   const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1)));
   return Math.hypot(x-a.x-dx*t,y-a.y-dy*t)<radius;
  });
 }
 const positions=[];
 function paint(x,y,w,d,angle){
  const c=Math.cos(angle),s=Math.sin(angle);
  for(const [a,b] of [[-1,-1],[1,-1],[1,1],[-1,-1],[1,1],[-1,1]]){
   const px=x+a*w/2*c-b*d/2*s,py=y+a*w/2*s+b*d/2*c;positions.push(px,py,field.heightAt(px,py)+.28);
  }
 }
 for(const road of roads){let progress=0;
  for(let i=1;i<road.points.length;i++){
   const a=road.points[i-1],b=road.points[i],length=Math.hypot(b.x-a.x,b.y-a.y),angle=Math.atan2(b.y-a.y,b.x-a.x),x=(a.x+b.x)/2,y=(a.y+b.y)/2;
   const inYard=courts.some(([l,b,r,t])=>x>=l-8&&x<=r+8&&y>=b-8&&y<=t+8);
   if(!inYard&&!atJunction(x,y,road)){
    if(road.width>=24&&(progress%14)<6)paint(x,y,length+.04,.36,angle);
    for(const side of [-1,1]){const offset=side*(road.width/2-2.2);paint(x-Math.sin(angle)*offset,y+Math.cos(angle)*offset,length+.04,.32,angle);}
   }
   progress+=length;
  }
 }
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();
 root.add(new T.Mesh(geometry,material));
 return{root,update(mission){root.visible=mission.state.m02?.version>=2;}};
}
