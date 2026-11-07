import {GLTFLoader} from '../demo/vendor/loaders/GLTFLoader.js';
import {createConstructionProjector} from './construction-projector.js';
import {vehiclePose} from './builder-kinematics.js';
import {buildKord} from '../demo/kord.js';
import {vehicleKit,batchRigidMeshes,createFieldVehicle} from './field-vehicles.js';

// One instance stream per GLB primitive. More units do not add draw calls.
class PoseBatch{
 constructor(T,parent,prototype,capacity){this.T=T;this.prototype=prototype;this.parts=[];prototype.updateMatrixWorld(true);prototype.traverse(node=>{
  if(!node.isMesh)return;let geometry=node.geometry,material=node.material,emission=null,signal=null;
  if(['projector_optics','projector_emitter_core'].includes(material.name)){
   geometry=geometry.clone();material=material.clone();signal='projector';material.emissiveIntensity=material.name==='projector_optics'?2.6:4.3;emission=new T.InstancedBufferAttribute(new Float32Array(capacity),1);geometry.setAttribute('instanceEmission',emission);
   material.onBeforeCompile=shader=>{shader.vertexShader='attribute float instanceEmission;varying float vInstanceEmission;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvInstanceEmission=instanceEmission;');shader.fragmentShader='varying float vInstanceEmission;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance*=vInstanceEmission;');};material.customProgramCacheKey=()=> 'builder_instance_emission_v1';
  }
  const mesh=new T.InstancedMesh(geometry,material,capacity);mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);mesh.frustumCulled=false;mesh.castShadow=mesh.receiveShadow=true;mesh.count=0;parent.add(mesh);this.parts.push({node,mesh,emission,signal});
 });this.world=new T.Matrix4();this.combined=new T.Matrix4();this.index=0;}
 begin(){this.index=0;}
 add(transform,color,signals={}){const index=this.index++;this.prototype.updateMatrixWorld(true);for(const part of this.parts){this.combined.multiplyMatrices(transform,part.node.matrixWorld);part.mesh.setMatrixAt(index,this.combined);part.mesh.setColorAt(index,color);if(part.emission)part.emission.setX(index,signals[part.signal]??0);}}
 end(){for(const {mesh,emission} of this.parts){mesh.count=this.index;mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;if(emission)emission.needsUpdate=true;}}
 visible(value){for(const {mesh} of this.parts)mesh.visible=value;}
}

