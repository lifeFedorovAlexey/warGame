import {mergeGeometries} from '../demo/vendor/utils/BufferGeometryUtils.js';
import {hoodGeometry,tagSalvagePart} from './salvage-part-models.js';

const commandMountHeight = 1.05;
const commandPads = [['FL',-.65,1.45],['FR',.65,1.45],['RL',-.65,-1.45],['RR',.65,-1.45]];
const commandRadioMount = [-.72,-1.76,1.12];

export function vehicleKit(T) {
  function group(parent,position=[0,0,0],name='') {
    const node = new T.Group();
    node.name=name;
    node.position.set(...position);
    parent.add(node);
    return node;
  }
  function mesh(parent,geometry,material,position=[0,0,0],name='') {
    const node = new T.Mesh(geometry,material);
    node.name=name;
    node.position.set(...position);
    parent.add(node);
    return node;
  }
  const box=(parent,size,p,mat)=>mesh(parent,new T.BoxGeometry(...size),mat,p);
  function cylinder(parent,r,length,p,mat,axis='Z',segments=12) {
    const g=new T.CylinderGeometry(r,r,length,segments);
    if(axis==='Z')g.rotateX(Math.PI/2);
    if(axis==='X')g.rotateZ(Math.PI/2);
    return mesh(parent,g,mat,p);
  }
  function rod(parent,a,b,r,mat) {
    const start=new T.Vector3(...a),end=new T.Vector3(...b),d=end.clone().sub(start);
    const item=cylinder(parent,r,d.length(),start.add(end).multiplyScalar(.5).toArray(),mat,'Y',7);
    item.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());
    return item;
  }
  function profile(parent,points,width,mat,x=0) {
    const shape=new T.Shape();
    points.forEach(([y,z],i)=>i?shape.lineTo(y,z):shape.moveTo(y,z));
    shape.closePath();
    const geo=new T.ExtrudeGeometry(shape,{depth:width,bevelEnabled:false,curveSegments:4,steps:1});
    geo.applyMatrix4(new T.Matrix4().set(0,0,1,x-width/2,1,0,0,0,0,1,0,0,0,0,0,1));
    return mesh(parent,geo,mat);
  }
  return {group,mesh,box,cylinder,rod,profile};
}

export function batchRigidMeshes(T, root) {
  const groups=new Map();
  for(const child of [...root.children]) {
    if(!child.isMesh){batchRigidMeshes(T,child);continue;}
    if(!groups.has(child.material))groups.set(child.material,[]);
    groups.get(child.material).push(child);
  }
  for(const [material,meshes] of groups){
    if(meshes.length===1)continue;
    const tagged=meshes.some(mesh=>mesh.geometry.attributes.damagePart);
    const flat=meshes.map(mesh=>{
      mesh.updateMatrix();
      const geometry=(mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone()).applyMatrix4(mesh.matrix);
      if(tagged&&!geometry.attributes.damagePart)geometry.setAttribute('damagePart',new T.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count),1));
      return geometry;
    });
    root.add(new T.Mesh(mergeGeometries(flat),material));
    for(const geo of flat)geo.dispose();
    for(const mesh of meshes){mesh.geometry.dispose();mesh.removeFromParent();}
  }
}

function commandFrame(chassis, kit, dark, steel) {
  const {box,group,profile}=kit;
  chassis.userData={id:'C-CMD',size:'S',role:'command-running-gear'};
  group(chassis,[0,0,commandMountHeight],'body_mount');
  for(const x of [-.40,.40]) {
    box(chassis,[.14,3.64,.24],[x,-.02,.70],dark);
    for(const y of [-1.29,1.21]) {
      profile(chassis,[[y-.32,.62],[y-.21,.54],[y,.489],[y+.21,.54],[y+.32,.62],[y+.28,.655],[y,.544],[y-.28,.655]],.10,steel,x);
    }
  }
  box(chassis,[.78,1.13,.20],[0,-.12,.69],dark);
  for(const y of [-1.45,1.45]) {
    box(chassis,[1.48,.205,.09],[0,y,.925],steel);
    for(const x of [-.40,.40]) box(chassis,[.16,.18,.11],[x,y,.841],dark);
  }
  for(const [name,x,y] of commandPads) {
    box(chassis,[.155,.155,.045],[x,y,.9825],dark);
    box(chassis,[.18,.18,.05],[x,y,1.025],steel);
    const pad=group(chassis,[x,y,commandMountHeight],'pad_'+name);
    pad.userData.contactSizeMetres=[.18,.18];
  }
}

