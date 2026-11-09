// Small physical signal boards above the front shutter. All factories share
// three instance streams; changing traffic never adds lights or materials.
export function createFactoryGateSignals(T,scene,scale){
 const root=new T.Group();root.name='factory_gate_signals';scene.add(root);
 const shape=new T.Shape().moveTo(-.18,-.4).lineTo(.18,-.4).lineTo(.18,.08).lineTo(.54,.08).lineTo(0,.60).lineTo(-.54,.08).lineTo(-.18,.08).closePath();
 const arrow=new T.ShapeGeometry(shape);arrow.rotateX(Math.PI/2);
 const plateMaterial=new T.MeshStandardMaterial({color:'#343a31',roughness:.87,metalness:.35});
 const signalMaterial=new T.MeshBasicMaterial({color:0xffffff,toneMapped:false});
 const streams=[['factory_gate_boards',new T.BoxGeometry(3.4,.14,1.4),plateMaterial],['factory_gate_arrows',arrow,signalMaterial],['factory_repair_lamps',new T.BoxGeometry(2.8,.04,.13),signalMaterial]];
 let capacity=16,meshes=[];
 const counts=[0,0,0],pose=new T.Object3D(),white=new T.Color(0xffffff),entry=new T.Color('#a8c76f'),exit=new T.Color('#e0ce94'),repair=new T.Color('#e9a13b');
 function allocate(){
  for(const mesh of meshes){root.remove(mesh);mesh.dispose();}
  meshes=streams.map(([name,geometry,material])=>{const mesh=new T.InstancedMesh(geometry,material,capacity);mesh.name=name;mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);mesh.setColorAt(0,new T.Color(0xffffff));mesh.instanceColor.setUsage(T.DynamicDrawUsage);root.add(mesh);return mesh;});
 }
 allocate();
 function begin(factoryCount){if(factoryCount*2>capacity){while(capacity<factoryCount*2)capacity*=2;allocate();}counts.fill(0);}
 function write(stream,f,object,x,y,z,flip,color,rear=false){
  const a=f.rotation??0,c=Math.cos(a),s=Math.sin(a),mesh=meshes[stream],index=counts[stream]++;
  pose.position.set(f.x+(x*c-y*s)*scale,f.y+(x*s+y*c)*scale,object.position.z+z*scale);
  pose.rotation.set(0,flip?Math.PI:0,a+(rear?Math.PI:0),'ZYX');pose.scale.setScalar(scale);pose.updateMatrix();mesh.setMatrixAt(index,pose.matrix);mesh.setColorAt(index,color??white);
 }
 function add(f,object,gate,depth,departure){
  if(f.hp<=0||!f.completed||!object.visible)return;
  for(const rear of [false,true]){
   const side=rear?1:-1,edge=side*(depth*.79/2+.62),vehicle=rear?departure:gate;
   write(0,f,object,0,edge,4.5,false,undefined,rear);
   const phase=vehicle?.hp>0&&vehicle.factoryVisit?.factoryId===f.id?vehicle.factoryVisit.phase:null;
   if((rear?['leaving','departure']:['gate','entering']).includes(phase))write(1,f,object,0,edge+side*.09,4.5,rear,rear?exit:entry,rear);
   if(f.activeRepair)write(2,f,object,0,edge+side*.09,3.98,false,repair,rear);
  }
 }
 function end(){for(const [i,mesh] of meshes.entries()){mesh.count=counts[i];if(mesh.count){mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}}}
 return {begin,add,end};
}
