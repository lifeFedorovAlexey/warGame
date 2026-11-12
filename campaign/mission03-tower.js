import {createFlamerModule} from './flamer-module.js';
import {styleM02Workshop} from './mission02-workshop-style.js';
export function styleM03FlameTower(T,root,spec){
 styleM02Workshop(T,root,'scav-flame-tower',spec);
 const gun=root.getObjectByName('tower_kord');if(!gun)throw new Error('Missing tower weapon mount');
 const module=createFlamerModule(T),parent=gun.parent;parent.remove(gun);
 module.root.name='warehouse_flamethrower';module.root.position.copy(gun.position);module.root.rotation.copy(gun.rotation);module.root.scale.setScalar(2.7);module.muzzle.name='muzzle';
 module.root.traverse(node=>{if(!node.isMesh)return;node.geometry.setAttribute('damagePart',new T.Float32BufferAttribute(new Float32Array(node.geometry.attributes.position.count).fill(9),1));node.userData.damageParts=root.userData.damageParts;node.castShadow=node.receiveShadow=true;});
 parent.add(module.root);return root;
}
