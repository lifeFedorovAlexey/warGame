import {CAGE, MATERIAL, VEHICLE_PARTS, cageSample, partMissing} from './damage-state.js';

// Shared preparation, once per model/LOD. Original GLBs and materials stay intact.
function refineSurface(T,source,edge=.34,envelopes=[],skinEdge=edge){
  let geometry=source;
  for(let pass=0;pass<7;pass++){
    const p=geometry.attributes.position,n=geometry.attributes.normal,uv=geometry.attributes.uv;
    const positions=Array.from(p.array),normals=Array.from(n.array),uvs=uv?Array.from(uv.array):null;
    const extras=Object.entries(geometry.attributes).filter(([name])=>!['position','normal','uv'].includes(name)).map(([name,attribute])=>({name,attribute,values:Array.from(attribute.array)}));
    const indices=geometry.index?Array.from(geometry.index.array):Array.from({length:p.count},(_,i)=>i),out=[],midpoints=new Map();
    let changed=false;
    const midpoint=(a,b)=>{
      const key=a<b?a+':'+b:b+':'+a;
      if(midpoints.has(key))return midpoints.get(key);
      const i=positions.length/3;
      for(let k=0;k<3;k++){positions.push((p.array[a*3+k]+p.array[b*3+k])/2);normals.push((n.array[a*3+k]+n.array[b*3+k])/2);}
      if(uvs)for(let k=0;k<2;k++)uvs.push((uv.array[a*2+k]+uv.array[b*2+k])/2);
      for(const extra of extras)for(let k=0;k<extra.attribute.itemSize;k++){const size=extra.attribute.itemSize;extra.values.push((extra.attribute.array[a*size+k]+extra.attribute.array[b*size+k])/2);}
      midpoints.set(key,i);return i;
    };
    for(let i=0;i<indices.length;i+=3){
      const ids=indices.slice(i,i+3),mids=[];
      for(let j=0;j<3;j++){
        const a=ids[j],b=ids[(j+1)%3];
        const nearSkin=envelopes.some(box=>[0,1,2].every(k=>Math.min(p.array[a*3+k],p.array[b*3+k])<=box.max[k]&&Math.max(p.array[a*3+k],p.array[b*3+k])>=box.min[k]));
        if(Math.hypot(...[0,1,2].map(k=>p.array[a*3+k]-p.array[b*3+k]))>(nearSkin?skinEdge:edge)){mids[j]=midpoint(a,b);changed=true;}else mids[j]=null;
      }
      const splits=mids.filter(v=>v!==null).length;
      if(!splits){out.push(...ids);continue;}
      // Shared edge midpoints preserve seams. Avoid centroid fans: they create
      // long thin triangles that trigger excessive recursive subdivision.
      if(splits===3){const [a,b,c]=ids,[ab,bc,ca]=mids;out.push(a,ab,ca,ab,b,bc,ca,bc,c,ab,bc,ca);}
      else{
        const j=splits===1?mids.findIndex(v=>v!==null):mids.findIndex((v,k)=>v!==null&&mids[(k+1)%3]!==null);
        const a=ids[j],b=ids[(j+1)%3],c=ids[(j+2)%3],ab=mids[j];
        if(splits===1)out.push(a,ab,c,ab,b,c);
        else{const bc=mids[(j+1)%3];out.push(b,bc,ab,a,ab,c,ab,bc,c);}
      }
    }
    if(!changed)break;
    const next=new T.BufferGeometry();next.setAttribute('position',new T.Float32BufferAttribute(positions,3));next.setAttribute('normal',new T.Float32BufferAttribute(normals,3));
    if(uvs)next.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));next.setIndex(out);
    for(const {name,attribute,values} of extras)next.setAttribute(name,new T.BufferAttribute(new attribute.array.constructor(values),attribute.itemSize,attribute.normalized));
    if(geometry!==source)geometry.dispose();geometry=next;
  }
  return geometry;
}

