// Each ring follows the ground under its entire circumference, including roads.
export function placeSelectionRing(ring,field,x,y,radius){
  const key=[x,y,radius];
  if(ring.userData.groundPose?.every((v,i)=>v===key[i]))return;
  ring.userData.groundPose=key;
  const positions=ring.geometry.attributes.position;
  const circle=ring.userData.circle??=positions.array.slice();
  const base=field.heightAt(x,y),clearance=1.1;
  ring.position.set(x,y,base);
  for(let i=0;i<positions.count;i++){
    const dx=circle[i*3]*radius,dy=circle[i*3+1]*radius;
    positions.setXYZ(i,dx,dy,field.heightAt(x+dx,y+dy)-base+clearance);
  }
  positions.needsUpdate=true;ring.geometry.computeBoundingSphere();
}

// Ground-following rings have different vertex heights, but share material
// and topology. Upload one packed buffer per colour instead of issuing one
// transparent draw (and two material-side passes) per selected vehicle.
export function createSelectionRings(T,parent,field,source,materials){
 const circle=source.attributes.position.array,vertices=source.attributes.position.count,indices=source.index.array;
 const layers=materials.map(material=>{
  material.forceSinglePass=true;
  const geometry=new T.BufferGeometry(),mesh=new T.Mesh(geometry,material);
  mesh.frustumCulled=false;mesh.visible=false;parent.add(mesh);
  return {geometry,mesh,capacity:0,count:0,poses:[],dirty:false};
 });
 const grow=layer=>{
  layer.capacity=Math.max(64,layer.capacity*2);
  const old=layer.geometry.attributes.position,positions=new T.BufferAttribute(new Float32Array(layer.capacity*vertices*3),3).setUsage(T.DynamicDrawUsage);
  if(old)positions.array.set(old.array);layer.geometry.setAttribute('position',positions);
  const elements=new Uint32Array(layer.capacity*indices.length);
  for(let i=0;i<layer.capacity;i++)for(let j=0;j<indices.length;j++)elements[i*indices.length+j]=i*vertices+indices[j];
  layer.geometry.setIndex(new T.BufferAttribute(elements,1));
 };
 return {
  layers,
  begin(){for(const layer of layers){layer.count=0;layer.dirty=false;}},
  add(x,y,radius,colour=0){
   const layer=layers[colour],slot=layer.count++;if(slot>=layer.capacity)grow(layer);
   const old=layer.poses[slot];if(old&&old[0]===x&&old[1]===y&&old[2]===radius)return;
   layer.poses[slot]=[x,y,radius];const positions=layer.geometry.attributes.position;
   for(let i=0;i<vertices;i++){
    const wx=x+circle[i*3]*radius,wy=y+circle[i*3+1]*radius;
    positions.setXYZ(slot*vertices+i,wx,wy,field.heightAt(wx,wy)+1.1);
   }
   layer.dirty=true;
  },
  end(){for(const layer of layers){layer.geometry.setDrawRange(0,layer.count*indices.length);layer.mesh.visible=layer.count>0;
   if(layer.dirty)layer.geometry.attributes.position.needsUpdate=true;}},
 };
}
