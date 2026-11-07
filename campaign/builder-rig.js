// U25 owns only its flange, tool assembly and work effects. All values are metres.
export function createBuilderRig(T,{lod=0}={}){
 const root=new T.Group();root.name='U25_STROITEL';root.userData={id:'U25',size:'S',status:'engineering-draft',ringDiameterMetres:.9};
 const paint=new T.MeshStandardMaterial({color:'#60664d',metalness:.35,roughness:.48}),dark=new T.MeshStandardMaterial({color:'#292e2b',metalness:.7,roughness:.5}),steel=new T.MeshStandardMaterial({color:'#89928b',metalness:.85,roughness:.35}),rubber=new T.MeshStandardMaterial({color:'#20231e',roughness:.9,metalness:0});
 const lens=new T.MeshStandardMaterial({color:'#e3dabd',emissive:'#fff0cf',emissiveIntensity:0,roughness:.3,metalness:.1});lens.name='builder_work_lamp';
 const status=new T.MeshStandardMaterial({color:'#507b48',emissive:'#75d58a',emissiveIntensity:.4,roughness:.4});status.name='builder_status';
 const segments=[16,10,8][lod],Y=new T.Vector3(0,1,0);
 function mesh(parent,geometry,material,position=[0,0,0],name=''){const item=new T.Mesh(geometry,material);item.position.set(...position);item.name=name;item.castShadow=item.receiveShadow=true;parent.add(item);return item;}
 const box=(parent,size,pos,material=paint,name='')=>mesh(parent,new T.BoxGeometry(...size),material,pos,name);
 function cylinder(parent,r,length,pos,material=steel,axis='Z',name=''){const g=new T.CylinderGeometry(r,r,length,segments);if(axis==='Z')g.rotateX(Math.PI/2);if(axis==='X')g.rotateZ(Math.PI/2);return mesh(parent,g,material,pos,name);}
 function group(parent,name,pos){const child=new T.Group();child.name=name;child.position.set(...pos);parent.add(child);return child;}
 function beam(parent,a,b,width,depth,material=paint){const start=new T.Vector3(...a),end=new T.Vector3(...b),direction=end.clone().sub(start),part=box(parent,[width,direction.length(),depth],start.clone().add(end).multiplyScalar(.5).toArray(),material);part.quaternion.setFromUnitVectors(Y,direction.normalize());return part;}
 cylinder(root,.45,.08,[0,0,.04],dark,'Z','mount_flange');cylinder(root,.39,.035,[0,0,.0975],steel);
 group(root,'mount',[0,0,0]);const yaw=group(root,'builder_yaw',[0,0,.08]);
 box(yaw,[.56,.68,.32],[0,-.13,.16],paint);for(const x of [-.19,.19])box(yaw,[.09,.26,.27],[x,-.25,.25],dark);
 const shoulder=group(yaw,'shoulder',[0,-.25,.37]);cylinder(shoulder,.095,.49,[0,0,0],steel,'X');beam(shoulder,[0,0,0],[0,.85,.60],.16,.17);
 for(const x of [-.10,.10])beam(shoulder,[x,.08,.09],[x,.76,.57],.027,.027,rubber);
 const elbow=group(shoulder,'elbow',[0,.85,.60]);cylinder(elbow,.095,.34,[0,0,0],dark,'X');beam(elbow,[0,-.04,0],[0,-.90,.03],.13,.14,paint);
 const telescope=group(elbow,'telescope',[0,-.9,.03]);beam(telescope,[0,1.10,0],[0,-.30,0],.085,.09,steel);beam(telescope,[0,-.30,0],[0,-.30,-.23],.085,.09,steel);
 const wrist=group(telescope,'wrist',[0,-.30,-.23]);cylinder(wrist,.065,.22,[0,0,0],dark,'X');box(wrist,[.16,.19,.18],[0,-.02,-.10],dark);cylinder(wrist,.025,.16,[0,-.02,-.19],steel);
 const tip=group(wrist,'tool_tip',[0,-.02,-.15]);box(wrist,[.17,.065,.07],[0,-.005,.10],dark);box(wrist,[.13,.012,.045],[0,.034,.10],lens);
 box(root,[.28,.52,.28],[.44,-.38,.22],dark,'tool_case');cylinder(root,.18,.17,[-.43,-.4,.30],rubber,'X','cable_reel');cylinder(root,.19,.025,[-.525,-.4,.30],steel,'X');
 mesh(root,new T.SphereGeometry(.015,8,6),status,[.42,-.5,.22],'status');
 const pistonBody=mesh(yaw,new T.CylinderGeometry(.048,.048,1,segments),dark),pistonRod=mesh(yaw,new T.CylinderGeometry(.025,.025,1,segments),steel);
 const sparkPositions=new Float32Array(16*3),sparkGeometry=new T.BufferGeometry();sparkGeometry.setAttribute('position',new T.BufferAttribute(sparkPositions,3));const sparks=new T.Points(sparkGeometry,new T.PointsMaterial({color:'#ffd690',size:.024,transparent:true,opacity:.85,depthWrite:false}));sparks.name='builder_weld_sparks';sparks.visible=false;tip.add(sparks);
 function setRod(item,a,b){const direction=b.clone().sub(a);item.position.copy(a).add(b).multiplyScalar(.5);item.scale.y=direction.length();item.quaternion.setFromUnitVectors(Y,direction.normalize());}
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),smooth=n=>{const t=clamp(n,0,1);return t*t*(3-2*t);};
 function pose(amount=0,heading=0,time=0,working=true){
  const first=smooth(amount/.25),unfold=smooth((amount-.25)/.45),extend=smooth((amount-.7)/.3);yaw.rotation.z=clamp(heading,-150,150)*Math.PI/180*unfold;shoulder.rotation.x=(25*first-35*unfold)*Math.PI/180;elbow.rotation.x=-145*unfold*Math.PI/180;telescope.position.y=-.90-1.05*extend;wrist.rotation.x=-25*extend*Math.PI/180;
  root.updateWorldMatrix(true,true);const a=new T.Vector3(.18,-.13,.16),b=yaw.worldToLocal(shoulder.localToWorld(new T.Vector3(.18,.45,.30))),delta=b.clone().sub(a);setRod(pistonBody,a,a.clone().addScaledVector(delta,.65));setRod(pistonRod,a.clone().addScaledVector(delta,.55),b);
  const welding=working&&amount>.985&&Math.sin(time*23)>.1;sparks.visible=welding;lens.emissiveIntensity=amount>.7?1.7:0;status.emissiveIntensity=amount>.9?.75:.25;
  if(welding){for(let i=0;i<16;i++){const life=((time*2.7+i*.13)%1),angle=i*2.399;sparkPositions[i*3]=Math.cos(angle)*life*.15;sparkPositions[i*3+1]=Math.sin(angle)*life*.15;sparkPositions[i*3+2]=.04*life-.32*life*life;}sparkGeometry.attributes.position.needsUpdate=true;}
  return {deployed:amount>.985,welding,yawDegrees:yaw.rotation.z*180/Math.PI};
 }
 pose(0,0,0,false);return {root,pose,tip,joints:{yaw,shoulder,elbow,telescope,wrist}};
}