function wheelId(node){
  for(let p=node;p;p=p.parent){
    const match=/axle_([12])_([LR])_wheel/i.exec(p.name);
    if(match)return (Number(match[1])-1)*2+(match[2].toUpperCase()==='L'?1:2);
    if(p.name.endsWith('_wheel'))return p.position.y>=0?(p.position.x<0?1:2):(p.position.x<0?3:4);
  }
  return 0;
}
function classify(node,point,category){
  if(category==='building')return 0;
  if(category==='weapon')return 9;
  const wheel=wheelId(node);if(wheel)return wheel;
  const name=node.material.name??'',[x,y,z]=point;
  if(name==='headlamp_lens')return x<0?5:6;
  // B01 batches the front and rear amber lenses in one unnamed emissive mesh.
  // Only the lenses at the tail join the red stop lens as one rear lamp.
  if(name==='rear_stop_lens'||node.name.startsWith('B01_surface_')&&y<-2.035&&node.material.emissive?.r>0)return x<0?31:32;
  if(/window_glass/.test(name)){
    if(Math.abs(x)>1.02)return x<0?16:17;
    if(y>1.77)return x<0?10:11;
    if(y<-1.92)return x<0?14:15;
    if(y>.55)return x<0?20:21;
    if(y<-.98)return x<0?18:19;
    return x<0?12:13;
  }
  return 0;
}

// The C01 export batches rigid guard tubes with the chassis by material. Recover
// their connected components once, using the documented guard envelope from
// demo/main.js. Never cut a triangle/door out of the continuous B01 shell.
function connectedComponents(geometry,positions){
  const count=positions.length/3,parent=Array.from({length:count},(_,i)=>i),same=new Map(),index=geometry.index;
  const find=x=>{while(parent[x]!==x){parent[x]=parent[parent[x]];x=parent[x];}return x;};
  const join=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent[b]=a;};
  for(let i=0;i<count;i++){const key=[0,1,2].map(k=>Math.round(positions[i*3+k]*1e5)).join(',');if(same.has(key))join(i,same.get(key));else same.set(key,i);}
  for(let i=0;i<(index?.count??count);i+=3){const a=index?index.getX(i):i;join(a,index?index.getX(i+1):i+1);join(a,index?index.getX(i+2):i+2);}
  const components=new Map();
  for(let i=0;i<count;i++){const root=find(i);if(!components.has(root))components.set(root,[]);components.get(root).push(i);}
  return [...components.values()];
}
function tagC01Guards(geometry,positions,parts){
  for(const ids of connectedComponents(geometry,positions)){
    let minY=Infinity,maxY=-Infinity,maxZ=-Infinity;
    for(const i of ids){minY=Math.min(minY,positions[i*3+1]);maxY=Math.max(maxY,positions[i*3+1]);maxZ=Math.max(maxZ,positions[i*3+2]);}
    if(maxZ<1.52){const id=minY>1.64?7:maxY<-1.64?8:0;if(id)for(const i of ids)parts[i]=id;}
  }
}
function tagGlass(node,geometry,positions,parts,category){
  for(const ids of connectedComponents(geometry,positions)){
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(const i of ids)for(let k=0;k<3;k++){min[k]=Math.min(min[k],positions[i*3+k]);max[k]=Math.max(max[k],positions[i*3+k]);}
    const id=classify(node,min.map((v,k)=>(v+max[k])*.5),category);
    for(const i of ids)parts[i]=id;
  }
}
// Small rest-space attachment envelopes, shared by all copies of a model.
// Used for approximate local load transfer, never for picking or a wreck preset.
export function collectDamageRegions(bindings){
  const regions=new Map();
  for(const binding of bindings){
    const p=binding.geometry.attributes.damagePosition,parts=binding.geometry.attributes.damagePart;
    for(let i=0;i<p.count;i++){
      const id=Math.round(parts.getX(i));if(!id)continue;
      let r=regions.get(id);if(!r){r={id,installationPart:binding.installationPart,min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};regions.set(id,r);}
      for(let k=0;k<3;k++){const v=p.array[i*3+k];r.min[k]=Math.min(r.min[k],v);r.max[k]=Math.max(r.max[k],v);}
    }
  }
  return [...regions.values()];
}
function glazingEnvelopes(T,node){
  let root=node;while(root.parent)root=root.parent;
  const inverse=node.matrixWorld.clone().invert(),point=new T.Vector3(),boxes=[];
  root.traverse(glass=>{
    if(!glass.isMesh||!/window_glass/.test(glass.material.name??''))return;
    const p=glass.geometry.attributes.position,positions=new Float32Array(p.count*3),matrix=new T.Matrix4().multiplyMatrices(inverse,glass.matrixWorld);
    for(let i=0;i<p.count;i++)point.fromBufferAttribute(p,i).applyMatrix4(matrix).toArray(positions,i*3);
    for(const ids of connectedComponents(glass.geometry,positions)){
      const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
      for(const i of ids)for(let k=0;k<3;k++){min[k]=Math.min(min[k],positions[i*3+k]-.04);max[k]=Math.max(max[k],positions[i*3+k]+.04);}
      boxes.push({min,max});
    }
  });
  return boxes;
}

