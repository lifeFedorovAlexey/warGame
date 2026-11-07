import {setButtonIcon, setButtonLabel} from '../assets/ui/icons.js';
import * as T from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { buildBukhanka } from './bukhanka.js';
import { buildKord } from './kord.js';
import {createHeadlightPair,setHeadlightPower,createMuzzleFlash} from './vehicle-effects.js';
import { createProductionExporter } from './production-kit.js';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';
import { createAlphaMap } from './alpha-map.js';
import { createDesertSky } from './sky.js';
import { createMapNavigation } from './map-navigation.js';
import { createDriveModel } from './drive-model.js';
import { createWheelEffects } from './wheel-effects.js';
import { createGroundDust } from './ground-dust.js';
import { createTerrainCameraResolver } from './terrain-camera.js';
const lod=Math.max(0,Math.min(2,Number(new URLSearchParams(location.search).get('lod')||0)));
const VEHICLE_WORLD_SCALE=4.5;
const exportMode=new URLSearchParams(location.search).has('export');

const host=document.getElementById('viewport');
const state={ready:false,mode:'arena',paused:false,fire:true,lights:true,night:false,cameraMode:'overview',timeScale:20,simulatedSeconds:0,routeDistance:0,groundHeight:0,shots:0,impacts:0,angle:0,explosion:0};
window.demoState=state;
window.addEventListener('error',e=>{const box=document.getElementById('error');box.hidden=false;box.textContent='Ошибка демо: '+e.message;});
const renderer=new T.WebGLRenderer({antialias:true,alpha:false});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.15));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;host.prepend(renderer.domElement);
const scene=new T.Scene();scene.background=new T.Color('#78816d');scene.fog=new T.Fog('#78816d',3500,10500);
const camera=new T.PerspectiveCamera(43,1,.1,22000);camera.up.set(0,0,1);camera.position.set(20,-17,12);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=5;controls.maxDistance=16000;controls.maxPolarAngle=Math.PI*.47;controls.target.set(9,0,1.8);
const hemi=new T.HemisphereLight('#c4d8e0','#79664d',2.3);hemi.position.set(0,0,30);scene.add(hemi);
const sun=new T.DirectionalLight('#ffdfb7',2.5);sun.position.set(-18,5,30);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-21,right:21,top:21,bottom:-21,near:1,far:80});sun.shadow.normalBias=.015;scene.add(sun);scene.add(sun.target);
const fill=new T.DirectionalLight('#a5b6c3',1.2);fill.position.set(10,-20,8);scene.add(fill);
const sky=await createDesertSky(T,renderer,scene);state.sky=sky.statistics;
const material=(c,metalness=.2,roughness=.7)=>new T.MeshStandardMaterial({color:c,metalness,roughness});
const olive=material('#5c644c',.3,.44),edge=material('#6a7058',.4,.48),dark=material('#242b27',.5,.65),rubber=new T.MeshLambertMaterial({color:'#171b19'}),steel=material('#717972',.85,.34),glass=material('#293e42',.05,.25),amber=material('#bc9848',.45,.5);
glass.envMapIntensity=.35;
const paintCanvas=document.createElement('canvas');paintCanvas.width=paintCanvas.height=128;const paintContext=paintCanvas.getContext('2d');const paintPixels=paintContext.createImageData(128,128);let paintSeed=9831;for(let i=0;i<paintPixels.data.length;i+=4){paintSeed=(1664525*paintSeed+1013904223)>>>0;const v=117+(paintSeed%24);paintPixels.data.set([v,v,v,255],i);}paintContext.putImageData(paintPixels,0,0);const paintBump=new T.CanvasTexture(paintCanvas);paintBump.wrapS=paintBump.wrapT=T.RepeatWrapping;for(const m of [olive,edge]){m.bumpMap=paintBump;m.bumpScale=.002;m.roughness=.44;}
let lampMat=new T.MeshStandardMaterial({color:'#fff0c5',emissive:'#ffdda0',emissiveIntensity:2});
let redMat=new T.MeshStandardMaterial({color:'#822b20',emissive:'#ff2910',emissiveIntensity:.7});
lampMat.name='headlamp_lens';redMat.name='rear_stop_lens';olive.name='paint_olive';steel.name='steel';glass.name='window_glass';
function mesh(parent,geo,mat,pos=[0,0,0],name=''){const o=new T.Mesh(geo,mat);o.position.set(...pos);o.castShadow=true;o.receiveShadow=true;o.name=name;parent.add(o);return o;}
function box(parent,size,pos,mat=olive,name=''){return mesh(parent,new T.BoxGeometry(...size),mat,pos,name);}
function cylinder(parent,r,len,pos,mat=olive,axis='Z',name=''){const g=new T.CylinderGeometry(r,r,len,[20,12,8][lod]);if(axis==='Z')g.rotateX(Math.PI/2);if(axis==='X')g.rotateZ(Math.PI/2);return mesh(parent,g,mat,pos,name);}
function group(parent,pos,name){const g=new T.Group();g.position.set(...pos);g.name=name;parent.add(g);return g;}
function line(parent,points,color='#bdca83',dash=false){const geom=new T.BufferGeometry().setFromPoints(points.map(p=>new T.Vector3(...p)));const m=dash?new T.LineDashedMaterial({color,dashSize:.15,gapSize:.1}):new T.LineBasicMaterial({color});const o=new T.Line(geom,m);if(dash)o.computeLineDistances();parent.add(o);return o;}
function rounded(parent,w,l,h,r,pos,mat=olive){const s=new T.Shape();s.moveTo(-w/2+r,-l/2);s.lineTo(w/2-r,-l/2);s.quadraticCurveTo(w/2,-l/2,w/2,-l/2+r);s.lineTo(w/2,l/2-r);s.quadraticCurveTo(w/2,l/2,w/2-r,l/2);s.lineTo(-w/2+r,l/2);s.quadraticCurveTo(-w/2,l/2,-w/2,l/2-r);s.lineTo(-w/2,-l/2+r);s.quadraticCurveTo(-w/2,-l/2,-w/2+r,-l/2);const bevel=Math.min(.035,h*.22);const geo=new T.ExtrudeGeometry(s,{depth:h,bevelEnabled:lod<2,bevelSize:bevel,bevelThickness:bevel,bevelSegments:lod===0?2:1,curveSegments:[6,3,1][lod],steps:1});return mesh(parent,geo,mat,pos);}
function rod(parent,from,to,r,mat=steel){const a=new T.Vector3(...from),b=new T.Vector3(...to),d=b.clone().sub(a);const o=mesh(parent,new T.CylinderGeometry(r,r,d.length(),[10,8,6][lod]),mat,a.clone().add(b).multiplyScalar(.5).toArray());o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());return o;}
function instances(parent,geo,mat,transforms,shadow=false){const inst=new T.InstancedMesh(geo,mat,transforms.length);const dummy=new T.Object3D();transforms.forEach((t,i)=>{dummy.position.set(...t.p);dummy.rotation.set(...(t.r||[0,0,0]));dummy.scale.set(1,1,1);dummy.updateMatrix();inst.setMatrixAt(i,dummy.matrix);});inst.castShadow=shadow;inst.receiveShadow=true;parent.add(inst);return inst;}
function mergeStatic(parent){const batches=new Map();for(const child of [...parent.children])if(child.isMesh&&!child.isInstancedMesh&&!Array.isArray(child.material)){if(!batches.has(child.material))batches.set(child.material,[]);batches.get(child.material).push(child);}for(const [mat,items] of batches){if(items.length<2)continue;const attrs={position:[],normal:[],uv:[]};for(const item of items){item.updateMatrix();const g=item.geometry.index?item.geometry.toNonIndexed():item.geometry.clone();g.applyMatrix4(item.matrix);for(const key of Object.keys(attrs)){const a=g.getAttribute(key);if(a)attrs[key].push(a.array);}g.dispose();}const merged=new T.BufferGeometry();for(const [key,arrays] of Object.entries(attrs)){if(!arrays.length)continue;const data=new Float32Array(arrays.reduce((s,a)=>s+a.length,0));let offset=0;for(const a of arrays){data.set(a,offset);offset+=a.length;}merged.setAttribute(key,new T.BufferAttribute(data,key==='uv'?2:3));}mesh(parent,merged,mat);for(const item of items){parent.remove(item);item.geometry.dispose();}}}
const mapScene=group(scene,[0,0,0],'Alpha_level');
const terrain=await createAlphaMap(T);mapScene.add(terrain.root);state.map={...terrain.statistics,vehicleScale:VEHICLE_WORLD_SCALE,referenceLaneWidthMetres:10};state.mapReady=true;
const resolveCamera=createTerrainCameraResolver({camera,controls,field:terrain.field,state});
const studio=group(scene,[0,0,0],'model_review_studio');box(studio,[90,90,.08],[0,0,-.01],new T.MeshLambertMaterial({color:'#686d67'}));studio.visible=false;
const drive=createDriveModel(),wheelEffects=createWheelEffects(T,scene,(x,y)=>surfaceHeight(x,y));
const groundDust=createGroundDust(T,mapScene,terrain.field);
const wheelContacts=Array.from({length:4},()=>new T.Vector3());
const targets=[],mapTargets=[],studioTargets=[];
function addTarget(parent,x,y,h,heading){
 const g=group(parent,[x,y,h],'target_'+targets.length);g.rotation.z=heading;box(g,[2,.8,.25],[0,0,.125],dark);box(g,[.18,.18,1.8],[0,0,1.1],steel);
 const face=box(g,[1.7,.18,2],[0,0,2.1],new T.MeshLambertMaterial({color:'#6b7264'}));box(g,[1.1,.04,.06],[0,.115,2.1],amber);box(g,[.06,.04,1.1],[0,.115,2.1],amber);
 const target={group:g,face,point:new T.Vector3(x,y,h+2.4),index:targets.length};targets.push(target);return target;
}
for(const stop of terrain.route.stops){const p=terrain.route.sample(stop.distance+60),x=p.x+Math.cos(p.heading)*14,y=p.y+Math.sin(p.heading)*14;const target=addTarget(mapScene,x,y,terrain.heightAt(x,y)+.03,p.heading);target.group.scale.setScalar(VEHICLE_WORLD_SCALE);target.group.visible=false;target.point.z=terrain.heightAt(x,y)+.03+2.4*VEHICLE_WORLD_SCALE;mapTargets.push(target);}
for(let i=0;i<4;i++){const a=i*Math.PI/2;studioTargets.push(addTarget(studio,16*Math.cos(a),16*Math.sin(a),.03,a-Math.PI/2));}
function surfaceHeight(x,y){return state.mode==='arena'?terrain.heightAt(x,y):0;}
const vehicle=group(scene,[9,0,0],'C01_B01_U01');
const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=64;const sh=shadowCanvas.getContext('2d');const grad=sh.createRadialGradient(32,32,2,32,32,32);grad.addColorStop(0,'rgba(0,0,0,.7)');grad.addColorStop(1,'rgba(0,0,0,0)');sh.fillStyle=grad;sh.fillRect(0,0,64,64);const contactPatches=[];const shadowMaterial=new T.MeshBasicMaterial({map:new T.CanvasTexture(shadowCanvas),transparent:true,opacity:.5,depthWrite:false});const softShadow=mesh(vehicle,new T.PlaneGeometry(2.1,4.0),shadowMaterial,[0,0,.009]);softShadow.castShadow=false;for(const x of [-.7,.7])for(const y of [-1.3,1.3]){const contact=mesh(vehicle,new T.PlaneGeometry(.48,.66),shadowMaterial,[x,y,.011]);contact.castShadow=false;contactPatches.push(contact);}
const chassisRoot=group(vehicle,[0,0,0],'C01_DVOR');
const chassis=group(chassisRoot,[0,0,0],'sprung_frame');
// Two steel frame rails, crossmembers, leaf springs and axle supports.
for(const x of [-.40,.40])box(chassis,[.16,3.8,.20],[x,0,.87],dark);
for(const y of [-1.7,-.7,.7,1.7])box(chassis,[.95,.13,.16],[0,y,.87],steel);
box(chassis,[1.7,3.8,.10],[0,0,1.00],olive);
for(const y of [-1.3,1.3]){cylinder(chassis,.075,1.4,[0,y,.45],steel,'X');mesh(chassis,new T.SphereGeometry(.19,12,8),dark,[0,y,.45]);for(const x of [-.45,.45]){for(let leaf=0;leaf<3;leaf++)box(chassis,[.095,.96-leaf*.14,.028],[x,y,.67+leaf*.03],dark);for(const dy of [-.46,.46])box(chassis,[.10,.08,.23],[x,y+dy,.83],steel);rod(chassis,[x,y-.28,.52],[x*.82,y+.32,.96],.033,steel);rod(chassis,[x*.82,y+.32,.96],[x,y-.06,.69],.064,dark);}rod(chassis,[0,y,.45],[0,0,.87],.055,dark);}
for(const x of [-.65,.65])for(const y of [-1.45,1.45])box(chassis,[.18,.18,.02],[x,y,1.04],amber);
const wheels=[];
for(const x of [-.70,.70])for(const y of [-1.3,1.3]){const sign=Math.sign(x);rod(chassis,[sign*.45,y-.25,.75],[x,y,.45],.055,steel);rod(chassis,[sign*.45,y+.25,.75],[x,y,.45],.055,steel);cylinder(chassis,.11,.22,[sign*.67,y,.45],dark,'X');const stem='axle_'+(y>0?'1':'2')+'_'+(x<0?'L':'R');const susp=group(chassisRoot,[x,y,.45],stem+'_suspension');const steer=group(susp,[0,0,0],stem+'_steer');const spin=group(steer,[0,0,0],stem+'_wheel');cylinder(spin,lod===2?.45:.435,.35,[0,0,0],rubber,'X');cylinder(spin,.265,.37,[0,0,0],steel,'X');cylinder(spin,.10,.4,[0,0,0],dark,'X');instances(spin,new T.BoxGeometry(.37,.086,.035),rubber,Array.from({length:[20,12,0][lod]},(_,j)=>{const a=j*Math.PI*2/[20,12,1][lod];return{p:[0,.4325*Math.sin(a),.4325*Math.cos(a)],r:[-a,0,(j%2?1:-1)*.12]};}),true);const bolt=new T.CylinderGeometry(.023,.023,.405,8);bolt.rotateZ(Math.PI/2);instances(spin,bolt,dark,Array.from({length:lod===0?6:0},(_,j)=>({p:[0,.19*Math.sin(j*Math.PI/3),.19*Math.cos(j*Math.PI/3)]})));wheels.push({steer,spin,x,y});}
// C01 owns the pressed-metal wheel arches. No extra component is attached to B01.
const archShape=new T.Shape();archShape.moveTo(-2.02,1.038);archShape.lineTo(2.02,1.038);archShape.lineTo(2.02,.50);archShape.lineTo(1.88,.50);archShape.lineTo(1.72,.98);archShape.lineTo(.88,.98);archShape.lineTo(.72,.50);archShape.lineTo(-.72,.50);archShape.lineTo(-.88,.98);archShape.lineTo(-1.72,.98);archShape.lineTo(-1.88,.50);archShape.lineTo(-2.02,.50);archShape.closePath();
for(const sign of [-1,1]){const arch=new T.ExtrudeGeometry(archShape,{depth:.035,bevelEnabled:true,bevelSize:.012,bevelThickness:.012,bevelSegments:lod===0?2:1});arch.translate(0,0,-.0175);arch.applyMatrix4(new T.Matrix4().makeBasis(new T.Vector3(0,1,0),new T.Vector3(0,0,1),new T.Vector3(1,0,0)));mesh(chassis,arch,olive,[sign*.911,0,0],'C01_wheel_arch_'+sign);line(chassis,[[sign*.98,-1.88,.50],[sign*.98,-1.72,.98],[sign*.98,-.88,.98],[sign*.98,-.72,.50]],'#333c31');line(chassis,[[sign*.98,.72,.50],[sign*.98,.88,.98],[sign*.98,1.72,.98],[sign*.98,1.88,.50]],'#333c31');}
for(const sign of [-1,1])box(chassis,[.008,4.02,.004],[sign*.941,0,1.049],dark);
box(chassis,[1.88,.11,.12],[0,2.01,.55],dark);box(chassis,[1.88,.11,.12],[0,-2.01,.55],dark);
// Heavy guards are part of C01, structurally carried by the chassis rails.
function guardTube(points,r=.055){const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)));return mesh(chassis,new T.TubeGeometry(curve,[20,12,6][lod],r,[8,6,4][lod],false),dark);}
let rearGuardTop=0;
for(const end of [-1,1]){
 const firstGuardPart=chassis.children.length;
 const y=end*2.32;const top=end===1?1.38:.90,wing=end===1?1.10:.88;
 box(chassis,[2.02,.22,.17],[0,end*2.25,.56],dark);
 for(const x of [-.46,.46]){box(chassis,[.13,.62,.12],[x,end*1.99,.65],steel);rod(chassis,[x,end*1.72,.83],[x,end*2.32,.94],.055,dark);}
 guardTube([[-.60,y,.60],[-.60,y,top-.12],[-.49,y,top],[.49,y,top],[.60,y,top-.12],[.60,y,.60]],.060);
 for(const sign of [-1,1])guardTube([[sign*.60,y,.70],[sign*.98,y,wing-.07],[sign*1.02,end*2.19,wing],[sign*1.02,end*1.83,wing]],.052);
 const upperCross=end===1?1.02:.84,lowerCross=end===1?.76:.68;rod(chassis,[-.60,y,upperCross],[.60,y,upperCross],.052,dark);rod(chassis,[-.60,y,lowerCross],[.60,y,lowerCross],.049,dark);
 const shield=box(chassis,[1.32,.055,.40],[0,end*2.12,.78],steel);shield.rotation.x=end*.12;
 for(const x of [-.52,.52])for(const z of [.65,.90])cylinder(chassis,.026,.07,[x,end*2.16,z],dark,'Y');
 if(end<0){chassis.updateWorldMatrix(true,true);const bounds=new T.Box3();for(const part of chassis.children.slice(firstGuardPart))bounds.expandByObject(part);rearGuardTop=bounds.max.z;}
}
box(chassis,[1.44,.30,.085],[0,-2.26,.58],dark);
group(chassis,[0,0,1.05],'body_mount');for(const [name,x,y] of [['FL',-.65,1.45],['FR',.65,1.45],['RL',-.65,-1.45],['RR',.65,-1.45]])group(chassis,[x,y,1.05],'pad_'+name);
const body=group(chassis,[0,0,1.05],'B01_BUKHANKA');
group(body,[0,0,0],'mount');group(body,[0,-.65,1.65],'upper_mount');for(const [name,x,y] of [['FL',-.65,1.45],['FR',.65,1.45],['RL',-.65,-1.45],['RR',.65,-1.45]])group(body,[x,y,0],'pad_'+name);for(const [name,x,y,z] of [['headlamp_L',-.62,2.18,.56],['headlamp_R',.62,2.18,.56],['rear_marker_L',-.77,-2.11,.35],['rear_marker_R',.77,-2.11,.35]])group(body,[x,y,z],name);
const indicator=new T.MeshStandardMaterial({color:'#d48e29',emissive:'#ff9c2a',emissiveIntensity:.25,metalness:.15,roughness:.35});
buildBukhanka(T,body,{olive,edge,dark,rubber,steel,glass,lampMat,redMat,indicator},{box,mesh,rod,cylinder,line,rounded,lod});
cylinder(body,.45,.176,[0,-.65,1.558],dark,'Z','upper_mount_solid_collar');cylinder(body,.47,.025,[0,-.65,1.6375],steel);
state.modelClearances={rearDoorGuardMm:(body.position.z+body.userData.rearDoorLowerZ-rearGuardTop)*1000,glassOffsetMm:body.userData.glassOffsetMm,sealOffsetMm:body.userData.sealOffsetMm,roofSupportBottom:1.47,roofSupportTop:1.646};
const upper=group(body,[0,-.65,1.65],'U01_KORD');
const {yaw,pitch,recoil,muzzle}=buildKord(T,upper,{olive,edge,dark,rubber,steel,glass},{box,cylinder,group});
yaw.rotation.z=-Math.PI/2;
const flash=createMuzzleFlash(T);flash.visible=false;muzzle.add(flash);
const flashLight=new T.PointLight('#ffc46a',0,5);muzzle.add(flashLight);
const headSpots=createHeadlightPair(T,body);
mergeStatic(body);mergeStatic(chassis);mergeStatic(yaw);mergeStatic(recoil);for(const w of wheels)mergeStatic(w.spin);
const joins=group(chassis,[0,0,0],'attachment_guides');
for(const x of [-.65,.65])for(const y of [-1.45,1.45])line(joins,[[x,y,1.05],[x,y,2.85]],'#eac76a',true);
line(joins,[[0,-.65,4.5],[0,-.65,6.3]],'#eac76a',true);joins.visible=false;
const bullets=[];let timer=0,flashTime=0,last=performance.now(),theta=0,routeDistance=0,driveDistance=0,lastFollow=new T.Vector3(),statsTime=0,statsFrames=0;const targetPos=new T.Vector3();
function fire(targetIndex){vehicle.updateMatrixWorld(true);const start=muzzle.getWorldPosition(new T.Vector3());const dir=targetPos.clone().sub(start).normalize();const o=line(scene,[start.toArray(),start.clone().addScaledVector(dir,.8).toArray()],'#ffe48e');bullets.push({o,pos:start,dir,target:targetPos.clone(),targetIndex,remaining:start.distanceTo(targetPos),life:0});flashTime=.065;state.shots++;document.getElementById('shots').textContent=state.shots;}
function mode(value){
 state.mode=value;vehicle.scale.setScalar(value==='arena'?VEHICLE_WORLD_SCALE:1);controls.minDistance=value==='arena'?5*VEHICLE_WORLD_SCALE:5;drive.reset();wheelEffects.clear();state.gradePitch=0;mapScene.visible=value==='arena';studio.visible=value!=='arena';
 document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===value));document.getElementById('view-title').textContent={arena:'Alpha · проездка по карте',inspect:'Осмотр образца',explode:'Три модуля · два стыка'}[value];
 if(value==='arena'){placeOnRoad(routeDistance);lastFollow.copy(vehicle.position);navigation.mode(value);}
 else{vehicle.position.set(0,0,.03);vehicle.quaternion.identity();controls.target.set(0,0,value==='explode'?3:1.8);camera.position.set(7,10,value==='explode'?9:6.5);controls.update();lastFollow.copy(vehicle.position);navigation.mode(value);}
}

