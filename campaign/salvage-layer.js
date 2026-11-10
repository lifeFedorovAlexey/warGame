import {extractDamagePart} from './damage-geometry.js';
import {paintSalvageModel} from './salvage-paint.js';
export function createSalvageLayer(T,scene,field,scale,getTemplate){
  const root=new T.Group();root.name='recoverable_parts';scene.add(root);
  const models=new Map(),cache=new Map(),point=new T.Vector3(),spin=new T.Quaternion();
  let sceneryStock=0;
  function update(mission,camera){
    const items=mission?.state.salvage?.items??[],live=new Set(items.map(i=>i.id));
    sceneryStock=items.filter(item=>item.sourceKind==='street-lamp').length;
    for(const [id,model] of models)if(!live.has(id)){root.remove(model);models.delete(id);}
    for(const item of items){
      // The yard owns this exact pole, including its hinged fall and pickup.
      if(item.sourceKind==='street-lamp')continue;
      let model=models.get(item.id);
      if(!model){
        const key=item.sourceKind+':'+item.sourcePart+':'+item.paintColor;
        if(!cache.has(key)){
          const template=getTemplate({kind:item.sourceKind}),part=template&&extractDamagePart(T,template.bindings,item.sourcePart,null);
          if(!part)continue;paintSalvageModel(part.root,item.paintColor);cache.set(key,part);
        }
        const part=cache.get(key);model=part.root.clone(true);model.name=item.id;model.scale.setScalar(scale);
        model.quaternion.setFromUnitVectors(part.restAxis,new T.Vector3(0,0,1));
        model.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),item.heading));
        model.position.set(item.x,item.y,field.heightAt(item.x,item.y));model.updateMatrix();
        let gap=Infinity;for(const p of part.supports){point.copy(p).applyMatrix4(model.matrix);gap=Math.min(gap,point.z-field.heightAt(point.x,point.y));}
        model.position.z+=.012*scale-gap;model.updateMatrix();
        model.userData.landing=model.position.clone();model.userData.restRotation=model.quaternion.clone();
        root.add(model);models.set(item.id,model);
      }
      const t=item.origin?Math.max(0,Math.min(1,(mission.state.time-item.bornAt)/Math.max(.01,item.readyAt-item.bornAt))):1;
      if(t<1){
        model.position.fromArray(item.origin).lerp(model.userData.landing,t);model.position.z+=Math.sin(Math.PI*t)*scale*.6;
        spin.setFromAxisAngle(new T.Vector3(0,0,1),item.heading);model.quaternion.copy(spin).slerp(model.userData.restRotation,t);
      }else{model.position.copy(model.userData.landing);model.quaternion.copy(model.userData.restRotation);}
      model.updateMatrix();
      model.visible=(!mission.exploredAt||mission.exploredAt(item.x,item.y))&&model.position.distanceToSquared(camera.position)<820**2;
    }
  }
  return {root,update,reset(){for(const m of models.values())root.remove(m);models.clear();sceneryStock=0;},get count(){return models.size+sceneryStock;}};
}
