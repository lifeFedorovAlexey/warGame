import {createKorovnik} from './korovnik-model.js';
import {transportSite} from './transport-site.js';
import {createHelipad} from './helipad.js';
import {transportPose,cargoPose} from './korovnik-transport.js';

export function createKorovnikView(T,scene,field,config,vehicles,addFog){
 const site=transportSite(field,config),root=new T.Group();root.name='mu26_landing_ground';scene.add(root);
 createHelipad(T,root,field,site,addFog);
 const dustPositions=new Float32Array(64*3),dustGeometry=new T.BufferGeometry();dustGeometry.setAttribute('position',new T.BufferAttribute(dustPositions,3));
 const dustSprite=document.createElement('canvas');dustSprite.width=dustSprite.height=32;
 const dustContext=dustSprite.getContext('2d'),dustGradient=dustContext.createRadialGradient(16,16,0,16,16,16);dustGradient.addColorStop(0,'#ffffff');dustGradient.addColorStop(.35,'#ffffff99');dustGradient.addColorStop(1,'#ffffff00');dustContext.fillStyle=dustGradient;dustContext.fillRect(0,0,32,32);
 const dustMaterial=new T.PointsMaterial({map:new T.CanvasTexture(dustSprite),color:'#b2a18a',size:29,transparent:true,opacity:.2,depthWrite:false});addFog(dustMaterial);
 const downwash=new T.Points(dustGeometry,dustMaterial);downwash.frustumCulled=false;downwash.visible=false;scene.add(downwash);
 let helicopter=null,lastPhase='',lastDoor=-1,lastRotor=-1;const cargo=new Map();
 function update(mission,camera){
  const t=mission.state.transport,visible=!!t&&!['absent','departed'].includes(t.phase);
  // The plot exists from mission one, while the aircraft is created on demand.
  if(!helicopter&&visible){helicopter=createKorovnik(T);helicopter.materials.forEach(addFog);scene.add(helicopter.root);helicopter.root.scale.setScalar(config.worldScale);}
  if(!helicopter)return false;
  helicopter.root.visible=visible;downwash.visible=false;if(!visible)return lastPhase!==t?.phase?(lastPhase=t?.phase,true):false;
  const p=transportPose(t),ground=field.heightAt(t.site.x,t.site.y);
  helicopter.root.position.set(p.x,p.y,ground+p.z);helicopter.root.rotation.set(p.tilt,0,p.heading);helicopter.pose(p);
  helicopter.setDetail?.(!camera||camera.position.distanceTo(helicopter.root.position)<1000);
  downwash.visible=p.z<140&&['landing','opening','spooling','departing'].includes(t.phase);
  if(downwash.visible){for(let i=0;i<64;i++){const a=i*2.399+mission.state.time*.2,r=35+(i*17+mission.state.time*29)%115,x=p.x+Math.cos(a)*r,y=p.y+Math.sin(a)*r;dustPositions.set([x,y,field.heightAt(x,y)+3+(i*3+mission.state.time*6)%15],i*3);}dustGeometry.attributes.position.needsUpdate=true;dustMaterial.opacity=.21*(1-p.z/160);}
  const ids=new Set(t.manifest.map(c=>c.unit.id));
  for(const [id,model] of cargo)if(!ids.has(id)){helicopter.root.remove(model.root);model.dispose?.();cargo.delete(id);}
  for(const c of t.manifest){
   let model=cargo.get(c.unit.id);
   if(!model){model=vehicles.makeCargoModel(c.unit);if(!model)continue;model.root.name='cargo_'+c.unit.id;model.root.traverse(n=>{if(n.isMesh){for(const material of Array.isArray(n.material)?n.material:[n.material])addFog(material);}});cargo.set(c.unit.id,model);helicopter.root.add(model.root);}
   const pose=cargoPose(t,c);model.root.position.set(pose.x,pose.y,pose.z);model.root.rotation.set(pose.pitch??0,0,pose.heading??0);
  }
  const dirty=lastPhase!==t.phase||lastDoor!==t.door||lastRotor!==t.rotor;lastPhase=t.phase;lastDoor=t.door;lastRotor=t.rotor;return dirty;
 }
 return {root,site,update,get helicopter(){return helicopter;}};
}
