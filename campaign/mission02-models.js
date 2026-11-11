// The owner specified a parabolic dish for the reconnaissance module.
// Shared antenna construction keeps the vehicle and stationary tower related.
export function createRadarAntenna(T,kit,palette,radius=.4){
 const root=new T.Group();root.name='radar_dish';
 const face=new T.MeshStandardMaterial({color:'#c0bba2',roughness:.87,metalness:.12});
 const rear=new T.MeshStandardMaterial({color:'#686c4b',roughness:.86,metalness:.25,side:T.BackSide});
 face.name='radar_reflector';rear.name='radar_back';
 const vertices=[0,0,0],back=[0,0,-radius*.035],indices=[],rings=10,sectors=48,depth=radius*.27;
 for(let r=1;r<=rings;r++)for(let i=0;i<sectors;i++){
  const d=radius*r/rings,a=i/sectors*Math.PI*2,z=depth*(d/radius)**2;
  vertices.push(Math.cos(a)*d,Math.sin(a)*d,z);back.push(Math.cos(a)*d,Math.sin(a)*d,z-radius*.035);
 }
 for(let i=0;i<sectors;i++)indices.push(0,1+i,1+(i+1)%sectors);
 for(let r=0;r<rings-1;r++)for(let i=0;i<sectors;i++){const j=1+r*sectors+i,next=1+r*sectors+(i+1)%sectors;indices.push(j,j+sectors,next,next,j+sectors,next+sectors);}
 for(const [positions,material] of [[vertices,face],[back,rear]]){
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setIndex(indices);geo.computeVertexNormals();kit.mesh(root,geo,material);
 }
 kit.mesh(root,new T.TorusGeometry(radius,radius*.028,6,40),palette.olive,[0,0,depth]);
 kit.cylinder(root,radius*.19,radius*.17,[0,0,-radius*.09],palette.steel,'Z',16);
 for(let i=0;i<8;i++){
  const a=i/8*Math.PI*2;
  for(let j=1;j<=4;j++){
   const r0=radius*(j-1)/4,r1=radius*j/4;
   kit.rod(root,[Math.cos(a)*r0,Math.sin(a)*r0,depth*(r0/radius)**2-radius*.045],[Math.cos(a)*r1,Math.sin(a)*r1,depth*(r1/radius)**2-radius*.045],radius*.017,palette.olive);
  }
 }
 const focus=radius*.66;
 for(const a of [Math.PI/2,Math.PI*7/6,Math.PI*11/6])kit.rod(root,[Math.cos(a)*radius*.91,Math.sin(a)*radius*.91,depth*.83],[0,0,focus],radius*.012,palette.steel);
 kit.cylinder(root,radius*.07,radius*.15,[0,0,focus],palette.olive,'Z',16);
 kit.cylinder(root,radius*.08,radius*.025,[0,0,focus-radius*.075],palette.steel,'Z',16);
 return root;
}
export function createSensorModule(T,kit,palette){
 const root=new T.Group();root.name='U21_dish_sensor';
 const paint=palette.olive,steel=palette.steel,dark=palette.dark;
 const edge=new T.MeshStandardMaterial({color:'#777956',roughness:.78,metalness:.38});
 kit.cylinder(root,.45,.08,[0,0,.04],steel,'Z',32);
 kit.cylinder(root,.39,.10,[0,0,.13],paint,'Z',24);
 kit.box(root,[.70,.78,.23],[0,0,.285],paint);
 for(const x of [-.31,.31]){
  kit.box(root,[.18,.76,.22],[x,0,.34],edge);
  for(const y of [-.26,0,.26])kit.box(root,[.19,.018,.23],[x,y,.34],paint);
 }
 for(let i=0;i<12;i++){const a=i/12*Math.PI*2;kit.cylinder(root,.014,.014,[Math.cos(a)*.417,Math.sin(a)*.417,.09],edge,'Z',6);}
 kit.cylinder(root,.15,.16,[0,0,.47],dark,'Z',16);
 kit.cylinder(root,.12,.35,[0,0,.70],paint,'Z',16);
 kit.cylinder(root,.092,.32,[0,0,.98],steel,'Z',16);
 for(const z of [.59,.83,1.10])kit.cylinder(root,.13,.04,[0,0,z],dark,'Z',16);
 const yaw=kit.group(root,[0,0,1.21],'camera_yaw');
 for(const x of [-.15,.15]){kit.box(yaw,[.045,.18,.24],[x,-.05,-.09],paint);kit.cylinder(yaw,.065,.055,[x,0,0],steel,'X',12);}
 const dish=createRadarAntenna(T,kit,palette,.40);dish.rotation.x=-Math.PI/2+.33;dish.position.set(0,.18,.04);yaw.add(dish);
 for(const x of [-.15,.15])kit.rod(yaw,[x,0,0],[x,.14,.04],.022,paint);
 kit.rod(root,[-.13,-.08,.42],[-.13,-.08,1.16],.018,dark);
 kit.box(root,[.18,.22,.12],[.29,-.24,.51],paint);kit.rod(root,[.29,-.24,.56],[.29,-.24,1.16],.009,dark);
 const status=new T.MeshStandardMaterial({color:'#75d58a',emissive:'#75d58a',emissiveIntensity:.25});status.name='sensor_status';
 kit.box(root,[.032,.012,.022],[0,-.39,.28],status);
 root.userData.antenna='parabolic';return root;
}
export function addPowerModuleModel(T,root){
 const module=new T.Group();module.name='power_module';module.visible=false;
 const paint=new T.MeshStandardMaterial({color:'#77764e',roughness:.85,metalness:.3});
 const metal=new T.MeshStandardMaterial({color:'#3b4035',roughness:.8});
 for(const [size,position,material] of [[[2.6,2,1.4],[3,0,5.4],paint],[[.3,2.2,1.6],[2.3,0,5.4],metal],[[.3,2.2,1.6],[3,0,5.4],metal],[[.3,2.2,1.6],[3.7,0,5.4],metal]]){
  const mesh=new T.Mesh(new T.BoxGeometry(...size),material);mesh.position.set(...position);mesh.castShadow=true;module.add(mesh);
 }
 root.add(module);return module;
}

