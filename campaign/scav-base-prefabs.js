import {mergeGeometries} from '../demo/vendor/utils/BufferGeometryUtils.js';

// Low-poly scrap construction, shared geometry per material and model variant.
export function createScavBasePrefab(T,kind,site,span=7,variant='0',profile=null){
 const root=new T.Group(),structure=new T.Group();structure.name='building_structure';root.add(structure);
 const materials=[0x6e4531,0x8c8167,0x393b32,0x665744].map(color=>new T.MeshStandardMaterial({color,roughness:.96,metalness:.17}));
 const batches=materials.map(()=>[]),parts={0:{name:'frame',material:'metal'}};let part=0;
 const box=(w,d,h,x,y,z,mat=0,rx=0,ry=0,rz=0)=>{
  const g=new T.BoxGeometry(w,d,h).toNonIndexed(),pose=new T.Object3D();pose.position.set(x,y,z);pose.rotation.set(rx,ry,rz);pose.updateMatrix();g.applyMatrix4(pose.matrix);
  g.setAttribute('damagePart',new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(part),1));batches[mat].push(g);
 };
 const beam=(a,b,w,mat=2)=>{const v=new T.Vector3(...b).sub(new T.Vector3(...a)),g=new T.BoxGeometry(w,w,v.length()).toNonIndexed();g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,1),v.normalize()));g.translate(...a.map((n,i)=>(n+b[i])/2));g.setAttribute('damagePart',new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(part),1));batches[mat].push(g);};
 const panel=(id,name,fn)=>{part=id;parts[id]={name,material:'metal',detachable:true,strength:70};fn();part=0;};
 if(kind==='scav-fence'){
  const count=Math.ceil(span/1.55),w=span/count,v=Number(variant)||0;
  for(let i=0;i<=count;i++){const x=-span/2+i*w;box(.15,.19,3.1,x,.08,1.12,3,0,(i%2?.025:-.02));}
  for(const z of [.45,1.65])box(span,.13,.15,0,.1,z,2);
  for(let i=0;i<count;i++){const x=-span/2+(i+.5)*w,h=1.9+((i+v)%3)*.17;
   panel(16+i,'scrap_panel_'+i,()=>{
    box(w-.035,.11,h,x,-.045,h/2+.18,(i+v)%2,0,(i%3-1)*.025,0);
    for(let k=0;k<5;k++)box(.045,.05,h-.06,x-w/2+(k+.5)*w/5,-.12,h/2+.18,(i+v)%2);
    if((i+v)%3===0){box(w*.7,.07,.55,x,-.16,1.27,2,0,0,.10);box(.55,.06,.36,x+.13,-.21,.54,1,0,0,-.13);}
   });
  }
  for(let i=0;i<count;i++)beam([-span/2+i*w,.1,2.6],[-span/2+(i+1)*w,.1,2.44],.035,2);
 }else if(kind==='scav-gate'){
  box(.38,.42,5.2,0,-2.3,2.05,2);box(.9,.85,.3,0,-2.3,0,3);
  for(const z of [.5,2.45])beam([0,-2.25,z],[0,2.7,z],.13);
  for(const y of [-2.2,2.7])beam([0,y,.5],[0,y,2.5],.14);
  beam([0,-2.2,.55],[0,2.7,2.45],.12,3);
  panel(16,'gate_leaf',()=>{box(.12,4.8,1.8,-.06,.22,1.45,0);for(let y=-2;y<2.7;y+=.38)box(.09,.05,1.75,-.15,y,1.45,1);});
  box(.76,.12,.65,0,-2.57,3.65,1,0,0,.07);box(.40,.08,.14,0,-2.65,3.65,0);
  beam([0,-2.3,4.7],[0,-3.4,4.7],.1);box(.6,.4,.16,0,-3.4,4.65,2);
 }else{
  const barracks=kind==='scav-barracks',w=barracks?9.2:5.6,d=barracks?5.1:3.5,h=barracks?3.0:2.5;
  box(w,d,.22,0,0,.08,3);
  // Different sheets, boarded windows and an exposed doorway under an awning.
  box(w,.14,h,0,d/2,h/2,0);for(const x of [-w/2,w/2])box(.14,d,h,x,0,h/2,1);
  for(const x of [-w*.32,w*.32])box(w*.34,.14,h,x,-d/2,h/2,0);
  box(w*.30,.14,.65,0,-d/2,h-.325,1);box(w*.24,.1,h*.76,0,-d/2+.14,h*.38,2);
  for(const x of [-w*.32,w*.32]){box(1.3,.1,.75,x,-d/2-.1,1.85,2);for(const z of [1.56,1.9,2.18])box(1.5,.13,.12,x,-d/2-.19,z,3,0,0,.06);}
  for(let i=0;i<7;i++){const x=(i-3)*w/7,mat=i===1||i===4?3:0;panel(16+i,'roof_sheet_'+i,()=>{
   box(w/7+.08,d+.4,.13,x,0,h+.18,mat);
   for(const offset of [-.33,0,.33])box(.045,d+.38,.045,x+offset,0,h+.27,mat);
   if(i===2||i===5)box(w/7*.85,1.05,.045,x,i===2?-.8:.7,h+.29,i===2?1:2,0,0,i===2?.08:-.05);
  });}
  if(barracks){
   box(3.1,1.8,.13,0,-d/2-.8,2.65,3,.12);for(const x of [-1.4,1.4])box(.14,.14,2.65,x,-d/2-1.55,1.23,3);
   // Beds / lockers outside the crowded shack, not a clean military prefab.
   for(const x of [-3.6,3.6]){box(1.45,.75,.35,x,-d/2-.6,.25,3);box(1.25,.62,.16,x,-d/2-.6,.51,1);}
   beam([w/2-.4,1,0],[w/2-.4,1,4.6],.14);box(1.1,.05,.7,w/2+.1,1,4.13,0,0,0,.05);
  }else{for(const x of [-1.7,0,1.6]){box(1.1,.9,.8,x,-2.25,.4,3);box(.12,.94,.82,x-.3,-2.25,.4,2);}}
 }
 root.userData.damageParts=parts;
 batches.forEach((items,i)=>{if(!items.length){materials[i].dispose();return;}const geometry=mergeGeometries(items);
  if(profile){const p=geometry.attributes.position;for(let j=0;j<p.count;j++){const t=Math.max(0,Math.min(2,p.getX(j)/span*2+1)),k=Math.min(1,Math.floor(t));p.setZ(j,p.getZ(j)+profile[k]+(profile[k+1]-profile[k])*(t-k));}geometry.computeVertexNormals();}
  const mesh=new T.Mesh(geometry,materials[i]);mesh.castShadow=mesh.receiveShadow=true;mesh.userData.damageParts=parts;structure.add(mesh);items.forEach(g=>g.dispose());});
 root.name='scav_'+kind+'_'+site;return root;
}
