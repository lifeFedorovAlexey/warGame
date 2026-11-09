import * as T from '../demo/vendor/three.module.js';
import {clamp,smooth,random} from './dream-render-kit.js';

const earthUrl=new URL('../assets/campaign/alpha/mission01/dream-earth.png',import.meta.url).href;
const cities=[[139,36],[116,40],[121,31],[127,38],[103,1],[77,29],[73,19],[90,24],[37,56],[29,41],[31,30],[2,49],[0,52],[13,52],[-3,40],[28,-26],[3,6],[-74,41],[-118,34],[-87,42],[-99,19],[-46,-24],[-58,-35],[-77,-12],[151,-34],[145,-38]];
const rad=Math.PI/180;
// Coordinates follow Three's equirectangular sphere UVs, not screen positions.
const surface=(lon,lat)=>new T.Vector3(Math.cos(lat*rad)*Math.cos(lon*rad),Math.sin(lat*rad),-Math.cos(lat*rad)*Math.sin(lon*rad));

export function createDreamGlobe(glow) {
 const scene=new T.Scene();scene.background=new T.Color('#050403');
 const camera=new T.PerspectiveCamera(33,1,.01,50);camera.position.set(0,.10,4.5);camera.lookAt(0,0,0);
 scene.add(new T.HemisphereLight('#d9c3a4','#160f09',.65));
 const sun=new T.DirectionalLight('#ecd1a5',3);sun.position.set(-3,2.5,4);scene.add(sun);
 const root=new T.Group();root.rotation.z=-.12;scene.add(root);
 const texture=new T.TextureLoader().load(earthUrl);texture.colorSpace=T.SRGBColorSpace;
 const material=new T.MeshStandardMaterial({map:texture,roughness:1,metalness:0,color:'#c6ae89'});
 material.onBeforeCompile=shader=>{
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
   float luminance=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
   diffuseColor.rgb=mix(vec3(luminance)*vec3(1.1,.89,.65),diffuseColor.rgb,.18);`);
 };
 const earth=new T.Mesh(new T.SphereGeometry(1,128,80),material);root.add(earth);
 const atmosphere=new T.Mesh(new T.SphereGeometry(1.016,80,48),new T.ShaderMaterial({
  transparent:true,depthWrite:false,side:T.BackSide,blending:T.AdditiveBlending,
  vertexShader:'varying vec3 n; varying vec3 eye; void main(){vec4 p=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);eye=normalize(-p.xyz);gl_Position=projectionMatrix*p;}',
  fragmentShader:'varying vec3 n; varying vec3 eye; void main(){float rim=pow(1.-abs(dot(normalize(n),normalize(eye))),4.);gl_FragColor=vec4(.40,.28,.16,rim*.19);}'
 }));root.add(atmosphere);
 const cloudGeometry=new T.IcosahedronGeometry(1,2),marks=[];
 for(let i=0;i<cities.length;i++){
  const normal=surface(...cities[i]),anchor=new T.Group();anchor.position.copy(normal).multiplyScalar(1.004);
  anchor.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),normal);root.add(anchor);
  const flash=new T.Sprite(new T.SpriteMaterial({map:glow,color:'#ffe0a1',blending:T.AdditiveBlending,transparent:true,depthWrite:false}));
  flash.position.z=.003;anchor.add(flash);
  const cloudMaterial=new T.MeshStandardMaterial({color:'#a99e80',roughness:1,transparent:true,opacity:0,depthWrite:false});
  const cloud=new T.InstancedMesh(cloudGeometry,cloudMaterial,7);cloud.frustumCulled=false;anchor.add(cloud);
  const scorch=new T.Sprite(new T.SpriteMaterial({map:glow,color:'#24180d',transparent:true,depthWrite:false,opacity:0}));scorch.position.z=.001;anchor.add(scorch);
  marks.push({normal,anchor,flash,cloud,scorch,start:i<17?i*.14:(i-17)*.19+2.9});
 }
 const pose=new T.Object3D(),worldNormal=new T.Vector3();
 function update(age,aspect,{reducedMotion=false}={}) {
  camera.aspect=aspect;camera.position.z=Math.max(4.15,3.9/aspect)+smooth(age/6)*.22;camera.lookAt(0,0,0);camera.updateProjectionMatrix();
  root.rotation.y=(-165+Math.min(age,6.2)*20)*rad;root.updateMatrixWorld(true);
  for(let i=0;i<marks.length;i++){
   const m=marks[i],t=age-m.start;
   // Explicit horizon cull keeps billboard corners from leaking across the limb.
   worldNormal.copy(m.normal).transformDirection(root.matrixWorld);
   m.anchor.visible=t>=0&&worldNormal.z>1/camera.position.length()+.025;if(!m.anchor.visible)continue;
   const bloom=clamp(t/.13),fade=Math.exp(-Math.max(0,t-.13)*3.5),growth=smooth(t/2.6);
   m.flash.scale.setScalar(.045+bloom*.09);m.flash.material.opacity=bloom*fade*(reducedMotion?.5:1.5);
   m.scorch.scale.setScalar(.025+growth*.075);m.scorch.material.opacity=clamp(t)*.53;
   m.cloud.material.opacity=Math.min(.72,t*.8)*Math.max(.25,1-t/7);
   for(let j=0;j<7;j++){
    const a=j*2.4+i,r=(j? .012:.002)*growth;
    pose.position.set(Math.cos(a)*r,Math.sin(a)*r,.002+growth*.006+(j%2)*.001);
    const size=(.005+random(i*8+j)*.007)*(.25+growth);pose.scale.set(size,size,size*.35);pose.rotation.set(0,0,a+t*.04);pose.updateMatrix();m.cloud.setMatrixAt(j,pose.matrix);
   }
   m.cloud.instanceMatrix.needsUpdate=true;
  }
 }
 return {scene,camera,update,texture};
}