export function buildSensorTower(T,{box,rod,cylinder},p){
 const {paint,steel,concrete,dark}=p;
 // Open braced mast instead of a solid box. All details fit its 6 Г— 6 m plot.
 for(const x of [-1.55,1.55])for(const y of [-1.55,1.55]){
  box([.85,.85,.36],[x,y,.48],concrete);
  rod([x,y,.62],[x*.58,y*.58,5.08],.115,steel);
  for(const dx of [-.24,.24])for(const dy of [-.24,.24])cylinder(.035,.09,[x+dx,y+dy,.70],steel);
 }
 for(const z of [1.8,3.4,4.9]){
  const r=1.55-(z-.62)/4.46*.65;
  for(const s of [-1,1]){
   rod([-r,s*r,z],[r,s*r,z],.065,steel);rod([s*r,-r,z],[s*r,r,z],.065,steel);
   if(z<4.9){const top=r-.23;rod([-r,s*r,z],[top,s*top,z+1.5],.045,steel);rod([s*r,-r,z],[s*top,top,z+1.5],.045,steel);}
  }
 }
 box([2.7,2.7,.16],[0,0,5.12],steel);
 for(const side of [-1,1])for(const v of [-1.25,0,1.25]){
  rod([v,side*1.25,5.2],[v,side*1.25,5.95],.033,paint);
  rod([side*1.25,v,5.2],[side*1.25,v,5.95],.033,paint);
 }
 for(const side of [-1,1])for(const z of [5.55,5.95]){rod([-1.25,side*1.25,z],[1.25,side*1.25,z],.035,paint);rod([side*1.25,-1.25,z],[side*1.25,1.25,z],.035,paint);}
 for(const x of [-.32,.32])rod([x,-1.78,.55],[x,-1.26,5.22],.043,steel);
 for(let i=0;i<16;i++){const z=.7+i*.285,y=-1.78+(z-.55)/4.67*.52;rod([-.32,y,z],[.32,y,z],.025,steel);}
 box([1.7,1.8,1.9],[1.6,1.4,1.45],paint);
 box([1.85,1.9,.12],[1.6,1.4,2.48],steel);
 box([1.12,.06,1.55],[1.6,.47,1.45],dark);
 box([.95,.08,1.39],[1.6,.42,1.45],paint);
 for(let i=0;i<7;i++)box([.62,.035,.035],[1.6,.365,1.70+i*.06],steel);
 rod([.3,.3,.5],[.3,.3,5.3],.045,dark);
 cylinder(.09,.6,[-1.55,1.55,5.78],steel);
 rod([-1.55,1.55,5.9],[-1.55,1.55,7.2],.025,steel);
}