document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>mode(b.dataset.mode));
for(const key of ['fire','lights','night'])document.getElementById(key).onclick=()=>{state[key]=!state[key];document.getElementById(key).setAttribute('aria-pressed',state[key]);if(key==='fire')setButtonIcon(document.getElementById(key),state.fire?'machinegun':'stop','Огонь: '+(state.fire?'вкл':'выкл'));if(key==='lights')setButtonIcon(document.getElementById(key),state.lights?'lights':'lights-off','Фары: '+(state.lights?'вкл':'выкл'));if(key==='night')setButtonIcon(document.getElementById(key),state.night?'day':'night',state.night?'Дневной свет':'Сумерки');};
document.getElementById('pause').onclick=()=>{state.paused=!state.paused;setButtonIcon(document.getElementById('pause'),state.paused?'play':'pause',state.paused?'Продолжить':'Пауза');};
document.getElementById('reset').onclick=()=>{if(state.mode==='arena')navigation.setCamera(state.cameraMode);else mode(state.mode);};
document.getElementById('terrain').onclick=()=>{terrain.path.visible=!terrain.path.visible;setButtonLabel(document.getElementById('terrain'),'Маршрут: '+(terrain.path.visible?'вкл':'выкл'));document.getElementById('terrain').setAttribute('aria-pressed',terrain.path.visible);};

