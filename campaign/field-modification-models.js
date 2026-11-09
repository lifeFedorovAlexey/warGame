import {mergeGeometries} from '../demo/vendor/utils/BufferGeometryUtils.js';
import {FIELD_RECIPES} from './vehicle-salvage.js';
// Optional bolt-on parts in the existing B01 assembly coordinate system.
// Original vehicle geometry and materials are untouched.
export function createFieldModification(T,id){
  const root=new T.Group(),geometries=[],part=FIELD_RECIPES[id].part;
  function bar(a,b,r=.025){
    const start=new T.Vector3(...a),end=new T.Vector3(...b),delta=end.clone().sub(start),length=delta.length();
    const geometry=new T.CylinderGeometry(r,r,length,6,Math.max(1,Math.ceil(length/.18)));
    const rotation=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());
    geometry.applyMatrix4(new T.Matrix4().compose(start.add(end).multiplyScalar(.5),rotation,new T.Vector3(1,1,1)));geometries.push(geometry);
  }
  if(id==='hood-guard'){
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
  }else{
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
  const mesh=new T.Mesh(geometry,new T.MeshStandardMaterial({name:'field_guard',color:0x444836,metalness:.55,roughness:.74}));mesh.userData.installationPart=part;mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);root.name=id;
  return root;
}
