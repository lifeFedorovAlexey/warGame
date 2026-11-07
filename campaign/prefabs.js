import {buildingWorkRail} from './builder-kinematics.js';
import {createOilPump} from './oil-pump.js';
import {buildIndustrialStructure} from './industrial-buildings.js';
import {buildDefenseTower} from './defense-tower.js';

// Replaceable engineering prefabs. Dimensions and anchors belong to gameplay.json.
export function createBuildingPrefab(T,kind,spec){
 const root=new T.Group();root.name=kind;root.userData={kind,artStatus:['generator','factory','lab'].includes(kind)?'industrial-atlas':'game-prefab',dimensionsMetres:spec.realSizeMetres};
 let oilPump,tower;
 const [w,d,h]=spec.realSizeMetres??[12,10,5],paint=new T.MeshStandardMaterial({color:'#66674e',metalness:.4,roughness:.69}),steel=new T.MeshStandardMaterial({color:'#454b47',metalness:.7,roughness:.55}),concrete=new T.MeshStandardMaterial({color:'#8d8574',roughness:1}),dark=new T.MeshStandardMaterial({color:'#242e2d',roughness:.7}),light=new T.MeshStandardMaterial({color:'#c8b282',emissive:'#ac8a43',emissiveIntensity:.35}),baseGroups=new Map(),structureGroups=new Map();let groups=baseGroups;
 paint.name='building_paint';steel.name='building_structural_steel';concrete.name='foundation_concrete';dark.name='building_dark';light.name='building_lamp';
 const damageParts={0:{name:'structure',material:'concrete'}},damageNames=new Map();let activePart=0,nextPart=1;
 function part(name,profile,build){let id=damageNames.get(name);if(id===undefined){if(nextPart===9)nextPart++;if(nextPart>=128)throw new Error('Building damage part budget exceeded: '+kind);id=name==='weapon'?9:nextPart++;damageNames.set(name,id);damageParts[id]={name,...profile};}const previous=activePart;activePart=id;try{return build(id);}finally{activePart=previous;}}
 function mesh(geo,mat,pos=[0,0,0],rotation){const item=new T.Mesh(geo,mat);item.position.set(...pos);if(rotation)item.rotation.set(...rotation);item.updateMatrix();geo.applyMatrix4(item.matrix);let id=activePart;if(!id&&mat.name==='building_window'){const name='window_'+pos.map(x=>x.toFixed(3)).join('_');part(name,{material:'glass',detachable:true},()=>{id=activePart;});}geo.setAttribute('damagePart',new T.Float32BufferAttribute(new Float32Array(geo.attributes.position.count).fill(id),1));if(!groups.has(mat))groups.set(mat,[]);const flat=geo.index?geo.toNonIndexed():geo;groups.get(mat).push(flat);if(flat!==geo)geo.dispose();}
 const box=(size,pos,mat=paint,rotation)=>mesh(new T.BoxGeometry(...size),mat,pos,rotation);
 function rod(a,b,r=.1,mat=steel){const start=new T.Vector3(...a),end=new T.Vector3(...b),geo=new T.CylinderGeometry(r,r,start.distanceTo(end),8);geo.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),end.clone().sub(start).normalize()));mesh(geo,mat,start.add(end).multiplyScalar(.5).toArray());}
 const cylinder=(r,height,pos,mat=steel)=>{const geo=new T.CylinderGeometry(r,r,height,12);geo.rotateX(Math.PI/2);mesh(geo,mat,pos);};
 const foundationHeight=kind==='bunker'?.20:.35;
 box([w,d,foundationHeight],[0,0,foundationHeight/2],concrete);
 const rail=buildingWorkRail(spec);box([rail.width,rail.depth,rail.height],rail.position,steel);
 if(kind==='bunker')for(const x of [-w*.24,0,w*.24])box([.17,.22,.21],[x,-d*.487,.30],steel);
 groups=structureGroups;
 if(['generator','factory','lab'].includes(kind)){
  buildIndustrialStructure(T,kind,[w,d,h],{box,cylinder,rod,mesh,part});
 }else if(kind==='derrick'){
  oilPump=createOilPump(T,w,d,h);
 }else if(kind==='bunker'){
  const cast=new T.MeshStandardMaterial({color:'#a29883',roughness:.96});
  const joint=new T.MeshStandardMaterial({color:'#655f51',roughness:.95});
  const edge=-d*.427, slitZ=h*.53, sill=h*.40, crown=h*.80;
  function slab(width,depth,corner,z,height,bevel,material,pitch=0){
   const x=width/2,y=depth/2;
   const section=new T.Shape().moveTo(-x+corner,-y).lineTo(x-corner,-y)
    .lineTo(x,-y+corner).lineTo(x,y-corner).lineTo(x-corner,y).lineTo(-x+corner,y)
    .lineTo(-x,y-corner).lineTo(-x,-y+corner).closePath();
   const geometry=new T.ExtrudeGeometry(section,{depth:height,bevelEnabled:true,bevelThickness:bevel,bevelSize:bevel,bevelSegments:1});
   if(pitch)geometry.applyMatrix4(new T.Matrix4().makeShear(0,0,0,pitch,0,0));
   mesh(geometry,material,[0,0,z]);
  }
  slab(w*.87,d*.83,.40,.28,sill-.28,.07,concrete);
  slab(w*.80,d*.77,.48,crown,.16,.083,cast,.082);
  const cheekWidth=w*.29, cheekZ=(sill+crown)/2;
  for(const side of [-1,1]){
   box([cheekWidth,.49,crown-sill],[side*w*.30,edge+.26,cheekZ],cast,[0,0,side*.12]);
   box([.34,d*.69,crown-sill],[side*w*.38,.12,cheekZ],concrete);
   box([w*.31,.20,.085],[side*w*.23,edge-.02,sill+.055],joint);
  }
  box([w*.72,d*.57,crown-sill],[0,d*.12,cheekZ],cast);
  box([w*.46,.12,.36],[0,edge+.38,slitZ],dark);
  box([w*.45,.37,.23],[0,edge+.16,crown-.18],cast);
  box([w*.43,.10,.085],[0,edge+.05,slitZ-.21],steel);
  box([.27,.22,.22],[0,edge+.32,slitZ],steel);
  rod([0,-d*.28,slitZ],[0,-d*.495,slitZ],.052,dark);
  rod([0,-d*.456,slitZ],[0,-d*.50,slitZ],.069,steel);
  box([.75,.12,1.08],[w*.145,d*.395,.86],steel);
  box([.86,.12,.13],[w*.145,d*.401,1.44],joint);
  box([.18,.11,.09],[w*.19,d*.422,.89],joint);
  const muzzle=new T.Object3D();
  muzzle.name='muzzle';
  muzzle.position.set(0,-d*.504,slitZ);
  root.add(muzzle);
 }else if(kind==='mg-tower'){
  tower=buildDefenseTower(T,[w,d,h],{box,rod,cylinder,mesh,part},{paint,steel,concrete,dark});
  part('weapon',{material:'equipment',detachable:true,strength:210},()=>{});
 }else{
  box([w,d,h*.72],[0,0,h*.38],steel);box([w*1.08,d*1.06,.25],[0,0,h*.77],paint);for(let j=0;j<4;j++)box([w*.12,.12,h*.18],[(j-1.5)*w*.22,-d*.51,h*.5],dark);
 }
 for(const [name,grouped] of [['building_foundation',baseGroups],['building_structure',structureGroups]]){const group=new T.Group();group.name=name;root.add(group);for(const [material,geometries] of grouped){const merged=new T.BufferGeometry();for(const key of ['position','normal','uv','damagePart']){const arrays=geometries.map(g=>g.getAttribute(key)).filter(Boolean);if(arrays.length!==geometries.length)continue;const values=new Float32Array(arrays.reduce((sum,a)=>sum+a.array.length,0));let offset=0;for(const a of arrays){values.set(a.array,offset);offset+=a.array.length;}merged.setAttribute(key,new T.BufferAttribute(values,key==='uv'?2:key==='damagePart'?1:3));}const item=new T.Mesh(merged,material);item.userData.damageParts=damageParts;item.castShadow=item.receiveShadow=true;group.add(item);for(const geo of geometries)geo.dispose();}}
 root.userData.damageParts=damageParts;
 if(oilPump)root.getObjectByName('building_structure').add(oilPump);
 if(tower){tower.traverse(node=>{if(node.isMesh)node.userData.damageParts=damageParts;});root.getObjectByName('building_structure').add(tower);}
 const contact=new T.Object3D();contact.name='work_contact';contact.position.set(0,rail.position[1]-rail.depth/2,rail.position[2]);root.add(contact);
 for(const [key,point] of Object.entries({work:spec.workAnchor,exit:spec.exitAnchor}).filter(([,value])=>value)){const anchor=new T.Object3D();anchor.name=key+'_anchor';anchor.position.set(...point);root.add(anchor);}
 return root;
}