export async function createVehicleLayer(T,scene,field,config) {
 const root=new T.Group();
 root.name='modular_vehicle_instances';
 scene.add(root);
 const scale=config.worldScale,loader=new GLTFLoader(),capacity=80;
 const loaded=await Promise.all([0,1,2].map(lod=>Promise.all(['C01','B01'].map(id=>loader.loadAsync('../assets/vehicles/'+id+'/'+id+'-lod'+lod+'.glb')))));
 const lods=loaded.map(assets=>assets.map((asset,index)=>{
  const proto=asset.scene, id=index?'B01':'C01';
  proto.rotation.x=Math.PI/2;
  if(index)proto.position.z=1.05;
  const group=new T.Group(),wheels=[],steering=[],suspension=[];
  group.name=id;
  root.add(group);
  proto.traverse(node=>{
   if(node.name.endsWith('_wheel'))wheels.push(node);
   if(node.name.endsWith('_suspension'))suspension.push({node,x:node.position.x,y:node.position.y,z:node.position.z});
   if(node.name.startsWith('axle_1_')&&node.name.endsWith('_steer'))steering.push(node);
   if(node.isMesh&&node.material.name==='headlamp_lens'){node.material.emissiveIntensity=4;node.material.color.set('#ffeac0');}
  });
  return{batch:new PoseBatch(T,group,proto,capacity),wheels,steering,suspension,sprung:proto.getObjectByName('sprung_frame')};
 }));
 const kit=vehicleKit(T);
 const palette={
  olive:new T.MeshStandardMaterial({color:'#5c644c',metalness:.3,roughness:.44}),
  edge:new T.MeshStandardMaterial({color:'#6a7058',metalness:.4,roughness:.48}),
  dark:new T.MeshStandardMaterial({color:'#242b27',metalness:.5,roughness:.65}),
  rubber:new T.MeshLambertMaterial({color:'#171b19'}),
  steel:new T.MeshStandardMaterial({color:'#717972',metalness:.85,roughness:.34}),
  glass:new T.MeshStandardMaterial({color:'#293e42',roughness:.25}),
 };
 const builder=createConstructionProjector(T);
 builder.root.position.set(0,-.65,2.7);
 const builderBatch=new PoseBatch(T,root,builder.root,capacity);
 const gun=new T.Group();
 gun.name='U01_KORD';
 gun.position.set(0,-.65,2.7);
 const kord=buildKord(T,gun,palette,kit);
 batchRigidMeshes(T,gun);
 const gunBatch=new PoseBatch(T,root,gun,capacity);
 const flame=new T.Group();
 flame.name='U04_field_flamer';
 flame.position.set(0,-.65,2.7);
 kit.cylinder(flame,.45,.08,[0,0,.04],palette.olive);
 const flameYaw=kit.group(flame,[0,0,.08],'flame_yaw');
 const tanks=new T.MeshStandardMaterial({color:'#8a6743',metalness:.52,roughness:.65});
 for(const x of [-.21,.21]){
  kit.cylinder(flameYaw,.155,.66,[x,-.24,.23],tanks,'Y');
  kit.cylinder(flameYaw,.16,.04,[x,-.49,.23],palette.dark,'Y');
 }
 kit.box(flameYaw,[.34,.51,.23],[0,.12,.29],palette.olive);
 kit.cylinder(flameYaw,.075,.65,[0,.62,.30],palette.dark,'Y');
 kit.cylinder(flameYaw,.113,.15,[0,.92,.30],palette.steel,'Y');
 const flameMuzzle=kit.group(flameYaw,[0,.995,.30],'fx_muzzle');
 batchRigidMeshes(T,flame);
 const flameBatch=new PoseBatch(T,root,flame,capacity);

 const command=createFieldVehicle(T,'command',kit,palette);
 const raider=createFieldVehicle(T,'raider',kit,palette);
 const raiderYaw=kit.group(raider.root,[0,-1.19,1.62],'scrap_mount');
 kit.cylinder(raiderYaw,.08,.56,[0,0,.26],palette.steel);
 kit.box(raiderYaw,[.35,.38,.20],[0,.04,.54],palette.dark);
 kit.box(raiderYaw,[.63,.065,.42],[0,.21,.47],palette.edge);
 const raiderRecoil=kit.group(raiderYaw,[0,0,.56],'scrap_recoil');
 kit.cylinder(raiderRecoil,.045,.67,[0,.40,0],palette.dark,'Y');
 const raiderMuzzle=kit.group(raiderRecoil,[0,.735,0],'fx_muzzle');
 const commandBatch=new PoseBatch(T,root,command.root,capacity),raiderBatch=new PoseBatch(T,root,raider.root,capacity);
 const extras=[builderBatch,gunBatch,flameBatch,commandBatch,raiderBatch];
 const transforms=new Map(),muzzles=new Map(),visible=[],workBeams=[];
 const dummy=new T.Object3D(),color=new T.Color(),matrix=new T.Matrix4(),contact=new T.Vector3();
 const turnDelta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
 let activeLod=1;

 function update(mission,cameraDistance,shotTimes,now) {
  if(cameraDistance>725)activeLod=2;
  else if(cameraDistance<212)activeLod=0;
  else if(activeLod===0&&cameraDistance>255||activeLod===2&&cameraDistance<625)activeLod=1;
  lods.forEach((entries,lod)=>entries.forEach(({batch})=>{batch.begin();batch.visible(lod===activeLod);}));
  for(const batch of extras)batch.begin();
  const phase=T.MathUtils.clamp(mission.accumulator/config.simulationStep,0,1);
  const time=mission.state.time;
  workBeams.length=visible.length=0;
  muzzles.clear();
  const live=new Set();
  for(const unit of mission.state.units){
   if(unit.hp<=0||unit.owner!=='rai'&&!mission.visibleAt(unit.x,unit.y))continue;
   live.add(unit.id);
   const moving=Math.hypot(unit.x-unit.previousX,unit.y-unit.previousY)>.008;
   const blend=moving?phase:1;
   const x=T.MathUtils.lerp(unit.previousX,unit.x,blend),y=T.MathUtils.lerp(unit.previousY,unit.y,blend);
   const previous=unit.previousHeading??unit.heading,heading=previous+turnDelta(unit.heading,previous)*(unit.builderWorking?1:phase);
   const pose=vehiclePose({kind:unit.kind,x,y,heading},field,scale);
   dummy.position.set(...pose.position);
   dummy.rotation.set(pose.pitch,pose.roll,heading,'ZXY');
   dummy.scale.setScalar(scale);
   dummy.updateMatrix();
   matrix.copy(dummy.matrix);
   let data=transforms.get(unit.id);
   if(!data){data={matrix:new T.Matrix4(),position:new T.Vector3()};transforms.set(unit.id,data);}
   data.matrix.copy(matrix);
   data.position.copy(dummy.position);
   data.heading=heading;
   const steer=T.MathUtils.lerp(unit.previousSteering??unit.steering??0,unit.steering??0,phase);
   const travel=T.MathUtils.lerp(unit.previousWheelDistance??unit.wheelDistance??0,unit.wheelDistance??0,phase);
   visible.push({id:unit.id,kind:unit.kind,owner:unit.owner,x,y,heading,steering:steer,speed:moving?(unit.driveSpeed??0):0,working:unit.builderWorking});
   const spin=-travel/(.435*scale);
   const suspensionDelta=(x,y)=>{
    contact.set(x,y,0).applyMatrix4(matrix);
    return T.MathUtils.clamp((field.heightAt(contact.x,contact.y)-contact.z)/Math.max(1,matrix.elements[10]),-.11,.11);
   };
   const custom=unit.kind==='command'?command:unit.kind==='raider'?raider:null;
   if(custom){
    for(const wheel of custom.wheels){wheel.wheel.rotation.x=spin;wheel.steer.rotation.z=wheel.front?steer:0;wheel.steer.position.z=.43+suspensionDelta(wheel.steer.position.x,wheel.steer.position.y);}
   }else{
    color.set('#ffffff');
    for(const entry of lods[activeLod]){
     for(const wheel of entry.wheels)wheel.rotation.x=spin;
     for(const node of entry.steering)node.rotation.z=steer;
     for(const {node,x,y,z} of entry.suspension)node.position.z=z+suspensionDelta(x,y);
     if(entry.sprung)entry.sprung.position.z=moving?Math.sin(time*6+x*.03)*.022:0;
     entry.batch.add(matrix,color);
    }
   }
   let aim=0;
   if(unit.aimTarget)aim=turnDelta(Math.atan2(x-unit.aimTarget.x,unit.aimTarget.y-y),heading);
   const age=now-(shotTimes.get(unit.id)??-Infinity),recoil=age<.065 ? -.025*Math.sin(age/.065*Math.PI) : 0;
   color.set('#ffffff');
   if(unit.kind==='builder'){
    builder.aim(unit.projector?.yaw??0,unit.projector?.pitch??0,false);
    builderBatch.add(matrix,color,{projector:unit.builderWorking?1:.015});
    if(unit.builderWorking&&unit.builderContact)workBeams.push({from:builder.emitter.getWorldPosition(new T.Vector3()).applyMatrix4(matrix),to:new T.Vector3(...unit.builderContact),targetId:unit.task?.targetId,mode:unit.task?.type});
   }else if(unit.kind==='command'){
    commandBatch.add(matrix,color);
   }else if(unit.kind==='raider'){
    raiderYaw.rotation.z=aim;raiderRecoil.position.y=recoil;
    raiderBatch.add(matrix,color);
    muzzles.set(unit.id,raiderMuzzle.getWorldPosition(new T.Vector3()).applyMatrix4(matrix));
   }else if(unit.kind==='flamer'){
    flameYaw.rotation.z=aim;flameBatch.add(matrix,color);
    muzzles.set(unit.id,flameMuzzle.getWorldPosition(new T.Vector3()).applyMatrix4(matrix));
   }else{
    kord.yaw.rotation.z=aim;kord.recoil.position.y=recoil;
    if(unit.aimTarget){
     const dx=unit.aimTarget.x-x,dy=unit.aimTarget.y-y;
     const dz=field.heightAt(unit.aimTarget.x,unit.aimTarget.y)+1.5*scale-dummy.position.z-3.28*scale;
     kord.pitch.rotation.x=T.MathUtils.clamp(Math.atan2(dz,Math.hypot(dx,dy))-dummy.rotation.x*Math.cos(aim),-.32,.48);
    }else kord.pitch.rotation.x=0;
    gunBatch.add(matrix,color);
    muzzles.set(unit.id,kord.muzzle.getWorldPosition(new T.Vector3()).applyMatrix4(matrix));
   }
  }
  for(const id of transforms.keys())if(!live.has(id))transforms.delete(id);
  for(const {batch} of lods[activeLod])batch.end();
  for(const batch of extras)batch.end();
 }
 function makeDesignModel(components){
  const [chassisId,bodyId,upperId]=components;
  if(chassisId!=='C01'||bodyId!=='B01')return null;
  const source={U01:gun,U25:builder.root,'mission-flamer':flame}[upperId];
  if(!source)return null;
  const assembled=new T.Group(),chassis=lods[0][0].batch.prototype.clone(true),body=lods[0][1].batch.prototype.clone(true),upper=source.clone(true);
  for(const node of [chassis,body,upper])node.traverse(part=>{
   if(part.isMesh)part.castShadow=part.receiveShadow=true;
   if(/(_wheel|_steer|_yaw|_pitch|recoil_1)$/.test(part.name)||part.name==='recoil_1')part.rotation.set(0,0,0);
   if(part.name==='sprung_frame')part.position.z=0;
  });
  const recoil=upper.getObjectByName('recoil_1');if(recoil)recoil.position.y=0;
  assembled.name='project_'+components.join('_');
  assembled.add(chassis,body,upper);
  return {root:assembled,chassis,body,upper};
 }
 return {root,update,transforms,muzzles,visible,workBeams,makeDesignModel,get lod(){return activeLod;},get drawCalls(){
  return [...lods[activeLod].map(entry=>entry.batch),...extras].reduce((sum,b)=>sum+(b.index?b.parts.length:0),0);
 }};
}
