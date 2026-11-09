export function createFactoryRoadView(T,scene,field,terrain,baseRoads,addFog,updateJunctions){
 let signature='';
 const paintMaterial=new T.MeshStandardMaterial({color:'#d2cbb5',roughness:1,transparent:true,opacity:.7,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
 addFog?.(paintMaterial);
 const markings=new T.Mesh(new T.BufferGeometry(),paintMaterial);markings.name='factory_road_markings';markings.receiveShadow=true;scene.add(markings);
 const preview=new T.Mesh(new T.BufferGeometry(),new T.MeshBasicMaterial({color:'#adc67c',transparent:true,opacity:.28,depthWrite:false}));
 preview.name='factory_access_preview';preview.visible=false;preview.frustumCulled=false;scene.add(preview);
 function update(mission){
  const factories=mission.state.buildings.filter(b=>b.kind==='factory'&&b.hp>0&&b.accessRoads?.length),key=factories.map(f=>f.id+':'+f.x+':'+f.y+':'+f.rotation+':'+JSON.stringify(f.accessRoads)).join('|');
  if(key===signature)return;signature=key;
  const accessRoads=factories.flatMap(f=>f.accessRoads);
  terrain.setLocalRoads([...baseRoads,...accessRoads]);updateJunctions?.(accessRoads);
  const vertices=[];
  const strip=(a,b,offset,width)=>{
   const length=Math.hypot(b.x-a.x,b.y-a.y),nx=-(b.y-a.y)/length,ny=(b.x-a.x)/length;
   const p=(q,side)=>{const x=q.x+nx*(offset+side*width/2),y=q.y+ny*(offset+side*width/2);return[x,y,field.heightAt(x,y)+.18];};
   const l=p(a,-1),r=p(a,1),L=p(b,-1),R=p(b,1);vertices.push(...l,...L,...r,...L,...R,...r);
  };
  for(const road of factories.flatMap(f=>f.accessRoads)){
   const total=road.points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-road.points[i].x,p.y-road.points[i].y),0);let travelled=0;
   for(let i=1;i<road.points.length;i++){
    const a=road.points[i-1],b=road.points[i],length=Math.hypot(b.x-a.x,b.y-a.y);if(length<.01)continue;
    const steps=Math.ceil(length/1.5),point=t=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
    for(let j=0;j<steps;j++){
     const d=travelled+length*(j+.5)/steps;if(d<12||d>total-16)continue;
     const p=point(j/steps),q=point((j+1)/steps);
     if(d%14<6)strip(p,q,0,.42);
     for(const side of [-1,1])strip(p,q,side*(road.width/2-1.6),.32);
    }
    travelled+=length;
   }
  }
  markings.geometry.dispose();markings.geometry=new T.BufferGeometry();markings.geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));markings.geometry.computeVertexNormals();
 }
 function setPreview(placement){
  const roads=placement?.accessRoads??[];preview.visible=roads.length>0;
  if(!preview.visible)return;
  const vertices=[];
  for(const road of roads)for(let i=1;i<road.points.length;i++){
   const a=road.points[i-1],b=road.points[i],len=Math.hypot(b.x-a.x,b.y-a.y);if(len<.01)continue;
   const nx=-(b.y-a.y)/len*road.width/2,ny=(b.x-a.x)/len*road.width/2,n=Math.ceil(len/6);
   for(let j=0;j<n;j++){
    const p=t=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t}),u=p(j/n),v=p((j+1)/n);
    const point=(p,s)=>[p.x+nx*s,p.y+ny*s,field.heightAt(p.x+nx*s,p.y+ny*s)+.55],l=point(u,-1),r=point(u,1),L=point(v,-1),R=point(v,1);
    vertices.push(...l,...L,...r,...L,...R,...r);
   }
  }
  preview.geometry.dispose();preview.geometry=new T.BufferGeometry();preview.geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));preview.material.color.set(placement.ok?'#adc67c':'#ec785b');
 }
 return {update,setPreview};
}