function commandRadio(T, root, body, kit, dark, rubber, steel) {
  const {box,cylinder,group,mesh,rod}=kit;
  const socket=group(body,commandRadioMount,'radio_mount');
  socket.userData={interface:'CMD-RF-100',footDiameterMetres:.10};
  // The bottom of the body-side collar follows the two roof panels.
  const collar=new T.CylinderGeometry(.057,.057,1,24);
  collar.rotateX(Math.PI/2);
  const vertices=collar.getAttribute('position');
  for(let i=0;i<vertices.count;i++) {
    if(vertices.getZ(i)>0) vertices.setZ(i,0);
    else {
      const y=commandRadioMount[1]+vertices.getY(i);
      const roofZ=y<=-1.72?1.95+(y+1.98)*.17/.26:2.12+(y+1.72)*.01/1.07;
      vertices.setZ(i,roofZ-commandMountHeight-commandRadioMount[2]-.004);
    }
  }
  collar.computeVertexNormals();
  mesh(body,collar,steel,commandRadioMount,'radio_socket_seat');
  const radio=group(root,body.position.clone().add(socket.position).toArray(),'R-CMD');
  radio.userData={id:'R-CMD',role:'command-radio',interface:'CMD-RF-100'};
  group(radio,[0,0,0],'mount');
  cylinder(radio,.05,.022,[0,0,.011],dark,'Z',16);
  cylinder(radio,.037,.030,[0,0,.036],rubber,'Z',12);
  for(const x of [-.033,.033]) box(radio,[.013,.013,.011],[x,0,.025],steel);
  const antenna=group(radio,[0,0,.047],'antenna_flex');
  rod(antenna,[0,0,0],[0,-.20,1.443],.012,dark);
  return radio;
}

