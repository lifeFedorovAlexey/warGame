import * as T from '../demo/vendor/three.module.js';
import {random,smooth} from './dream-render-kit.js';

// The room and city share a scene; the camera passes through the open window.
export function createDreamRoom(scene,video) {
 const room=new T.Group();scene.add(room);
 const plaster=document.createElement('canvas');plaster.width=plaster.height=256;
 const ctx=plaster.getContext('2d');ctx.fillStyle='#d7cbbb';ctx.fillRect(0,0,256,256);
 for(let i=0;i<3500;i++){ctx.fillStyle=`rgba(${random(i)>.5?'250,242,224':'121,99,79'},.035)`;ctx.fillRect(random(i+1)*256,random(i+2)*256,1,2);}
 ctx.strokeStyle='#ab94851c';ctx.lineWidth=1;
 for(let y=0;y<280;y+=32)for(let x=0;x<280;x+=32){ctx.beginPath();ctx.moveTo(x,y-10);ctx.quadraticCurveTo(x+12,y,x,y+10);ctx.quadraticCurveTo(x-12,y,x,y-10);ctx.stroke();}
 const texture=new T.CanvasTexture(plaster);texture.colorSpace=T.SRGBColorSpace;texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.set(3,2);
 const wall=new T.MeshStandardMaterial({map:texture,color:'#e4d8c6',roughness:1}),wood=new T.MeshStandardMaterial({color:'#65432d',roughness:.78}),trim=new T.MeshStandardMaterial({color:'#d5cdc1',roughness:.8}),dark=new T.MeshStandardMaterial({color:'#151313',roughness:.85});
 const paint=new T.MeshStandardMaterial({color:'#e9e0d3',roughness:.92});
 function box(x,y,z,w,d,h,material=wood){const m=new T.Mesh(new T.BoxGeometry(w,d,h),material);m.position.set(x,y,z);m.receiveShadow=true;room.add(m);return m;}
 const floorCanvas=document.createElement('canvas');floorCanvas.width=floorCanvas.height=256;const fc=floorCanvas.getContext('2d');
 fc.fillStyle='#98704b';fc.fillRect(0,0,256,256);
 for(let i=0;i<8;i++){fc.fillStyle=['#99724d','#aa8059','#896544','#a57b51'][i%4];fc.fillRect(i*32,0,31,256);fc.fillStyle='#34251a';fc.fillRect(i*32,(i%3)*80,32,1);}
 for(let i=0;i<1800;i++){fc.fillStyle=`rgba(62,38,23,${random(i)*.09})`;fc.fillRect(random(i+2)*256,random(i+4)*256,.5,10+random(i+8)*35);}
 const floorTexture=new T.CanvasTexture(floorCanvas);floorTexture.colorSpace=T.SRGBColorSpace;floorTexture.wrapS=floorTexture.wrapT=T.RepeatWrapping;floorTexture.repeat.set(4,4);
 box(0,-79,20,8.8,10.4,.25,new T.MeshStandardMaterial({map:floorTexture,roughness:.82}));box(0,-79,26.6,8.8,10.4,.2,paint);
 box(-4.4,-79,23.3,.2,10.4,6.6,wall);box(4.4,-79,23.3,.2,10.4,6.6,wall);box(0,-84,23.3,8.8,.2,6.6,wall);
 // Front wall opening: x .25..3.65, z 22.35..25.6.
 box(-2.1,-74,23.3,4.7,.28,6.6,wall);box(4.05,-74,23.3,.8,.28,6.6,wall);
 box(1.95,-74,21.18,3.4,.28,2.35,wall);box(1.95,-74,26.1,3.4,.28,1,wall);
 for(const x of [.25,3.65])box(x,-74.22,24,.12,.24,3.45,trim);
 for(const z of [22.35,25.6])box(1.95,-74.22,z,3.55,.24,.12,trim);
 box(1.95,-74.45,22.3,3.8,.7,.13,trim);
 const casement=new T.Group();casement.position.set(3.65,-74.2,24);casement.rotation.z=.7;room.add(casement);
 for(const z of [-1.55,1.55]){const m=new T.Mesh(new T.BoxGeometry(1.5,.07,.07),trim);m.position.set(-.75,0,z);casement.add(m);}
 for(const x of [0,-1.5]){const m=new T.Mesh(new T.BoxGeometry(.07,.07,3.15),trim);m.position.x=x;casement.add(m);}
 const fabric=new T.MeshStandardMaterial({color:'#b69d88',roughness:1,side:T.DoubleSide});
 for(const side of [0,1]){
  const geometry=new T.PlaneGeometry(.65,3.75,18,20),p=geometry.attributes.position;
  for(let i=0;i<p.count;i++)p.setZ(i,Math.sin(p.getX(i)*40)*.075);
  geometry.computeVertexNormals();const curtain=new T.Mesh(geometry,fabric);curtain.rotation.x=Math.PI/2;curtain.position.set(side?3.9:0,-74.55,23.8);room.add(curtain);
 }
 for(let i=0;i<12;i++)box(.7+i*.22,-74.5,21.4,.15,.24,1.05,trim);
 box(1.95,-74.5,21.83,2.8,.2,.1,trim);
 box(-1.8,-75.1,21.1,2.9,1.4,.15);
 for(const x of [-2.9,-.7])for(const y of [-75.55,-74.65])box(x,y,20.55,.12,.12,1.1);
 box(-1.8,-75.08,20.65,2.65,1.15,.78);
 for(const x of [-2.46,-1.14]){box(x,-75.675,20.65,1.27,.04,.7);box(x+.44,-75.71,20.7,.035,.05,.16,trim);}
 const tvStart=room.children.length;
 const shell=new T.MeshStandardMaterial({color:'#503327',roughness:.79}),edge=new T.MeshStandardMaterial({color:'#a18e79',roughness:.66,metalness:.25});
 box(-1.95,-75.03,21.93,1.95,.9,1.5,shell);box(-1.95,-74.48,21.93,1.6,.4,1.24,dark);
 box(-2.15,-75.51,21.95,1.42,.14,1.41,edge);box(-2.15,-75.59,21.95,1.32,.04,1.32,dark);
 const videoTexture=new T.VideoTexture(video);videoTexture.colorSpace=T.SRGBColorSpace;
 const screenMaterial=new T.MeshBasicMaterial({map:videoTexture,toneMapped:false});
 screenMaterial.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
  float gray=dot(diffuseColor.rgb,vec3(.299,.587,.114));
  diffuseColor.rgb=vec3(gray)*vec3(.94,.945,.96)*(.93+.07*sin(vMapUv.y*540.));`);};
 const glass=new T.PlaneGeometry(1.25,1.25,24,24),gp=glass.attributes.position;
 for(let i=0;i<gp.count;i++){const x=gp.getX(i)/.625,y=gp.getY(i)/.625;gp.setZ(i,.075*(1-x*x)*(1-y*y));}glass.computeVertexNormals();
 const screen=new T.Mesh(glass,screenMaterial);screen.rotation.x=Math.PI/2;screen.position.set(-2.15,-75.62,21.95);room.add(screen);
 for(const z of [21.67,22.25]){
  const socket=new T.Mesh(new T.CylinderGeometry(.14,.14,.025,24),dark);socket.position.set(-1.18,-75.5,z);room.add(socket);
  const knob=new T.Mesh(new T.CylinderGeometry(.105,.12,.12,24),edge);knob.position.set(-1.18,-75.565,z);room.add(knob);
  box(-1.18,-75.63,z+.04,.022,.01,.065,dark);
 }
 // Vents and cabinet feet reveal the depth of the side and the weight on the table.
 for(let i=0;i<12;i++)box(-.969,-74.98,21.54+i*.065,.014,.48,.021,dark);
 for(let i=0;i<10;i++)box(-2.45+i*.11,-74.92,22.685,.025,.4,.014,dark);
 for(const x of [-2.65,-1.25])box(x,-75.05,21.145,.22,.5,.13,dark);
 for(let i=0;i<9;i++)box(-1.18,-75.53,21.35+i*.025,.21,.03,.009,dark);
 const led=new T.Mesh(new T.SphereGeometry(.017,8,6),new T.MeshBasicMaterial({color:'#d77b32'}));led.position.set(-1.18,-75.56,21.16);room.add(led);
 const wireMat=new T.LineBasicMaterial({color:'#9c8c7b'});
 for(const sign of [-1,1])room.add(new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(-1.9,-75,22.7),new T.Vector3(-1.9+sign*.6,-74.9,23.5)]),wireMat));
 const television=new T.Group();television.position.set(-1.95,-75.03,21.93);room.add(television);
 for(const part of room.children.slice(tvStart,-1))television.attach(part);
 television.rotation.z=-.13;
 // A lived-in pre-war apartment: clean wallpaper, parquet, a wool rug and upholstery.
 const rugCanvas=document.createElement('canvas');rugCanvas.width=512;rugCanvas.height=384;const rc=rugCanvas.getContext('2d');
 rc.fillStyle='#704335';rc.fillRect(0,0,512,384);
 for(const [inset,color] of [[8,'#b69b76'],[15,'#513b31'],[25,'#bd9468'],[31,'#783c30'],[44,'#a77c53'],[48,'#6d3b30']]){rc.fillStyle=color;rc.fillRect(inset,inset,512-inset*2,384-inset*2);}
 function diamond(x,y,w,h,color){rc.fillStyle=color;rc.beginPath();rc.moveTo(x,y-h);rc.lineTo(x+w,y);rc.lineTo(x,y+h);rc.lineTo(x-w,y);rc.closePath();rc.fill();}
 diamond(256,192,130,115,'#be986d');diamond(256,192,114,100,'#453b36');diamond(256,192,94,82,'#9c5b3e');diamond(256,192,56,50,'#c8ac80');
 for(let x=65;x<490;x+=38)for(const y of [22,362])diamond(x,y,9,7,'#d2b88e');
 for(let y=65;y<340;y+=38)for(const x of [22,490])diamond(x,y,7,9,'#d2b88e');
 const rugTexture=new T.CanvasTexture(rugCanvas);rugTexture.colorSpace=T.SRGBColorSpace;
 const rug=new T.Mesh(new T.PlaneGeometry(4.8,3.3),new T.MeshStandardMaterial({map:rugTexture,roughness:1}));rug.position.set(-.3,-77.7,20.136);room.add(rug);
 const cushionGeometry=new T.SphereGeometry(1,32,20),cp=cushionGeometry.attributes.position;
 for(let i=0;i<cp.count;i++)for(const axis of ['X','Y','Z']){const value=cp['get'+axis](i);cp['set'+axis](i,Math.sign(value)*Math.pow(Math.abs(value),.36));}cushionGeometry.computeVertexNormals();
 const upholstery=new T.MeshStandardMaterial({color:'#8c6252',roughness:1}),pillow=new T.MeshStandardMaterial({color:'#d2b68e',roughness:1});
 function cushion(x,y,z,w,d,h,mat=upholstery){const m=new T.Mesh(cushionGeometry,mat);m.position.set(x,y,z);m.scale.set(w/2,d/2,h/2);room.add(m);return m;}
 box(-3.35,-77.6,20.43,1.3,1.55,.5);cushion(-3.35,-77.55,20.83,1.45,1.55,.4);
 cushion(-3.35,-78.25,21.35,1.5,.35,1.4);for(const x of [-4.1,-2.6])cushion(x,-77.6,21.05,.28,1.75,.7);
 const loosePillow=cushion(-3.25,-78.04,21.3,.65,.22,.65,pillow);loosePillow.rotation.y=.2;
 // Floating bookshelf, a quiet wall clock and a low reading lamp.
 box(-2.1,-74.45,24.23,2.7,.7,.09);
 const bookColors=['#6d3f36','#b59871','#405064','#856b55','#a77245','#cbc0a6'];
 for(let i=0;i<11;i++){
  const h=.32+random(i+80)*.22;const cover=new T.MeshStandardMaterial({color:bookColors[i%bookColors.length],roughness:1});
  box(-3.12+i*.18,-74.47,24.28+h/2,.13+random(i)*.04,.36,h,cover);box(-3.12+i*.18,-74.66,24.32+h*.58,.085,.007,.013,trim);
 }
 const clockCanvas=document.createElement('canvas');clockCanvas.width=clockCanvas.height=256;const cc=clockCanvas.getContext('2d');cc.fillStyle='#e7dfd0';cc.fillRect(0,0,256,256);cc.translate(128,128);
 cc.fillStyle='#46372f';cc.font='20px Georgia';cc.textAlign='center';cc.textBaseline='middle';
 for(let n=1;n<=12;n++){const a=n*Math.PI/6;cc.fillText(String(n),Math.sin(a)*95,-Math.cos(a)*95);}
 cc.lineCap='round';for(const [a,length,width] of [[(2+17/60)*Math.PI/6,55,7],[17*Math.PI/30,80,4]]){cc.strokeStyle='#473830';cc.lineWidth=width;cc.beginPath();cc.moveTo(0,0);cc.lineTo(Math.sin(a)*length,-Math.cos(a)*length);cc.stroke();}
 const clockTexture=new T.CanvasTexture(clockCanvas);clockTexture.colorSpace=T.SRGBColorSpace;
 const clockCase=new T.Mesh(new T.CylinderGeometry(.35,.35,.075,48),wood);clockCase.position.set(-2.45,-74.23,25.38);room.add(clockCase);
 const clockFace=new T.Mesh(new T.CircleGeometry(.315,48),new T.MeshStandardMaterial({map:clockTexture,roughness:.8}));clockFace.rotation.x=Math.PI/2;clockFace.position.set(-2.45,-74.273,25.38);room.add(clockFace);
 const lampMetal=new T.MeshStandardMaterial({color:'#5d4434',roughness:.6,metalness:.4});
 box(-3.95,-76.2,21.25,.045,.045,2.2,lampMetal);box(-3.95,-76.2,20.2,.5,.5,.08,lampMetal);
 const shade=new T.Mesh(new T.CylinderGeometry(.24,.4,.5,32,1,true),new T.MeshStandardMaterial({color:'#e5cba4',emissive:'#d29a5c',emissiveIntensity:.22,roughness:1,side:T.DoubleSide}));shade.rotation.x=Math.PI/2;shade.position.set(-3.95,-76.2,22.35);room.add(shade);
 const lampLight=new T.PointLight('#ffd5a1',4.5,5,1.6);lampLight.position.set(-3.95,-76.2,22.1);room.add(lampLight);
 const mug=new T.Mesh(new T.CylinderGeometry(.1,.09,.2,16,1,true),trim);mug.rotation.x=Math.PI/2;mug.position.set(-.75,-75.25,21.27);room.add(mug);
 const tvLight=new T.PointLight('#c8cdd7',16,8,1.7);tvLight.position.set(-2.1,-76,22.2);room.add(tvLight);
 const moon=new T.SpotLight('#a9b5c8',26,12,.85,.7,1);moon.position.set(2,-73,25.5);moon.target.position.set(-1,-79,20);room.add(moon,moon.target);
 const start=new T.Vector3(1.15,-79.5,23.35),end=new T.Vector3(1.8,-73.1,24.05),target=new T.Vector3(),skyPosition=new T.Vector3(22,-120,320),skyTarget=new T.Vector3(-12,105,0);
 function update(time,duration,camera,aspect,{reducedMotion=false,blastAge=-1}={}){
  const travel=smooth((time-Math.max(5,duration-16))/Math.min(14,duration-5));
  camera.position.lerpVectors(start,end,travel);target.set(-.3+2.1*travel,-74+travel*150,22.7+travel*8.2);
  const narrow=smooth((1.2-aspect)/.75);camera.position.y-=narrow*(1-travel)*1.7;
  // Keep the horizontal composition on phones: do not crop the TV or the missiles.
  camera.fov=T.MathUtils.radToDeg(2*Math.atan(Math.tan(T.MathUtils.degToRad((58-travel*5)/2))*Math.max(1,1.35/aspect)));
  if(!reducedMotion){camera.position.z+=Math.sin(time*1.35)*.014*(1-travel);target.x+=Math.sin(time*.8)*.015;}
  if(blastAge>=0){
   const ascend=smooth((blastAge-1.6)/1.7);camera.position.lerp(skyPosition,ascend);target.lerp(skyTarget,ascend);
   if(!reducedMotion){const shake=Math.exp(-Math.max(0,blastAge-.7)*3)*smooth((blastAge-.7)/.12);camera.position.x+=Math.sin(blastAge*76)*.12*shake;camera.position.z+=Math.sin(blastAge*91)*.07*shake;}
  }
  camera.aspect=aspect;camera.near=.06;camera.lookAt(target);camera.updateProjectionMatrix();
  tvLight.intensity=blastAge>=0?0:13+Math.sin(time*11)*1.6+Math.sin(time*23)*.9;room.visible=blastAge<2.8;
  return {travel};
 }
 return {update,videoTexture,room};
}
