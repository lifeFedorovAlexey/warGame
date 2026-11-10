import {extractDamagePart} from './damage-geometry.js';
import {vehiclePaint,vehiclePaintTint,isVehiclePaintMaterial} from './vehicle-paint.js';
import {debrisLaunch} from './debris-motion.js';
import {recoveredPaint,paintSalvageModel} from './salvage-paint.js';

export function createDamageDebris(T,scene,field,scale,{activeLimit=24,capacity=64}={}){
  const root=new T.Group();root.name='damage_debris_pool';scene.add(root);
  const slots=Array.from({length:capacity},()=>({model:null,active:false,age:0,velocity:new T.Vector3(),spin:new T.Vector3(),radius:0}));
  let serial=0,accumulator=0;
  const point=new T.Vector3(),axis=new T.Vector3(),groundNormal=new T.Vector3(),tilt=new T.Quaternion(),restRotation=new T.Quaternion();
  function clearance(slot){
    slot.model.updateMatrix();let minimum=Infinity;
    for(const support of slot.supports){point.copy(support).applyMatrix4(slot.model.matrix);minimum=Math.min(minimum,point.z-field.heightAt(point.x,point.y));}
    return minimum;
  }
  function settleRotation(slot,amount){
    const p=slot.model.position,slope=field.gradientAt?.(p.x,p.y)??{x:0,y:0};groundNormal.set(-slope.x,-slope.y,1).normalize();
    axis.copy(slot.restAxis).applyQuaternion(slot.model.quaternion);if(axis.dot(groundNormal)<0)axis.negate();
    tilt.setFromUnitVectors(axis,groundNormal);restRotation.copy(slot.model.quaternion).premultiply(tilt);slot.model.quaternion.slerp(restRotation,amount);
  }
  function clear(slot){
    if(slot.model){const materials=new Set();slot.model.traverse(n=>{if(n.isMesh){n.geometry.dispose();materials.add(n.material);}});for(const m of materials)m.dispose();root.remove(slot.model);}
    slot.model=null;slot.active=false;
  }
  function spawn(bindings,id,state,matrix,direction,power,transforms,vehicle,profile={}){
    if(slots.filter(s=>s.active).length>=activeLimit)return false;
    const slot=slots.find(s=>!s.model)??slots.filter(s=>!s.active).sort((a,b)=>b.age-a.age)[0];
    if(!slot)return false;
    const part=extractDamagePart(T,bindings,id,state,transforms);if(!part)return false;
    if(vehicle){
      const tint=vehiclePaintTint(T,vehiclePaint(vehicle)),painted=new Set();
      part.root.traverse(node=>{const material=node.material;if(node.isMesh&&isVehiclePaintMaterial(material)&&!painted.has(material)){material.color.multiply(tint);painted.add(material);}});
      if([27,28,30].includes(id))paintSalvageModel(part.root,recoveredPaint(vehicle,id));
    }
    clear(slot);slot.model=part.root;slot.age=0;slot.active=true;slot.serial=serial++;
    matrix.decompose(slot.model.position,slot.model.quaternion,slot.model.scale);
    slot.model.position.copy(part.centre).applyMatrix4(matrix);
    slot.supports=part.supports;slot.restAxis=part.restAxis;
    // Bias the blast towards the struck side, while far-side pieces still
    // break outwards. A local break uses the actual contact as its origin.
    const origin=new T.Vector3().fromArray(state.lastImpact?.point??[0,0,0]);
    if(state.wreck)origin.multiplyScalar(.3);
    origin.applyMatrix4(matrix);
    const offset=slot.model.position.clone().sub(origin),p=slot.model.position;
    const seed=Math.imul(slot.serial+1,73856093)^Math.imul(id+1,19349663)^Math.round(p.x*97+p.y*193+p.z*53);
    slot.motion=debrisLaunch({seed,size:part.size.toArray(),material:profile.material,offset:offset.toArray(),direction,power,wreck:state.wreck});
    slot.velocity.fromArray(slot.motion.velocity).multiplyScalar(scale);slot.spin.fromArray(slot.motion.spin);
    root.add(slot.model);return true;
  }
  function update(dt,camera){
    accumulator+=Math.min(dt,.15);let steps=0;
    while(accumulator>=1/30&&steps++<5){
      accumulator-=1/30;
      for(const slot of slots){
        if(!slot.model)continue;slot.age+=1/30;
        if(slot.age>55){clear(slot);continue;}
        if(!slot.active)continue;
        const p=slot.model.position,motion=slot.motion;slot.velocity.multiplyScalar(Math.exp(-motion.drag/30));slot.velocity.z-=9.8*scale/30;p.addScaledVector(slot.velocity,1/30);
        slot.spin.multiplyScalar(Math.exp(-motion.drag*.5/30));
        slot.model.rotateX(slot.spin.x/30);slot.model.rotateY(slot.spin.y/30);slot.model.rotateZ(slot.spin.z/30);
        const gap=clearance(slot);
        if(gap<.008*scale){p.z+=.008*scale-gap;slot.velocity.z=Math.abs(slot.velocity.z)*motion.bounce;slot.velocity.x*=motion.friction;slot.velocity.y*=motion.friction;slot.spin.multiplyScalar(motion.angularRetention);
          settleRotation(slot,motion.settle);
          if(slot.velocity.length()<scale*.5&&slot.age>.35||slot.age>4){settleRotation(slot,1);slot.active=false;slot.velocity.set(0,0,0);}
          p.z+=.008*scale-clearance(slot);
        }
      }
    }
    for(const slot of slots)if(slot.model)slot.model.visible=slot.model.position.distanceToSquared(camera.position)<820**2;
  }
  return {spawn,update,reset(){for(const s of slots)clear(s);accumulator=0;},get active(){return slots.filter(s=>s.active).length;},get count(){return slots.filter(s=>s.model).length;},root,activeLimit,capacity};
}
