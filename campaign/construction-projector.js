import {mergeGeometries} from '../demo/vendor/utils/BufferGeometryUtils.js';

const yawLimit = Math.PI;
const pitchMin = -50*Math.PI/180;
const pitchMax = 65*Math.PI/180;

// The bottom face of the S flange is local Z=0. The optics look along +Y.
export function createConstructionProjector(T) {
 const root = new T.Group();
 root.name = 'U25_CONSTRUCTION_PROJECTOR';
 root.userData = {id:'U25', size:'S', role:'construction-projector', ringDiameterMetres:.9};
 const azimuth = new T.Group();
 azimuth.name = 'projector_yaw';
 azimuth.position.z = .087;
 root.add(azimuth);
 const optics = new T.Group();
 optics.name = 'projector_pitch';
 optics.position.set(0,.21,.598);
 azimuth.add(optics);

 const paint = new T.MeshStandardMaterial({color:'#606750', metalness:.37, roughness:.60});
 const steel = new T.MeshStandardMaterial({color:'#444d47', metalness:.62, roughness:.49});
 const machined = new T.MeshStandardMaterial({color:'#83918a', metalness:.72, roughness:.43});
 const black = new T.MeshStandardMaterial({color:'#252c2a', metalness:.30, roughness:.72});
 const ochre = new T.MeshStandardMaterial({color:'#b6975f', metalness:.35, roughness:.62});
 const glass = new T.MeshStandardMaterial({color:'#5e5743', emissive:'#ffcf82', emissiveIntensity:.03, metalness:.18, roughness:.28});
 const core = new T.MeshStandardMaterial({color:'#807153', emissive:'#fff1bb', emissiveIntensity:.05, roughness:.30});
 glass.name = 'projector_optics';
 core.name = 'projector_emitter_core';

 const batches = new Map();
 function part(parent, geometry, material, position) {
  geometry.translate(...position);
  if (!batches.has(parent)) batches.set(parent,new Map());
  const materials = batches.get(parent);
  if (!materials.has(material)) materials.set(material,[]);
  const triangles = geometry.index ? geometry.toNonIndexed() : geometry;
  materials.get(material).push(triangles);
  if (triangles !== geometry) geometry.dispose();
 }
 function box(parent, size, material, position) {
  part(parent,new T.BoxGeometry(...size),material,position);
 }
 function drum(parent, radius, length, material, position, axis='Y') {
  const geometry = new T.CylinderGeometry(radius,radius,length,24);
  if (axis==='Z') geometry.rotateX(Math.PI/2);
  if (axis==='X') geometry.rotateZ(Math.PI/2);
  part(parent,geometry,material,position);
 }
 function housing(parent, width, depth, height, corner, material, position) {
  const x = width/2, y = depth/2;
  const shape = new T.Shape();
  shape.moveTo(-x+corner,-y);
  for (const point of [[x-corner,-y],[x,-y+corner],[x,y-corner],[x-corner,y],[-x+corner,y],[-x,y-corner],[-x,-y+corner]]) {
   shape.lineTo(...point);
  }
  shape.closePath();
  const bevel = .018;
  const geometry = new T.ExtrudeGeometry(shape,{depth:height-2*bevel,bevelEnabled:true,bevelSize:bevel,bevelThickness:bevel,bevelSegments:1,steps:1});
  geometry.translate(0,0,-height/2+bevel);
  part(parent,geometry,material,position);
 }

 drum(root,.45,.08,black,[0,0,.04],'Z');
 drum(root,.408,.035,machined,[0,0,.09],'Z');
 drum(azimuth,.357,.089,steel,[0,0,.0535],'Z');
 housing(azimuth,.79,.53,.111,.065,paint,[0,-.245,.1495]);
 housing(azimuth,.51,.28,.115,.055,steel,[0,-.34,.224]);
 box(azimuth,[.48,.030,.079],black,[0,-.496,.224]);
 for (let i=0;i<5;i++) box(azimuth,[.034,.026,.056],machined,[(i-2)*.079,-.519,.224]);

 // The two pivot cheeks carry the head on a through-shaft.
 for (const side of [-1,1]) {
  const x = side*.395;
  housing(azimuth,.183,.49,.159,.041,steel,[x,.032,.244]);
  housing(azimuth,.136,.282,.406,.038,paint,[x,.177,.447]);
  drum(azimuth,.128,.104,steel,[side*.447,optics.position.y,optics.position.z],'X');
  drum(azimuth,.091,.052,machined,[side*.503,optics.position.y,optics.position.z],'X');
  drum(optics,.091,.155,steel,[side*.322,0,0],'X');
  box(azimuth,[.09,.018,.034],ochre,[x,.331,.404]);
 }

 housing(optics,.530,.642,.390,.079,paint,[0,-.033,0]);
 housing(optics,.467,.503,.065,.065,steel,[0,-.044,.201]);
 box(optics,[.39,.042,.205],black,[0,-.366,-.006]);
 for (const side of [-1,1]) {
  const x = side*.273;
  box(optics,[.033,.324,.179],black,[x,-.116,-.044]);
  for (let i=0;i<4;i++) box(optics,[.027,.027,.133],steel,[side*.293,-.222+i*.071,-.044]);
 }
 box(optics,[.112,.154,.022],ochre,[0,.082,.243]);

 // Counterbored metal rings seat the optic against the housing.
 drum(optics,.226,.117,steel,[0,.334,.003]);
 drum(optics,.237,.062,black,[0,.399,.003]);
 drum(optics,.216,.047,machined,[0,.436,.003]);
 drum(optics,.193,.039,black,[0,.467,.003]);
 drum(optics,.173,.025,glass,[0,.487,.003]);
 drum(optics,.064,.013,core,[0,.503,.003]);
 box(optics,[.52,.045,.115],steel,[0,.280,-.123]);
 for (const side of [-1,1]) {
  drum(optics,.050,.048,steel,[side*.241,.303,-.123]);
  drum(optics,.032,.018,glass,[side*.241,.333,-.123]);
 }

 for (const [parent,materials] of batches) {
  for (const [material,geometries] of materials) {
   const mesh = new T.Mesh(mergeGeometries(geometries),material);
   mesh.castShadow = mesh.receiveShadow = true;
   parent.add(mesh);
   for (const geometry of geometries) geometry.dispose();
  }
 }

 const emitter = new T.Object3D();
 emitter.name = 'projector_emitter';
 emitter.position.set(0,.511,.003);
 optics.add(emitter);
 function aim(yaw=0,pitch=0,working=false) {
  azimuth.rotation.z = T.MathUtils.clamp(yaw,-yawLimit,yawLimit);
  optics.rotation.x = T.MathUtils.clamp(pitch,pitchMin,pitchMax);
  glass.emissiveIntensity = working ? 2.6 : .03;
  core.emissiveIntensity = working ? 4.3 : .05;
 }
 aim();
 return {root,aim,emitter};
}
