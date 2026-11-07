import {setButtonIcon} from '../assets/ui/icons.js';
import * as T from 'three';
import {OrbitControls} from '../demo/vendor/OrbitControls.js';
import {GLTFLoader} from '../demo/vendor/loaders/GLTFLoader.js';
import {createProductionExporter} from '../demo/production-kit.js';
import {createBuilderRig} from './builder-rig.js';
import {createBuildingPrefab} from './prefabs.js';
import {createBuilderState,stepBuilderRig,workContact,vehiclePose,builderClearOfGround,builderClearOfTarget} from './builder-kinematics.js';

const $=id=>document.getElementById(id),host=$('view'),renderer=new T.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.4));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.toneMapping=T.ACESFilmicToneMapping;host.prepend(renderer.domElement);
const scene=new T.Scene();scene.background=new T.Color('#777e70');
const camera=new T.PerspectiveCamera(43,1,.1,200);camera.up.set(0,0,1);camera.position.set(10,12,9);
const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(3,0,2);controls.enableDamping=true;controls.maxPolarAngle=Math.PI*.47;
scene.add(new T.HemisphereLight('#d0dce5','#5c6049',2));
const sun=new T.DirectionalLight('#ffebc9',3);sun.position.set(-7,4,10);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-15,right:15,top:15,bottom:-15,near:1,far:45});sun.shadow.normalBias=.01;scene.add(sun);
const fill=new T.DirectionalLight('#a6bbc9',1);fill.position.set(7,-3,5);scene.add(fill);
const ground=new T.Mesh(new T.PlaneGeometry(200,200),new T.MeshStandardMaterial({color:'#6b7060',roughness:1}));ground.position.z=-.005;ground.receiveShadow=true;scene.add(ground);
const assembly=new T.Group();scene.add(assembly);const body=new T.Group();body.position.z=1.05;assembly.add(body);
const rig=createBuilderRig(T);rig.root.position.set(0,-.65,1.65);body.add(rig.root);
const field={heightAt:()=>0,gradientAt:()=>({x:0,y:0})};
let config,parts,fixture,fixtureData,rigState=createBuilderState(),unit={id:'preview-builder',kind:'builder',x:0,y:0,heading:0},requested=false,explosion=0,explodeTarget=0,time=0,ready=false,last=performance.now(),pendingCase=null,solution=null;
const defaults={kind:'generator',distance:9.5,side:1,rotation:0,progress:.4};let caseData={...defaults};

