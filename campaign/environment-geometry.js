import {mergeGeometries} from '../demo/vendor/utils/BufferGeometryUtils.js';
// Batched, named physical scenery. No Mission entities, picking or nav obstacles.
export function sceneryBuilder(T,root){
 const groups=new Map();let part='fixed';
 function shape(geometry,material,position=[0,0,0],rotation=[0,0,0]){
  const item=new T.Object3D();item.position.set(...position);item.rotation.set(...rotation);item.updateMatrix();geometry.applyMatrix4(item.matrix);
  const flat=geometry.index?geometry.toNonIndexed():geometry;if(flat!==geometry)geometry.dispose();
  const batch=groups.get(part)??new Map(),list=batch.get(material)??[];list.push(flat);batch.set(material,list);groups.set(part,batch);
 }
 const box=(size,at,mat,rot)=>shape(new T.BoxGeometry(...size),mat,at,rot);
 function rod(a,b,r,mat,sides=6){const start=new T.Vector3(...a),end=new T.Vector3(...b),g=new T.CylinderGeometry(r,r,start.distanceTo(end),sides);g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),end.clone().sub(start).normalize()));shape(g,mat,start.add(end).multiplyScalar(.5).toArray());}
 function section(name,fn){const previous=part;part=name;fn();part=previous;}
 function finish(){for(const [name,batches] of groups){const group=new T.Group();group.name=name;root.add(group);for(const [mat,list] of batches){const geo=mergeGeometries(list,false),mesh=new T.Mesh(geo,mat);mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);for(const g of list)g.dispose();}}}
 return {shape,box,rod,section,finish};
}
