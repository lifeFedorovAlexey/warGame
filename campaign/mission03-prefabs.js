import {createScavBasePrefab} from './scav-base-prefabs.js';
import {createM02Factory} from './mission02-factory.js';

// Ruins use the campaign's corrugated stores with missing authored parts.
export function createM03Landmark(T,large,ruined){
 const root=createScavBasePrefab(T,large?'scav-barracks':'scav-store','m03');
 const width=large?9.2:5.6,depth=large?5.1:3.5;
 if(ruined)root.traverse(mesh=>{
  if(!mesh.isMesh)return;
  const old=mesh.geometry,g=new T.BufferGeometry(),p=old.attributes.position,part=old.attributes.damagePart,keep=[];
  for(let i=0;i<p.count;i+=3){
   const id=part.getX(i),front=p.getY(i)<-depth/2+.25&&p.getY(i+1)<-depth/2+.25&&p.getY(i+2)<-depth/2+.25;
   if(id>=16&&id<=22||id===37||id===38||id===0&&front&&Math.max(p.getZ(i),p.getZ(i+1),p.getZ(i+2))>.4)continue;
   keep.push(i,i+1,i+2);
  }
  for(const [name,attribute] of Object.entries(old.attributes)){
   const values=new Float32Array(keep.length*attribute.itemSize);
   keep.forEach((index,i)=>{for(let k=0;k<attribute.itemSize;k++)values[i*attribute.itemSize+k]=attribute.array[index*attribute.itemSize+k];});
   g.setAttribute(name,new T.BufferAttribute(values,attribute.itemSize));
  }
  mesh.geometry=g;old.dispose();
 });
 root.scale.set((large?44:22)/width,(large?30:21)/depth,4.5);
 return root;
}

export function createM03Warehouse(T){
 const root=createM02Factory(T),bounds=new T.Box3().setFromObject(root),size=bounds.getSize(new T.Vector3()),centre=bounds.getCenter(new T.Vector3());
 // Keep the existing warehouse collision footprint, including the side bay.
 const scale=Math.min(44/(4.5*size.x),36/(4.5*size.y));
 for(const child of root.children){child.scale.multiplyScalar(scale);child.position.x=(child.position.x-centre.x)*scale;child.position.y=(child.position.y-centre.y)*scale;child.position.z*=scale;}
 return root;
}
