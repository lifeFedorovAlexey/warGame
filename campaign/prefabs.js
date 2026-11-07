import {buildingWorkRail} from './builder-kinematics.js';
// Replaceable engineering prefabs. Dimensions and anchors belong to gameplay.json.
export function createBuildingPrefab(T,kind,spec){
 const root=new T.Group();root.name=kind;root.userData={kind,artStatus:'engineering-placeholder',dimensionsMetres:spec.realSizeMetres};
 const [w,d,h]=spec.realSizeMetres??[12,10,5],paint=new T.MeshStandardMaterial({color:'#66674e',metalness:.4,roughness:.69}),steel=new T.MeshStandardMaterial({color:'#454b47',metalness:.7,roughness:.55}),concrete=new T.MeshStandardMaterial({color:'#8d8574',roughness:1}),dark=new T.MeshStandardMaterial({color:'#242e2d',roughness:.7}),light=new T.MeshStandardMaterial({color:'#c8b282',emissive:'#ac8a43',emissiveIntensity:.35}),baseGroups=new Map(),structureGroups=new Map();let groups=baseGroups;
 paint.name='building_paint';steel.name='building_structural_steel';concrete.name='foundation_concrete';dark.name='building_dark';light.name='building_lamp';
 function mesh(geo,mat,pos=[0,0,0],rotation){const part=new T.Mesh(geo,mat);part.position.set(...pos);if(rotation)part.rotation.set(...rotation);part.updateMatrix();geo.applyMatrix4(part.matrix);if(!groups.has(mat))groups.set(mat,[]);groups.get(mat).push(geo.index?geo.toNonIndexed():geo);}
 const box=(size,pos,mat=paint,rotation)=>mesh(new T.BoxGeometry(...size),mat,pos,rotation);
 function rod(a,b,r=.1,mat=steel){const start=new T.Vector3(...a),end=new T.Vector3(...b),geo=new T.CylinderGeometry(r,r,start.distanceTo(end),8);geo.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),end.clone().sub(start).normalize()));mesh(geo,mat,start.add(end).multiplyScalar(.5).toArray());}
 const cylinder=(r,height,pos,mat=steel)=>{const geo=new T.CylinderGeometry(r,r,height,12);geo.rotateX(Math.PI/2);mesh(geo,mat,pos);};
 box([w,d,.35],[0,0,.175],concrete);
 const rail=buildingWorkRail(spec);box([rail.width,rail.depth,rail.height],rail.position,steel);
 groups=structureGroups;
 if(kind==='generator'){
  box([w*.78,d*.75,h*.62],[0,0,h*.36]);for(const x of [-1,1]){box([.18,d*.7,h*.68],[x*w*.37,0,h*.41],steel);for(let j=0;j<5;j++)box([.12,d*.55,.09],[x*w*.397,0,h*.25+j*.26],dark);}
  box([w*.62,d*.55,.15],[0,0,h*.69],steel);cylinder(.32,h*.36,[w*.25,d*.23,h*.82]);for(const x of [-1,1])for(const y of [-1,1])cylinder(.45,.5,[x*w*.4,y*d*.36,.5]);
 }else if(kind==='derrick'){
  const top=h*.94;for(const x of [-1,1])for(const y of [-1,1])rod([x*w*.4,y*d*.4,.35],[x*w*.12,y*d*.12,top],.18);for(let j=1;j<=4;j++){const z=top*j/5,r=w*(.4-.28*j/5);for(const sign of [-1,1]){rod([-r,sign*r,z],[r,sign*r,z],.08);rod([sign*r,-r,z],[sign*r,r,z],.08);}}
  box([w*.5,d*.48,.4],[0,0,top],steel);cylinder(.32,h*.8,[0,0,h*.42]);box([w*.85,d*.5,1],[0,0,.9],paint);rod([-w*.42,0,2],[w*.42,0,3.2],.28,paint);
 }else if(kind==='factory'){
  box([w*.94,d*.92,h*.75],[0,0,h*.4]);box([w,d,.35],[0,0,h*.82],steel);box([w*.83,d*.68,h*.20],[0,d*.08,h*.88],paint);
  box([w*.48,.08,h*.54],[0,-d*.465,h*.3],dark);for(const side of [-1,1])box([w*.17,.1,h*.55],[side*w*.36,-d*.47,h*.3],steel);
  for(let j=0;j<7;j++)box([w*.45,.14,.045],[0,-d*.48,.8+j*.55],steel);for(let j=0;j<4;j++)box([w*.1,.09,.55],[(j-1.5)*w*.19,d*.47,h*.57],light);
  for(const side of [-1,1])box([w*.13,d*.8,.12],[side*w*.41,0,h*.85],dark);
 }else if(kind==='lab'){
  box([w*.92,d*.9,h*.75],[0,0,h*.4]);box([w,d,.3],[0,0,h*.8],concrete);box([w*.55,d*.5,h*.12],[0,0,h*.89],steel);
  for(const side of [-1,1])for(let j=0;j<3;j++)box([w*.16,.1,h*.18],[(j-1)*w*.25,side*d*.46,h*.52],dark);
  box([w*.14,.12,h*.42],[w*.23,-d*.46,h*.24],steel);cylinder(.09,h*.25,[-w*.32,d*.21,h*.875]);
 }else if(kind==='bunker'){
  box([w*.92,d*.9,h*.68],[0,0,h*.4],concrete);box([w,d,.42],[0,0,h*.8],steel);box([w*.65,.11,h*.13],[0,-d*.455,h*.48],dark);rod([0,-d*.42,h*.48],[0,-d*.7,h*.48],.08);
 }else if(kind==='mg-tower'){
  for(const x of [-1,1])for(const y of [-1,1]){rod([x*w*.4,y*d*.4,.3],[x*w*.3,y*d*.3,h*.8],.18);rod([x*w*.4,y*d*.4,.5],[x*w*.3,-y*d*.3,h*.77],.09);}
  box([w*.8,d*.8,.32],[0,0,h*.8],steel);box([w*.68,d*.65,h*.15],[0,0,h*.89]);box([w*.3,d*.24,h*.12],[0,0,h*.94],dark);rod([0,-d*.1,h*.94],[0,-d*.62,h*.94],.1);
 }else{
  box([w,d,h*.72],[0,0,h*.38],steel);box([w*1.08,d*1.06,.25],[0,0,h*.77],paint);for(let j=0;j<4;j++)box([w*.12,.12,h*.18],[(j-1.5)*w*.22,-d*.51,h*.5],dark);
 }
 for(const [name,grouped] of [['building_foundation',baseGroups],['building_structure',structureGroups]]){const group=new T.Group();group.name=name;root.add(group);for(const [material,geometries] of grouped){const merged=new T.BufferGeometry();for(const key of ['position','normal','uv']){const arrays=geometries.map(g=>g.getAttribute(key)).filter(Boolean);if(arrays.length!==geometries.length)continue;const values=new Float32Array(arrays.reduce((sum,a)=>sum+a.array.length,0));let offset=0;for(const a of arrays){values.set(a.array,offset);offset+=a.array.length;}merged.setAttribute(key,new T.BufferAttribute(values,key==='uv'?2:3));}const part=new T.Mesh(merged,material);part.castShadow=part.receiveShadow=true;group.add(part);for(const geo of geometries)geo.dispose();}}
 const contact=new T.Object3D();contact.name='work_contact';contact.position.set(0,rail.position[1]-rail.depth/2,rail.position[2]);root.add(contact);
 for(const [key,point] of Object.entries({work:spec.workAnchor,exit:spec.exitAnchor}).filter(([,value])=>value)){const anchor=new T.Object3D();anchor.name=key+'_anchor';anchor.position.set(...point);root.add(anchor);}
 return root;
}
