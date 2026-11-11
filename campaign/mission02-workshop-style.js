import {vehicleKit,batchRigidMeshes} from './field-vehicles.js';
import {M02_STATION_SCALE} from './mission02-base-layout.js';

// Attached salvage belongs to the existing destructible building. This module
// has no mission/navigation access and creates no independent props or solids.
export function styleM02Workshop(T,root,kind,spec){
 const palette={industrial_concrete:'#9a866b',industrial_trim:'#74604d',industrial_stripe:'#884f35',industrial_roof:'#686052',industrial_steel:'#484035',industrial_pipe:'#8b7b61',industrial_caution:'#b39055',
  building_paint:'#7c684e',building_structural_steel:'#50483b',foundation_concrete:'#8c7c66',building_dark:'#332f29'};
 const seen=new Set();
 root.traverse(node=>{if(!node.isMesh)return;for(const material of [node.material].flat()){
  if(seen.has(material))continue;seen.add(material);
  if(palette[material.name]){material.color.set(palette[material.name]);material.roughness=Math.max(material.roughness,.87);material.metalness=Math.min(material.metalness,.32);}
 }});
 const structure=root.getObjectByName('building_structure');if(!structure)return root;
 const details=new T.Group();details.name='scav_workshop_details';structure.add(details);
 const kit=vehicleKit(T),parts=root.userData.damageParts??={0:{name:'structure',material:'metal'}};
 const rust=new T.MeshStandardMaterial({color:'#81513a',roughness:.96,metalness:.18}),tin=new T.MeshStandardMaterial({color:'#91816a',roughness:.94,metalness:.22}),dark=new T.MeshStandardMaterial({color:'#39342d',roughness:.95}),wood=new T.MeshStandardMaterial({color:'#776149',roughness:1});
 let id=96;
 function fragment(name,material,build){
  while(parts[id])id++;if(id>=128)throw Error('Workshop damage-part budget exceeded');
  const group=new T.Group();group.name=name;details.add(group);parts[id]={name,material,detachable:true,structural:true,strength:85};build(group);
  group.traverse(node=>{if(node.isMesh)node.geometry.setAttribute('damagePart',new T.Float32BufferAttribute(new Float32Array(node.geometry.attributes.position.count).fill(id),1));});
  batchRigidMeshes(T,group);id++;
 }
 function canopy(x,y,w,d,h){
  fragment('salvaged_canopy','metal',g=>{
   kit.box(g,[w,d,.11],[x,y,h],rust).rotation.y=.04;
   for(let dx=-w/2+.15;dx<w/2;dx+=.38)kit.box(g,[.045,d,.05],[x+dx,y,h+.08],rust);
   for(const side of [-1,1])kit.rod(g,[x-w/2+.12,y+side*(d/2-.12),-.12],[x-w/2+.12,y+side*(d/2-.12),h],.07,dark);
   kit.rod(g,[x-w/2+.12,y-d/2+.12,h-.5],[x-w/2+.6,y-d/2+.12,h],.04,dark);
  });
  fragment('workshop_stores','equipment',g=>{
   kit.box(g,[w*.56,d*.4,.25],[x,y+d*.16,.13],wood);
   kit.box(g,[w*.44,d*.32,.63],[x,y+d*.16,.56],tin);
   for(const offset of [-.18,.18])kit.box(g,[.07,d*.33,.68],[x+offset,y+d*.16,.56],dark);
   for(const dx of [-.32,.32]){kit.cylinder(g,.23,.72,[x+dx,y-d*.24,.36],rust);for(const z of [.2,.57])kit.cylinder(g,.242,.045,[x+dx,y-d*.24,z],dark);}
  });
 }
 const [w,d]=spec.realSizeMetres;
 if(kind==='scav-sensor'){
  canopy(-2.35,.15,1.8,3,2.4);
  fragment('radio_shelter_panels','metal',g=>{kit.box(g,[.1,2.7,1.4],[-3.2,.2,.75],tin);kit.box(g,[1.6,.1,1.7],[-2.35,1.55,.9],rust);});
 }else if(kind==='scav-generator'){
  canopy(-.65,-1.82,2.5,1.45,2.1);
 }else if(kind==='generator'){
  canopy(-w*.31,d*.29,w*.32,1.8,2.45);
 }else if(kind==='bunker'){
  fragment('dugout_scrap_shields','metal',g=>{
   for(const side of [-1,1]){kit.box(g,[.1,d*.62,.85],[side*w*.44,.15,.65],rust);kit.box(g,[.14,.20,1.0],[side*w*.45,-d*.25,.55],dark);}
   kit.box(g,[w*.62,.07,.63],[0,d*.4,.6],tin);
  });
  fragment('dugout_sandbags','concrete',g=>{for(const side of [-1,1])for(let i=0;i<3;i++)kit.box(g,[.52,.72,.32],[side*(w*.42),-.6+i*.62,.2],wood);});
 }else if(['scav-flame-tower','scav-cannon-tower'].includes(kind)){
  fragment('tower_scrap_armor','metal',g=>{
   for(const side of [-1,1]){
    const x=side*1.85;kit.box(g,[.13,2.2,1.25],[x,.15,1.12],rust);
    for(const y of [-.8,1.1])kit.rod(g,[x,y,.25],[x,y,1.85],.065,dark);
    kit.box(g,[.15,1.2,.52],[x+side*.09,.28,1.5],tin);
   }
  });
 }
 root.traverse(node=>{if(node.isMesh){node.userData.damageParts=parts;node.castShadow=node.receiveShadow=true;}});
 // Scale the existing complete asset, including its fixed-size cooling towers,
 // foundation and damage geometry. Scaling only its hall distorted the model.
 if(kind==='generator')for(const child of root.children){child.scale.multiplyScalar(M02_STATION_SCALE);child.position.multiplyScalar(M02_STATION_SCALE);}
 return root;
}