export function prepareDamageGeometry(T,node,category,lod=0,profile={}){
  const bind=node.matrixWorld.clone(),normalMatrix=new T.Matrix3().getNormalMatrix(bind);
  let authoredMotion=false;for(let p=node;p;p=p.parent)if(p.userData.damageDynamic)authoredMotion=true;
  const isBody=category==='body',isShell=isBody&&!wheelId(node)&&/^(paint_olive|field_body_|window_glass|rubber)/.test(node.material.name);
  // Broad glass panels need the same tessellation as the shell underneath:
  // four corner samples alone would cut through a curved damaged body.
  const glazing=/window_glass/.test(node.material.name),envelopes=isBody&&node.material.name==='paint_olive'&&lod<2?glazingEnvelopes(T,node):[];
  const skinEdge=lod===0?.10:.18;
  const source=isShell&&lod<2?refineSurface(T,node.geometry,glazing?skinEdge:lod===0?.30:.54,envelopes,skinEdge):node.geometry;
  const geometry=new T.BufferGeometry();
  for(const [name,attribute] of Object.entries(source.attributes))geometry.setAttribute(name,attribute);
  geometry.setIndex(source.index);geometry.groups=source.groups.slice();
  geometry.boundingBox=source.boundingBox?.clone()??null;geometry.boundingSphere=source.boundingSphere?.clone()??null;
  const count=source.attributes.position.count,positions=new Float32Array(count*3),normals=new Float32Array(count*3),parts=new Float32Array(count),point=new T.Vector3(),normal=new T.Vector3();
  const authored=source.attributes.damagePart;
  for(let i=0;i<count;i++){
    point.fromBufferAttribute(source.attributes.position,i).applyMatrix4(bind);
    normal.fromBufferAttribute(source.attributes.normal,i).applyMatrix3(normalMatrix).normalize();
    point.toArray(positions,i*3);normal.toArray(normals,i*3);
    parts[i]=authored?authored.getX(i):classify(node,point.toArray(),category);
  }
  if(category==='chassis'&&!wheelId(node)&&node.name.startsWith('C01_'))tagC01Guards(geometry,positions,parts);
  if(!authored&&isBody&&/window_glass/.test(node.material.name??''))tagGlass(node,geometry,positions,parts,category);
  geometry.setAttribute('damagePosition',new T.BufferAttribute(positions,3));
  geometry.setAttribute('damageNormal',new T.BufferAttribute(normals,3));
  geometry.setAttribute('damagePart',new T.BufferAttribute(parts,1));
  const partIds=[...new Set(parts)];
  let constructionClipped=false;for(let parent=node.parent;parent;parent=parent.parent)if(parent.name==='building_structure')constructionClipped=true;
  return {geometry,bind,cageBounds:profile.cageBounds??CAGE,inverseLinear:new T.Matrix3().setFromMatrix4(bind).invert(),linear:new T.Matrix3().setFromMatrix4(bind),
    deform:isBody&&!wheelId(node)&&!authoredMotion,dynamic:category==='weapon'||category==='equipment'||!!wheelId(node)||authoredMotion,installationPart:node.userData.installationPart,constructionClipped,category,parts:partIds,node,material:node.material,partSpecs:profile.parts??(category==='building'?node.userData.damageParts??{}:VEHICLE_PARTS)};
}

