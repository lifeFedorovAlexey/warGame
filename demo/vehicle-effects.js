export function createHeadlightPair(T,body) {
  return [-.62,.62].map(x=>{
    const target=new T.Object3D();
    target.name='light_target';
    target.position.set(x,13,.05);
    const spot=new T.SpotLight('#ffe2a3',25,18,.34,.6,1.2);
    spot.position.set(x,2.20,.56);
    spot.target=target;
    body.add(target,spot);
    return spot;
  });
}

export function setHeadlightPower(spots,scale,night,enabled) {
  for(const spot of spots){
    spot.distance=18*scale;
    spot.intensity=enabled?(night?95:10)*scale**2:0;
  }
}

export function createMuzzleFlash(T) {
  const material=new T.MeshBasicMaterial({color:'#ffe7a0',transparent:true,opacity:.95,blending:T.AdditiveBlending,depthWrite:false});
  const mesh=new T.Mesh(new T.IcosahedronGeometry(.095,0),material);
  mesh.position.y=.10;
  mesh.scale.set(.8,2.4,.8);
  return mesh;
}
