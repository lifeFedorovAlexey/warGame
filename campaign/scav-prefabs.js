import {mergeGeometries} from '../demo/vendor/utils/BufferGeometryUtils.js';

export function createScavPrefab(T, kind, site) {
  const root = new T.Group();
  root.name = 'scavs_' + kind + '_' + site;
  const structure = new T.Group();
  structure.name = 'building_structure';
  root.add(structure);
  const depot = site === 'nw-west';
  const waterTower = kind === 'mg-tower' && site === 'nw-east';
  const stronghold = site === 'west-south';
  const mats = {
    rust: new T.MeshStandardMaterial({color:stronghold ? '#51443b' : depot ? '#685a4e' : '#795145', roughness:.87, metalness:.25}),
    tin: new T.MeshStandardMaterial({color:waterTower ? '#8aaca9' : depot ? '#939c98' : stronghold ? '#77796a' : '#8b8476', roughness:.74, metalness:.46}),
    dark: new T.MeshStandardMaterial({color:stronghold ? '#282c29' : '#3a3630', roughness:.91, metalness:.24}),
    wood: new T.MeshStandardMaterial({color:stronghold ? '#716c58' : '#79634d', roughness:1}),
    tarp: new T.MeshStandardMaterial({color:stronghold ? '#5c6153' : '#796447', roughness:1}),
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
  const drum = (radius, height, position, mat, segments = 9, topRadius = radius) => {
    const geometry = new T.CylinderGeometry(topRadius, radius, height, segments);
    geometry.rotateX(Math.PI/2);
    shape(geometry, mat, position);
  };
  function beam(from, to, width, mat) {
    const a = new T.Vector3(...from), b = new T.Vector3(...to), d = b.clone().sub(a);
    const g = new T.BoxGeometry(width, width, d.length());
    g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,1), d.normalize()));
    shape(g, mat, a.add(b).multiplyScalar(.5).toArray());
  }
  function shed(x, y, width, depth, height, mat, loadingBay = false) {
    box([width, depth, height], [x,y,height/2], mat);
    const door = loadingBay ? x : x-width*.19;
    box([width*(loadingBay ? .56 : .32),.09,height*.76], [door,y-depth/2-.04,height*.38], mats.dark);
    const slope = .23;
    box([width+.30, depth/2+.22, .12], [x,y-depth/4,height+.17], mats.tin, [slope,0,0]);
    box([width+.30, depth/2+.22, .12], [x,y+depth/4,height+.17], mats.rust, [-slope,0,0]);
    for (let i=0; i<Math.ceil(width*3); i++) {
      const u = x - width/2 + (i+.5)*width/Math.ceil(width*3);
      if (loadingBay && Math.abs(u-door)<width*.28) continue;
      box([.075,.08,height*.95], [u,y-depth/2-.025,height*.5], i%4 === 0 ? mats.tin : mat);
    }
  }
  if (kind === 'mg-tower') {
    for (const x of [-2.2,2.2]) for (const y of [-2.2,2.2]) {
      beam([x,y,0], [x*.63,y*.63,9.15], .23, mats.rust);
      beam([x,y,1.25], [-x*.72,y*.73,7.9], .14, mats.dark);
    }
    box([3.75,3.75,.24],[0,0,9.15],mats.wood);
    if (waterTower) {
      drum(1.46,.21,[0,.39,9.38],mats.dark,12);
      drum(1.59,2.14,[0,.39,10.53],mats.tin,12);
      for(const z of [9.62,11.38])drum(1.63,.12,[0,.39,z],mats.rust,12);
      drum(1.64,.54,[0,.39,11.9],mats.tin,12,.34);
      drum(.23,.16,[0,.39,12.24],mats.rust,9);
      drum(.105,8.95,[1.48,-.81,4.72],mats.dark,8);
      beam([1.1,-.49,9.57],[1.48,-.81,9.21],.2,mats.dark);
      for(const z of [2.4,5.5,8.2])box([.34,.15,.13],[1.48,-.81,z],mats.tin);
      for(const x of [-.44,.44])box([.38,.15,.61],[x,-1.56,10.62],mats.dark);
    } else {
      box([3.28,.20,1.02],[0,-1.55,9.82],mats.rust);
      box([3.28,3.1,.12],[0,.08,11.03],mats.tarp,[.08,0,0]);
      for (const x of [-1.48,1.48]) beam([x,1.38,9.22],[x,1.38,11.02],.16,mats.wood);
      if(stronghold){
        for(const side of [-1,1]){
          box([1.26,.23,.67],[side*.92,-1.59,10.52],mats.dark,[.12,0,side*.11]);
          box([.21,2.25,.79],[side*1.57,-.18,9.96],mats.rust);
        }
      }
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
    // A salvaged sidewall leans behind the barricade with its broken frame visible.
    box([2.72,.17,1.69],[-2.98,-3.12,1.02],mats.tin,[.18,0,.19]);
    beam([-4.28,-3.38,.24],[-4.28,-3.66,2.14],.19,mats.dark);
    beam([-1.65,-2.87,.22],[-1.65,-3.15,1.89],.18,mats.dark);
    for(const z of [.58,1.21])beam([-4.22,-3.40,z],[-1.74,-2.93,z],.11,mats.rust);
  } else if (site === 'nw-west') {
    shed(0,1.1,9.9,4.1,3.05,mats.tin,true);
    box([8.9,1.55,.53],[0,-1.72,.265],mats.wood);
    box([3.4,1.65,.19],[0,-3.14,.25],mats.rust,[.29,0,0]);
    box([6.04,1.81,.15],[0,-1.65,2.6],mats.rust,[.14,0,0]);
    for(const x of [-2.77,2.77])box([.17,.22,2.2],[x,-1.1,1.38],mats.tin);
    for(const z of [.67,1.15,1.62,2.1])box([5.34,.10,.06],[0,-1.05,z],mats.rust);
    for(const [x,y,layers] of [[-3.63,-1.61,2],[3.54,-1.64,1],[4.47,-2.66,1]]){
      const floor=y > -2.4 ? .53 : 0;
      for(let level=0;level<layers;level++){
        const z=floor+.39+level*.75;
        box([1.15,.94,.75],[x,y,z],mats.wood);
        for(const offset of [-.33,.33])box([.09,.03,.73],[x+offset,y-.48,z],mats.dark);
      }
    }
  } else if (site === 'nw-east') {
    shed(1.25,.8,6,4.4,2.65,mats.tin);
    for (const x of [-4.8,-3.65]) drum(.5,1.6,[x,1.45,.8],mats.rust);
    beam([-4.15,1.45,1.65],[.2,1.45,1.65],.19,mats.dark);
  } else {
    box([11.1,7.2,.42],[0,0,.21],mats.wood);
    box([3.32,4.75,2.91],[-3.64,.85,1.66],mats.rust);
    box([4.44,4.75,2.91],[2.85,.85,1.66],mats.rust);
    box([2.63,2.95,2.91],[-.66,1.73,1.66],mats.rust);
    box([1.86,.15,2.23],[-.66,.21,1.53],mats.dark);
    box([10.75,5.45,.47],[-.14,.79,3.29],mats.tin);
    box([3.1,2.05,.69],[2.87,1.48,3.78],mats.dark);
    box([2.89,1.88,.16],[2.87,1.48,4.19],mats.tin);
    box([2.7,2.25,.34],[-.66,-1.51,2.71],mats.dark);
    for(const [side,x] of [[-1,-3.75],[1,3.06]]){
      box([3.78,.56,1.28],[x,-3.16,.89],mats.dark,[.16,0,side*.17]);
      box([.53,1.41,1.54],[x-side*1.48,-2.45,.98],mats.tin,[0,0,side*.24]);
      box([.84,.19,1.65],[x+side*1.2,-1.68,1.12],mats.tin,[.13,0,0]);
    }
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
