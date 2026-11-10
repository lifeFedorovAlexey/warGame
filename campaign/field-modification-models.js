import {mergeGeometries} from '../demo/vendor/utils/BufferGeometryUtils.js';
import {FIELD_RECIPES} from './field-modifications.js';
import {hoodGeometry} from './salvage-part-models.js';
import {batchRigidMeshes} from './field-vehicles.js';
// Optional bolt-on parts in the existing B01 assembly coordinate system.
// Original vehicle geometry and materials are untouched.
export function createFieldModification(T,id,{paintColor='#825a46'}={}){
  const root=new T.Group(),geometries=[],part=FIELD_RECIPES[id].part,materials=new Map();
  function bar(a,b,r=.025){
    const start=new T.Vector3(...a),end=new T.Vector3(...b),delta=end.clone().sub(start),length=delta.length();
    const geometry=new T.CylinderGeometry(r,r,length,6,Math.max(1,Math.ceil(length/.18)));
    const rotation=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());
    geometry.applyMatrix4(new T.Matrix4().compose(start.add(end).multiplyScalar(.5),rotation,new T.Vector3(1,1,1)));geometries.push(geometry);
  }
  function mesh(geometry,name,color){
    geometry.setAttribute('damagePart',new T.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count).fill(part),1));
    if(!materials.has(name))materials.set(name,new T.MeshStandardMaterial({name,color,metalness:name==='salvage_tyre'?.05:.4,roughness:name==='salvage_tyre'?.95:.78}));
    const node=new T.Mesh(geometry,materials.get(name));
    node.userData.installationPart=part;node.castShadow=node.receiveShadow=true;root.add(node);return node;
  }
  if(id.startsWith('side-hood-')){
    const side=id.endsWith('left')?-1:1,x=1.075,y=-.22,z=1.43;
    const panel=hoodGeometry(T);panel.rotateY(side*Math.PI/2);panel.translate(side*x,y,z);mesh(panel,'salvage_hood_paint',paintColor);
    for(const mountY of [y-.44,y+.44]){
      // Rails seat against the curved B01 side. Short spacers reach into the
      // pressed panel at the same height as the outer bolt heads.
      geometries.push(new T.BoxGeometry(.09,.10,.68).translate(side*.96,mountY,z));
      for(const mountZ of [z-.29,z+.29]){
        bar([side*.98,mountY,mountZ],[side*(x+.055),mountY,mountZ],.032);
        const bolt=new T.CylinderGeometry(.037,.037,.045,6).rotateZ(Math.PI/2).translate(side*(x+.075),mountY,mountZ);mesh(bolt,'salvage_bolt','#74776a');
      }
    }
  }else if(id==='spare-wheel'){
    const y=-2.58,z=1.48,r=.43;
    // Wheel axis points aft. The carrier sits clear of the rear doors and lamps.
    mesh(new T.TorusGeometry(.32,.11,8,20).rotateX(Math.PI/2).translate(0,y,z),'salvage_tyre','#272a24');
    mesh(new T.CylinderGeometry(.225,.225,.14,16).translate(0,y,z),'salvage_wheel_rim','#73766b');
    mesh(new T.CylinderGeometry(.075,.075,.20,10).translate(0,y,z),'salvage_wheel_hub','#383e32');
    for(let i=0;i<20;i++){const a=i*Math.PI/10,g=new T.BoxGeometry(.105,.23,.035);g.rotateY(-a);g.translate(Math.sin(a)*r,y,z+Math.cos(a)*r);mesh(g,'salvage_tyre','#272a24');}
    for(const x of [-.24,.24])bar([x,-2.20,1.05],[x,y+.12,z],.035);
    bar([-.24,y+.12,z],[.24,y+.12,z],.035);
  }else if(id==='hood-guard'){
    for(const x of [-.70,.70])bar([x,2.23,1.25],[x,2.23,1.88],.035);
    for(const z of [1.27,1.47,1.67,1.87])bar([-.70,2.23,z],[.70,2.23,z],.032);
    for(const x of [-.70,.70])bar([x,2.23,1.25],[x,2.04,1.13],.035);
  }else if(id==='tube-bumper'){
    // Cut from the 15 cm street-light tube; short brackets keep it off the body.
    for(const z of [.74,1.05])bar([-1.03,2.53,z],[1.03,2.53,z],.075);
    for(const x of [-.72,.72]){
      bar([x,2.53,.74],[x,2.53,1.05],.06);
      bar([x,2.53,.82],[x,2.12,.82],.06);
    }
  }else if(id==='window-grille'){
    // Twin sloping windscreen grilles: protection only where a ray hits a bar.
    const y=z=>2.15-(z-1.99)*.53;
    for(const sign of [-1,1]){
      const left=sign<0?-.85:.08,right=sign<0?-.08:.85;
      for(const z of [2.00,2.16,2.32])bar([left,y(z),z],[right,y(z),z]);
      for(let x=left;x<=right+.001;x+=(right-left)/4)bar([x,y(2.00),2.00],[x,y(2.32),2.32]);
    }
  }
  const geometry=mergeGeometries(geometries);for(const g of geometries)g.dispose();
  geometry.setAttribute('damagePart',new T.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count).fill(part),1));
  const guard=new T.Mesh(geometry,new T.MeshStandardMaterial({name:'field_guard',color:0x444836,metalness:.55,roughness:.74}));guard.userData.installationPart=part;guard.castShadow=guard.receiveShadow=true;root.add(guard);root.name=id;
  batchRigidMeshes(T,root);root.traverse(node=>{if(node.isMesh){node.userData.installationPart=part;node.castShadow=node.receiveShadow=true;}});
  return root;
}
