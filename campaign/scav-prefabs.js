import {mergeGeometries} from '../demo/vendor/utils/BufferGeometryUtils.js';

export function createScavPrefab(T, kind, site) {
  const root = new T.Group();
  root.name = 'scavs_' + kind + '_' + site;
  const structure = new T.Group();
  structure.name = 'building_structure';
  root.add(structure);
  const mats = {
    rust: new T.MeshStandardMaterial({color:'#795145', roughness:.87, metalness:.25}),
    tin: new T.MeshStandardMaterial({color:'#8b8476', roughness:.74, metalness:.46}),
    dark: new T.MeshStandardMaterial({color:'#3a3630', roughness:.91, metalness:.24}),
    wood: new T.MeshStandardMaterial({color:'#79634d', roughness:1}),
    tarp: new T.MeshStandardMaterial({color:'#796447', roughness:1}),
  };
  const batches = new Map();
  function shape(geometry, material, position, rotation = [0,0,0]) {
    const object = new T.Object3D();
    object.position.set(...position);
    object.rotation.set(...rotation);
    object.updateMatrix();
    geometry.applyMatrix4(object.matrix);
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    if (!batches.has(material)) batches.set(material, []);
    batches.get(material).push(flat);
  }
  const box = (size, position, mat, rotation) => shape(new T.BoxGeometry(...size), mat, position, rotation);
  const drum = (radius, height, position, mat, segments = 9) => {
    const geometry = new T.CylinderGeometry(radius, radius, height, segments);
    geometry.rotateX(Math.PI/2);
    shape(geometry, mat, position);
  };
  function beam(from, to, width, mat) {
    const a = new T.Vector3(...from), b = new T.Vector3(...to), d = b.clone().sub(a);
    const g = new T.BoxGeometry(width, width, d.length());
    g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,1), d.normalize()));
    shape(g, mat, a.add(b).multiplyScalar(.5).toArray());
  }
  function shed(x, y, width, depth, height, mat) {
    box([width, depth, height], [x,y,height/2], mat);
    box([width*.32,.09,height*.76], [x-width*.19,y-depth/2-.04,height*.38], mats.dark);
    const slope = .23;
    box([width+.30, depth/2+.22, .12], [x,y-depth/4,height+.17], mats.tin, [slope,0,0]);
    box([width+.30, depth/2+.22, .12], [x,y+depth/4,height+.17], mats.rust, [-slope,0,0]);
    for (let i=0; i<Math.ceil(width*3); i++) {
      const u = x - width/2 + (i+.5)*width/Math.ceil(width*3);
      box([.075,.08,height*.95], [u,y-depth/2-.025,height*.5], i%4 === 0 ? mats.tin : mat);
    }
  }
  if (kind === 'mg-tower') {
    for (const x of [-2.2,2.2]) for (const y of [-2.2,2.2]) {
      beam([x,y,0], [x*.63,y*.63,9.15], .23, mats.rust);
      beam([x,y,1.25], [-x*.72,y*.73,7.9], .14, mats.dark);
    }
    box([3.75,3.75,.24],[0,0,9.15],mats.wood);
    if (site === 'nw-east') {
      drum(1.67,1.45,[0,.28,10],mats.tin,12);
      drum(1.75,.18,[0,.28,10.82],mats.rust,12);
    } else {
      box([3.28,.20,1.02],[0,-1.55,9.82],mats.rust);
      box([3.28,3.1,.12],[0,.08,11.03],mats.tarp,[.08,0,0]);
      for (const x of [-1.48,1.48]) beam([x,1.38,9.22],[x,1.38,11.02],.16,mats.wood);
    }
    box([.42,.66,.34],[0,-1.41,10.78],mats.dark);
    beam([0,-1.55,10.80],[0,-2.9,10.80],.095,mats.dark);
    const muzzle = new T.Object3D();
    muzzle.name = 'muzzle';
    muzzle.position.set(0,-2.9,10.80);
    root.add(muzzle);
  } else if (site === 'nw-pocket') {
    shed(-2.6,.40,4.2,4.3,2.65,mats.rust);
    shed(3.25,1.55,3.1,2.45,1.95,mats.wood);
    box([4.25,2.4,.08],[2.1,-1.25,2.18],mats.tarp,[.12,0,-.12]);
    for (const x of [.22,4.1]) beam([x,-2.5,0],[x,-2.5,2.05],.14,mats.wood);
    for (const side of [-1,1]) {
      const x=side*3.55;
      box([3.75,.58,.50],[x,-4.21,.25],mats.dark);
      box([3.69,.17,.77],[x,-4.30,.73],side<0?mats.rust:mats.tin,[.13,0,0]);
      for (const offset of [-1.64,1.64]) box([.16,.23,1.23],[x+offset,-4.16,.615],mats.wood);
    }
  } else if (site === 'nw-west') {
    shed(0,1.1,9.9,4.1,3.05,mats.tin);
    for (const x of [-4.15,-2.5,.2,2.1,3.75]) box([1.04,.9,.78],[x,-2.45,.39],mats.wood,[0,0,x*.08]);
    box([4.2,1.9,.11],[1,-1.55,2.55],mats.rust,[.15,0,0]);
  } else if (site === 'nw-east') {
    shed(1.25,.8,6,4.4,2.65,mats.tin);
    for (const x of [-4.8,-3.65]) drum(.5,1.6,[x,1.45,.8],mats.rust);
    beam([-4.15,1.45,1.65],[.2,1.45,1.65],.19,mats.dark);
  } else {
    shed(-1.55,1.12,7.9,4.4,4.05,mats.rust);
    shed(3.5,-.68,3.7,4.15,2.85,mats.dark);
    box([9.5,.24,.8],[-.5,-3.2,.4],mats.tin);
    for (const x of [-4.5,0,4.5]) beam([x,-3.22,0],[x,-3.22,1.2],.22,mats.wood);
  }
  if (kind !== 'mg-tower') {
    for (const [x,y] of [[-4.45,-2.6],[-3.5,-3.2],[3.85,-2.7],[4.65,-2.55]]) {
      drum(.37,.96,[x,y,.48],mats.rust);
      for (const z of [.26,.7]) drum(.382,.055,[x,y,z],mats.dark);
    }
    box([.82,.10,.58],[4.5,-3.15,1.53],mats.rust,[0,0,.12]);
    beam([4.5,-3.15,0],[4.5,-3.15,1.8],.13,mats.dark);
  }
  for (const [mat, geometries] of batches) {
    const geometry = mergeGeometries(geometries);
    const mesh = new T.Mesh(geometry, mat);
    mesh.castShadow = mesh.receiveShadow = true;
    structure.add(mesh);
    for (const item of geometries) item.dispose();
  }
  return root;
}
