import {mergeGeometries} from '../demo/vendor/utils/BufferGeometryUtils.js';

// Presentation variants share the existing destructible fence entity. Keep
// all leaning panels inside its .7 m physical depth and preserve gate spans.
export function concreteFenceVariant(entity){
 let hash=0;for(const c of entity.id??'')hash=(Math.imul(hash,31)+c.charCodeAt(0))>>>0;
 return hash%8;
}

export function createConcreteFence(T,site,span=7,variant='0',profile=null){
 const root=new T.Group(),structure=new T.Group();structure.name='building_structure';root.add(structure);
 root.name='scav_concrete_fence_'+site;
 let seed=0;for(const c of `${site}|${variant}`)seed=(Math.imul(seed,31)+c.charCodeAt(0))>>>0;
 const palette=['#9d947f','#b5a88f','#776e5f','#80533d'].map((color,i)=>new T.MeshStandardMaterial({color,roughness:i===3?.96:1,metalness:i===3?.15:0}));
 const batches=palette.map(()=>[]),parts={},count=Math.max(1,Math.ceil(span/3.2)),step=span/count;
 const add=(geometry,material,id,pose)=>{
  geometry.applyMatrix4(pose);const g=geometry.index?geometry.toNonIndexed():geometry;if(g!==geometry)geometry.dispose();
  if(!g.attributes.uv)g.setAttribute('uv',new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count*2),2));
  if(profile){const p=g.attributes.position;for(let j=0;j<p.count;j++){const t=Math.max(0,Math.min(2,p.getX(j)/span*2+1)),k=Math.min(1,Math.floor(t));p.setZ(j,p.getZ(j)+profile[k]+(profile[k+1]-profile[k])*(t-k));}g.computeVertexNormals();}
  g.setAttribute('damagePart',new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(id),1));batches[material].push(g);
 };
 const box=(size,p,mat,id,pose)=>{const g=new T.BoxGeometry(...size);g.translate(...p);add(g,mat,id,pose);};
 for(let i=0;i<=count;i++){
  const id=80+i,x=-span/2+(i===0?.14:i===count?span-.14:i*step),pose=new T.Matrix4().makeTranslation(x,0,0);
  parts[id]={name:'concrete_post_'+i,material:'concrete',detachable:true,structural:true,strength:160};
  box([.28,.36,2.55],[0,0,1.15],0,id,pose);box([.34,.42,.15],[0,0,2.47],1,id,pose);
  box([.36,.52,.23],[0,0,.02],2,id,pose);
 }
 for(let i=0;i<count;i++){
  const id=16+i,key=(seed+i*13)>>>0,w=step-.29,h=2.36-(key%3)*.025,x=-span/2+(i+.5)*step;
  const leaning=key%5===0,rx=leaning?(key%2?-.05:.05):0,ry=leaning?(key%2?.035:-.035):0;
  const pose=new T.Object3D();pose.position.set(x,0,leaning?-.035:0);pose.rotation.set(rx,ry,0);pose.updateMatrix();
  parts[id]={name:'concrete_panel_'+i,material:'concrete',detachable:true,structural:true,strength:130};
  const chipped=key%3===0?.22:.07,shape=new T.Shape();
  shape.moveTo(-w/2,.04);shape.lineTo(w/2,.04);shape.lineTo(w/2,h-chipped*.5);shape.lineTo(w/2-chipped,h);shape.lineTo(-w/2+.06,h);shape.lineTo(-w/2,h-.09);shape.closePath();
  const slab=new T.ExtrudeGeometry(shape,{depth:.20,bevelEnabled:false,steps:1,curveSegments:1});slab.rotateX(Math.PI/2);slab.translate(0,.10,0);add(slab,0,id,pose.matrix);
  for(const z of [.25,h-.22])box([w-.12,.25,.13],[0,0,z],1,id,pose.matrix);
  for(const side of [-1,1])for(const cx of [-w*.24,w*.24]){
   const a=w*.215,b=.74,cy=side*.111,z=h*.53,vertices=[];
   const corners=[[cx-a,cy,z],[cx,cy,z+b],[cx+a,cy,z],[cx,cy,z-b]],top=[cx,side*.205,z];
   for(let j=0;j<4;j++){const u=corners[j],v=corners[(j+1)%4];vertices.push(...u,...(side<0?v:top),...(side<0?top:v));}
   const relief=new T.BufferGeometry();relief.setAttribute('position',new T.Float32BufferAttribute(vertices,3));relief.computeVertexNormals();add(relief,1,id,pose.matrix);
  }
  if(key%4===0){
   // A short surface fracture; it belongs to the slab's damage part.
   for(const [dx,z,angle] of [[-.16,1.87,.25],[-.08,1.54,-.19],[0,1.22,.24]]){
    const g=new T.BoxGeometry(.018,.012,.36);g.rotateY(angle);g.translate(dx,-.115,z);add(g,2,id,pose.matrix);
   }
  }
  if(key%7===0){
   const patch=48+i;parts[patch]={name:'bolted_fence_patch_'+i,material:'metal',detachable:true,strength:60};
   box([w*.32,.035,.85],[w*.28,-.15,.72],3,patch,pose.matrix);
   for(let j=0;j<5;j++)box([.025,.025,.81],[w*(.13+j*.075),-.18,.72],3,patch,pose.matrix);
  }
 }
 root.userData.damageParts=parts;root.userData.concreteFence=true;
 batches.forEach((list,i)=>{if(!list.length){palette[i].dispose();return;}const geometry=mergeGeometries(list),mesh=new T.Mesh(geometry,palette[i]);mesh.userData.damageParts=parts;mesh.castShadow=mesh.receiveShadow=true;structure.add(mesh);for(const g of list)g.dispose();});
 return root;
}
