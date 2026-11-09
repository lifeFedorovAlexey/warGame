import {createBuildingPrefab} from './prefabs.js';

export function createScavOilPrefab(T,spec){
 const root=createBuildingPrefab(T,'derrick',spec),seen=new Set();
 root.traverse(o=>{if(!o.isMesh)return;for(const m of Array.isArray(o.material)?o.material:[o.material]){
  if(seen.has(m))continue;seen.add(m);
  if(m.name==='pump_structural_steel')m.color.set('#645344');
  if(m.name==='pump_oxide_paint')m.color.set('#75442f');
  if(m.name==='foundation_concrete')m.color.set('#817762');
  m.roughness=Math.max(.83,m.roughness);m.metalness=Math.min(.38,m.metalness);
 }});
 // Mismatched sheet-metal patches on the lower pump frame. The original
 // named moving assemblies and their animation remain intact.
 const material=new T.MeshStandardMaterial({color:'#777663',roughness:.95,metalness:.25}),parts=[];
 for(const [x,y,z,w,h] of [[1.5,1.2,1.35,2.1,1.6],[-.5,1.2,1.15,1.7,1.3]]){
  const g=new T.BoxGeometry(w,.08,h).translate(x,y,z),mesh=new T.Mesh(g,material);
  g.setAttribute('damagePart',new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(120),1));mesh.castShadow=mesh.receiveShadow=true;parts.push(mesh);
 }
 const structure=root.getObjectByName('building_structure')??root;structure.add(...parts);
 root.userData.damageParts[120]={name:'scrap_pump_shield',material:'metal',detachable:true,strength:75};
 return root;
}
