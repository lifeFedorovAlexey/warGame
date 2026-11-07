import {mergeGeometries} from '../demo/vendor/utils/BufferGeometryUtils.js';

const pumpRigs = new WeakMap();
const cycleSeconds = 7.6;

// Named rigid assemblies survive Object3D.clone and keep the mechanism cheap to draw.
export function createOilPump(T, width, depth, height) {
 const pump = new T.Group();
 pump.name = 'oil_pump';
 const steel = new T.MeshStandardMaterial({color:'#454c49', metalness:.64, roughness:.58});
 const paint = new T.MeshStandardMaterial({color:'#a9633f', metalness:.42, roughness:.68});
 const shaft = new T.MeshStandardMaterial({color:'#9fa8a2', metalness:.78, roughness:.44});
 const dark = new T.MeshStandardMaterial({color:'#2d3331', metalness:.35, roughness:.73});
 const cap = new T.MeshStandardMaterial({color:'#c7a96f', metalness:.42, roughness:.68});
 steel.name = 'pump_structural_steel';
 paint.name = 'pump_oxide_paint';
 shaft.name = 'pump_machined_steel';
 dark.name = 'pump_drive_and_cable';
 cap.name = 'pump_service_marks';

 const pivotX = -width*.048;
 const pivotZ = height*.79;
 const headRadius = width*.406;
 const beamArm = width*.35;
 const driveX = pivotX + beamArm + width*.023;
 const driveZ = height*.178;
 const crankRadius = Math.min(width*.077, height*.052);
 const linkLength = Math.hypot(pivotX + beamArm - driveX, pivotZ - driveZ);
 const wellX = pivotX - headRadius - .027;
 const wellTop = height*.108;
 const carrierHeight = height*.30;
 const driveSide = depth*.137;
 const cableSide = depth*.047;
 pump.userData = {pivotX,pivotZ,headRadius,beamArm,driveX,driveZ,crankRadius,linkLength,wellX,wellTop,carrierHeight};

 function assembly(name) {
  const group = new T.Group();
  group.name = name;
  pump.add(group);
  return group;
 }
 function add(group, geometry, material, position, rotation) {
  const mesh = new T.Mesh(geometry, material);
  mesh.position.set(...position);
  if (rotation) mesh.quaternion.copy(rotation);
  group.add(mesh);
 }
 function box(group, size, position, material = steel) {
  add(group,new T.BoxGeometry(...size),material,position);
 }
 function member(group, from, to, section, material = steel) {
  const start = new T.Vector3(...from);
  const delta = new T.Vector3(...to).sub(start);
  const length = delta.length();
  const midpoint = start.addScaledVector(delta,.5).toArray();
  const rotation = new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,1),delta.normalize());
  add(group,new T.BoxGeometry(section[0],section[1],length),material,midpoint,rotation);
 }
 function pipe(group, from, to, radius, material = steel, segments = 10) {
  const start = new T.Vector3(...from);
  const delta = new T.Vector3(...to).sub(start);
  const length = delta.length();
  const midpoint = start.addScaledVector(delta,.5).toArray();
  const rotation = new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());
  add(group,new T.CylinderGeometry(radius,radius,length,segments),material,midpoint,rotation);
 }

 const support = assembly('oil_support');
 const frontFootX = -width*.25;
 const rearFootX = width*.175;
 const postTop = pivotZ-.21;
 function postPoint(footX, side, z) {
  const fraction = (z-.71)/(postTop-.71);
  const x = T.MathUtils.lerp(footX,pivotX,fraction);
  const y = side*depth*T.MathUtils.lerp(.245,.067,fraction);
  return [x,y,z];
 }
 for (const side of [-1,1]) {
  const baseY = side*depth*.245;
  const topY = side*depth*.067;
  box(support,[width*.94,.36,.22],[0,baseY,.46]);
  for (const footX of [frontFootX,rearFootX]) {
   box(support,[.74,.76,.15],[footX,baseY,.64],dark);
   member(support,postPoint(footX,side,.71),postPoint(footX,side,postTop),[.39,.39]);
  }
  member(support,postPoint(frontFootX,side,pivotZ*.37),postPoint(rearFootX,side,pivotZ*.37),[.22,.26]);
  box(support,[.68,.41,.36],[pivotX,topY,pivotZ-.1],dark);
  pipe(support,[pivotX,topY-side*.24,pivotZ],[pivotX,topY+side*.27,pivotZ],.26,shaft);
 }
 // Diagonal bracing stabilizes the open Samson post without filling its silhouette.
 for (const side of [-1,1]) {
  member(support,postPoint(frontFootX,side,pivotZ*.23),postPoint(frontFootX,-side,pivotZ*.62),[.19,.19]);
 }
 const bedTop = .675;
 const gearboxBottom = driveZ - 1.42;
 box(support,[width*.60,depth*.38,.25],[driveX-width*.18,0,.55],steel);
 box(support,[1.30,1.48,gearboxBottom-bedTop+.05],[driveX,0,(gearboxBottom+bedTop)/2],steel);
 box(support,[1.14,1.32,1.64],[driveX,0,driveZ-.60],dark);
 pipe(support,[driveX,-.69,driveZ],[driveX,.69,driveZ],.76,steel,16);
 pipe(support,[driveX,-driveSide-.29,driveZ],[driveX,driveSide+.29,driveZ],.23,shaft);
 box(support,[1.16,.99,.18],[driveX-1.10,0,bedTop+.08],steel);
 box(support,[1.02,.85,.78],[driveX-1.10,0,1.21],paint);
 for (let i=0;i<4;i++) box(support,[.69,.065,.072],[driveX-1.10,-.34+i*.20,1.636],dark);
 box(support,[.49,.045,.14],[driveX-.02,-.68,driveZ-.41],cap);

 // Wellhead, stuffing box and the production line sit under the vertical rod.
 pipe(support,[wellX,0,.37],[wellX,0,.62],.31,dark,14);
 pipe(support,[wellX,0,.55],[wellX,0,wellTop],.15,steel,14);
 pipe(support,[wellX,0,wellTop-.22],[wellX,0,wellTop+.04],.23,shaft,14);
 pipe(support,[wellX,0,1.03],[wellX,1.49,1.03],.095,dark);
 pipe(support,[wellX,1.49,1.03],[wellX,1.72,.65],.095,dark);
 pipe(support,[wellX,1.72,.65],[wellX+1.15,1.72,.65],.095,dark);
 pipe(support,[wellX+1.15,1.72,.65],[wellX+1.15,1.72,.39],.095,dark);
 pipe(support,[wellX,.86,1.04],[wellX,.86,1.44],.066,shaft);
 add(support,new T.TorusGeometry(.18,.032,6,14),paint,[wellX,.86,1.44]);
 member(support,[wellX-.18,.86,1.44],[wellX+.18,.86,1.44],[.04,.04],paint);

 const beam = assembly('oil_beam');
 beam.position.set(pivotX,0,pivotZ);
 const beamStart = -headRadius*.79;
 const beamEnd = beamArm+.26;
 const beamMiddle = (beamStart + beamEnd)/2;
 box(beam,[beamEnd-beamStart,.58,.42],[beamMiddle,0,0]);
 for (const sign of [-1,1]) box(beam,[beamEnd-beamStart,.77,.12],[beamMiddle,0,sign*.26]);
 box(beam,[.72,1.08,.67],[0,0,0],dark);
 pipe(beam,[beamArm,-driveSide-.15,0],[beamArm,driveSide+.15,0],.18,shaft);

 // The polished face is an arc about the beam bearing. Its vertical tangent
 // stays over the wellhead throughout the beam stroke.
 const head = new T.Shape();
 const headAngle = .60;
 const steps = 18;
 for (let i=0;i<=steps;i++) {
  const angle = -headAngle + 2*headAngle*i/steps;
  const point = [-headRadius*Math.cos(angle),headRadius*Math.sin(angle)];
  if (i===0) head.moveTo(...point);
  else head.lineTo(...point);
 }
 head.lineTo(-headRadius*.65,headRadius*.46);
 head.lineTo(-headRadius*.58,headRadius*.24);
 head.lineTo(-headRadius*.62,-headRadius*.14);
 head.lineTo(-headRadius*.71,-headRadius*.46);
 head.closePath();
 const headWidth = depth*.143;
 const headGeometry = new T.ExtrudeGeometry(head,{depth:headWidth,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.045,bevelThickness:.045});
 headGeometry.translate(0,0,-headWidth/2);
 headGeometry.rotateX(Math.PI/2);
 add(beam,headGeometry,paint,[0,0,0]);
 for (const side of [-1,1]) {
  const guideRadius = headRadius+.027;
  const y = side*cableSide;
  for (let i=0;i<steps;i++) {
   const a = -headAngle + 2*headAngle*i/steps;
   const b = a + 2*headAngle/steps;
   pipe(beam,[-guideRadius*Math.cos(a),y,guideRadius*Math.sin(a)],[-guideRadius*Math.cos(b),y,guideRadius*Math.sin(b)],.034,dark,6);
  }
  const face = side*headWidth/2;
  pipe(beam,[-headRadius*.73,face-side*.02,.31],[-headRadius*.73,face+side*.105,.31],.126,shaft);
  pipe(beam,[-headRadius*.73,face-side*.02,-.31],[-headRadius*.73,face+side*.105,-.31],.126,shaft);
 }

 const crank = assembly('oil_crank');
 crank.position.set(driveX,0,driveZ);
 const pitman = assembly('oil_pitman');
 for (const side of [-1,1]) {
  const y = side*driveSide;
  box(crank,[crankRadius*2.65,.22,.28],[-crankRadius*.23,y,0],paint);
  box(crank,[.50,.38,.60],[-crankRadius*1.17,y,0],paint);
  box(crank,[.27,.042,.29],[-crankRadius*1.17,y+side*.19,0],cap);
  pipe(crank,[0,y-side*.17,0],[0,y+side*.22,0],.29,steel);
  pipe(crank,[crankRadius,y-side*.15,0],[crankRadius,y+side*.28,0],.132,shaft);
  box(pitman,[linkLength,.15,.16],[linkLength/2,y,0],steel);
  for (const x of [0,linkLength]) pipe(pitman,[x,y-.11,0],[x,y+.11,0],.19,dark);
 }

 const carrier = assembly('oil_carrier');
 box(carrier,[.19,2*cableSide+.22,.14],[0,0,0],steel);
 for (const side of [-1,1]) pipe(carrier,[0,side*cableSide,-.12],[0,side*cableSide,.15],.073,shaft);
 const bridle = assembly('oil_bridle');
 for (const side of [-1,1]) pipe(bridle,[0,side*cableSide,0],[0,side*cableSide,1],.032,dark,8);
 const polishedRod = assembly('oil_polished_rod');
 pipe(polishedRod,[0,0,0],[0,0,1],.055,shaft);

 for (const group of pump.children) {
  const batches = new Map();
  for (const mesh of [...group.children]) {
   mesh.updateMatrix();
   const source = mesh.geometry;
   const geometry = source.index ? source.toNonIndexed() : source;
   geometry.applyMatrix4(mesh.matrix);
   if (!batches.has(mesh.material)) batches.set(mesh.material,[]);
   batches.get(mesh.material).push(geometry);
   if (source !== geometry) source.dispose();
   group.remove(mesh);
  }
  for (const [material,geometries] of batches) {
   const mesh = new T.Mesh(mergeGeometries(geometries),material);
   mesh.castShadow = mesh.receiveShadow = true;
   group.add(mesh);
   for (const geometry of geometries) geometry.dispose();
  }
 }
 updateOilPump(pump,0);
 return pump;
}

