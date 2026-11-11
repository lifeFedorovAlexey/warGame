import {mergeGeometries} from '../demo/vendor/utils/BufferGeometryUtils.js';

// Z-up, nose +Y. The hold is genuinely hollow: 2 lanes × 5 vehicles.
// Static metal is batched by material; rotors, ramp and doors remain articulated.
export function createKorovnik(T){
 const root=new T.Group();root.name='MU26_Korovnik';
 const paint=new T.MeshStandardMaterial({color:'#796e57',roughness:.91,metalness:.36});
 const patch=new T.MeshStandardMaterial({color:'#968367',roughness:.92,metalness:.25});
 const rust=new T.MeshStandardMaterial({color:'#73462f',roughness:1,metalness:.2});
 const steel=new T.MeshStandardMaterial({color:'#363632',roughness:.76,metalness:.6});
 const dark=new T.MeshStandardMaterial({color:'#252420',roughness:.98});
 const rubber=new T.MeshStandardMaterial({color:'#242321',roughness:1});
 const yellow=new T.MeshStandardMaterial({color:'#b18a44',roughness:.9,metalness:.35});
 const glass=new T.MeshStandardMaterial({color:'#24363b',roughness:.3,metalness:.45});
 const white=new T.MeshStandardMaterial({color:'#d0c5a8',roughness:1});
 const red=new T.MeshStandardMaterial({color:'#853c2e',roughness:.95});
 const lamp=new T.MeshStandardMaterial({color:'#e8b068',emissive:'#ffc572',emissiveIntensity:1.4});
 const materials=[paint,patch,rust,steel,dark,rubber,yellow,glass,white,red,lamp];
 const batches=new Map();
 function part(parent,geometry,mat,pos=[0,0,0],rot=[0,0,0]){
  const m=new T.Mesh(geometry,mat);m.position.set(...pos);m.rotation.set(...rot);m.updateMatrix();geometry.applyMatrix4(m.matrix);
  let entries=batches.get(parent);if(!entries)batches.set(parent,entries=new Map());
  if(!entries.has(mat))entries.set(mat,[]);entries.get(mat).push(geometry.index?geometry.toNonIndexed():geometry);if(geometry.index)geometry.dispose();
 }
 const box=(p,size,pos,mat=paint,rot)=>part(p,new T.BoxGeometry(...size),mat,pos,rot);
 const cyl=(p,r1,r2,h,pos,mat=steel,rot=[Math.PI/2,0,0],n=12)=>part(p,new T.CylinderGeometry(r1,r2,h,n),mat,pos,rot);
 function beam(p,a,b,r=.07,mat=steel){
  const from=new T.Vector3(...a),to=new T.Vector3(...b),g=new T.CylinderGeometry(r,r,from.distanceTo(to),6);
  const q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),to.clone().sub(from).normalize());
  g.applyQuaternion(q);part(p,g,mat,from.add(to).multiplyScalar(.5).toArray());
 }
 function ellipsoid(pos,size,mat=paint){const g=new T.SphereGeometry(1,16,10);g.scale(...size);part(root,g,mat,pos);}
 function polygon(p,pts,mat){const positions=[];for(let i=1;i<pts.length-1;i++)positions.push(...pts[0],...pts[i],...pts[i+1]);const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.computeVertexNormals();part(p,g,mat);}
 // Load deck, lower sills and curved ribbed cargo shell.
 box(root,[9.4,29.2,.48],[0,-.4,1.65],steel);
 box(root,[8.7,28.8,.12],[0,-.4,1.96],dark);
 for(const x of [-4.6,4.6])box(root,[.36,29.5,.6],[x,-.3,2],rust);
 const cross=[[-4.6,2.2],[-5.15,3.8],[-5.05,6.8],[-3.65,8.7],[-1.6,9.3],[1.6,9.3],[3.65,8.7],[5.05,6.8],[5.15,3.8],[4.6,2.2]];
 for(let j=0;j<9;j++)for(let k=0;k<8;k++){
  const a=cross[j],b=cross[j+1],dy=29/8,y=-15+k*dy;
  polygon(root,[[a[0],y,a[1]],[b[0],y,b[1]],[b[0],y+dy-.035,b[1]],[a[0],y+dy-.035,a[1]]],(j+k)%7===0?patch:paint);
  // Interior liner has inward normals, keeping the hold dark but visible.
  polygon(root,[[a[0]*.98,y+dy,a[1]-.1],[b[0]*.98,y+dy,b[1]-.1],[b[0]*.98,y,b[1]-.1],[a[0]*.98,y,a[1]-.1]],dark);
 }
 for(let y=-15;y<=14;y+=3.625){
  for(let i=0;i<cross.length-1;i++)beam(root,[...cross[i].slice(0,1),y,cross[i][1]],[cross[i+1][0],y,cross[i+1][1]],.075,steel);
  for(const side of [-1,1])for(let z=2.5;z<7;z+=1.05)cyl(root,.052,.052,.09,[side*5.17,y,z],steel,[0,0,Math.PI/2],6);
 }
 // Broad armoured cockpit with framed, individually fitted glazing.
 ellipsoid([0,14.2,4.6],[4.8,6.4,3.65]);
 ellipsoid([0,19.4,3.6],[2.5,1.55,1.85],steel);
 for(const side of [-1,1]){
  const panes=[[[.18,19.8,4.9],[2.2,19.25,4.9],[2.4,17.5,6.95],[.18,18.05,7.3]],
   [[2.45,19.13,4.9],[3.65,17.85,4.9],[3.7,16.1,6.8],[2.64,17.4,6.95]],
   [[3.83,17.58,4.9],[4.57,15.2,4.9],[4.4,13.7,6.75],[3.95,15.9,6.8]]];
  for(const pts of panes){const pp=pts.map(([x,y,z])=>[x*side,y,z]);if(side<0)pp.reverse();polygon(root,pp,glass);for(let i=0;i<4;i++)beam(root,pp[i],pp[(i+1)%4],.065,yellow);}
  for(const y of [10.7,7.5]){box(root,[.12,1.8,2.1],[side*5.09,y,4.6],steel);box(root,[.14,1.45,.85],[side*5.16,y,5.1],glass);}
  for(let z=1.2;z<=4;z+=.48)beam(root,[side*5.4,9.3,z],[side*5.4,10.6,z],.065,yellow);
  for(const y of [9.3,10.6])beam(root,[side*5.4,y,.9],[side*5.4,y,4.3],.055,yellow);
  // Riveted repair plates, external pipes and handles.
  for(let i=0;i<9;i++){
   const y=-13.7+i*2.9;box(root,[.13,2.45,1.35],[side*5.13,y,3.3],i%3===0?rust:patch);
   for(const dy of [-1,1])for(const z of [2.8,3.8])cyl(root,.06,.06,.15,[side*5.22,y+dy,z],steel,[0,0,Math.PI/2],6);
   beam(root,[side*5.3,y-.45,2],[side*5.3,y+.45,2],.055,yellow);
  }
  beam(root,[side*5.24,-14,2.4],[side*5.24,12,2.4],.08,steel);
 }
 // Roof plant: exposed engines, cooling grilles, tanks and trussed outriggers.
 for(const side of [-1,1]){
  box(root,[2.15,11,1.15],[side*2.35,-.7,9.6],steel);
  for(let y=-5.5;y<5;y+=.48)box(root,[2.05,.14,.07],[side*2.35,y,10.22],patch);
  for(const y of [-5.4,4.6])cyl(root,.5,.5,1.5,[side*3.8,y,9.3],rust,[0,0,0]);
  for(const y of [-8,6]){box(root,[1.65,2.4,1.1],[side*3.3,y,9.6],patch);for(const yy of [-.75,.75])box(root,[1.7,.09,1.17],[side*3.3,y+yy,9.6],steel);}
 }
 const rotors=[];
 for(const [i,y] of [10,-11].entries()){
  box(root,[13.6,2.2,.38],[0,y,10.1],steel);
  for(const s of [-1,1]){
   beam(root,[s*3.7,y-1.1,8],[s*6.8,y-1.1,10.5],.14,rust);
   beam(root,[s*3.7,y+1.1,8],[s*6.8,y+1.1,10.5],.14,rust);
  }
  cyl(root,1.95,2.5,3.5,[0,y,11.4],paint);cyl(root,.65,.85,1.1,[0,y,13.6],steel);
  for(let a=0;a<8;a++){const t=a*Math.PI/4;box(root,[.2,.5,1.6],[2.08*Math.cos(t),y+2.08*Math.sin(t),11.1],yellow,[0,0,t]);}
  // Maintenance walkway and handrails around each transmission tower.
  box(root,[5.8,4.8,.15],[0,y,12],steel);
  for(const s of [-1,1])for(let x=-2.8;x<=2.8;x+=1.4)beam(root,[x,y+s*2.35,12],[x,y+s*2.35,13.1],.045,yellow);
  for(const s of [-1,1])beam(root,[-2.8,y+s*2.35,13.1],[2.8,y+s*2.35,13.1],.045,yellow);
  const rotor=new T.Group();rotor.name='main_rotor_'+i;rotor.position.set(0,y,14.5+i*.35);root.add(rotor);rotors.push(rotor);
  cyl(rotor,.85,.85,.42,[0,0,0]);
  for(let blade=0;blade<8;blade++){
   const a=blade*Math.PI/4,arm=new T.Group();arm.rotation.z=a;rotor.add(arm);
   beam(arm,[.35,0,0],[2.4,.15,.15],.09,steel);
   polygon(arm,[[1.7,-.22,.11],[12.5,-.45,-.12],[12.7,.32,-.12],[3,.55,.11]],steel);
   polygon(arm,[[11.5,-.43,-.105],[12.5,-.45,-.105],[12.7,.32,-.105],[11.6,.34,-.105]],red);
   box(arm,[.4,.7,.04],[9.3,-.02,-.03],patch);
  }
 }
 // High tail boom leaves a clear rear loading aperture and ramp.
 beam(root,[0,-11,8.4],[0,-28.3,11],1.12,paint);
 beam(root,[-2.3,-14,7.8],[0,-27,10.8],.18,steel);
 beam(root,[2.3,-14,7.8],[0,-27,10.8],.18,steel);
 polygon(root,[[.18,-23,10.2],[.18,-29.7,10.9],[.18,-32,17],[.18,-29.4,17]],patch);
 polygon(root,[[-.18,-29.4,17],[-.18,-32,17],[-.18,-29.7,10.9],[-.18,-23,10.2]],paint);
 box(root,[7.4,1.6,.16],[0,-25.6,11.3],paint);
 const tail=new T.Group();tail.name='tail_rotor';tail.position.set(.65,-30.2,15.8);tail.rotation.y=Math.PI/2;root.add(tail);
 cyl(tail,.36,.36,.45,[0,0,0]);
 for(let i=0;i<5;i++){const a=i*Math.PI*2/5;box(tail,[.42,4.2,.11],[Math.sin(a)*1.85,Math.cos(a)*1.85,0],steel,[0,0,-a]);box(tail,[.44,.5,.12],[Math.sin(a)*3.65,Math.cos(a)*3.65,0],red,[0,0,-a]);}
 // Six-wheel main bogies and twin nose gear.
 for(const side of [-1,1]){
  beam(root,[side*3.7,-8,2.5],[side*5.9,-8,1.05],.24,steel);
  box(root,[.4,5.7,.38],[side*5.95,-8,.95],steel);
  for(const y of [-10.1,-8,-5.9])for(const dx of [0,.62]){
   cyl(root,1,1,.53,[side*(5.95+dx),y,1],rubber,[0,0,Math.PI/2],20);
   cyl(root,.52,.52,.56,[side*(5.95+dx),y,1],patch,[0,0,Math.PI/2],12);
   cyl(root,.23,.23,.58,[side*(5.95+dx),y,1],steel,[0,0,Math.PI/2]);
  }
 }
 beam(root,[0,16.2,3],[0,16.2,.8],.19,steel);
 for(const x of [-.5,.5]){cyl(root,.78,.78,.47,[x,16.2,.8],rubber,[0,0,Math.PI/2],16);cyl(root,.35,.35,.49,[x,16.2,.8],patch,[0,0,Math.PI/2]);}
 // Split clamshell doors plus independent hinged drive-on ramp.
 const doors=[];
 for(const side of [-1,1]){
  const door=new T.Group();door.name=side<0?'cargo_door_left':'cargo_door_right';door.position.set(side*4.7,-15.08,2);root.add(door);doors.push({root:door,side});
  box(door,[4.6,.28,6.5],[-side*2.3,0,3.25],paint);
  for(const z of [1,3,5.5])box(door,[4.5,.15,.13],[-side*2.3,-.2,z],steel);
  for(const x of [-.25,-4.25])box(door,[.12,.16,6.1],[side*x,-.2,3.2],rust);
 }
 const ramp=new T.Group();ramp.name='cargo_ramp';ramp.position.set(0,-15.1,1.95);root.add(ramp);
 box(ramp,[9.2,7.4,.25],[0,-3.7,0],steel);
 for(let y=-.4;y>-7.4;y-=.45)box(ramp,[8.9,.06,.06],[0,y,.15],patch);
 for(const x of [-3.8,3.8]){box(ramp,[.6,7.4,.03],[x,-3.7,.18],yellow);for(let y=-.6;y>-7.2;y-=.9)box(ramp,[.63,.33,.035],[x,y,.2],dark,[0,0,.35]);}
 for(const x of [-4.45,4.45])box(ramp,[.18,7.4,.3],[x,-3.7,.22],rust);
 for(const x of [-2,2])for(let y=-13;y<=12;y+=5.2)box(root,[.1,4.2,.025],[x,y,2.04],yellow);
 for(let y=-12;y<13;y+=5){box(root,[1.7,.3,.1],[0,y,8.82],lamp);}
 // Worn stencilled livery is mapped onto the hull, not drawn in the HUD.
 if(typeof document!=='undefined'){
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;const c=canvas.getContext('2d');
  c.fillStyle='#d5c8a7';c.font='bold 100px Arial';c.textAlign='center';c.fillText('КОРОВНИК',512,113);c.font='bold 52px Arial';c.fillText('МУ-26    •    73',512,189);
  let seed=13;for(let i=0;i<2000;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const x=seed%1024;seed=(Math.imul(seed,1664525)+1013904223)>>>0;c.clearRect(x,seed%256,1+seed%7,1+seed%3);}
  const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;
  const decal=new T.MeshStandardMaterial({map:tex,transparent:true,roughness:1,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});materials.push(decal);
  for(const side of [-1,1]){const mesh=new T.Mesh(new T.PlaneGeometry(13,3.25),decal);mesh.position.set(side*5.16,-1.4,5.5);mesh.rotation.set(Math.PI/2,side*Math.PI/2,0);root.add(mesh);}
 }
 for(const [parent,entries] of batches)for(const [material,parts] of entries){const g=mergeGeometries(parts,false);parts.forEach(p=>p.dispose());const mesh=new T.Mesh(g,material);mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);}
 function pose({door=0,rotor=0,time=0}={}){
  for(const [i,r] of rotors.entries())r.rotation.z=(i?-1:1)*rotor;
  tail.rotation.x=rotor*1.7;
  for(const d of doors)d.root.rotation.z=-d.side*door*Math.PI*.54;
  ramp.rotation.x=(1-door)*-Math.PI/2+door*.255;
 }
 pose();
 return {root,materials,rotors,doors,ramp,pose};
}
