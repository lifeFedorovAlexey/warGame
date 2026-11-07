export function createFieldArtifact(T,key) {
  const root=new T.Group();
  root.name='salvage_'+key;
  const steel=new T.MeshStandardMaterial({color:'#5b6260',roughness:.63,metalness:.51});
  const dark=new T.MeshStandardMaterial({color:'#303733',roughness:.84,metalness:.32});
  const rust=new T.MeshStandardMaterial({color:'#855943',roughness:.88,metalness:.24});
  const tape=new T.MeshStandardMaterial({color:'#315c9b',roughness:.82});
  function part(geometry,material,x,y,z){
    const mesh=new T.Mesh(geometry,material);
    mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);
    return mesh;
  }
  const box=(w,d,h,mat,x,y,z)=>part(new T.BoxGeometry(w,d,h),mat,x,y,z);
  const drum=(radius,length,mat,x,y,z)=>{
    const mesh=part(new T.CylinderGeometry(radius,radius,length,12),mat,x,y,z);
    mesh.rotation.z=Math.PI/2;
    return mesh;
  };
  if(key==='flamethrower'){
    box(8.4,5.2,.6,dark,0,0,.45);
    box(7.6,.62,.66,rust,0,-2.2,.8);
    box(7.6,.62,.66,rust,0,2.2,.8);
    drum(1.42,5.8,steel,-.35,0,2.25);
    drum(1.47,.68,tape,-1.85,0,2.25);
    drum(1.47,.7,tape,.94,0,2.25);
    drum(.77,1.9,dark,3.3,0,2.25);
    drum(.28,.86,rust,-3.58,.32,2.85);
  }else if(key==='mg-ammo-1'){
    const wood=new T.MeshStandardMaterial({color:'#6b654a',roughness:.96});
    box(7.2,5.6,2.9,wood,0,0,1.47);
    box(7.4,5.8,.46,steel,0,0,3.04);
    for(const x of [-2.5,2.5]){
      box(.64,5.92,.33,dark,x,0,3.33);
      box(.64,.18,2.8,dark,x,-2.83,1.62);
    }
    box(1.2,1.8,.12,tape,0,-1.7,3.33);
    box(1.0,.24,.65,rust,0,-2.87,2.77);
  }else{
    box(6.9,5.9,.72,rust,0,0,.43);
    const plate=part(new T.CylinderGeometry(2.24,2.55,.9,12),steel,0,0,1.2);
    plate.rotation.x=Math.PI/2;
    box(3.6,2.8,2.5,dark,0,0,2.72);
    drum(.98,3.7,steel,0,0,4.1);
    drum(1.01,.64,tape,.65,0,4.1);
  }
  const beacon=part(new T.OctahedronGeometry(1.42),new T.MeshBasicMaterial({color:'#ead797',toneMapped:false}),0,0,8.4);
  beacon.name='salvage_beacon';beacon.castShadow=beacon.receiveShadow=false;
  return root;
}
