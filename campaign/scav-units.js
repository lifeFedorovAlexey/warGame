import {vehicleKit,batchRigidMeshes} from './field-vehicles.js';
import {hoodGeometry} from './salvage-part-models.js';
import {SCAV_PROFILES} from './scav-unit-profiles.js';

// Civilian silhouettes, salvaged plates and dull paint match the field assets.
export function createScavUnit(T,kind) {
  const kit=vehicleKit(T),{group,cylinder,rod,profile,mesh}=kit;
  const box=(parent,size,p,mat)=>{
    const b=Math.min(.045,...size.map(s=>s*.10));
    if(b<.018)return kit.box(parent,size,p,mat);
    const [x,y,z]=size,shape=new T.Shape().moveTo(-x/2+b,-y/2+b).lineTo(x/2-b,-y/2+b).lineTo(x/2-b,y/2-b).lineTo(-x/2+b,y/2-b).closePath();
    const geometry=new T.ExtrudeGeometry(shape,{depth:z-2*b,bevelEnabled:true,bevelSize:b,bevelThickness:b,bevelSegments:1,steps:1});
    geometry.translate(0,0,-z/2+b);return mesh(parent,geometry,mat,p);
  };
  const info=SCAV_PROFILES[kind],root=new T.Group(),wheels=[];
  root.name=kind;
  const material=(name,color,roughness=.88,metalness=.12)=>{
    const m=new T.MeshStandardMaterial({color,roughness,metalness,flatShading:true});m.name=name;return m;
  };
  const m={steel:material('scav_steel','#66665a'),rust:material('field_body_rust','#674939'),dark:material('scav_dark','#292c28'),
    rubber:material('scav_tyres','#242622',1,0),glass:material('scav_windows','#304144',.64,.1),cream:material('field_body_cream','#b8b39b'),
    paint:material('field_body_scav',kind==='scav-firetruck'?'#914c39':kind==='scav-bus'?'#b99b45':'#718d83'),
    lamp:material('scav_lamps','#d8c694',.58,.1),wood:material('scav_wood','#725137',1,0)};
  const tagged=(node,id)=>{node.geometry.setAttribute('damagePart',new T.Float32BufferAttribute(new Float32Array(node.geometry.attributes.position.count).fill(id),1));return node;};
  const patch=(size,p,rotation=0)=>{const n=box(root,size,p,m.rust);n.rotation.z=rotation;return n;};
  function wheel(x,y,front){
    const side=x<0?'L':'R',axle=front?1:2;
    const steer=group(root,[x,y,info.wheel],`axle_${axle}_${side}_steer`),spin=group(steer,[0,0,0],`axle_${axle}_${side}_wheel`);
    cylinder(spin,info.wheel,.24,[0,0,0],m.rubber,'X',12);
    cylinder(spin,info.wheel*.56,.255,[0,0,0],m.steel,'X',10);
    cylinder(spin,info.wheel*.19,.275,[0,0,0],m.dark,'X',8);
    for(let i=0;i<12;i++){
      const a=i*Math.PI/6,r=info.wheel-.027,tread=box(spin,[.25,.10,.045],[0,Math.sin(a)*r,Math.cos(a)*r],m.rubber);tread.rotation.x=-a;
    }
    for(let i=0;i<5;i++){
      const a=i*Math.PI*2/5;cylinder(spin,.023,.29,[0,Math.sin(a)*info.wheel*.32,Math.cos(a)*info.wheel*.32],m.dark,'X',6);
    }
    wheels.push({steer,wheel:spin,front,radius:info.wheel});
  }
  function windshield(width,y,z,height,slope=0){
    const pane=box(root,[width,.065,height],[0,y,z],m.glass);pane.rotation.x=slope;
    box(root,[.065,.10,height],[0,y+.05,z],m.cream);
    for(const side of [-1,1])rod(root,[side*width*.40,y+.09,z-height*.35],[side*width*.10,y+.09,z],.017,m.dark);
  }
  function lamps(width,y,z){
    for(const side of [-1,1]){
      cylinder(root,.13,.06,[side*width,y,z],m.dark,'Y',10);
      tagged(cylinder(root,.10,.07,[side*width,y+.035,z],m.lamp,'Y',10),side<0?5:6);
    }
  }
  function weapon(position,flame=false){
    const yaw=group(root,position,'scav_weapon_yaw');yaw.userData.damageDynamic=true;
    cylinder(yaw,.24,.12,[0,0,0],m.steel);
    const pitch=group(yaw,[0,0,.20],'scav_weapon_pitch'),recoil=group(pitch,[0,0,0],'scav_weapon_recoil');
    tagged(box(recoil,[.19,.42,.18],[0,.04,0],m.dark),9);
    tagged(cylinder(recoil,flame?.08:.038,flame?.94:.62,[0,.50,0],m.dark,'Y',8),9);
    if(flame){
      tagged(cylinder(recoil,.13,.13,[0,.99,0],m.rust,'Y',8),9);
      rod(yaw,[.15,-.05,.14],[.40,-.25,-.23],.045,m.rubber);
    }else tagged(box(recoil,[.15,.19,.27],[.17,-.02,-.09],m.rust),9);
    const muzzle=group(recoil,[0,flame?1.08:.84,0],'fx_muzzle');
    return {yaw,pitch,recoil,muzzle,origin:position};
  }
  let gun,limbs,figure,upper,supportArm,throwArm;
  if(info.infantry){
    const coat=material('scav_cloth',kind==='scav-grenadier'?'#75664b':'#62694c',1,0),pants=material('scav_trousers','#444942',1,0),skin=material('scav_skin','#a68b6a',1,0);
    figure=group(root,[0,0,0],'scav_figure');figure.userData.damageDynamic=true;
    limbs=[];
    for(const side of [-1,1]){
      const leg=group(figure,[side*.14,0,.88],'leg_'+side),knee=group(leg,[0,0,-.38],'knee_'+side);
      box(leg,[.20,.23,.40],[0,0,-.20],pants);
      box(knee,[.18,.19,.38],[0,0,-.18],pants);
      box(knee,[.21,.34,.14],[0,.07,-.40],m.dark);
      limbs.push({leg,knee,side});
    }
    box(figure,[.43,.29,.19],[0,0,.87],pants);
    upper=group(figure,[0,0,.94],'scav_torso');
    profile(upper,[[-.15,0],[.14,0],[.18,.43],[-.17,.43]],.48,coat);
    box(upper,[.45,.31,.07],[0,0,.04],m.dark);
    box(upper,[.37,.08,.32],[0,.18,.27],pants);
    box(upper,[.065,.065,.075],[0,.16,.65],skin);
    for(const side of [-1,1])box(upper,[.036,.018,.026],[side*.065,.151,.70],m.dark);
    for(const side of [-1,1])box(upper,[.12,.10,.22],[side*.17,.205,.15],m.wood);
    cylinder(upper,.075,.12,[0,0,.50],skin,'Z',7);
    mesh(upper,new T.SphereGeometry(.15,8,5),skin,[0,.015,.66]);
    if(kind==='scav-rifleman'){
      cylinder(upper,.16,.11,[0,0,.77],coat,'Z',8);
      box(upper,[.24,.12,.025],[0,.11,.75],coat);
      box(upper,[.24,.11,.10],[0,.085,.59],pants);
    }else{
      box(upper,[.29,.29,.10],[0,0,.76],m.dark);
      box(upper,[.34,.21,.39],[0,-.23,.25],coat);
      for(const side of [-1,1])cylinder(upper,.047,.11,[side*.12,.22,.04],m.dark,'Z',7);
    }
    const rifle=group(upper,kind==='scav-grenadier'?[0,-.30,.18]:[.10,.31,.27],'scav_rifle');
    if(kind==='scav-grenadier')rifle.rotation.x=.75;
    tagged(box(rifle,[.09,.31,.12],[0,.12,0],m.dark),9);
    tagged(box(rifle,[.10,.22,.10],[0,-.13,-.025],m.wood),9);
    tagged(box(rifle,[.09,.20,.09],[0,.34,0],m.wood),9);
    tagged(cylinder(rifle,.021,.38,[0,.56,.025],m.dark,'Y',6),9);
    const magazine=tagged(box(rifle,[.065,.10,.21],[0,.15,-.13],m.dark),9);magazine.rotation.x=-.22;
    tagged(box(rifle,[.025,.04,.07],[0,.64,.065],m.dark),9);
    const muzzle=group(rifle,[0,.77,.025],'fx_muzzle');
    supportArm=group(upper,[-.27,0,.40],'support_arm');
    rod(supportArm,[0,0,0],[-.03,.22,-.22],.082,coat);
    rod(supportArm,[-.03,.22,-.22],[.32,.56,-.14],.068,coat);
    mesh(supportArm,new T.SphereGeometry(.067,6,4),skin,[.32,.56,-.14]);
    throwArm=group(upper,[.27,0,.40],'throw_arm');
    rod(throwArm,[0,0,0],[.07,.13,-.23],.08,coat);
    rod(throwArm,[.07,.13,-.23],[-.08,.30,-.13],.064,coat);
    mesh(throwArm,new T.SphereGeometry(.067,6,4),skin,[-.08,.30,-.13]);
    if(kind==='scav-grenadier')mesh(throwArm,new T.IcosahedronGeometry(.06,0),m.dark,[-.08,.35,-.10]);
    gun={yaw:upper,pitch:rifle,recoil:rifle,muzzle,origin:[0,0,1.21],restPosition:rifle.position.clone(),restRotation:rifle.rotation.clone()};
  }else{
    for(const y of [info.front,info.rear])for(const side of [-1,1])wheel(side*info.track,y,y===info.front);
    const length=kind==='scav-zaporozhets'?3.72:7.30,width=kind==='scav-zaporozhets'?1.56:2.26;
    box(root,[width*.76,length,.19],[0,0,info.wheel+.17],m.dark);
    if(kind==='scav-zaporozhets'){
      profile(root,[[-1.86,.52],[1.86,.52],[1.86,.82],[-1.86,.80]],1.55,m.paint);
      box(root,[1.55,2.46,.14],[0,-.57,.89],m.paint);
      for(const x of [-.73,.73])box(root,[.10,1.12,.12],[x,1.27,.91],m.paint);
      tagged(kit.mesh(root,hoodGeometry(T,1.32,1.05),m.paint,[0,1.27,.96],'donor_hood'),30);
      profile(root,[[-1.10,.94],[.90,.94],[.52,1.42],[-.68,1.45]],1.39,m.cream);
      for(const side of [-1,1]){
        profile(root,[[-.95,1.02],[.75,1.02],[.45,1.35],[-.65,1.37]],.025,m.glass,side*.706);
        box(root,[.055,.055,.40],[side*.725,-.13,1.20],m.cream);
        for(let i=0;i<5;i++)box(root,[.035,.055,.19],[side*.79,-1.10-i*.105,.85],m.dark);
        patch([.03,.65,.26],[side*.80,.05,.83],.02*side);
      }
      windshield(1.18,.76,1.19,.32,.40);lamps(.53,1.87,.79);
      box(root,[1.7,.14,.13],[0,1.94,.48],m.steel);
      gun=weapon([0,-.37,1.49]);
    }else if(kind==='scav-firetruck'){
      // ZIL-style hood/cab, water tank, lockers, hose reels and roof ladder.
      profile(root,[[1.62,.78],[3.48,.78],[3.48,1.33],[1.62,1.33]],1.82,m.paint);
      for(const x of [-.86,.86])box(root,[.10,1.86,.18],[x,2.55,1.42],m.paint);
      tagged(kit.mesh(root,hoodGeometry(T,1.68,1.80),m.paint,[0,2.55,1.51],'donor_hood'),30);
      profile(root,[[.45,.88],[1.88,.88],[1.88,2.38],[1.55,2.57],[.45,2.57]],2.24,m.paint);
      windshield(1.90,1.91,2.10,.60);lamps(.68,3.51,1.22);
      box(root,[1.10,.08,.56],[0,3.50,1.17],m.dark);
      for(let x=-.47;x<=.48;x+=.14)box(root,[.035,.04,.48],[x,3.55,1.18],m.cream);
      box(root,[2.39,.18,.20],[0,3.66,.63],m.steel);
      box(root,[2.22,3.99,1.67],[0,-1.57,1.64],m.paint);
      for(const side of [-1,1]){
        box(root,[.035,1.03,.58],[side*1.132,1.14,2.12],m.glass);
        box(root,[.025,.025,1.32],[side*1.135,.57,1.57],m.dark);
        box(root,[.07,.22,.055],[side*1.15,.77,1.65],m.dark);
        box(root,[.32,1.12,.12],[side*1.11,1.06,.63],m.steel);
        rod(root,[side*1.08,1.79,2.2],[side*1.28,1.94,2.3],.024,m.steel);
        box(root,[.14,.06,.29],[side*1.28,1.94,2.3],m.steel);
        box(root,[.04,5.60,.22],[side*1.14,-.77,1.61],m.cream);
        for(const y of [-2.83,-1.60,-.37]){
          box(root,[.06,1.06,.77],[side*1.15,y,1.06],m.steel);
          for(const z of [.82,1.0,1.18,1.36])box(root,[.025,1.01,.025],[side*1.19,y,z],m.dark);
        }
        cylinder(root,.43,.16,[side*1.18,-1.65,2.09],m.dark,'X',12);
        cylinder(root,.30,.17,[side*1.18,-1.65,2.09],m.rust,'X',12);
        rod(root,[side*.62,-3.42,2.57],[side*.62,.44,2.57],.06,m.steel);
      }
      for(let y=-3.35;y<.5;y+=.39)rod(root,[-.62,y,2.57],[.62,y,2.57],.041,m.steel);
      cylinder(root,.13,.17,[-.73,1.0,2.68],m.cream,'Z',8);
      cylinder(root,.11,.17,[.73,1.0,2.68],m.paint,'Z',8);
      patch([1.05,.08,.54],[-.42,3.57,1.26],.07);
      box(root,[.48,.06,.18],[.19,3.57,.82],m.dark);
      for(const x of [-.86,.86]){
        box(root,[.12,.055,.19],[x,-3.61,1.04],m.rust);
        rod(root,[x,-3.64,1.42],[x,-3.64,2.23],.025,m.steel);
      }
      gun=weapon([.0,.16,2.83],true);
    }else{
      // Faded school bus: short hood, tall passenger body and a row of windows.
      profile(root,[[2.31,.85],[3.51,.85],[3.51,1.37],[3.34,1.50],[2.31,1.50]],1.98,m.paint);
      profile(root,[[-3.57,.68],[2.33,.68],[2.33,2.48],[2.08,2.83],[-3.35,2.83],[-3.57,2.56]],2.27,m.paint);
      windshield(1.94,2.35,2.13,.62);lamps(.73,3.53,1.18);
      box(root,[.85,.07,.45],[0,3.55,1.11],m.dark);
      box(root,[2.45,.17,.19],[0,3.69,.61],m.dark);
      box(root,[2.33,.16,.20],[0,-3.68,.63],m.steel);
      for(const side of [-1,1]){
        for(let y=-2.94;y<=1.66;y+=.76){
          box(root,[.045,.58,.60],[side*1.145,y,2.19],m.glass);
          rod(root,[side*1.18,y-.25,1.92],[side*1.18,y+.25,2.43],.026,m.rust);
        }
        for(const z of [1.28,1.50])box(root,[.04,5.78,.09],[side*1.16,-.57,z],m.dark);
        patch([.07,1.10,.44],[side*1.20,-2.58,1.08],side*.025);
        rod(root,[side*1.12,2.03,2.19],[side*1.31,2.30,2.26],.025,m.steel);
        box(root,[.13,.07,.29],[side*1.31,2.30,2.26],m.steel);
      }
      for(const y of [1.44,1.78]){
        box(root,[.04,.30,1.48],[1.19,y,1.47],m.dark);
        box(root,[.045,.23,.58],[1.215,y,1.92],m.glass);
        box(root,[.045,.23,.35],[1.215,y,1.22],m.paint);
      }
      box(root,[.28,.76,.12],[1.20,1.60,.57],m.steel);
      box(root,[.90,.06,1.64],[0,-3.60,1.58],m.cream);
      box(root,[.64,.075,.49],[0,-3.65,2.10],m.glass);
      box(root,[1.30,.09,.24],[0,2.39,2.60],m.cream);
      for(const x of [-.82,-.58,.58,.82])cylinder(root,.065,.06,[x,2.43,2.62],m.rust,'Y',8);
      patch([1.24,.82,.04],[.35,-1.48,2.89],.05);
      gun=weapon([0,-.42,2.92]);
    }
    for(const side of [-1,1])for(const y of [info.front,info.rear]){
      const outer=info.wheel+.14,inner=info.wheel+.045,points=[];
      for(let i=0;i<=10;i++){const a=i*Math.PI/10;points.push([y+Math.cos(a)*outer,info.wheel+Math.sin(a)*outer]);}
      for(let i=10;i>=0;i--){const a=i*Math.PI/10;points.push([y+Math.cos(a)*inner,info.wheel+Math.sin(a)*inner]);}
      profile(root,points,.13,m.paint,side*info.track);
      box(root,[.25,.08,.32],[side*info.track,y-info.wheel-.13,.32],m.rubber);
    }
  }
  batchRigidMeshes(T,root);
  root.traverse(n=>{if(n.isMesh)n.castShadow=n.receiveShadow=true;});
  return {root,wheels,gun,info,kind,scav:true,figure,upper,limbs,supportArm,throwArm};
}