function resize(){const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();if(navigation)navigation.resize();}
let navigation;new ResizeObserver(resize).observe(host);resize();
const terrainMatrix=new T.Matrix4(),terrainRight=new T.Vector3(),terrainForward=new T.Vector3(),terrainUp=new T.Vector3();
function placeOnRoad(distance){const pose=terrain.route.sample(distance);theta=pose.heading;state.heading=theta;const {x,y}=pose,c=Math.cos(theta),s=Math.sin(theta),scale=vehicle.scale.x;const heights=[];for(const wx of [-.7,.7])for(const wy of [-1.3,1.3])heights.push({x:wx,y:wy,h:surfaceHeight(x+(wx*c-wy*s)*scale,y+(wx*s+wy*c)*scale)});const front=(heights[1].h+heights[3].h)/2,rear=(heights[0].h+heights[2].h)/2,left=(heights[0].h+heights[1].h)/2,right=(heights[2].h+heights[3].h)/2;terrainRight.set(c,s,(right-left)/(1.4*scale)).normalize();terrainForward.set(-s,c,(front-rear)/(2.6*scale)).normalize();terrainUp.crossVectors(terrainRight,terrainForward).normalize();terrainForward.crossVectors(terrainUp,terrainRight).normalize();vehicle.quaternion.setFromRotationMatrix(terrainMatrix.makeBasis(terrainRight,terrainForward,terrainUp));vehicle.position.set(x,y,heights.reduce((sum,p)=>sum+p.h,0)/4+.03);vehicle.updateMatrixWorld(true);let error=0;for(const [wheelIndex,w] of wheels.entries()){let correction=0;for(let n=0;n<3;n++){const foot=vehicle.localToWorld(new T.Vector3(w.x,w.y,correction));correction=T.MathUtils.clamp(correction+(surfaceHeight(foot.x,foot.y)+.03-foot.z)/(terrainUp.z*scale),-.08,.08);}w.steer.parent.position.z=.45+correction;if(contactPatches[wheelIndex])contactPatches[wheelIndex].position.z=correction+.011;const foot=vehicle.localToWorld(new T.Vector3(w.x,w.y,correction));error=Math.max(error,Math.abs(foot.z-surfaceHeight(foot.x,foot.y)-.03));}state.groundHeight=vehicle.position.z-.03;state.gradePitch=Math.atan2(front-rear,2.6*scale);state.gradeRoll=Math.atan2(right-left,1.4*scale);state.contactErrorMm=error*1000;}
function wrap(a){return Math.atan2(Math.sin(a),Math.cos(a));}
function animate(now){requestAnimationFrame(animate);const elapsed=(now-last)/1000;const raw=Math.min(elapsed,.1);last=now;statsTime+=elapsed;statsFrames++;if(statsTime>1){state.fps=Math.round(statsFrames/statsTime);state.drawCalls=renderer.info.render.calls;if(state.fps<24&&!state.lowCost&&!state.forceQuality){state.lowCost=true;renderer.setPixelRatio(.80);renderer.shadowMap.enabled=false;for(const m of [olive,edge]){m.bumpMap=null;m.needsUpdate=true;}resize();}statsFrames=0;statsTime=0;}const dt=state.paused?0:raw;state.simulatedSeconds+=dt;timer+=dt;const driving=state.mode==='arena';const dest=state.mode==='explode'?1:0;state.explosion=T.MathUtils.damp(state.explosion,dest,6,raw);body.position.z=1.05+state.explosion*1.8;upper.position.z=1.65+state.explosion*1.8;joins.visible=state.explosion>.1;
let motion=drive.step(0,state.gradePitch||0,driving),wheelFrameDistance=0;
if(driving){let remaining=dt*state.timeScale;while(remaining>0){const step=Math.min(.05,remaining),a=terrain.route.sample(routeDistance-1.3*VEHICLE_WORLD_SCALE),b=terrain.route.sample(routeDistance+1.3*VEHICLE_WORLD_SCALE),grade=Math.atan2(b.z-a.z,2.6*VEHICLE_WORLD_SCALE);motion=drive.step(step,grade,true);wheelFrameDistance+=motion.distance*(1+motion.slip);routeDistance=(routeDistance+motion.distance*VEHICLE_WORLD_SCALE*Math.cos(grade))%terrain.route.length;remaining-=step;}}
state.speedKmh=motion.speed*3.6*(driving?VEHICLE_WORLD_SCALE:1);state.wheelSlip=motion.slip;state.acceleration=motion.acceleration;
if(driving){
 state.routeDistance=routeDistance;state.angle=routeDistance/terrain.route.length*Math.PI*2;placeOnRoad(routeDistance);driveDistance=motion.wheelTravel;const curvature=terrain.route.curvature(routeDistance);
 for(const w of wheels){w.travel=(w.travel||0)+wheelFrameDistance*(1+w.x*VEHICLE_WORLD_SCALE*curvature);w.spin.rotation.x=-w.travel/.45;w.steer.rotation.z=w.y>0?T.MathUtils.clamp(Math.atan(2.6*VEHICLE_WORLD_SCALE*curvature/(1+w.x*VEHICLE_WORLD_SCALE*curvature)),-.6,.6):0;}
 if(state.cameraMode==='follow'){const delta=vehicle.position.clone().sub(lastFollow);camera.position.add(delta);controls.target.add(delta);}lastFollow.copy(vehicle.position);
}else{vehicle.position.set(0,0,.03);vehicle.quaternion.identity();for(const w of wheels){w.steer.rotation.z=0;w.steer.parent.position.z=.45;}state.groundHeight=0;state.gradePitch=0;state.contactErrorMm=0;for(const patch of contactPatches)patch.position.z=.011;}

const rideDt=driving?dt:raw;chassis.position.z=T.MathUtils.damp(chassis.position.z,driving?.008*Math.sin(routeDistance*3.1):0,8,rideDt);chassis.rotation.x=T.MathUtils.damp(chassis.rotation.x,driving?.008*Math.sin(routeDistance*2.6):0,8,rideDt);chassis.rotation.y=T.MathUtils.damp(chassis.rotation.y,driving?.010*Math.sin(routeDistance*1.9+.7):0,8,rideDt);state.ride={heave:chassis.position.z,pitch:chassis.rotation.x,roll:chassis.rotation.y};
const activeTargets=driving?mapTargets:studioTargets;let nearest=activeTargets[0],targetDistance=Infinity;for(const t of activeTargets){const d=t.point.distanceTo(vehicle.position);if(d<targetDistance){targetDistance=d;nearest=t;}}
const ti=nearest.index;targetPos.copy(nearest.point);let clearShot=targetDistance<80;if(clearShot&&driving){const start=vehicle.position.clone().add(new T.Vector3(0,0,3.3*vehicle.scale.x));for(let t=.1;t<.96;t+=.08){const p=start.clone().lerp(targetPos,t);if(surfaceHeight(p.x,p.y)+.3>p.z){clearShot=false;break;}}}
const local=upper.worldToLocal(targetPos.clone());const wantedYaw=Math.atan2(-local.x,local.y);const yawDelta=wrap(wantedYaw-yaw.rotation.z);yaw.rotation.z+=Math.sign(yawDelta)*Math.min(Math.abs(yawDelta),dt*T.MathUtils.degToRad(35));const localAim=yaw.worldToLocal(targetPos.clone());const rawPitch=Math.atan2(localAim.z-pitch.position.z,Math.hypot(localAim.x,localAim.y-pitch.position.y));const wantedPitch=T.MathUtils.clamp(rawPitch,T.MathUtils.degToRad(-10),T.MathUtils.degToRad(60));pitch.rotation.x=T.MathUtils.damp(pitch.rotation.x,wantedPitch,8,dt);
if(state.fire&&clearShot&&state.mode!=='explode'&&!state.paused&&Math.abs(yawDelta)<.06&&Math.abs(rawPitch-pitch.rotation.x)<.06&&timer>.17){fire(ti);timer=0;}
flashTime=Math.max(0,flashTime-dt);flash.visible=flashTime>0&&state.mode!=='explode';flash.rotation.y=now*.01;flashLight.distance=5*vehicle.scale.x;flashLight.intensity=flash.visible?22*vehicle.scale.x**2:0;recoil.position.y=flashTime>0?-.025*Math.sin(flashTime/.065*Math.PI):0;
for(let i=bullets.length-1;i>=0;i--){const b=bullets[i];b.life+=dt;const step=dt*65;b.pos.addScaledVector(b.dir,Math.min(step,b.remaining));b.remaining-=step;const attr=b.o.geometry.attributes.position;attr.setXYZ(0,b.pos.x-b.dir.x*.8,b.pos.y-b.dir.y*.8,b.pos.z-b.dir.z*.8);attr.setXYZ(1,b.pos.x,b.pos.y,b.pos.z);attr.needsUpdate=true;if(b.remaining<=0||b.life>2){b.o.geometry.dispose();b.o.material.dispose();scene.remove(b.o);bullets.splice(i,1);if(b.remaining<=0){state.impacts++;targets[b.targetIndex].face.material.emissive.set('#e5a842');targets[b.targetIndex].face.material.emissiveIntensity=1.8;}}}
for(const t of targets)t.face.material.emissiveIntensity=T.MathUtils.damp(t.face.material.emissiveIntensity,0,8,raw);
lampMat.emissiveIntensity=state.lights?4:0;lampMat.color.set(state.lights?'#ffeac0':'#8d958c');redMat.emissiveIntensity=state.lights?2.2:.15;setHeadlightPower(headSpots,vehicle.scale.x,state.night,state.lights);hemi.intensity=state.night?.65:(driving?1.7:1.9);sun.intensity=state.night?.42:(driving?2.7:2.5);fill.intensity=state.night?.8:(driving?.65:1.2);scene.environmentIntensity=state.night?.25:.75;const bg=state.night?'#172425':(driving?'#c5bdab':'#bba68a');scene.background.set(bg);scene.fog.color.set(bg);scene.fog.near=state.mode==='arena'&&state.cameraMode==='overview'?4500:450;scene.fog.far=state.mode==='arena'&&state.cameraMode==='overview'?18500:5000;document.getElementById('height').textContent=state.groundHeight.toFixed(1);const speedText=driving&&!state.paused?state.speedKmh.toFixed(1):'0';if(document.getElementById('speed').textContent!==speedText)document.getElementById('speed').textContent=speedText;const liveText=state.paused?'ПАУЗА':'В РАБОТЕ';if(document.getElementById('live').textContent.trim()!==liveText)document.getElementById('live').innerHTML=state.paused?'ПАУЗА':'<i></i> В РАБОТЕ';if(state.productionReady){const distance=camera.position.distanceTo(controls.target)/vehicle.scale.x;applyGameLod(distance>36?2:distance>18?1:0);}resolveCamera(raw);for(let i=0;i<wheels.length;i++){const w=wheels[i];vehicle.localToWorld(wheelContacts[i].set(w.x,w.y,w.steer.parent.position.z-.45));}state.effects=wheelEffects.update(dt,{driving,speed:state.paused?0:motion.speed,slip:motion.slip,grade:state.gradePitch||0,heading:theta,contacts:wheelContacts,camera,night:state.night,lowCost:state.lowCost,scale:vehicle.scale.x});state.groundDust=groundDust.update(dt,{vehicle,camera,speed:motion.speed,driving,night:state.night,lowCost:state.lowCost});navigation.update();sky.update(camera,state.night);terrain.setViewMode(state.mode==='arena'&&state.cameraMode==='follow'&&!state.lowCost?'close':'overview');sun.position.copy(vehicle.position).add(new T.Vector3(driving?-24:-18,driving?10:5,driving?21:30));sun.target.position.copy(vehicle.position);renderer.render(scene,camera);}
navigation=createMapNavigation(T,{terrain,vehicle,camera,controls,state,jump:jumpToRoute});mode('arena');
window.exportProductionParts=createProductionExporter({C01:chassisRoot,B01:body},lod);state.lod=lod;state.ready=true;state.assetSource='procedural-authoring';if(!exportMode){queueMicrotask(loadGameAssets);requestAnimationFrame(animate);}

