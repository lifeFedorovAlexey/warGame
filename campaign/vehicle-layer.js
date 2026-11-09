import {GLTFLoader} from '../demo/vendor/loaders/GLTFLoader.js';
import {createConstructionProjector} from './construction-projector.js';
import {vehiclePose,worldToVehicle} from './builder-kinematics.js';
import {buildKord} from '../demo/kord.js';
import {mgRecoil} from './mg-burst.js';
import {vehicleKit,batchRigidMeshes,createFieldVehicle} from './field-vehicles.js';
import {createFieldModification} from './field-modification-models.js';
import {FIELD_RECIPES,modificationInstalled} from './vehicle-salvage.js';
import {createVehicleContactShadows} from './vehicle-contact-shadows.js';
import {createScavUnit,poseScavUnit} from './scav-units.js';
import {SCAV_PROFILES,isInfantry} from './scav-unit-profiles.js';
import {contactRockAt} from './vehicle-contact-rock.js';
import {VEHICLE_PAINTS,vehiclePaint,vehiclePaintTint,isVehiclePaintMaterial,paintVehicleModel} from './vehicle-paint.js';

// One instance stream per GLB primitive. More units do not add draw calls.
export class PoseBatch{
 constructor(T,parent,prototype,capacity,damage,category='body',lod=0,profile={}){this.T=T;this.prototype=prototype;this.parts=[];this.capacity=capacity;this.damage=damage;this.colorAttribute=new T.InstancedBufferAttribute(new Float32Array(capacity*3),3).setUsage(T.DynamicDrawUsage);this.damageAttribute=new T.InstancedBufferAttribute(new Float32Array(capacity*2),2).setUsage(T.DynamicDrawUsage);prototype.updateMatrixWorld(true);prototype.traverse(node=>{
  if(!node.isMesh)return;let geometry=node.geometry,material=node.material,emission=null,signal=null;
  if(['projector_optics','projector_emitter_core','flamer_igniter'].includes(material.name)){
   geometry=geometry.clone();material=material.clone();signal=material.name==='flamer_igniter'?'ignition':'projector';
   material.emissiveIntensity=signal==='ignition'?3.2:material.name==='projector_optics'?2.6:4.3;
   emission=new T.InstancedBufferAttribute(new Float32Array(capacity),1);geometry.setAttribute('instanceEmission',emission);
   material.onBeforeCompile=shader=>{shader.vertexShader='attribute float instanceEmission;varying float vInstanceEmission;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvInstanceEmission=instanceEmission;');shader.fragmentShader='varying float vInstanceEmission;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance*=vInstanceEmission;');};material.customProgramCacheKey=()=> 'builder_instance_emission_v1';
  }
  const binding=damage.prepare(node,category,lod,profile);geometry=binding.geometry;
  // Bake rigid local transforms once. Per-instance work then copies the
  // vehicle matrix; it no longer multiplies every static body primitive.
  const baked=!binding.dynamic||lod===2&&category==='chassis';
  if(baked){
   const flat=new T.BufferGeometry();
   for(const [name,attribute] of Object.entries(geometry.attributes))flat.setAttribute(name,['position','normal','tangent'].includes(name)?attribute.clone():attribute);
   flat.setIndex(geometry.index);flat.groups=geometry.groups.slice();flat.applyMatrix4(binding.bind);
   binding.geometry=geometry=flat;binding.bind.identity();binding.inverseLinear.identity();binding.linear.identity();
   damage.trackGeometry(geometry);
  }
  if(emission)geometry.setAttribute('instanceEmission',emission);
  geometry.setAttribute('instanceDamage',this.damageAttribute);
  const mesh=new T.InstancedMesh(geometry,material,capacity);
  // Painted metal has its own shared tint stream. All other primitives keep
  // the general tint, so paint changes cannot tint glass, rubber or lights.
  const painted=profile.paintable&&isVehiclePaintMaterial(material);
  if(painted)this.paintAttribute??=new T.InstancedBufferAttribute(new Float32Array(capacity*3),3).setUsage(T.DynamicDrawUsage);
  mesh.instanceColor=painted?this.paintAttribute:this.colorAttribute;
  if(baked)mesh.instanceMatrix=this.rigidMatrix??=new T.InstancedBufferAttribute(new Float32Array(capacity*16),16).setUsage(T.DynamicDrawUsage);
  mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);mesh.frustumCulled=false;mesh.castShadow=mesh.receiveShadow=true;mesh.count=0;damage.attach(mesh,binding,{instanced:true});parent.add(mesh);this.parts.push({node,mesh,emission,signal,binding,baked,painted});
 });this.staticPrototype=category==='body'&&this.parts.every(p=>!p.binding.dynamic);this.world=new T.Matrix4();this.combined=new T.Matrix4();this.index=0;}
 begin(){this.index=0;this.damageDirty=this.rigidDirty=this.colorDirty=this.paintDirty=false;for(const p of this.parts)p.matrixDirty=p.emissionDirty=false;}
 motion(nodes){this.prototype.traverse(node=>{node.matrixAutoUpdate=false;});for(const node of nodes.filter(Boolean))node.matrixAutoUpdate=true;this.selectiveMotion=true;return this;}
 updatePose(key){
  const revision=this.prototype.userData.damagePoseRevision??0;
  if(key&&this.poseRevision===revision&&this.poseKey?.length===key.length&&key.every((v,i)=>v===this.poseKey[i]))return;
  this.prototype.updateMatrixWorld(!this.selectiveMotion);this.poseKey=key;this.poseRevision=revision;
 }
 grow(){const T=this.T,capacity=this.capacity*2,attr=new T.InstancedBufferAttribute(new Float32Array(capacity*2),2).setUsage(T.DynamicDrawUsage);attr.array.set(this.damageAttribute.array);this.damageAttribute=attr;
  const colors=new T.InstancedBufferAttribute(new Float32Array(capacity*3),3).setUsage(T.DynamicDrawUsage);colors.array.set(this.colorAttribute.array);this.colorAttribute=colors;
  if(this.paintAttribute){const paints=new T.InstancedBufferAttribute(new Float32Array(capacity*3),3).setUsage(T.DynamicDrawUsage);paints.array.set(this.paintAttribute.array);this.paintAttribute=paints;}
  if(this.rigidMatrix){const grown=new T.InstancedBufferAttribute(new Float32Array(capacity*16),16).setUsage(T.DynamicDrawUsage);grown.array.set(this.rigidMatrix.array);this.rigidMatrix=grown;}
  for(const part of this.parts){const mesh=part.mesh;mesh.dispose();const matrix=part.baked?this.rigidMatrix:new T.InstancedBufferAttribute(new Float32Array(capacity*16),16).setUsage(T.DynamicDrawUsage);if(!part.baked)matrix.array.set(mesh.instanceMatrix.array);mesh.instanceMatrix=matrix;mesh.instanceColor=part.painted?this.paintAttribute:colors;mesh.geometry.setAttribute('instanceDamage',attr);if(part.emission){const emission=new T.InstancedBufferAttribute(new Float32Array(capacity),1);emission.array.set(part.emission.array);part.emission=emission;mesh.geometry.setAttribute('instanceEmission',emission);}}this.capacity=capacity;}
 add(transform,color,signals={},damageInfo={row:0,lod:2},poseKey=null,paint=color){
  if(this.index>=this.capacity)this.grow();const index=this.index++;
  const colors=this.colorAttribute;
  if(colors.getX(index)!==Math.fround(color.r)||colors.getY(index)!==Math.fround(color.g)||colors.getZ(index)!==Math.fround(color.b)){colors.setXYZ(index,color.r,color.g,color.b);this.colorDirty=true;}
  const paints=this.paintAttribute;
  if(paints&&(paints.getX(index)!==Math.fround(paint.r)||paints.getY(index)!==Math.fround(paint.g)||paints.getZ(index)!==Math.fround(paint.b))){paints.setXYZ(index,paint.r,paint.g,paint.b);this.paintDirty=true;}
  if(this.damageAttribute.getX(index)!==damageInfo.row||this.damageAttribute.getY(index)!==damageInfo.lod){this.damageAttribute.setXY(index,damageInfo.row,damageInfo.lod);this.damageDirty=true;}
  if(!this.staticPrototype)this.updatePose(poseKey);
  let rigidWritten=false;
  for(const part of this.parts){
   if(!part.baked||!rigidWritten){
   const combined=part.baked?transform:this.combined.multiplyMatrices(transform,part.node.matrixWorld);
   const a=part.mesh.instanceMatrix.array,e=combined.elements;let changed=false;
   for(let k=0;k<16;k++)if(a[index*16+k]!==Math.fround(e[k])){changed=true;break;}
   if(changed){part.mesh.setMatrixAt(index,combined);if(part.baked)this.rigidDirty=true;else part.matrixDirty=true;}
   if(part.baked)rigidWritten=true;
   }
   if(part.emission&&part.emission.getX(index)!==Math.fround(signals[part.signal]??0)){part.emission.setX(index,signals[part.signal]??0);part.emissionDirty=true;}
  }
 }
 end(){if(this.paintDirty)this.paintAttribute.needsUpdate=true;if(this.damageDirty)this.damageAttribute.needsUpdate=true;if(this.rigidDirty)this.rigidMatrix.needsUpdate=true;if(this.colorDirty)this.colorAttribute.needsUpdate=true;for(const p of this.parts){const {mesh,emission}=p;mesh.count=this.index;mesh.visible=this.index>0;if(p.matrixDirty)mesh.instanceMatrix.needsUpdate=true;if(emission&&p.emissionDirty)emission.needsUpdate=true;}}
 visible(value){for(const {mesh} of this.parts)mesh.visible=value;}
}