export function poseScavUnit(model,unit,{aim,travel=0,steer=0,scale=4.5,age=Infinity,moving=false,suspension=()=>0}={}){
  const {root,info,gun}=model;
  const [x,y,z]=gun.origin;
  const yaw=aim?Math.atan2(x-aim[0],aim[1]-y):0;
  if(info.infantry){
    const dead=unit.hp<=0;
    moving=moving&&!dead;
    const step=travel/(.72*scale)*Math.PI;
    for(const {leg,knee,side} of model.limbs){leg.rotation.x=dead?(model.kind==='scav-grenadier'?-.26:-.13):moving?Math.sin(step)*.55*side:side*.05;knee.rotation.x=moving?Math.max(0,-Math.sin(step)*side)*.55:0;}
    model.figure.position.z=dead?(model.kind==='scav-grenadier'?.36:.25):moving?.025*Math.abs(Math.sin(step)):0;
    model.figure.rotation.x=dead?Math.PI/2:0;
    model.upper.rotation.z=dead?0:yaw;
    model.supportArm.rotation.x=dead?-1.2:0;
    model.throwArm.rotation.x=dead?-1.16:model.kind==='scav-grenadier'&&age<.6?-Math.sin(Math.min(1,age/.6)*Math.PI)*2.2:0;
    // Lower the rifle beside the fallen torso. Reset every transform for each
    // instance: living and dead soldiers share this animated prototype.
    if(dead){
      gun.pitch.position.set(.43,.13-model.figure.position.z,-.22);
      gun.pitch.rotation.set(Math.PI/2,0,.15);
    }else{
      gun.pitch.position.copy(gun.restPosition);
      gun.pitch.rotation.copy(gun.restRotation);
    }
  }else{
    for(const wheel of model.wheels){wheel.wheel.rotation.x=-travel/(wheel.radius*scale);wheel.steer.rotation.z=wheel.front?steer:0;wheel.steer.position.z=wheel.radius+suspension(wheel.steer.position.x,wheel.steer.position.y);}
    gun.yaw.rotation.z=yaw;
    gun.pitch.rotation.x=aim?Math.max(-.30,Math.min(.55,Math.atan2(aim[2]-z,Math.hypot(aim[0]-x,aim[1]-y)))):0;
    gun.recoil.position.y=age<.09?-.035*Math.sin(age/.09*Math.PI):0;
  }
  root.updateMatrixWorld(true);
}
