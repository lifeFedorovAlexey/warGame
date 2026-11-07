import {GLTFLoader} from '../demo/vendor/loaders/GLTFLoader.js';
import {createBuilderRig} from './builder-rig.js';

// One instance stream per GLB primitive. More units do not add draw calls.
class PoseBatch{
 constructor(T,parent,prototype,capacity){this.T=T;this.prototype=prototype;this.parts=[];prototype.updateMatrixWorld(true);prototype.traverse(node=>{if(!node.isMesh)return;const mesh=new T.InstancedMesh(node.geometry,node.material,capacity);mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);mesh.frustumCulled=false;mesh.castShadow=mesh.receiveShadow=true;mesh.count=0;parent.add(mesh);this.parts.push({node,mesh});});this.world=new T.Matrix4();this.combined=new T.Matrix4();this.index=0;}
 begin(){this.index=0;}
 add(transform,color){const index=this.index++;this.prototype.updateMatrixWorld(true);for(const part of this.parts){this.combined.multiplyMatrices(transform,part.node.matrixWorld);part.mesh.setMatrixAt(index,this.combined);part.mesh.setColorAt(index,color);}}
 end(){for(const {mesh} of this.parts){mesh.count=this.index;mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}}
 visible(value){for(const {mesh} of this.parts)mesh.visible=value;}
}

export async function createVehicleLayer(T,scene,field,config){
 const root=new T.Group();root.name='modular_vehicle_instances';scene.add(root);const scale=config.worldScale,loader=new GLTFLoader(),capacity=80,lods=[];
 for(let lod=0;lod<3;lod++){
  const assets=await Promise.all(['C01','B01'].map(id=>loader.loadAsync('../assets/vehicles/'+id+'/'+id+'-lod'+lod+'.glb'))),batches=[];
  for(const [index,asset] of assets.entries()){const proto=asset.scene;proto.rotation.x=Math.PI/2;if(index)proto.position.z=1.05;proto.updateMatrixWorld(true);const group=new T.Group();group.name=index?'B01':'C01';root.add(group);batches.push(new PoseBatch(T,group,proto,capacity));}
  lods.push(batches);
 }
 const builder=createBuilderRig(T,{lod:1});builder.root.position.set(0,-.65,2.7);const builderBatch=new PoseBatch(T,root,builder.root,capacity);
 const gun=new T.Group();gun.name='U01_temporary';gun.position.set(0,-.65,2.7);const gunPaint=new T.MeshStandardMaterial({color:'#505947',metalness:.6,roughness:.52}),gunDark=new T.MeshStandardMaterial({color:'#242a28',metalness:.7,roughness:.45});
 function part(parent,geometry,material,position){const mesh=new T.Mesh(geometry,material);mesh.position.set(...position);parent.add(mesh);return mesh;}
 const flange=new T.CylinderGeometry(.45,.45,.1,12);flange.rotateX(Math.PI/2);part(gun,flange,gunDark,[0,0,.05]);const turret=new T.Group();gun.add(turret);part(turret,new T.BoxGeometry(.40,.56,.34),gunPaint,[0,0,.25]);part(turret,new T.BoxGeometry(.24,.38,.25),gunDark,[-.26,-.15,.25]);const barrel=new T.CylinderGeometry(.045,.045,1.1,10);part(turret,barrel,gunDark,[0,.65,.26]);const gunBatch=new PoseBatch(T,root,gun,capacity);
 const command=new T.Group();command.name='U21_temporary';command.position.set(0,-.65,2.7);part(command,new T.BoxGeometry(.55,.75,.25),gunPaint,[0,0,.15]);part(command,new T.CylinderGeometry(.012,.02,1.6,6),gunDark,[.24,-.24,1]).rotation.x=Math.PI/2;const commandBatch=new PoseBatch(T,root,command,capacity);
 const transforms=new Map(),dummy=new T.Object3D(),color=new T.Color(),matrix=new T.Matrix4(),weldTips=[];let activeLod=1,previousTime=0;
 function update(mission,selected,cameraDistance){
  activeLod=cameraDistance>700?2:cameraDistance>230?1:0;lods.forEach((batches,lod)=>batches.forEach(batch=>{batch.begin();batch.visible(lod===activeLod);}));for(const batch of [builderBatch,gunBatch,commandBatch])batch.begin();
  const time=mission.state.time,dt=Math.max(0,time-previousTime);previousTime=time;weldTips.length=0;
  for(const unit of mission.state.units){if(unit.hp<=0||unit.owner!=='rai'&&!mission.visibleAt(unit.x,unit.y))continue;
   const data=transforms.get(unit.id)??{spin:0,heading:unit.heading};data.spin+=Math.hypot(unit.x-unit.previousX,unit.y-unit.previousY)/(.45*scale)*Math.min(1,dt/.1);const speed=Math.hypot(unit.x-unit.previousX,unit.y-unit.previousY)/.1,g=field.gradientAt(unit.x,unit.y),c=Math.cos(unit.heading),s=Math.sin(unit.heading),forward=-s*g.x+c*g.y,side=c*g.x+s*g.y;
   dummy.position.set(unit.x,unit.y,field.heightAt(unit.x,unit.y));dummy.rotation.set(Math.atan(forward),-Math.atan(side),unit.heading,'ZXY');dummy.scale.setScalar(scale);dummy.updateMatrix();matrix.copy(dummy.matrix);transforms.set(unit.id,{...data,matrix:matrix.clone(),position:dummy.position.clone()});
   color.set(unit.owner==='rai'?'#ffffff':'#d0a18a');
   for(const batch of lods[activeLod]){batch.prototype.traverse(node=>{if(node.name.endsWith('_wheel'))node.rotation.x=data.spin;if(node.name==='sprung_frame')node.position.z=speed>.1?Math.sin(time*5+unit.x*.03)*.025:0;});batch.add(matrix,color);}
   let aim=0;if(unit.aimTarget){const angle=Math.atan2(-(unit.aimTarget.x-unit.x),unit.aimTarget.y-unit.y)-unit.heading;aim=Math.atan2(Math.sin(angle),Math.cos(angle));}
   if(unit.kind==='builder'){builder.pose(unit.tool,aim*180/Math.PI,time,false);builderBatch.add(matrix,color);if(unit.tool>.985&&!unit.path.length&&['build','repair'].includes(unit.task?.type))weldTips.push(builder.tip.getWorldPosition(new T.Vector3()).applyMatrix4(matrix));}else if(unit.kind==='command')commandBatch.add(matrix,color);else{turret.rotation.z=aim;gunBatch.add(matrix,color);}
  }
  for(const batch of [...lods[activeLod],builderBatch,gunBatch,commandBatch])batch.end();
 }
 return{root,update,transforms,weldTips,get lod(){return activeLod;},get drawCalls(){return [...lods[activeLod],builderBatch,gunBatch,commandBatch].reduce((sum,b)=>sum+(b.index?b.parts.length:0),0);}};
}