export function updateOilPump(building, seconds) {
 let rig = pumpRigs.get(building);
 if (!rig) {
  const pump = building.getObjectByName('oil_pump');
  if (!pump) return;
  rig = {
   data:pump.userData,
   beam:pump.getObjectByName('oil_beam'),
   crank:pump.getObjectByName('oil_crank'),
   pitman:pump.getObjectByName('oil_pitman'),
   carrier:pump.getObjectByName('oil_carrier'),
   bridle:pump.getObjectByName('oil_bridle'),
   rod:pump.getObjectByName('oil_polished_rod'),
  };
  pumpRigs.set(building,rig);
 }
 const {pivotX,pivotZ,headRadius,beamArm,driveX,driveZ,crankRadius,linkLength,wellX,wellTop,carrierHeight} = rig.data;
 const phase = (seconds % cycleSeconds) / cycleSeconds * Math.PI*2;
 const lowerX = driveX + crankRadius*Math.cos(phase);
 const lowerZ = driveZ + crankRadius*Math.sin(phase);
 const deltaX = lowerX - pivotX;
 const deltaZ = lowerZ - pivotZ;
 const span = Math.hypot(deltaX,deltaZ);
 // Intersect the beam-arm circle with the fixed-length pitman circle.
 const cosine = (beamArm**2 + span**2 - linkLength**2)/(2*beamArm*span);
 const pitch = Math.atan2(deltaZ,deltaX) + Math.acos(Math.max(-1,Math.min(1,cosine)));
 const upperX = pivotX + beamArm*Math.cos(pitch);
 const upperZ = pivotZ + beamArm*Math.sin(pitch);

 rig.crank.rotation.set(0,-phase,0);
 rig.beam.rotation.set(0,-pitch,0);
 rig.pitman.position.set(lowerX,0,lowerZ);
 rig.pitman.rotation.set(0,-Math.atan2(upperZ-lowerZ,upperX-lowerX),0);
 const carrierZ = carrierHeight - headRadius*pitch;
 rig.carrier.position.set(wellX,0,carrierZ);
 rig.bridle.position.copy(rig.carrier.position);
 rig.bridle.scale.z = pivotZ - carrierZ;
 rig.rod.position.set(wellX,0,wellTop);
 rig.rod.scale.z = carrierZ - wellTop;
}
