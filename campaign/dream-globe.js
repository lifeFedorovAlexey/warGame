import * as T from '../demo/vendor/three.module.js';
import {clamp,smooth,random} from './dream-render-kit.js';
const earthUrl=new URL('../assets/campaign/alpha/mission01/dream-earth.png',import.meta.url).href;
const rad=Math.PI/180;
// Fictional strike locations on every continent, using geographic UV coordinates.
const locations=[[139,36],[116,40],[121,31],[127,38],[103,1],[77,29],[73,19],[90,24],[37,56],[29,41],[31,30],[2,49],[0,52],[13,52],[-3,40],[28,-26],[3,6],[15,-8],[-74,41],[-118,34],[-87,42],[-99,19],[-46,-24],[-58,-35],[-77,-12],[151,-34],[145,-38],[115,-32],[30,-72],[-70,-65]];
const surface=(lon,lat)=>new T.Vector3(Math.cos(lat*rad)*Math.cos(lon*rad),Math.sin(lat*rad),-Math.cos(lat*rad)*Math.sin(lon*rad));
export function createDreamGlobe(glow) {
 const scene=new T.Scene();scene.background=new T.Color('#020407');
 const camera=new T.PerspectiveCamera(39,1,.01,80);
 scene.add(new T.HemisphereLight('#bcc1cc','#1b1716',.65));
 const sun=new T.DirectionalLight('#e4d5c4',2.8);sun.position.set(-3,2,3);scene.add(sun);
 const root=new T.Group();root.rotation.z=-.18;scene.add(root);
 const texture=new T.TextureLoader().load(earthUrl);texture.colorSpace=T.SRGBColorSpace;
 const material=new T.MeshStandardMaterial({map:texture,roughness:1,color:'#c6bcb0'});
 material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
  float luminance=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
  diffuseColor.rgb=mix(vec3(luminance)*vec3(1.04,.92,.84),diffuseColor.rgb,.24);`);};
 root.add(new T.Mesh(new T.SphereGeometry(1,96,64),material));
 root.add(new T.Mesh(new T.SphereGeometry(1.025,64,48),new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.BackSide,blending:T.AdditiveBlending,
  vertexShader:'varying vec3 n; varying vec3 eye; void main(){vec4 p=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);eye=normalize(-p.xyz);gl_Position=projectionMatrix*p;}',
  fragmentShader:'varying vec3 n; varying vec3 eye; void main(){float rim=pow(1.-abs(dot(normalize(n),normalize(eye))),3.);gl_FragColor=vec4(.18,.37,.55,rim*.42);}'
 })));
 const stars=[];for(let i=0;i<600;i++){const a=random(i)*Math.PI*2,z=random(i+30)*2-1,r=Math.sqrt(1-z*z);stars.push(Math.cos(a)*r*25,z*25,Math.sin(a)*r*25);}
 scene.add(new T.Points(new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(stars,3)),new T.PointsMaterial({color:'#95a7ac',size:.025,transparent:true,opacity:.5})));
 const cloudGeometry=new T.IcosahedronGeometry(1,2),ringGeometry=new T.RingGeometry(.88,1,48),marks=[];
 for(let i=0;i<locations.length;i++){
  const [lon,lat]=locations[i],normal=surface(lon,lat),anchor=new T.Group();anchor.position.copy(normal).multiplyScalar(1.004);anchor.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),normal);root.add(anchor);
  const flash=new T.Sprite(new T.SpriteMaterial({map:glow,color:'#ffce85',blending:T.AdditiveBlending,transparent:true,depthTest:false,depthWrite:false}));flash.position.z=.006;anchor.add(flash);
  const core=new T.Sprite(new T.SpriteMaterial({map:glow,color:'#ff9a35',transparent:true,blending:T.AdditiveBlending,depthTest:false,depthWrite:false}));core.position.z=.009;anchor.add(core);
  const ring=new T.Mesh(ringGeometry,new T.MeshBasicMaterial({color:'#d9bb8b',transparent:true,opacity:0,side:T.DoubleSide,depthWrite:false}));ring.position.z=.003;anchor.add(ring);
  const cloud=new T.InstancedMesh(cloudGeometry,new T.MeshStandardMaterial({color:'#8c8879',roughness:1,transparent:true,opacity:0,depthWrite:false}),9);cloud.frustumCulled=false;anchor.add(cloud);
  // Strikes happen while their continent faces the camera, rather than behind the globe.
  let start=Math.max(.25,(75-lon)/30)+random(i+930)*.6;
  if(lon>110&&lat<0)start=(435-lon)/30-.8;
  marks.push({normal,anchor,flash,core,ring,cloud,start});
 }
 const pose=new T.Object3D(),worldNormal=new T.Vector3(),view=new T.Vector3();
 function update(age,aspect,{reducedMotion=false}={}) {
  const pull=smooth(age/2.8),narrow=Math.max(1,.95/aspect);
  camera.aspect=aspect;camera.position.set(.16*(1-pull),-.12,((2.15+pull*1.25)*narrow));camera.lookAt(0,0,0);camera.updateProjectionMatrix();view.copy(camera.position).normalize();
  root.rotation.y=(-165+Math.min(age,10.2)*30)*rad;root.updateMatrixWorld(true);
  for(let i=0;i<marks.length;i++){
   const m=marks[i],t=age-m.start;worldNormal.copy(m.normal).transformDirection(root.matrixWorld);
   m.anchor.visible=t>=0&&worldNormal.dot(view)>1/camera.position.length()+.02;if(!m.anchor.visible)continue;
   const bloom=smooth(t/.12),fade=Math.exp(-Math.max(0,t-.12)*1.5),growth=smooth(t/2.1);
   m.flash.scale.setScalar(.05+bloom*.27);m.flash.material.opacity=bloom*fade*(reducedMotion?.4:1.7);
   m.core.material.opacity=Math.exp(-t*.32)*.95;m.core.scale.setScalar(.04+growth*.055);
   m.ring.scale.setScalar(.003+clamp(t/1.8)*.07);m.ring.material.opacity=Math.exp(-t*2.4)*.23;
   m.cloud.material.opacity=Math.min(.83,t)*Math.max(.4,1-t/12);
   for(let j=0;j<9;j++){
    const a=j*2.4+i,r=(j?.013:.002)*growth;pose.position.set(Math.cos(a)*r,Math.sin(a)*r,.005+growth*.009+(j%2)*.003);
    const size=(.006+random(i*9+j)*.008)*(.25+growth);pose.scale.set(size,size,size*.55);pose.rotation.set(0,0,a+t*.04);pose.updateMatrix();m.cloud.setMatrixAt(j,pose.matrix);
   }m.cloud.instanceMatrix.needsUpdate=true;
  }
 }
 return {scene,camera,update,texture};
}