window.demoActions={mode,view(name){mode('inspect');const poses={front:[4,8,4.1],side:[9,0,3.5],rear:[-4,-8,4.1]};camera.position.set(...poses[name]);controls.target.set(0,0,1.7);controls.update();}};

const gameCache=[];let appliedLod=-1;
async function loadGameAssets(){
 try{const loader=new GLTFLoader();for(let level=0;level<3;level++){const [c,b]=await Promise.all([loader.loadAsync('../assets/vehicles/C01/C01-lod'+level+'.glb?v=rc2'),loader.loadAsync('../assets/vehicles/B01/B01-lod'+level+'.glb?v=rc2')]);gameCache[level]={c,b};if(level===0)applyGameLod(0);}state.productionReady=true;}catch(e){const error=document.getElementById('error');error.hidden=false;error.textContent='Не удалось загрузить игровые модели: '+e.message;state.assetError=e.message;}
}
function applyGameLod(level){
 if(appliedLod===level||!gameCache[level])return;
 if(appliedLod<0){
  const authoringRoots=[...chassis.children].filter(o=>o!==body&&o!==joins).concat([...chassisRoot.children].filter(o=>o!==chassis),[...body.children].filter(o=>o!==upper&&!o.isLight&&o.name!=='light_target'));
  const released=new Set();for(const root of authoringRoots)root.traverse(o=>{if(o.geometry&&!released.has(o.geometry)){released.add(o.geometry);o.geometry.dispose();}});
  state.authoringGeometryReleased=true;
 }
 const rawC=gameCache[level].c.scene.getObjectByName('C01_DVOR').clone(true),rawB=gameCache[level].b.scene.getObjectByName('B01_BUKHANKA').clone(true);
 const frame=rawC.getObjectByName('sprung_frame');
 for(const item of [...chassis.children])if(item!==body&&item!==joins)chassis.remove(item);
 for(const item of [...frame.children])chassis.add(item);
 for(const item of [...chassisRoot.children])if(item!==chassis)chassisRoot.remove(item);
 for(const item of [...rawC.children])if(item!==frame)chassisRoot.add(item);
 wheels.length=0;for(const x of [-.7,.7])for(const y of [-1.3,1.3]){const stem='axle_'+(y>0?'1':'2')+'_'+(x<0?'L':'R');wheels.push({steer:chassisRoot.getObjectByName(stem+'_steer'),spin:chassisRoot.getObjectByName(stem+'_wheel'),x,y});}
 for(const item of [...body.children])if(item!==upper&&!item.isLight&&item.name!=='light_target')body.remove(item);
 for(const item of [...rawB.children])body.add(item);
 body.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;for(const mat of Array.isArray(o.material)?o.material:[o.material]){if(mat.name==='headlamp_lens')lampMat=mat;if(mat.name==='rear_stop_lens')redMat=mat;}}});
 chassisRoot.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
 appliedLod=level;state.renderLod=level;state.assetSource='game-glb';
}
window.demoActions.audit=()=>{vehicle.updateMatrixWorld(true);const a=chassis.localToWorld(new T.Vector3(0,0,1.05)),b=body.getWorldPosition(new T.Vector3()),c=body.localToWorld(new T.Vector3(0,-.65,1.65)),d=upper.getWorldPosition(new T.Vector3());return{source:state.assetSource,lod:appliedLod,bodyErrorMm:a.distanceTo(b)*1000,upperErrorMm:c.distanceTo(d)*1000,wheels:wheels.length,productionReady:state.productionReady};};

