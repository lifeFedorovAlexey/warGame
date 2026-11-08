import * as T from '../demo/vendor/three.module.js';
import {createBuildingPrefab} from './prefabs.js';
import {boxBatch,createMushroom,random,smooth} from './dream-render-kit.js';

export function createDreamCity(glow) {
 const scene=new T.Scene();scene.background=new T.Color('#050403');scene.fog=new T.FogExp2('#050403',.0032);
 const camera=new T.PerspectiveCamera(42,1,.5,1000);camera.up.set(0,0,1);
 const sky=new T.HemisphereLight('#e6cfaa','#443224',1.8);sky.position.set(0,0,1);scene.add(sky);
 const sun=new T.DirectionalLight('#edcf9c',3.2);sun.position.set(-85,-80,160);sun.castShadow=true;
 sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-180,right:180,top:220,bottom:-160,near:1,far:500});sun.shadow.bias=-.0005;sun.shadow.normalBias=.25;scene.add(sun);
 const ground=new T.Mesh(new T.PlaneGeometry(2400,2400),new T.MeshStandardMaterial({color:'#826a45',roughness:1}));ground.position.set(0,95,-.12);ground.receiveShadow=true;scene.add(ground);
 const roads=[],pavements=[],blocks=[[],[],[]],roofs=[],windows=[],equipment=[];
 for(const x of [-128,-86,-44,-2,40,82,124])roads.push({position:[x,70,.02],size:[9,350,.08]});
 for(const y of [-49,-6,37,80,123,166,209])roads.push({position:[0,y,.025],size:[330,9,.08]});
 for(let row=0;row<6;row++)for(let col=0;col<6;col++){
  const i=row*6+col,x=-107+col*42,y=-27+row*43;
  if(row===0&&col>=2&&col<=4)continue;
  pavements.push({position:[x,y,.1],size:[31,33,.3]});
  for(let k=0;k<2;k++){
   const seed=i*11+k,w=11+random(seed+10)*3,d=22+random(seed+30)*4;
   const h=8+Math.floor(random(seed+70)*5)*3.2,px=x+(k-.5)*15;
   blocks[(row+col+k)%3].push({position:[px,y,h*.5+.35],size:[w,d,h]});
   roofs.push({position:[px,y,h+.52],size:[w+.55,d+.55,.45]});
   equipment.push({position:[px-2,y+4,h+1.2],size:[3,4,1.4]});
   for(let floor=0;floor<Math.floor(h/3);floor++)for(let pane=0;pane<4;pane++){
    const z=2+floor*3.1,offset=(pane-1.5)*w*.205;
    windows.push({position:[px+offset,y-d*.5-.04,z],size:[1.35,.08,1.25]});
    windows.push({position:[px-w*.5-.04,y+(pane-1.5)*d*.19,z],size:[.08,2.1,1.25]});
   }
  }
 }
 boxBatch(scene,roads,'#514636');boxBatch(scene,pavements,'#8c7657');
 blocks.forEach((items,i)=>boxBatch(scene,items,['#aa9070','#8d6c50','#b19b7a'][i]));
 boxBatch(scene,roofs,'#675044');boxBatch(scene,windows,'#302820',{emissive:.08});boxBatch(scene,equipment,'#76513b');
 // Actual prefabs keep the dream's industrial district in the game's visual vocabulary.
 for(const [kind,size,position] of [['factory',[26,20,9],[-22,-27,0]],['lab',[16,14,7],[21,-25,0]],['generator',[12,10,5],[62,-26,0]]]){
  const building=createBuildingPrefab(T,kind,{realSizeMetres:size});building.position.set(...position);scene.add(building);
 }
 const first=createMushroom([-22,108,0],1.35,19,glow),second=createMushroom([106,180,0],.78,157,glow);scene.add(first.root,second.root);
 // Fade world positions, including the foreground road ends, into the same
 // darkness as the sky. An incomplete district must never read as a board.
 const faded=new Set();scene.traverse(node=>{
  for(const material of Array.isArray(node.material)?node.material:node.material?[node.material]:[]){
   if(!material.isMeshStandardMaterial||faded.has(material))continue;faded.add(material);
   material.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec2 vDreamGround;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`vec4 dreamPoint=vec4(transformed,1.);
     #ifdef USE_INSTANCING
      dreamPoint=instanceMatrix*dreamPoint;
     #endif
     vDreamGround=(modelMatrix*dreamPoint).xy;
     #include <project_vertex>`);
    shader.fragmentShader='varying vec2 vDreamGround;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <fog_fragment>',`#include <fog_fragment>
     float edge=max(abs(vDreamGround.x/150.),abs((vDreamGround.y-68.)/185.));
     float mist=1.-smoothstep(.60,1.,edge);
     gl_FragColor.rgb=mix(vec3(.020,.016,.012),gl_FragColor.rgb,mist);`);
   };
   material.customProgramCacheKey=()=> 'dream-city-edge-v1';
  }
 });
 const target=new T.Vector3(-8,56,30);
 function update(seconds,aspect,options) {
  const pull=smooth(seconds/6),narrow=Math.max(1,.9/aspect);
  scene.fog.density=.0032/narrow;
  camera.aspect=aspect;camera.position.set(125*narrow,-205*narrow-18*pull,104*narrow+12*pull);camera.lookAt(target);camera.updateProjectionMatrix();
  first.update(seconds-.12,options);second.update(seconds-2.1,options);
 }
 return {scene,camera,update};
}
