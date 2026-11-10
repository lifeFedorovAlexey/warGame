import * as T from '../demo/vendor/three.module.js';
import {boxBatch,createMushroom,random,smooth,clamp} from './dream-render-kit.js';

export function createDreamCity(glow) {
 const scene=new T.Scene();scene.background=new T.Color('#080e13');scene.fog=new T.FogExp2('#080e13',.0028);
 const camera=new T.PerspectiveCamera(58,1,.06,1800);camera.up.set(0,0,1);
 const sky=new T.HemisphereLight('#88919d','#332821',1.1);sky.position.set(0,0,1);scene.add(sky);
 const moon=new T.DirectionalLight('#b5b9c2',1.2);moon.position.set(-85,-90,180);scene.add(moon);
 const ground=new T.Mesh(new T.PlaneGeometry(2600,2600),new T.MeshStandardMaterial({color:'#2c2522',roughness:1}));ground.position.z=-.15;scene.add(ground);
 const roads=[],blocks=[[],[],[]],roofs=[],windows=[],darkWindows=[],streetlights=[];
 for(const x of [-128,-86,-44,-2,40,82,124])roads.push({position:[x,180,.02],size:[8,530,.08]});
 for(const y of [-49,-6,37,80,123,166,209,252,295,338,381])roads.push({position:[0,y,.02],size:[360,8,.08]});
 for(let row=0;row<10;row++)for(let col=0;col<8;col++){
  const i=row*8+col,x=-149+col*42,y=-27+row*43;
  for(let k=0;k<2;k++){
   const seed=i*11+k,w=11+random(seed+10)*3,d=22+random(seed+30)*4;
   const h=9+Math.floor(random(seed+70)*7)*3.2,px=x+(k-.5)*15;
   blocks[(row+col+k)%3].push({position:[px,y,h*.5],size:[w,d,h]});roofs.push({position:[px,y,h+.3],size:[w+.45,d+.45,.45]});
   for(let floor=0;floor<Math.floor(h/3);floor++)for(let pane=0;pane<4;pane++){
    const z=2+floor*3.1,offset=(pane-1.5)*w*.205,list=random(seed*91+floor*4+pane)>.86?windows:darkWindows;
    list.push({position:[px+offset,y-d*.5-.05,z],size:[1.25,.08,1.4]});list.push({position:[px-w*.5-.05,y+(pane-1.5)*d*.19,z],size:[.08,1.8,1.4]});
   }
  }
  streetlights.push({position:[x+18,y-17,4],size:[.12,.12,8]});
 }
 boxBatch(scene,roads,'#211d1c');blocks.forEach((items,i)=>boxBatch(scene,items,['#6c594b','#514842','#796353'][i]));
 boxBatch(scene,roofs,'#3f302a');boxBatch(scene,darkWindows,'#171b23');boxBatch(scene,windows,'#c9aa7a',{emissive:1.7});boxBatch(scene,streetlights,'#564237');
 const lights=[];for(const {position:p} of streetlights)lights.push(p[0],p[1],8.1);
 scene.add(new T.Points(new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(lights,3)),new T.PointsMaterial({map:glow,color:'#e0b773',size:2.4,transparent:true,depthWrite:false,blending:T.AdditiveBlending})));
 const skyline=[];for(let i=0;i<130;i++){const h=20+random(i+802)*65;skyline.push({position:[-650+random(i+20)*1300,460+random(i+91)*350,h/2],size:[12+random(i+83)*23,20,h]});}boxBatch(scene,skyline,'#222f32');
 const first=createMushroom([-22,108,0],1.35,19,glow),second=createMushroom([106,230,0],1.05,157,glow);scene.add(first.root,second.root);
 const missiles=[];
 for(const [i,impact] of [[0,[-22,108,0]],[1,[106,230,0]],[2,[-110,300,0]],[3,[45,370,0]]]){
  const end=new T.Vector3(...impact),start=end.clone().add(new T.Vector3((i%2?1:-1)*(100+i*25),70,170+i*16));
  const trail=new T.Mesh(new T.CylinderGeometry(.07,.9,1,8,1,true),new T.MeshBasicMaterial({color:'#d3b28a',transparent:true,opacity:.6,blending:T.AdditiveBlending,depthWrite:false}));scene.add(trail);
  const head=new T.Sprite(new T.SpriteMaterial({map:glow,color:'#ffb96d',transparent:true,blending:T.AdditiveBlending,depthWrite:false}));head.scale.setScalar(5);scene.add(head);
  missiles.push({start,end,trail,head,impact:.12+i*.9});
 }
 const pulse=new T.DirectionalLight('#ffdc98',0);pulse.position.set(-22,108,30);scene.add(pulse);
 const ring=new T.Mesh(new T.RingGeometry(.92,1,128),new T.MeshBasicMaterial({color:'#e4c28c',transparent:true,opacity:0,side:T.DoubleSide,depthWrite:false}));ring.position.set(-22,108,.3);scene.add(ring);
 function update(seconds,aspect,options={}) {
  first.update((seconds-.12)*1.45,options);second.update((seconds-1.02)*1.4,options);
  pulse.intensity=seconds>=.12?Math.exp(-(seconds-.12)*2.8)*7:0;
  ring.scale.setScalar(Math.max(1,(seconds-.35)*95));ring.material.opacity=seconds>.35?Math.exp(-(seconds-.35)*1.5)*.7:0;
  for(const m of missiles){
   const t=clamp((seconds-(m.impact-5.8))/5.8),visible=seconds>m.impact-5.8&&seconds<m.impact;
   m.trail.visible=m.head.visible=visible;if(!visible)continue;m.head.position.lerpVectors(m.start,m.end,t);
   const tail=new T.Vector3().lerpVectors(m.start,m.end,Math.max(0,t-.24));m.trail.position.copy(m.head.position).add(tail).multiplyScalar(.5);
   m.trail.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),tail.clone().sub(m.head.position).normalize());m.trail.scale.y=Math.max(.001,tail.distanceTo(m.head.position));m.trail.material.opacity=smooth(t*5)*.55;
  }
 }
 return {scene,camera,update};
}