function jumpToRoute(value){routeDistance=((value%terrain.route.length)+terrain.route.length)%terrain.route.length;state.routeDistance=routeDistance;drive.reset();wheelEffects.clear();if(state.mode!=='arena')mode('arena');else{placeOnRoad(routeDistance);lastFollow.copy(vehicle.position);if(state.cameraMode==='follow')navigation.setCamera('follow');}}
window.demoActions.setRouteDistance=jumpToRoute;window.demoActions.setCheckpoint=index=>navigation.go(index);window.demoActions.mapView=()=>navigation.setCamera('overview');window.demoActions.follow=()=>navigation.setCamera('follow');window.demoActions.setTimeScale=value=>navigation.setRate(value);window.demoActions.routeSample=value=>terrain.route.sample(value);window.demoActions.mapAudit=()=>({...terrain.statistics,stops:terrain.route.stops,routeSamples:terrain.route.points.length});window.demoActions.setDistance=value=>{const direction=camera.position.clone().sub(controls.target).normalize();camera.position.copy(controls.target).addScaledVector(direction,value);controls.update();};
window.demoActions.auditRoute=(count=4096)=>{
 let maxContactErrorMm=0,maxPitch=0,maxRoll=0,bodyErrorMm=0,upperErrorMm=0;
 for(let i=0;i<count;i++){placeOnRoad(terrain.route.length*i/count);const result=window.demoActions.audit();maxContactErrorMm=Math.max(maxContactErrorMm,state.contactErrorMm);maxPitch=Math.max(maxPitch,Math.abs(state.gradePitch));maxRoll=Math.max(maxRoll,Math.abs(state.gradeRoll));bodyErrorMm=Math.max(bodyErrorMm,result.bodyErrorMm);upperErrorMm=Math.max(upperErrorMm,result.upperErrorMm);}
 placeOnRoad(routeDistance);return {samples:count,maxContactErrorMm,maxPitch,maxRoll,bodyErrorMm,upperErrorMm};
};
window.demoActions.driveSegments=()=>{
 const result={},grade=d=>{const a=terrain.route.sample(d-1.3*VEHICLE_WORLD_SCALE),b=terrain.route.sample(d+1.3*VEHICLE_WORLD_SCALE);return (b.z-a.z)/(2.6*VEHICLE_WORLD_SCALE);};
 for(let d=40;d<terrain.route.length-60;d+=2){
  const slopes=[0,8,16,24].map(offset=>grade(d+offset));if(Math.max(...[0,12,24].map(offset=>Math.abs(terrain.route.curvature(d+offset))))>.008)continue;
  if(!result.flat&&slopes.every(g=>Math.abs(g)<.008))result.flat=d;
  if(!result.uphill&&slopes.every(g=>g>.12&&g<.30))result.uphill=d;
  if(!result.downhill&&slopes.every(g=>g<-.12&&g>-.30))result.downhill=d;
  if(!result.slipEntry&&Math.abs(grade(d-25))<.025&&Math.abs(grade(d-15))<.025&&grade(d+5)>.06)result.slipEntry=d-25;
 }
 return result;
};

