import {createScavPrefab} from './scav-prefabs.js';
import {vehicleKit,batchRigidMeshes} from './field-vehicles.js';

// An expanded version of the first mission's corrugated repair workshop.
export function createM02Factory(T){
 const root=createScavPrefab(T,'camp-core','west-south:square-workshop'),structure=root.getObjectByName('building_structure');
 structure.scale.z=1.18;
 const kit=vehicleKit(T),details=new T.Group();details.name='workshop_reinforcement';structure.add(details);
 const steel=new T.MeshStandardMaterial({color:'#393b32',roughness:.9,metalness:.3}),rust=new T.MeshStandardMaterial({color:'#795145',roughness:.94,metalness:.2}),sand=new T.MeshStandardMaterial({color:'#8c8167',roughness:.98});
 for(const x of [-5.2,5.2]){
  kit.box(details,[.65,6.2,.55],[x,.3,.15],sand);
  for(const y of [-2.5,2.7]){kit.box(details,[.24,.28,3.85],[x,y,1.78],steel);kit.rod(details,[x,y,2.5],[x,y+(y<0?1:-1),3.35],.07,steel);}
  kit.box(details,[.22,6.2,.22],[x,.3,3.6],steel);
  for(let y=-1.8;y<2.8;y+=1.2)kit.box(details,[.17,1.08,1.25],[x+.16*Math.sign(x),y,.9],rust);
 }
 // Raised handling beam above the open loading bay, with a parked hoist.
 for(const x of [-2.8,2.8])kit.box(details,[.22,.24,4.25],[x,-3.4,2],steel);
 kit.box(details,[6,.28,.34],[0,-3.4,4.16],rust);
 kit.box(details,[.6,.55,.35],[2,-3.4,3.87],steel);kit.rod(details,[2,-3.4,3.7],[2,-3.4,3.1],.025,steel);
 for(const y of [.2,1.4,2.6]){kit.box(details,[1.7,.48,.36],[2.1,y,3.5],steel);kit.box(details,[1.9,.63,.12],[2.1,y,3.72],sand);}
 kit.cylinder(details,.24,4.5,[-4.3,2.5,2.45],steel);kit.cylinder(details,.35,.16,[-4.3,2.5,4.7],rust);
 for(const z of [1,2.7,4])kit.box(details,[.6,.16,.14],[-4.3,2.6,z],rust);
 const parts=root.userData.damageParts;parts[96]={name:'workshop_reinforcement',material:'metal',detachable:true,structural:true,strength:150};
 details.traverse(node=>{if(node.isMesh){node.geometry.setAttribute('damagePart',new T.Float32BufferAttribute(new Float32Array(node.geometry.attributes.position.count).fill(96),1));node.castShadow=node.receiveShadow=true;}});
 batchRigidMeshes(T,details);details.traverse(node=>{if(node.isMesh){node.userData.damageParts=parts;node.castShadow=node.receiveShadow=true;}});return root;
}