// Median-split BVH of shared rest triangles. Expand nodes by the bounded dent
// displacement; evaluate the cage only for leaf triangles visited by a hit.
export function createDamageCollider(T,bindings,splitMotion=true){
  const movers=splitMotion?bindings.filter(b=>b.dynamic).map(binding=>({binding,collider:createDamageCollider(T,[binding],false)})):[];
  if(splitMotion)bindings=bindings.filter(b=>!b.dynamic);
  const triangles=[];
  const cageBounds=bindings.find(b=>b.deform)?.cageBounds??CAGE;
  const cache=new Map(bindings.map(b=>[b,{stamp:new Uint32Array(b.geometry.attributes.damagePosition.count),values:new Float32Array(b.geometry.attributes.damagePosition.count*3)}]));let queryId=0;
  for(const binding of bindings){
    const g=binding.geometry,p=g.attributes.damagePosition,idx=g.index,part=g.attributes.damagePart;
    for(let i=0;i<(idx?.count??p.count);i+=3){
      const ids=[0,1,2].map(j=>idx?idx.getX(i+j):i+j),points=ids.map(id=>[p.getX(id),p.getY(id),p.getZ(id)]);
      const min=[0,1,2].map(k=>Math.min(...points.map(v=>v[k]))),max=[0,1,2].map(k=>Math.max(...points.map(v=>v[k])));
      triangles.push({binding,ids,points,min,max,part:Math.round(part.getX(ids[0]))});
    }
  }
  function build(items){
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(const t of items)for(let k=0;k<3;k++){min[k]=Math.min(min[k],t.min[k]);max[k]=Math.max(max[k],t.max[k]);}
    const node={min,max,cageIndices:null};
    if(items.some(t=>t.binding.deform)){
      const last=[3,7,3],cells=last.map((v,k)=>{const scale=(v+1)/(cageBounds.max[k]-cageBounds.min[k]);return [Math.max(0,Math.min(v,Math.floor((min[k]-cageBounds.min[k])*scale))),Math.max(0,Math.min(v,Math.floor((max[k]-cageBounds.min[k])*scale)))+1];}),indices=[];
      for(let z=cells[2][0];z<=cells[2][1];z++)for(let y=cells[1][0];y<=cells[1][1];y++)for(let x=cells[0][0];x<=cells[0][1];x++)indices.push((z*45+y*5+x)*3);
      node.cageIndices=new Uint16Array(indices);
    }
    if(items.length<=12)node.items=items;
    else{const ext=max.map((v,i)=>v-min[i]),axis=ext.indexOf(Math.max(...ext));items.sort((a,b)=>a.min[axis]+a.max[axis]-b.min[axis]-b.max[axis]);const mid=items.length>>1;node.left=build(items.slice(0,mid));node.right=build(items.slice(mid));}
    return node;
  }
  const root=build(triangles),a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3(),point=new T.Vector3(),ray=new T.Ray(),normal=new T.Vector3(),temp=new T.Vector3(),bary=new T.Vector3(),delta=[0,0,0],vertices=[a,b,c],minDelta=[0,0,0],maxDelta=[0,0,0];
  let currentCage=null;
  function intersects(node,best){
    // Trilinear interpolation is a convex combination of these control nodes.
    // Bound only this subtree's support, not damage at the opposite end of the
    // vehicle. Remains conservative under accumulated, multidirectional hits.
    minDelta.fill(0);maxDelta.fill(0);
    if(currentCage&&node.cageIndices)for(const i of node.cageIndices)for(let k=0;k<3;k++){const value=currentCage[i+k];minDelta[k]=Math.min(minDelta[k],value);maxDelta[k]=Math.max(maxDelta[k],value);}
    let lo=0,hi=best;
    for(let k=0;k<3;k++){
      const axis=k===0?'x':k===1?'y':'z',o=ray.origin[axis],d=ray.direction[axis],min=node.min[k]+minDelta[k],max=node.max[k]+maxDelta[k];
      if(Math.abs(d)<1e-12){if(o<min||o>max)return Infinity;continue;}
      let t0=(min-o)/d,t1=(max-o)/d;if(t0>t1)[t0,t1]=[t1,t0];lo=Math.max(lo,t0);hi=Math.min(hi,t1);if(lo>hi)return Infinity;
    }
    return lo;
  }
  function trace(origin,direction,state,transforms=null,heightLimit=Infinity){
    ray.origin.fromArray(origin);ray.direction.fromArray(direction).normalize();
    let best=Infinity,result=null;queryId++;currentCage=state?.cage;
    function visit(node,entry=intersects(node,best)){
      if(entry===Infinity||entry>best)return;
      if(!node.items){const left=intersects(node.left,best),right=intersects(node.right,best);if(left<right){visit(node.left,left);visit(node.right,right);}else{visit(node.right,right);visit(node.left,left);}return;}
      for(const tri of node.items){
        if(tri.binding.installationPart&&!state?.parts?.[tri.binding.installationPart]?.installed)continue;
        if(partMissing(state,tri.part))continue;
        const scratch=cache.get(tri.binding);
        for(let j=0;j<3;j++){
          const v=vertices[j],id=tri.ids[j];
          v.fromArray(tri.points[j]);
          if(tri.binding.deform&&state?.cage){
            if(scratch.stamp[id]!==queryId){cageSample(state,tri.points[j],delta);scratch.values[id*3]=v.x+delta[0];scratch.values[id*3+1]=v.y+delta[1];scratch.values[id*3+2]=v.z+delta[2];scratch.stamp[id]=queryId;}
            v.fromArray(scratch.values,id*3);
          }
        }
        if(!ray.intersectTriangle(a,b,c,false,point))continue;
        if(tri.binding.constructionClipped&&point.z>heightLimit+1e-6)continue;
        const distance=point.distanceTo(ray.origin);if(distance>=best)continue;
        normal.subVectors(b,a).cross(temp.subVectors(c,a)).normalize();
        if(normal.dot(ray.direction)>0)normal.negate();
        T.Triangle.getBarycoord(point,a,b,c,bary);
        const weights=bary.toArray(),rest=[0,1,2].map(k=>weights.reduce((s,w,j)=>s+w*tri.points[j][k],0));
        const n=tri.binding.geometry.attributes.damageNormal,restNormal=[0,1,2].map(k=>weights.reduce((s,w,j)=>s+w*n.array[tri.ids[j]*3+k],0));
        if(restNormal.reduce((s,v,i)=>s+v*direction[i],0)>0)for(let i=0;i<3;i++)restNormal[i]*=-1;
        best=distance;result={point:point.toArray(),normal:normal.toArray(),restPoint:rest,restNormal,partId:tri.part,binding:tri.binding,distance};
      }
    }
    if(triangles.length)visit(root);
    for(const mover of movers){
      const matrix=transforms?.get(mover.binding),localOrigin=new T.Vector3(...origin),localDirection=new T.Vector3(...direction);
      if(matrix){const inverse=matrix.clone().invert();localOrigin.applyMatrix4(inverse);localDirection.transformDirection(inverse);}
      const hit=mover.collider.trace(localOrigin.toArray(),localDirection.toArray(),state);if(!hit)continue;
      if(matrix){hit.point=new T.Vector3(...hit.point).applyMatrix4(matrix).toArray();hit.normal=new T.Vector3(...hit.normal).applyMatrix3(new T.Matrix3().getNormalMatrix(matrix)).normalize().toArray();}
      hit.distance=Math.hypot(...hit.point.map((v,i)=>v-origin[i]));if(hit.distance<best){best=hit.distance;result=hit;}
    }
    return result;
  }
  const bounds={min:root.min.slice(),max:root.max.slice()};for(const {collider} of movers)for(let k=0;k<3;k++){bounds.min[k]=Math.min(bounds.min[k],collider.bounds.min[k]);bounds.max[k]=Math.max(bounds.max[k],collider.bounds.max[k]);}
  return {trace,triangles:triangles.length+movers.reduce((sum,m)=>sum+m.collider.triangles,0),bounds};
}

