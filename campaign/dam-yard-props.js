import {damWorld} from './dam-layout.js';
import {sceneryBuilder} from './environment-geometry.js';

export function createDamYardProps(T,field,layout,addFog){
 const root=new T.Group();root.name='dam_yard_props';root.userData.decorative=true;
 const rust=new T.MeshStandardMaterial({color:'#71503a',roughness:.94,metalness:.25});
 const paint=new T.MeshStandardMaterial({color:'#596047',roughness:.95,metalness:.18});
 const iron=new T.MeshStandardMaterial({color:'#383b31',roughness:.9,metalness:.4});
 const rubber=new T.MeshStandardMaterial({color:'#32342b',roughness:1});
 const dust=new T.MeshStandardMaterial({color:'#575447',roughness:1});
 const coal=new T.MeshStandardMaterial({color:'#2c2119',emissive:'#bc3e0b',emissiveIntensity:.7,roughness:1});
 for(const m of [rust,paint,iron,rubber,dust,coal])addFog(m);
 const {shape,box,finish}=sceneryBuilder(T,root),sites=[];
 const ground=(x,y)=>{const p=damWorld(layout,x,y);return(field.heightAt(p.x,p.y)-layout.z)/layout.scale;};
 for(const [i,[x,y]] of [[-19,-13],[31,-12]].entries()){
  const z=ground(x,y),barrel=new T.CylinderGeometry(.55,.57,1.45,14,3,true).rotateX(Math.PI/2).translate(0,0,.725),position=barrel.getAttribute('position');
  for(let k=0;k<position.count;k++){const a=Math.atan2(position.getY(k),position.getX(k)),dent=1-.08*Math.max(0,Math.cos(a*3+i))*Math.sin(position.getZ(k)/1.45*Math.PI);position.setXYZ(k,position.getX(k)*dent,position.getY(k)*dent,position.getZ(k));}barrel.computeVertexNormals();shape(barrel,i?paint:rust,[x,y,z]);
  for(const h of [.08,.49,1.02,1.44])shape(new T.TorusGeometry(.555,.032,5,14),iron,[x,y,z+h]);
  shape(new T.CircleGeometry(.51,14),iron,[x,y,z+1.29]);
  for(let j=0;j<6;j++){const a=j*2.4;shape(new T.IcosahedronGeometry(.16,0),coal,[x+Math.cos(a)*.3,y+Math.sin(a)*.3,z+1.31]);}
  for(let j=0;j<10;j++){const a=j/10*Math.PI*2;box([.13,.018,.075],[x+Math.sin(a)*.565,y-Math.cos(a)*.565,z+.23],iron,[0,0,a]);}
  // Flaking paint streaks follow the curved drum rather than a clean stripe.
  for(let j=0;j<12;j++){const a=j*2.3,h=.38+(j%4)*.22;box([.06,.012,.15+(j%3)*.06],[x+Math.sin(a)*.552,y-Math.cos(a)*.552,z+h],j%3?rust:dust,[0,0,a]);}
  sites.push({x,y,z,world:damWorld(layout,x,y,z)});
 }
 function tire(x,y,z,rotation=[0,0,0]){
  const ring=new T.TorusGeometry(.52,.18,7,18),group=new T.Group(),temp=sceneryBuilder(T,group);temp.shape(ring,rubber);
  for(let k=0;k<18;k++){const a=k/18*Math.PI*2;temp.box([.14,.13,.34],[Math.cos(a)*.68,Math.sin(a)*.68,0],k%5?rubber:dust,[0,0,a]);}
  temp.shape(new T.TorusGeometry(.4,.026,4,18),dust,[0,0,.13]);temp.finish();group.updateMatrixWorld(true);
  group.traverse(n=>{if(n.isMesh)shape(n.geometry,n.material,[x,y,z],rotation);});
 }
 for(const [x,y,count] of [[-16.7,-14.4,3],[33,-14,2]])for(let i=0;i<count;i++)tire(x+Math.sin(i*4)*.1,y+Math.cos(i*3)*.1,ground(x,y)+.21+i*.38,[0,0,i*.4]);
 tire(-15.4,-12.4,ground(-15.4,-12.4)+.7,[1.12,.1,.3]);tire(34.5,-13.4,ground(34.5,-13.4)+.64,[.9,.2,-.4]);finish();
 const clock={value:0},fireMaterial=new T.ShaderMaterial({uniforms:{clock},transparent:true,depthWrite:false,side:T.DoubleSide,forceSinglePass:true,
  vertexShader:`varying vec2 vFlameUv;uniform float clock;void main(){vFlameUv=uv;vec3 transformed=position;transformed.x+=sin(clock*6.+uv.y*8.)*.10*uv.y;transformed.y+=sin(clock*4.+uv.y*7.)*.07*uv.y;
   #include <worldpos_vertex>
   gl_Position=projectionMatrix*modelViewMatrix*vec4(transformed,1.);}`,
  fragmentShader:`varying vec2 vFlameUv;uniform float clock;void main(){float h=vFlameUv.y,side=abs(vFlameUv.x-.5+sin(h*14.-clock*8.)*.065*h),width=(1.-h)*(.4+.06*sin(clock*11.+h*25.));float alpha=(1.-smoothstep(width*.35,width,side))*(1.-smoothstep(.75,1.,h))*.86;if(alpha<.015)discard;vec3 c=mix(vec3(1.,.22,.025),vec3(1.,.78,.24),(1.-h)*(1.-side*1.4));gl_FragColor=vec4(c,alpha);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
   #include <dithering_fragment>
  }`});addFog(fireMaterial);
 const smokeCanvas=document.createElement('canvas');smokeCanvas.width=smokeCanvas.height=64;const sc=smokeCanvas.getContext('2d'),gradient=sc.createRadialGradient(32,32,0,32,32,31);gradient.addColorStop(0,'#ffffff99');gradient.addColorStop(.45,'#ffffff55');gradient.addColorStop(1,'#ffffff00');sc.fillStyle=gradient;sc.fillRect(0,0,64,64);
 const smokeMap=new T.CanvasTexture(smokeCanvas),smokeGeometry=new T.PlaneGeometry(1,1),animated=[];
 for(const [i,p] of sites.entries()){
  const flames=new T.Group();flames.name='dam_barrel_fire_'+i;root.add(flames);
  for(let j=0;j<3;j++){const g=new T.PlaneGeometry(.94,1.8,1,10).rotateX(Math.PI/2).translate(0,0,.9).rotateZ(j*Math.PI/3),f=new T.Mesh(g,fireMaterial);f.position.set(p.x,p.y,p.z+1.28);f.scale.z=1-j*.13;flames.add(f);}
  const smoke=[];for(let j=0;j<5;j++){const material=new T.MeshBasicMaterial({map:smokeMap,color:'#767368',transparent:true,opacity:.12,depthWrite:false});addFog(material);const puff=new T.Mesh(smokeGeometry,material);puff.name='dam_barrel_smoke';root.add(puff);smoke.push(puff);}
  const light=new T.PointLight('#ff952f',0,layout.scale*10,2);light.name='dam_barrel_light_'+i;light.position.set(p.x,p.y,p.z+1.9);root.add(light);animated.push({site:p,flames,smoke,light});
 }
 const inverse=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),-layout.rotation),billboard=new T.Quaternion();
 function update(mission,camera,time){
  clock.value=time;billboard.copy(inverse).multiply(camera.quaternion);
  for(const [i,{site:p,flames,smoke,light}] of animated.entries()){
   const visible=mission.visibleAt(p.world.x,p.world.y);flames.visible=visible;const flicker=.72+.18*Math.sin(time*12+i*4)+.1*Math.sin(time*23+i);light.intensity=visible?240*flicker:0;
   for(const [j,puff] of smoke.entries()){const age=(time*.23+j/5+i*.17)%1;puff.visible=visible;puff.quaternion.copy(billboard);puff.position.set(p.x+age*.55+Math.sin(time*.4+j)*age*.13,p.y+age*.35,p.z+2.2+age*2.6);puff.scale.setScalar(.55+age*1.7);puff.material.opacity=Math.sin(age*Math.PI)*.18;}
  }
 }
 return {root,update,sites};
}
