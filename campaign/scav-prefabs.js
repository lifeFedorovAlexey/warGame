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
    tin: new T.MeshStandardMaterial({color:waterTower ? '#8aaca9' : site === 'nw-east' ? '#778985' : depot ? '#939c98' : stronghold ? '#77796a' : '#8b8476', roughness:.74, metalness:.46}),
    dark: new T.MeshStandardMaterial({color:stronghold ? '#282c29' : '#3a3630', roughness:.91, metalness:.24}),
    wood: new T.MeshStandardMaterial({color:stronghold ? '#716c58' : '#79634d', roughness:1}),
    tarp: new T.MeshStandardMaterial({color:stronghold ? '#5c6153' : '#796447', roughness:1}),
  };
  const batches = new Map(), surfaces = [[structure,batches]];
  let activeBatches = batches;
  function shape(geometry, material, position, rotation = [0,0,0]) {
    const object = new T.Object3D();
    object.position.set(...position);
    object.rotation.set(...rotation);
    object.updateMatrix();
    geometry.applyMatrix4(object.matrix);
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    if (!activeBatches.has(material)) activeBatches.set(material, []);
    activeBatches.get(material).push(flat);
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
  function pipe(points, radius, material) {
    for (let i=1;i<points.length;i++) {
      const a=new T.Vector3(...points[i-1]),b=new T.Vector3(...points[i]),axis=b.clone().sub(a);
      const geometry=new T.CylinderGeometry(radius,radius,axis.length(),8);
      geometry.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),axis.normalize()));
      shape(geometry,material,a.lerp(b,.5).toArray());
      if(i<points.length-1)shape(new T.SphereGeometry(radius,8,4),material,points[i]);
    }
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
      if (stronghold) box([.76,.76,.28], [x,y,-.08], mats.wood);
      if (waterTower) box([.71,.71,.60], [x,y,-.19], mats.dark);
    }
    box([3.75,3.75,.24],[0,0,9.15],mats.wood);
    const yaw = new T.Group();
    yaw.name = 'tower_yaw';
    structure.add(yaw);
    const mountBatches = new Map();
    surfaces.push([yaw,mountBatches]);
    if (waterTower) {
      drum(1.46,.21,[0,.39,9.38],mats.dark,12);
      drum(1.59,2.14,[0,.39,10.53],mats.tin,12);
      for(const z of [9.62,11.38])drum(1.63,.12,[0,.39,z],mats.rust,12);
      drum(1.64,.54,[0,.39,11.9],mats.tin,12,.34);
      pipe([[1.10,-.49,9.57],[1.48,-.81,9.57],[1.48,-.81,.40],[1.95,-.29,.40],[1.95,-.29,-.22]],.12,mats.dark);
      box([.74,.72,.45],[1.95,-.29,-.13],mats.dark);
      drum(.20,.095,[1.95,-.29,.135],mats.rust,8);
      for(const z of [2.4,5.5,8.2])box([.34,.15,.13],[1.48,-.81,z],mats.tin);
      for(const x of [-.44,.44])box([.38,.15,.61],[x,-1.56,10.62],mats.dark);
      drum(.80,.19,[0,0,12.19],mats.rust,12);
      activeBatches = mountBatches;
      drum(.40,.20,[0,0,12.38],mats.dark,12);
      box([.54,1.88,.19],[0,-.71,12.52],mats.rust);
      drum(.29,.33,[0,-1.52,12.72],mats.dark,10);
      for (const x of [-.28,.28]) box([.12,.42,.48],[x,-1.52,12.98],mats.dark);
    } else {
      activeBatches = mountBatches;
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
    const pitch = new T.Group(), recoil = new T.Group(), muzzle = new T.Object3D();
    pitch.name = 'tower_pitch';
    pitch.position.set(0,waterTower?-1.52:-1.41,waterTower?13.16:10.80);
    recoil.name = 'tower_recoil';
    muzzle.name = 'muzzle';
    const barrelLength=waterTower?1.25:1.49;
    muzzle.position.y = -barrelLength;
    yaw.add(pitch);pitch.add(recoil);recoil.add(muzzle);
    activeBatches = new Map();
    surfaces.push([recoil,activeBatches]);
    box([.42,.66,.34],[0,0,-.02],mats.dark);
    beam([0,-.14,0],[0,-barrelLength,0],.095,mats.dark);
    activeBatches = batches;
  } else if (site === 'nw-pocket') {
    shed(-2.6,.40,4.2,4.3,2.65,mats.rust);
    box([1.47,1.26,.09],[-3.32,-.81,2.90],mats.tin,[.23,0,0]);
    for (const x of [-3.78,-3.31,-2.84])
      box([.061,1.25,.05],[x,-.81,2.96],mats.dark,[.23,0,0]);

    // Open repair bay made of salvaged panels, with enough space to read the
    // workbench and the spare wheels from the tactical camera.
    const deckTop = 1.14;
    box([4.52,4.04,.22],[2.77,-.14,deckTop-.11],mats.wood);
    for (const x of [.62,4.91]) {
      beam([x,-2.17,0],[x,-2.17,2.72],.17,mats.wood);
      beam([x,2.05,-.28],[x,2.05,3.14],.19,mats.dark);
      beam([x,-2.17,2.65],[x,2.05,3.07],.17,mats.wood);
      beam([x,-2.02,.67],[x,1.98,.67],.18,mats.dark);
    }
    beam([.62,-2.17,2.66],[4.91,-2.17,2.66],.16,mats.dark);
    beam([.62,2.05,3.07],[4.91,2.05,3.07],.16,mats.dark);
    beam([4.91,-2.17,deckTop],[4.91,2.05,2.95],.13,mats.wood);
    const panels = [[1.30,1.70,2.95,mats.tin],[2.84,1.57,2.98,mats.rust],[4.36,1.53,2.93,mats.tin]];
    for (const [x,width,z,material] of panels) {
      box([width,4.60,.11],[x,-.02,z],material,[.10,0,0]);
      for (const offset of [-.42,.05,.48])
        box([.064,4.58,.041],[x+offset,-.02,z+.07],material,[.10,0,0]);
      box([width-.10,.13,1.38],[x,2.02,deckTop+.69],material);
    }
    const benchY=-2.82,benchTop=1.79;
    box([2.08,.74,.14],[1.97,benchY,benchTop-.07],mats.wood);
    for (const [x,foot] of [[1.14,.54],[2.80,.81]])
      for (const y of [benchY-.23,benchY+.23]) beam([x,y,foot],[x,y,benchTop-.14],.14,mats.dark);
    box([.51,.43,.21],[1.50,benchY,benchTop+.105],mats.rust);
    box([.42,.37,.17],[2.65,benchY,benchTop+.085],mats.dark);
    for (const x of [2.52,2.79]) box([.09,.34,.14],[x,benchY,benchTop+.21],mats.tin);
    for (const [x,y,z] of [[4.30,-1.87,deckTop+.47],[4.48,-2.37,1.52]])
      shape(new T.TorusGeometry(.34,.13,6,12),mats.dark,[x,y,z],[Math.PI/2,0,.08]);
    for (const side of [-1,1]) {
      const x=side*3.55;
      // The apron slopes across the entrance; seat the barriers in the bank.
      const foot=side<0?.13:1.37,slope=side<0?.12:.21;
      box([3.75,.58,.50],[x,-4.21,foot+.25],mats.dark,[0,-slope,0]);
      box([3.69,.17,.77],[x,-4.30,foot+.73],side<0?mats.rust:mats.tin,[.13,-slope,0]);
      for (const offset of [-1.64,1.64])
        box([.16,.23,1.23],[x+offset,-4.16,foot+.615+offset*Math.tan(slope)],mats.wood);
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
    box([5.85,4.25,.52],[1.31,.27,-.10],mats.dark);
    box([5.65,.15,2.3],[1.31,2.32,1.27],mats.rust);
    box([.15,4.1,2.33],[4.13,.27,1.29],mats.tin);
    box([.15,4.1,2.33],[-1.52,.27,1.29],mats.tarp);
    box([2.64,.16,2.35],[2.80,-1.82,1.3],mats.rust);
    box([2.48,.08,.79],[2.81,-1.92,1.74],mats.tin);
    for (const x of [-1.49,1.47,4.11]) box([.17,.19,2.78],[x,-1.85,1.49],mats.dark);
    box([5.82,.18,.19],[1.30,-1.87,2.72],mats.dark);
    box([2.74,.09,.35],[-.01,-1.95,2.47],mats.tin);
    for (const x of [1.68,2.18,2.68,3.18,3.68,4.04]) box([.058,.045,2.25],[x,-1.93,1.28],mats.dark);
    beam([4.22,-1.75,.28],[4.22,2.17,2.24],.10,mats.dark);

    const roofSlope=-.13;
    for (const [side,x,width,z,material] of [['front',-.43,2.71,2.66,mats.tin],['back',2.46,3.14,2.61,mats.rust]]) {
      box([width,4.72,.12],[x,.24,z],material,[roofSlope,0,0]);
      for(let rib=x-width/2+.20;rib<x+width/2-.1;rib+=.54)box([.066,4.70,.047],[rib,.24,z+.075],material,[roofSlope,0,0]);
      if(side==='back')box([1.25,1.44,.04],[2.55,-.70,2.82],mats.tarp,[roofSlope,0,-.05]);
    }

    // The open bay exposes the motor and the pipe that feeds the salvaged tank.
    box([2.35,1.26,.17],[-.17,-.91,.25],mats.rust);
    pipe([[-1.08,-.99,.68],[.82,-.99,.68]],.39,mats.dark);
    for(const x of [-.80,-.49,-.18])pipe([[x,-.99,.68],[x+.085,-.99,.68]],.43,mats.tin);
    pipe([[.53,-.99,.81],[.53,-.99,1.49],[.53,.07,1.49],[-2.18,.07,1.49],[-2.18,-.57,1.49],[-3.72,-.57,1.49]],.13,mats.dark);
    box([.32,.23,.44],[.74,-1.58,.67],mats.tin);
    for(const y of [-.28,1.03])box([1.27,.28,.60],[-3.74,y,.045],mats.dark);
    pipe([[-3.74,-.94,.87],[-3.74,1.66,.87]],.65,mats.tin);
    for(const y of [-.28,1.03])pipe([[-3.74,y,.87],[-3.74,y+.12,.87]],.68,mats.rust);
    pipe([[-3.74,-.57,1.46],[-3.74,-.57,1.68]],.26,mats.rust);
    pipe([[-3.74,-.91,.76],[-3.74,-1.7,.76],[-5.13,-2.57,.76],[-5.13,-2.57,-.39]],.18,mats.rust);
    box([.74,.72,.54],[-5.13,-2.57,-.25],mats.dark);
    drum(.26,.09,[-5.13,-2.57,.07],mats.rust,8);
    box([.58,.41,.55],[-4.43,-2.13,-.12],mats.dark);
    beam([-4.43,-2.13,.13],[-4.43,-2.13,.73],.15,mats.dark);
    drum(.34,.91,[3.53,-2.77,.24],mats.rust);
    drum(.355,.07,[3.53,-2.77,.35],mats.dark);
  } else {
    box([11.1,7.2,.60],[0,0,.12],mats.wood);
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
  if (kind !== 'mg-tower' && site !== 'nw-east') {
    for (const [x,y] of [[-4.45,-2.6],[-3.5,-3.2],[3.85,-2.7],[4.65,-2.55]]) {
      drum(.37,.96,[x,y,.48],mats.rust);
      for (const z of [.26,.7]) drum(.382,.055,[x,y,z],mats.dark);
    }
    box([.82,.10,.58],[4.5,-3.15,1.53],mats.rust,[0,0,.12]);
    beam([4.5,-3.15,0],[4.5,-3.15,1.8],.13,mats.dark);
  }
  for (const [parent,grouped] of surfaces) for (const [mat, geometries] of grouped) {
    const geometry = mergeGeometries(geometries);
    const mesh = new T.Mesh(geometry, mat);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    for (const item of geometries) item.dispose();
  }
  return root;
}
