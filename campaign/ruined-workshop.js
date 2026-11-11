import {vehicleKit,batchRigidMeshes} from './field-vehicles.js';

// Old masonry is part of the existing damageable workshop, inside its current
// footprint. It adds neither a separate building nor a navigation obstacle.
export function addRuinedWorkshop(T,root,{width=9.8,depth=5,height=3.8,x=0,y=0,seed=0}={}){
 const structure=root.getObjectByName('building_structure');if(!structure)return root;
 const kit=vehicleKit(T),parts=root.userData.damageParts??={},detail=new T.Group();detail.name='inhabited_masonry_shell';structure.add(detail);
 const plaster=new T.MeshStandardMaterial({color:'#a89778',roughness:1}),stone=new T.MeshStandardMaterial({color:'#837560',roughness:1}),brick=new T.MeshStandardMaterial({color:'#876047',roughness:1});
 const rust=new T.MeshStandardMaterial({color:'#80523b',roughness:.96,metalness:.15}),tin=new T.MeshStandardMaterial({color:'#918b78',roughness:.94,metalness:.2});
 let id=112;
 const fragment=(name,material,build)=>{
  while(parts[id])id++;if(id>=128)throw Error('Ruined workshop damage-part budget');
  const group=new T.Group();group.name=name;detail.add(group);parts[id]={name,material,detachable:true,structural:true,strength:110};build(group);
  group.traverse(n=>{if(n.isMesh)n.geometry.setAttribute('damagePart',new T.Float32BufferAttribute(new Float32Array(n.geometry.attributes.position.count).fill(id),1));});
  batchRigidMeshes(T,group);id++;
 };
 fragment('old_rear_masonry','concrete',g=>{
  const count=10,w=width/count;
  for(let i=0;i<count;i++){
   const h=height+(.5+.5*Math.sin(i*1.7+seed))*.48-(i===3||i===7?.6:0),xx=x-width/2+(i+.5)*w;
   kit.box(g,[w+.015,.32,h],[xx,y+depth/2,h/2-.08],plaster);
   // Exposed courses on broken upper edges, kept sparse and low.
   kit.box(g,[w*.82,.36,.16],[xx,y+depth/2,h-.10],i%3?stone:brick);
   if(i%2===0)kit.box(g,[w*.65,.035,.13],[xx,y+depth/2+.18,.5+(i%3)*.48],brick);
  }
 });
 fragment('old_side_masonry','concrete',g=>{
  const side=seed%2?-1:1,xx=x+side*width/2;
  for(let i=0;i<6;i++){
   const h=height-(i<2?.6:.12)+(i%3)*.12,yy=y-depth/2+(i+.5)*depth/6;
   kit.box(g,[.30,depth/6+.02,h],[xx,yy,h/2-.08],i===1?stone:plaster);
   if(i%2)kit.box(g,[.34,depth/6*.74,.18],[xx,yy,h-.04],brick);
  }
 });
 fragment('broken_front_masonry','concrete',g=>{
  // Unequal surviving piers frame the existing workshop; the central loading
  // opening stays clear. Nothing projects into the yard or driveway.
  for(const side of [-1,1])for(let j=0;j<3;j++){
   const w=width*.085,xx=x+side*(width*.5-w*(j+.5)),h=height+.68-j*.42+(side>0?.16:0);
   kit.box(g,[w+.015,.34,h],[xx,y-depth/2,h/2-.08],plaster);
   kit.box(g,[w*.86,.38,.18],[xx,y-depth/2,h-.10],brick);
   for(let k=0;k<3;k++)kit.box(g,[w*.83,.045,.14],[xx,y-depth/2-.19,.58+k*.57+(j%2)*.14],k===1?brick:stone);
  }
 });
 fragment('bolted_repair_sheets','metal',g=>{
  for(let i=0;i<2;i++){
   const face=i?1:-1,xx=x+width*(i?-.25:.38),yy=y+face*(depth/2+.20),h=1.2+i*.4,z=1.35+i*.75;
   kit.box(g,[width*.21,.055,h],[xx,yy,z],i?tin:rust).rotation.y=i?.035:-.04;
   for(let j=0;j<5;j++)kit.box(g,[.04,.035,h],[xx-width*.10+j*width*.05,yy+face*.045,z],i?tin:rust);
   for(const side of [-1,1])for(const up of [-1,1])kit.cylinder(g,.045,.06,[xx+side*width*.085,yy+face*.09,z+up*(h/2-.1)],stone).rotation.x=Math.PI/2;
  }
 });
 detail.traverse(n=>{if(n.isMesh){n.userData.damageParts=parts;n.castShadow=n.receiveShadow=true;}});
 return root;
}