export async function createVehicleLayer(T,scene,field,config,damage) {
 const root=new T.Group();
 root.name='modular_vehicle_instances';
 scene.add(root);
 const scale=config.worldScale,loader=new GLTFLoader(),capacity=256;
 const [loaded,flamerAsset]=await Promise.all([
  Promise.all([0,1,2].map(lod=>Promise.all(['C01','B01'].map(id=>loader.loadAsync('../assets/vehicles/'+id+'/'+id+'-lod'+lod+'.glb'))))),
  loader.loadAsync('../assets/vehicles/'+config.units.flamer.model),
 ]);
 const lods=loaded.map((assets,lod)=>assets.map((asset,index)=>{
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
  const sprung=proto.getObjectByName('sprung_frame');
  return{batch:new PoseBatch(T,group,proto,capacity,damage,index?'body':'chassis',lod,{paintable:true}).motion([...wheels,...steering,...suspension.map(p=>p.node),sprung]),wheels,steering,suspension,sprung};
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
 const builderBatch=new PoseBatch(T,root,builder.root,capacity,damage,'equipment');
 const gun=new T.Group();
 gun.name='U01_KORD';
 gun.position.set(0,-.65,2.7);
 const kord=buildKord(T,gun,palette,kit);
 batchRigidMeshes(T,gun);
 const gunBatch=new PoseBatch(T,root,gun,capacity,damage,'weapon').motion([kord.yaw,kord.pitch,kord.recoil]);
 const flame=flamerAsset.scene;
 const mount=lods[0][1].batch.prototype.getObjectByName('upper_mount');
 mount.getWorldPosition(flame.position);
 const flameYaw=flame.getObjectByName('turret_yaw'),flamePitch=flame.getObjectByName('equipment_pitch'),flameMuzzle=flame.getObjectByName('fx_muzzle');
 flame.traverse(node=>{if(node.isMesh&&node.material.name==='flamer_igniter')node.material.emissiveIntensity=0;});
 const flameBatch=new PoseBatch(T,root,flame,capacity,damage,'weapon').motion([flameYaw,flamePitch]);

 const command=createFieldVehicle(T,'command',kit,palette);
 const raider=createFieldVehicle(T,'raider',kit,palette);
 const raiderYaw=kit.group(raider.root,[0,-1.19,1.62],'scrap_mount');
 kit.cylinder(raiderYaw,.08,.56,[0,0,.26],palette.steel);
 kit.box(raiderYaw,[.35,.38,.20],[0,.04,.54],palette.dark);
 kit.box(raiderYaw,[.63,.065,.42],[0,.21,.47],palette.edge);
 const raiderRecoil=kit.group(raiderYaw,[0,0,.56],'scrap_recoil');
 kit.cylinder(raiderRecoil,.045,.67,[0,.40,0],palette.dark,'Y');
 const raiderMuzzle=kit.group(raiderRecoil,[0,.735,0],'fx_muzzle');
 const commandBatch=new PoseBatch(T,root,command.root,capacity,damage,'body'),raiderBatch=new PoseBatch(T,root,raider.root,capacity,damage,'body');
 const scavModels=new Map(Object.keys(SCAV_PROFILES).filter(kind=>config.units[kind]).map(kind=>[kind,createScavUnit(T,kind)]));
 const infantryParts={0:{name:'person',material:'equipment',strength:10000},9:{name:'rifle',material:'equipment',strength:10000}};
 const scavBatches=new Map([...scavModels].map(([kind,model])=>[kind,new PoseBatch(T,root,model.root,capacity,damage,model.info.infantry?'equipment':'body',0,{cageBounds:model.info.bounds,parts:model.info.infantry?infantryParts:undefined})]));
 const modBatches=Object.entries(FIELD_RECIPES).map(([id,recipe])=>({id,recipe,batch:new PoseBatch(T,root,createFieldModification(T,id),capacity,damage,'body')}));
 const modularBindings=[...lods[0].flatMap(entry=>entry.batch.parts.map(p=>p.binding)),...modBatches.flatMap(m=>m.batch.parts.map(p=>p.binding))];
 function damagePose(bindings,kind){
  const animated=bindings.filter(b=>b.dynamic),matrices=new Map(animated.map(b=>[b,new T.Matrix4()])),inverses=new Map(animated.map(b=>[b,b.bind.clone().invert()]));
  const poseDummy=new T.Object3D(),groundPoint=new T.Vector3();
  return unit=>{
   const pose=vehiclePose(unit,field,scale),spin=-(unit.wheelDistance??0)/(.435*scale),steer=unit.steering??0;
   poseDummy.position.set(...pose.position);poseDummy.rotation.set(pose.pitch,pose.roll,unit.heading??0,'ZXY');poseDummy.scale.setScalar(scale);poseDummy.updateMatrix();
   const suspensionDelta=(x,y)=>{groundPoint.set(x,y,0).applyMatrix4(poseDummy.matrix);return T.MathUtils.clamp((field.heightAt(groundPoint.x,groundPoint.y)-groundPoint.z)/Math.max(1,poseDummy.matrix.elements[10]),-.11,.11);};
   const custom=scavModels.get(kind)??(kind==='command'?command:kind==='raider'?raider:null);
   if(custom&&!custom.scav){for(const wheel of custom.wheels){wheel.wheel.rotation.x=spin;wheel.steer.rotation.z=wheel.front?steer:0;wheel.steer.position.z=.43+suspensionDelta(wheel.steer.position.x,wheel.steer.position.y);}}
   else if(!custom)for(const entry of lods[0]){for(const wheel of entry.wheels)wheel.rotation.x=spin;for(const node of entry.steering)node.rotation.z=steer;for(const {node,x,y,z} of entry.suspension)node.position.z=z+suspensionDelta(x,y);}
   const aim=unit.aimTarget?worldToVehicle([unit.aimTarget.x,unit.aimTarget.y,unit.aimTarget.z??field.heightAt(unit.aimTarget.x,unit.aimTarget.y)+1.5*scale],pose):null;
   const yaw=(x,y)=>aim?Math.atan2(x-aim[0],aim[1]-y):0,pitch=(x,y,z,low,high)=>aim?T.MathUtils.clamp(Math.atan2(aim[2]-z,Math.hypot(aim[0]-x,aim[1]-y)),low,high):0;
   if(kind==='bukhanka'){kord.yaw.rotation.z=yaw(0,-.65);kord.pitch.rotation.x=pitch(0,-.65,3.28,-.32,.48);}
   if(kind==='builder')builder.aim(unit.projector?.yaw??0,unit.projector?.pitch??0,false);
   if(kind==='flamer'){flameYaw.rotation.z=yaw(flame.position.x,flame.position.y);flamePitch.rotation.x=pitch(flame.position.x,flame.position.y,flame.position.z+.422,-.22,.56);}
   if(kind==='raider')raiderYaw.rotation.z=yaw(0,-1.19);
   if(custom?.scav)poseScavUnit(custom,unit,{aim,travel:unit.wheelDistance??0,steer,scale,moving:unit.hp>0&&(unit.driveSpeed??0)>.1,suspension:suspensionDelta});
   const prototypes=custom?[custom.root]:[...lods[0].map(e=>e.batch.prototype),kind==='bukhanka'?gun:kind==='builder'?builder.root:flame];
   for(const prototype of prototypes){prototype.updateMatrixWorld(true);prototype.userData.damagePoseRevision=(prototype.userData.damagePoseRevision??0)+1;}
   for(const binding of animated)matrices.get(binding).multiplyMatrices(binding.node.matrixWorld,inverses.get(binding));
   return matrices;
  };
 }
 for(const [kind,batch] of [['bukhanka',gunBatch],['builder',builderBatch],['flamer',flameBatch]]){const bindings=[...modularBindings,...batch.parts.map(p=>p.binding)];damage.registerVehicle(kind,bindings,damagePose(bindings,kind));}
 for(const [kind,batch] of [['command',commandBatch],['raider',raiderBatch]]){const bindings=batch.parts.map(p=>p.binding);damage.registerVehicle(kind,bindings,damagePose(bindings,kind));}
 for(const [kind,batch] of scavBatches){const bindings=batch.parts.map(p=>p.binding);damage.registerVehicle(kind,bindings,damagePose(bindings,kind),isInfantry(kind)?{parts:infantryParts}:{});}
 const extras=[builderBatch,gunBatch,flameBatch,commandBatch,raiderBatch,...scavBatches.values(),...modBatches.map(m=>m.batch)];
 const transforms=new Map(),muzzles=new Map(),visible=[],workBeams=[],contacts=[];
 const contactShadows=createVehicleContactShadows(T,scene,field,scale);
 const dummy=new T.Object3D(),color=new T.Color(),matrix=new T.Matrix4(),contact=new T.Vector3();
 const paintTints=new Map(VEHICLE_PAINTS.map(paint=>[paint.id,vehiclePaintTint(T,paint)]));
 const turnDelta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
 let activeLod=1;

 function update(mission,cameraDistance,shotTimes,now,camera) {
  if(cameraDistance>725)activeLod=2;
  else if(cameraDistance<212)activeLod=0;
  else if(activeLod===0&&cameraDistance>255||activeLod===2&&cameraDistance<625)activeLod=1;
  lods.forEach(entries=>entries.forEach(({batch})=>{batch.begin();batch.visible(true);}));
  for(const batch of extras)batch.begin();
  const phase=T.MathUtils.clamp(mission.accumulator/config.simulationStep,0,1);
  const time=mission.state.time;
  workBeams.length=visible.length=contacts.length=0;
  muzzles.clear();
  const live=new Set();
  for(const unit of mission.state.units){
   const phase=unit.hp<=0?1:mission.renderUnitPhase?.(unit,now*1000)??T.MathUtils.clamp(mission.accumulator/config.simulationStep,0,1);
   if(unit.factoryVisit?.phase==='inside'||unit.hp<=0&&!unit.damage?.wreck||unit.owner!=='rai'&&!mission.visibleAt(unit.x,unit.y))continue;
   live.add(unit.id);
   const moving=unit.hp>0&&Math.hypot(unit.x-unit.previousX,unit.y-unit.previousY)>.008;
   const blend=moving?phase:1;
   const x=T.MathUtils.lerp(unit.previousX,unit.x,blend),y=T.MathUtils.lerp(unit.previousY,unit.y,blend);
   const previous=unit.previousHeading??unit.heading,heading=previous+turnDelta(unit.heading,previous)*(unit.builderWorking?1:phase);
   const pose=vehiclePose({kind:unit.kind,x,y,heading},field,scale);
   if(unit.contactRock&&!isInfantry(unit)&&activeLod<2){
    const rock=contactRockAt(unit,time+phase*config.simulationStep);pose.roll+=rock.roll;pose.pitch+=rock.pitch;
   }
   dummy.position.set(...pose.position);
   dummy.rotation.set(pose.pitch,pose.roll,heading,'ZXY');
   dummy.scale.setScalar(scale);
   dummy.updateMatrix();
   matrix.copy(dummy.matrix);
   const damageInfo=damage.representation(unit,matrix,(SCAV_PROFILES[unit.kind]?.boxes[0][2]??4)*scale+4);
   let data=transforms.get(unit.id);
   if(!data){data={matrix:new T.Matrix4(),position:new T.Vector3()};transforms.set(unit.id,data);}
   data.matrix.copy(matrix);
   data.position.copy(dummy.position);
   data.heading=heading;
   // HUD projection/picking also use this pose. Culling skips geometry work,
   // never leaves a moving offscreen unit at its last visible world position.
   if(!damageInfo.visible)continue;
   contacts.push({kind:unit.kind,x,y,z:dummy.position.z,heading,damage:unit.damage});
   const unitLod=Math.min(2,damageInfo.lod);
   const steer=unitLod===2?0:T.MathUtils.lerp(unit.previousSteering??unit.steering??0,unit.steering??0,phase);
   const travel=T.MathUtils.lerp(unit.previousWheelDistance??unit.wheelDistance??0,unit.wheelDistance??0,phase);
   if(unit.hp>0)visible.push({id:unit.id,kind:unit.kind,owner:unit.owner,x,y,heading,steering:steer,speed:moving?(unit.driveSpeed??0):0,working:unit.builderWorking});
   const spin=unitLod===2?0:-travel/(.435*scale);
   const suspensionDelta=(x,y)=>{
    contact.set(x,y,0).applyMatrix4(matrix);
    return T.MathUtils.clamp((field.heightAt(contact.x,contact.y)-contact.z)/Math.max(1,matrix.elements[10]),-.11,.11);
   };
   const custom=scavModels.get(unit.kind)??(unit.kind==='command'?command:unit.kind==='raider'?raider:null);
   if(!custom)for(const mod of modBatches)if(modificationInstalled(unit,mod.recipe.part)){color.setRGB(1,1,1);mod.batch.add(matrix,color,{},damageInfo);}
   if(custom&&!custom.scav){
    for(const wheel of custom.wheels){wheel.wheel.rotation.x=spin;wheel.steer.rotation.z=wheel.front?steer:0;wheel.steer.position.z=.43+suspensionDelta(wheel.steer.position.x,wheel.steer.position.y);}
   }else if(!custom){
    color.setRGB(1,1,1);
    for(const entry of lods[unitLod]){
     for(const wheel of entry.wheels)wheel.rotation.x=spin;
     for(const node of entry.steering)node.rotation.z=steer;
     for(const {node,x,y,z} of entry.suspension)node.position.z=z+(unitLod===2?0:suspensionDelta(x,y));
     if(entry.sprung)entry.sprung.position.z=moving&&unitLod<2?Math.sin(time*6+x*.03)*.022:0;
     entry.batch.add(matrix,color,{},damageInfo,unitLod===2?[0]:null,paintTints.get(vehiclePaint(unit).id));
    }
   }
   const aimPoint=unit.aimTarget;
   const aim=aimPoint?worldToVehicle([aimPoint.x,aimPoint.y,aimPoint.z??field.heightAt(aimPoint.x,aimPoint.y)+1.5*scale],pose):null;
   const yawTo=(px,py)=>aim?Math.atan2(px-aim[0],aim[1]-py):0;
   const pitchTo=(px,py,pz,low,high)=>aim?T.MathUtils.clamp(Math.atan2(aim[2]-pz,Math.hypot(aim[0]-px,aim[1]-py)),low,high):0;
   const age=now-(shotTimes.get(unit.id)??-Infinity),recoil=-.105*mgRecoil(age);
   color.setRGB(1,1,1);
   if(custom?.scav){
    poseScavUnit(custom,unit,{aim,travel,steer,scale,age,moving,suspension:suspensionDelta});
    scavBatches.get(unit.kind).add(matrix,color,{},damageInfo);
    muzzles.set(unit.id,new T.Vector3().setFromMatrixPosition(custom.gun.muzzle.matrixWorld).applyMatrix4(matrix));
   }else if(unit.kind==='builder'){
    builder.aim(unit.projector?.yaw??0,unit.projector?.pitch??0,false);
    builderBatch.add(matrix,color,{projector:unit.hp>0&&unit.builderWorking?1:.015},damageInfo);
    if(unit.hp>0&&unit.builderWorking&&unit.builderContact)workBeams.push({from:new T.Vector3().setFromMatrixPosition(builder.emitter.matrixWorld).applyMatrix4(matrix),to:new T.Vector3(...unit.builderContact),targetId:unit.task?.targetId,mode:unit.task?.type});
   }else if(unit.kind==='command'){
    commandBatch.add(matrix,color,{},damageInfo);
   }else if(unit.kind==='raider'){
    raiderYaw.rotation.z=yawTo(0,-1.19);raiderRecoil.position.y=recoil;
    raiderBatch.add(matrix,color,{},damageInfo);
    muzzles.set(unit.id,new T.Vector3().setFromMatrixPosition(raiderMuzzle.matrixWorld).applyMatrix4(matrix));
   }else if(unit.kind==='flamer'){
    flameYaw.rotation.z=yawTo(flame.position.x,flame.position.y);
    flamePitch.rotation.x=pitchTo(flame.position.x,flame.position.y,flame.position.z+.422,-.22,.56);
    flameBatch.add(matrix,color,{ignition:unit.hp>0&&age<.46?.72+.18*Math.sin(age*51):0},damageInfo,[flameYaw.rotation.z,flamePitch.rotation.x]);
    muzzles.set(unit.id,new T.Vector3().setFromMatrixPosition(flameMuzzle.matrixWorld).applyMatrix4(matrix));
   }else{
    kord.yaw.rotation.z=yawTo(0,-.65);kord.recoil.position.y=recoil;
    kord.pitch.rotation.x=pitchTo(0,-.65,3.28,-.32,.48);
    gunBatch.add(matrix,color,{},damageInfo,[kord.yaw.rotation.z,kord.pitch.rotation.x,kord.recoil.position.y]);
    muzzles.set(unit.id,new T.Vector3().setFromMatrixPosition(kord.muzzle.matrixWorld).applyMatrix4(matrix));
   }
  }
  for(const id of transforms.keys())if(!live.has(id))transforms.delete(id);
  for(const entries of lods)for(const {batch} of entries)batch.end();
  for(const batch of extras)batch.end();
  if(camera)contactShadows.update(contacts,camera);
 }
 function makeDesignModel(components,paint){
  const [chassisId,bodyId,upperId]=components;
  if(chassisId!=='C01'||bodyId!=='B01')return null;
  const source={U01:gun,U25:builder.root,'mission-flamer':flame}[upperId];
  if(!source)return null;
  const assembled=new T.Group(),chassis=lods[0][0].batch.prototype.clone(true),body=lods[0][1].batch.prototype.clone(true),upper=source.clone(true);
  for(const node of [chassis,body,upper])node.traverse(part=>{
   part.matrixAutoUpdate=true;
   if(part.isMesh)part.castShadow=part.receiveShadow=true;
   if(/(_wheel|_steer|_yaw|_pitch|recoil_1)$/.test(part.name)||part.name==='recoil_1')part.rotation.set(0,0,0);
   if(part.name==='sprung_frame')part.position.z=0;
  });
  const recoil=upper.getObjectByName('recoil_1');if(recoil)recoil.position.y=0;
  assembled.name='project_'+components.join('_');
  assembled.add(chassis,body,upper);
  const dispose=paintVehicleModel(assembled,vehiclePaint({components,paint}));
  return {root:assembled,chassis,body,upper,dispose};
 }
 return {root,update,transforms,muzzles,visible,workBeams,makeDesignModel,get lod(){return activeLod;},get drawCalls(){
  return [...lods.flatMap(entries=>entries.map(entry=>entry.batch)),...extras].reduce((sum,b)=>sum+(b.index?b.parts.length:0),0);
 }};
}
