import {mergeGeometries} from '../demo/vendor/utils/BufferGeometryUtils.js';

// This entire prefab is one ordinary, damageable bunker entity. Sandbags and
// steel sheets have damage-part IDs, but add no independent collision boxes.
export function createScavEmplacement(T){
 const root=new T.Group(),structure=new T.Group();structure.name='building_structure';root.add(structure);
 const materials=[new T.MeshStandardMaterial({color:'#9a825d',roughness:1}),new T.MeshStandardMaterial({color:'#75513c',roughness:.96}),new T.MeshStandardMaterial({color:'#34302a',roughness:.88})];
 const groups=[[],[],[]],parts={0:{name:'frame',material:'metal'},9:{name:'weapon',material:'equipment',detachable:true,strength:140}};
 function box(size,p,mat,part=0,angle=0){
  const g=new T.BoxGeometry(...size).toNonIndexed();g.rotateZ(angle);g.translate(...p);
  g.setAttribute('damagePart',new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(part),1));groups[mat].push(g);
 }
 for(let row=0;row<3;row++)for(let i=0;i<5;i++){
  const part=16+row*5+i;parts[part]={name:'sandbag_'+row+'_'+i,material:'concrete',detachable:true,strength:60};
  box([1.02,.7,.4],[-2.05+i*1.02+(row%2)*.15,-1.35,row*.38+.2],0,part,(i-2)*.035);
 }
 for(const side of [-1,1])for(let i=0;i<3;i++)box([.65,.92,.75],[side*2.25,-.62+i*.82,.4],0);
 for(const side of [-1,1])box([1.55,.12,1.05],[side*1.42,-1.72,.75],1,0,side*.1);
 box([.25,.25,1.7],[0,.02,.85],2);box([.5,1.1,.32],[0,-.25,1.73],2,9);
 box([.12,1.65,.12],[0,-1.3,1.76],2,9);
 const muzzle=new T.Object3D();muzzle.name='muzzle';muzzle.position.set(0,-2.15,1.76);root.add(muzzle);
 root.userData.damageParts=parts;
 groups.forEach((geometries,i)=>{const g=mergeGeometries(geometries),mesh=new T.Mesh(g,materials[i]);mesh.castShadow=mesh.receiveShadow=true;mesh.userData.damageParts=parts;structure.add(mesh);geometries.forEach(g=>g.dispose());});
 return root;
}