export function createFieldVehicle(T, kind, kit, palette) {
  const {box,cylinder,group,profile,rod}=kit, {dark,rubber,steel,glass}=palette;
  const root=new T.Group();
  const isCommand=kind==='command';
  root.name=isCommand?'command_radio_4x4':'scav_pickup';
  const chassis=group(root,[0,0,0],isCommand?'C-CMD':'field_chassis');
  const bodyModule=group(root,[0,0,0],isCommand?'B-CMD':'field_body');
  let radio;
  if(isCommand) {
    root.userData={role:'command-vehicle',size:'S',components:['C-CMD','B-CMD','R-CMD']};
    commandFrame(chassis,kit,dark,steel);
    bodyModule.position.copy(chassis.getObjectByName('body_mount').position);
    bodyModule.userData={id:'B-CMD',size:'S',role:'command-body'};
    group(bodyModule,[0,0,0],'mount');
    for(const [name,x,y] of commandPads) {
      const pad=group(bodyModule,[x,y,0],'pad_'+name);
      pad.userData.contactSizeMetres=[.18,.18];
      box(bodyModule,[.18,.18,.044],[x,y,.022],steel);
    }
  }
  // Panel coordinates retain the original assembled silhouette.
  const body=isCommand?group(bodyModule,[0,0,-commandMountHeight],'body_panels'):bodyModule;
  const paint=new T.MeshStandardMaterial({color:isCommand?'#58614a':'#825a46',metalness:.43,roughness:.64});
  const trim=new T.MeshStandardMaterial({color:isCommand?'#45483a':'#684537',metalness:.18,roughness:.85});
  paint.name='field_body_paint';trim.name='field_body_trim';
  const part=(node,id)=>{node.geometry.setAttribute('damagePart',new T.Float32BufferAttribute(new Float32Array(node.geometry.attributes.position.count).fill(id),1));return node;};
  const lamp=new T.MeshStandardMaterial({color:'#fff0cc',emissive:'#ffce83',emissiveIntensity:2.4,roughness:.34});
  const rear=new T.MeshStandardMaterial({color:'#81382b',emissive:'#ba3820',emissiveIntensity:.6,roughness:.43});
  const wheels=[];
  if(!isCommand)box(chassis,[1.38,3.64,.24],[0,-.02,.70],dark);
  for(const y of [-1.29,1.21]){
    cylinder(chassis,.073,1.65,[0,y,.43],steel,'X');
    for(const x of [-.79,.79]){
      const stem=`axle_${y>0?'1':'2'}_${x<0?'L':'R'}`;
      const steer=group(chassis,[x,y,.43],stem+'_steer');
      const wheel=group(steer,[0,0,0],stem+'_wheel');
      cylinder(wheel,.43,.25,[0,0,0],rubber,'X',16);
      cylinder(wheel,.255,.255,[0,0,0],steel,'X',12);
      cylinder(wheel,.095,.278,[0,0,0],dark,'X',10);
      wheels.push({steer,wheel,front:y>0});
    }
  }
  const floor=isCommand?1.09:.86;
  if(isCommand)profile(body,[[-2.015,floor],[1.94,floor],[1.94,1.19],[1.76,1.40],[.58,1.45],[-1.96,1.46]],1.70,paint);
  else{
    profile(body,[[-2.015,floor],[.58,floor],[.58,1.45],[-1.96,1.46]],1.70,paint);
    for(const x of [-.77,.77])profile(body,[[.58,floor],[1.94,floor],[1.94,1.19],[1.76,1.40],[.58,1.45]],.16,paint,x);
    box(body,[.86,1.05,.27],[0,1.19,1.06],dark);
    tagSalvagePart(T,kit.mesh(body,hoodGeometry(T),paint,[0,1.22,1.40],'donor_hood'),30);
  }
  profile(body,[[.45,1.40],[.38,1.63],[.16,2.03],[-.68,2.09],[-.91,1.90],[-.95,1.43]],1.63,trim);
  profile(body,[[.40,1.56],[.20,1.97],[-.58,2.01],[-.75,1.93],[-.75,1.56]],1.66,glass);
  for(const x of [-.87,.87]){
    box(body,[.07,1.06,.115],[x,1.13,1.06],paint);
    box(body,[.07,1.03,.115],[x,-1.24,1.04],paint);
    box(body,[.045,.04,.53],[x*.963,-.12,1.77],trim);
    box(body,[.035,.15,.044],[x*.988,-.66,1.44],dark);
    cylinder(body,.139,.07,[x*.72,1.97,1.23],dark,'Y');
    part(cylinder(body,.113,.035,[x*.72,2.015,1.23],lamp,'Y'),x<0?5:6);
    box(body,[.12,.054,.115],[x*.9,-2.03,1.15],rear);
  }
  part(box(body,[1.88,.17,.15],[0,2.024,.85],dark),7);
  part(box(body,[1.84,.15,.15],[0,-2.02,.85],dark),8);
  box(body,[.81,.052,.27],[0,1.985,1.23],dark);
  for(let x=-.33;x<=.34;x+=.115)box(body,[.035,.028,.22],[x,2.021,1.235],steel);
  if(isCommand){
    for(const x of [-.796,.796])profile(body,[[-2.015,.875],[1.94,.875],[1.94,1.105],[-2.015,1.105]],.105,paint,x);
    for(const x of [-.53,.53])for(const y of [-1.96,1.96])box(body,[.17,.298,.29],[x,y,.973],dark);
    profile(body,[[-1.98,1.45],[-1.98,1.95],[-1.72,2.12],[-.65,2.13],[-.55,1.46]],1.64,trim);
    box(body,[1.49,.042,.56],[0,-1.998,1.59],paint);
    box(body,[.71,.042,.25],[0,-2.023,1.87],glass);
    cylinder(body,.365,.22,[.51,-2.14,1.38],rubber,'Y',16);
    cylinder(body,.202,.231,[.51,-2.14,1.38],steel,'Y');
    radio=commandRadio(T,root,bodyModule,kit,dark,rubber,steel);
    box(body,[.24,.035,.15],[-.54,-2.026,1.35],trim);
  } else {
    for(const x of [-.84,.84]){
      box(body,[.06,1.30,.34],[x,-1.34,1.53],paint,[0,0,0]);
      part(rod(body,[x,-1.92,1.51],[x,-1.92,2.23],.047,steel),x<0?24:25);
      part(rod(body,[x,-1.92,2.23],[x,-.81,2.05],.047,dark),x<0?24:25);
    }
    cylinder(body,.235,.74,[.49,-1.50,1.53],trim,'Z');
    box(body,[.44,.53,.25],[-.52,-1.61,1.52],steel);
  }
  batchRigidMeshes(T,root);
  return isCommand?{root,wheels,parts:{chassis,body:bodyModule,radio}}:{root,wheels};
}