export function extractDamagePart(T,bindings,id,state,transforms=null){
  const root=new T.Group(),materials=new Map(),offset=[0,0,0];
  for(const binding of bindings){
    if(!binding.parts.includes(id))continue;
    // Glazing shatters in place; do not throw an intact window-sized sheet.
    if(/window_glass|building_window/.test(binding.material.name??''))continue;
    const g=binding.geometry,p=g.attributes.damagePosition,n=g.attributes.damageNormal,ids=g.index,part=g.attributes.damagePart,uv=g.attributes.uv,positions=[],normals=[],uvs=[];
    for(let i=0;i<(ids?.count??p.count);i+=3){
      const tri=[0,1,2].map(j=>ids?ids.getX(i+j):i+j);if(Math.round(part.getX(tri[0]))!==id)continue;
      for(const v of tri){const pos=[p.getX(v),p.getY(v),p.getZ(v)];if(binding.deform)cageSample(state,pos,offset);else offset.fill(0);const point=new T.Vector3(...pos.map((x,k)=>x+offset[k])),normal=new T.Vector3(n.getX(v),n.getY(v),n.getZ(v)),motion=transforms?.get(binding);if(motion){point.applyMatrix4(motion);normal.applyMatrix3(new T.Matrix3().getNormalMatrix(motion)).normalize();}positions.push(...point.toArray());normals.push(...normal.toArray());if(uv)uvs.push(uv.getX(v),uv.getY(v));}
    }
    if(!positions.length)continue;
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new T.Float32BufferAttribute(normals,3));if(uvs.length)geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
    if(!materials.has(binding.material)){const material=binding.material.clone();material.color.multiplyScalar(state?.wreck?.55:1-(state?.burn??0)*.3);material.emissiveIntensity=0;material.roughness=Math.max(material.roughness??.65,.65);materials.set(binding.material,material);}
    const material=materials.get(binding.material);
    const mesh=new T.Mesh(geometry,material);mesh.castShadow=true;root.add(mesh);
  }
  if(!root.children.length)return null;
  const bounds=new T.Box3().setFromObject(root),centre=bounds.getCenter(new T.Vector3());
  for(const mesh of root.children)mesh.geometry.translate(-centre.x,-centre.y,-centre.z);
  // Small convex support set for ground contact, made from real vertices.
  // A fixed sphere left thin bumpers hovering and let large pieces bury themselves.
  const directions=[];for(let z=-1;z<=1;z++)for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++)if(x||y||z)directions.push(new T.Vector3(x,y,z).normalize());
  const scores=directions.map(()=>-Infinity),supports=directions.map(()=>new T.Vector3()),v=new T.Vector3();
  for(const mesh of root.children){const p=mesh.geometry.attributes.position;for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);directions.forEach((d,j)=>{const dot=d.dot(v);if(dot>scores[j]){scores[j]=dot;supports[j].copy(v);}});}}
  const size=bounds.getSize(new T.Vector3()),thin=size.x<=size.y&&size.x<=size.z?new T.Vector3(1,0,0):size.y<=size.z?new T.Vector3(0,1,0):new T.Vector3(0,0,1);
  return {root,centre,size,radius:size.length()/2,supports,restAxis:thin};
}