window.demoActions.roadView=(index=0)=>{navigation.setCamera('overview');const road=terrain.roadPaths[index%terrain.roadPaths.length],point=road.points[Math.floor(road.points.length*.5)],h=terrain.heightAt(point.x,point.y);controls.target.set(point.x,point.y,h+1);camera.position.set(point.x+58,point.y-83,h+58);controls.update();};
window.demoActions.follow=()=>{state.followFront=false;navigation.setCamera('follow');};
window.demoActions.followFront=()=>{state.followFront=true;navigation.setCamera('follow');};
window.demoActions.inspectTerrain=(gridX,gridY,offset=[60,-90,65])=>{navigation.setCamera('overview');const p=terrain.field.gridToWorld([gridX,gridY]),height=terrain.heightAt(p.x,p.y);controls.target.set(p.x,p.y,height+1);camera.position.set(p.x+offset[0],p.y+offset[1],height+offset[2]);controls.update();};
window.demoActions.setQuality=(quality='auto')=>{state.forceQuality=quality==='full';state.lowCost=quality==='low';renderer.shadowMap.enabled=!state.lowCost;renderer.setPixelRatio(state.lowCost?.8:Math.min(devicePixelRatio,1.15));for(const material of [olive,edge]){material.bumpMap=state.lowCost?null:paintBump;material.needsUpdate=true;}resize();};
window.demoActions.setGroundDust=value=>groundDust.setEnabled(value);
const reviewView=new URLSearchParams(location.search).get('view');
if(reviewView==='front')window.demoActions.followFront();else if(reviewView==='follow')window.demoActions.follow();