function componentClone(index){const root=parts[index].scene.clone(true);root.rotation.x=Math.PI/2;root.traverse(o=>{if(o.isMesh)o.castShadow=o.receiveShadow=true;});return root;}
function configureCase(data){
 caseData={...defaults,...data};unit.heading=caseData.rotation;
 if(fixture){scene.remove(fixture);if(!fixture.userData.isRepair){const materials=new Set();fixture.traverse(o=>{if(o.isMesh){o.geometry.dispose();materials.add(o.material);}});materials.forEach(material=>material.dispose());}}
 const c=Math.cos(caseData.rotation),s=Math.sin(caseData.rotation),isRepair=caseData.kind==='repair',distance=caseData.distance*caseData.side;
 fixtureData={id:'preview-target',kind:isRepair?'bukhanka':caseData.kind,x:c*distance,y:s*distance,rotation:caseData.rotation-caseData.side*Math.PI/2,heading:caseData.rotation-caseData.side*Math.PI/2,completed:caseData.progress>=1,progress:caseData.progress,groundHeight:0};
 if(isRepair){fixture=new T.Group();fixture.userData.isRepair=true;fixture.add(componentClone(0));const targetBody=componentClone(1);targetBody.position.z=1.05;fixture.add(targetBody);}else fixture=createBuildingPrefab(T,caseData.kind,config.buildings[caseData.kind]);
 fixture.position.set(fixtureData.x,fixtureData.y,0);fixture.rotation.z=fixtureData.rotation;fixture.name='work_target';scene.add(fixture);
 if(!isRepair)fixture.getObjectByName('building_structure').scale.z=.1+.9*caseData.progress;
 assembly.rotation.z=caseData.rotation;solution=workContact(unit,fixtureData,config,field);
 $('fixture').value=isRepair?'repair':caseData.kind;$('distance').value=caseData.distance;$('construction').value=caseData.progress;return solution;
}
function changeCase(data){requested=false;pendingCase={...caseData,...data};if(rigState.phase==='stowed'){configureCase(pendingCase);pendingCase=null;}}
function advance(dt){
 time+=dt;if(!ready)return;
 if(pendingCase&&rigState.phase==='stowed'){configureCase(pendingCase);pendingCase=null;}
 solution=workContact(unit,fixtureData,config,field);const pose=vehiclePose(unit,field,1),contact=requested&&!explodeTarget?solution:null;
 stepBuilderRig(rigState,contact,dt,fixtureData.id,q=>builderClearOfGround(q,pose,field)&&(!contact||builderClearOfTarget(q,pose,contact)));
 explosion=T.MathUtils.damp(explosion,explodeTarget,5,dt);body.position.z=1.05+explosion*1.7;rig.root.position.z=1.65+explosion*1.7;
 rig.applyPose(rigState.q,time,rigState.ready&&requested&&!explodeTarget);
}
function audit(){
 rig.root.updateWorldMatrix(true,true);const inverse=rig.root.matrixWorld.clone().invert(),bounds=new T.Box3();rig.root.traverse(node=>{if(!node.isMesh)return;node.geometry.computeBoundingBox();const matrix=new T.Matrix4().multiplyMatrices(inverse,node.matrixWorld);bounds.union(node.geometry.boundingBox.clone().applyMatrix4(matrix));});
 assembly.updateMatrixWorld(true);const tip=rig.tip.getWorldPosition(new T.Vector3()),contact=solution?.world;
 return{sourceAxes:'X right,Y forward,Z up',size:'S',ring:.9,phase:rigState.phase,ready:rigState.ready,blocked:rigState.blocked,bodyJoinErrorMm:Math.abs(body.position.z-1.05-explosion*1.7)*1000,upperJoinErrorMm:Math.abs(rig.root.position.z-1.65-explosion*1.7)*1000,boundsMin:bounds.min.toArray(),boundsMax:bounds.max.toArray(),tip:tip.toArray(),target:contact,contactErrorMm:contact?tip.distanceTo(new T.Vector3(...contact))*1000:null,q:{...rigState.q},joints:Object.fromEntries(Object.entries(rig.joints).map(([id,g])=>[id,{position:g.position.toArray(),rotation:g.rotation.toArray().slice(0,3)}]))};
}
$('deploy').onclick=()=>requested=true;$('fold').onclick=()=>requested=false;
$('explode').onclick=()=>{requested=false;explodeTarget=1-explodeTarget;setButtonIcon($('explode'),explodeTarget?'assemble':'explode',explodeTarget?'Собрать':'Разобрать');};
$('fixture').onchange=()=>changeCase({kind:$('fixture').value,distance:$('fixture').value==='repair'?6.5:9.5});
$('distance').oninput=()=>changeCase({distance:Number($('distance').value)});
$('construction').oninput=()=>{caseData.progress=Number($('construction').value);fixtureData.progress=caseData.progress;fixtureData.completed=caseData.progress>=1;fixture.getObjectByName('building_structure')?.scale.set(1,1,.1+.9*caseData.progress);};
$('side').onclick=()=>changeCase({side:-caseData.side});
const resize=()=>{renderer.setSize(host.clientWidth,host.clientHeight,false);camera.aspect=host.clientWidth/host.clientHeight;camera.updateProjectionMatrix();};new ResizeObserver(resize).observe(host);resize();
try{
 config=await fetch('../assets/campaign/alpha/mission01/gameplay.json').then(r=>r.json());config={...config,worldScale:1};
 const loader=new GLTFLoader();parts=await Promise.all(['C01','B01'].map(id=>loader.loadAsync('../assets/vehicles/'+id+'/'+id+'-lod0.glb')));
 assembly.add(componentClone(0));body.add(componentClone(1));configureCase(defaults);ready=true;
}catch(error){$('error').textContent=error.message;console.error(error);}
window.builderPreview={get ready(){return ready;},get amount(){return rigState.progress;},get explosion(){return explosion;},get solution(){return solution;},get fixture(){return fixture;},get state(){return rigState;},rig,assembly,body,renderer,scene,camera,controls,audit,deploy:()=>requested=true,fold:()=>requested=false,
 setCase(data){rigState=createBuilderState();requested=false;explosion=explodeTarget=0;body.position.z=1.05;rig.root.position.z=1.65;configureCase(data);rig.applyPose(rigState.q);return audit();},
 advance(seconds,measure=true){for(let elapsed=0;elapsed<seconds;elapsed+=.02)advance(Math.min(.02,seconds-elapsed));return measure?audit():{phase:rigState.phase,ready:rigState.ready,q:{...rigState.q}};},
 probe(q){rig.applyPose(q);const result={...audit(),q:{...q}};rig.applyPose(rigState.q);return result;},
 export:async()=>{rig.applyPose();const output=await createProductionExporter({U25:rig.root},0)();rig.applyPose(rigState.q);return output;}};
function frame(now){requestAnimationFrame(frame);advance(Math.min(.1,(now-last)/1000));last=now;const error=solution?rig.tip.getWorldPosition(new T.Vector3()).distanceTo(new T.Vector3(...solution.world))*1000:0;$('state').textContent=!ready?'Загрузка…':pendingCase?'Сначала складываем стрелу':!solution?'Цель вне безопасной рабочей зоны':rigState.blocked?'Движение остановлено: нет зазора':rigState.ready?'Контакт инструмента · '+error.toFixed(2)+' мм':rigState.phase==='stowed'?'Транспортное положение':rigState.phase.startsWith('fold-')?'Сворачивание · движение машины заблокировано':'Развёртывание · '+rigState.phase;controls.update();renderer.render(scene,camera);}
requestAnimationFrame(frame);
