import {mergeGeometries} from '../demo/vendor/utils/BufferGeometryUtils.js';
import {streetLampSites,LAMP_FALL_SECONDS} from './street-furniture.js';

// Static instances normally; matrix uploads only on a break, fall or pickup.
export function createStreetLampLayer(T,field,config,addFog){
  const root=new T.Group();root.name='street_lamps';
  const scale=config.worldScale,sites=streetLampSites(field,config),pieces=[];
  function geometry(g,color,position){
    g.translate(...position);const flat=g.index?g.toNonIndexed():g;if(flat!==g)g.dispose();
    const rgb=new T.Color(color),colors=new Float32Array(flat.attributes.position.count*3);
    for(let i=0;i<colors.length;i+=3)rgb.toArray(colors,i);
    flat.setAttribute('color',new T.BufferAttribute(colors,3));pieces.push(flat);
  }
  function box(size,pos,color){geometry(new T.BoxGeometry(...size),color,pos);}
  function rod(a,b,r){
    const start=new T.Vector3(...a),end=new T.Vector3(...b),g=new T.CylinderGeometry(r,r,start.distanceTo(end),8);
    g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),end.clone().sub(start).normalize()));
    geometry(g,'#454b40',start.add(end).multiplyScalar(.5).toArray());
  }
  rod([0,0,0],[0,0,4.66],.075);rod([0,0,4.66],[0,-1,4.91],.055);
  box([.46,.76,.20],[0,-1.12,4.90],'#65674b');
  box([.18,.16,.44],[.04,.08,1.01],'#454b40');
  const bodyGeometry=mergeGeometries(pieces);for(const g of pieces)g.dispose();
  const bodyMaterial=new T.MeshStandardMaterial({vertexColors:true,roughness:.87,metalness:.3});
  const baseMaterial=new T.MeshStandardMaterial({color:'#454b40',roughness:.9,metalness:.3});
  const lensMaterial=new T.MeshStandardMaterial({color:'#c3b79a',emissive:'#edc17a',emissiveIntensity:0,roughness:.7});
  for(const m of [bodyMaterial,baseMaterial,lensMaterial])addFog(m);
  const bodies=new T.InstancedMesh(bodyGeometry,bodyMaterial,sites.length),bases=new T.InstancedMesh(new T.BoxGeometry(.45,.45,.17),baseMaterial,sites.length);
  const lenses=new T.InstancedMesh(new T.BoxGeometry(.37,.60,.035),lensMaterial,sites.length);
  bodies.name='lamp_poles';bases.name='lamp_footings';lenses.name='lamp_lenses';
  for(const mesh of [bodies,bases,lenses]){mesh.castShadow=mesh.receiveShadow=true;mesh.frustumCulled=false;root.add(mesh);}
  for(const mesh of [bodies,lenses])mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
  const dummy=new T.Object3D(),q=new T.Quaternion(),axis=new T.Vector3(),point=new T.Vector3(),zAxis=new T.Vector3(0,0,1),pose=new T.Matrix4();
  const supports=bodyGeometry.getAttribute('position'),lights=[],entries=[];
  for(const [i,site] of sites.entries()){
    const z=field.heightAt(site.x,site.y);
    dummy.position.set(site.x,site.y,z+.085*scale);dummy.rotation.set(0,0,site.angle);dummy.scale.setScalar(scale);dummy.updateMatrix();bases.setMatrixAt(i,dummy.matrix);
    const light=new T.PointLight('#ffdc9c',0,scale*11,2);light.name=site.id;
    light.position.set(site.x+Math.sin(site.angle)*1.12*scale,site.y-Math.cos(site.angle)*1.12*scale,z+4.83*scale);root.add(light);lights.push(light);
    entries.push({site,z:z+.14*scale,signature:null});
  }
  bases.instanceMatrix.needsUpdate=true;
  let visibleCount=sites.length,revision=0;
  function update(mission,time=mission.state.time){
    const broken=mission.state.streetFurniture??{},stock=new Set((mission.state.salvage?.items??[]).map(i=>i.id));
    const powered=!!mission.state.powered;lensMaterial.emissiveIntensity=powered?3:0;let changed=false;visibleCount=0;
    for(const [i,entry] of entries.entries()){
      const {site,z}=entry,state=broken[site.id],present=!state||stock.has(state.salvageId),t=state?Math.max(0,Math.min(1,(time-state.brokenAt)/LAMP_FALL_SECONDS)):0;
      const signature=state?state.salvageId+':'+present+':'+t+':'+state.direction.join(','):'standing';
      lights[i].intensity=powered&&!state?1800:0;
      if(present)visibleCount++;
      if(signature===entry.signature)continue;entry.signature=signature;changed=true;
      const fallKey=state&&state.salvageId+':'+state.brokenAt+':'+state.direction.join(',');
      if(state&&entry.fallKey!==fallKey){
        entry.fallKey=fallKey;
        const [dx,dy]=state.direction,orientation=new T.Quaternion().setFromAxisAngle(zAxis,site.angle),position=new T.Vector3(site.x,site.y,z),size=new T.Vector3(scale,scale,scale);
        axis.set(-dy,dx,0);let low=0,high=Math.PI*.66;
        // Rest on the cut foot and the first grounded part of the bent head.
        // Raising the whole horizontal pole to clear its head would leave its
        // broken end floating. Solve its final tilt once instead.
        for(let step=0;step<15;step++){
          const angle=(low+high)/2;q.setFromAxisAngle(axis,angle).multiply(orientation);pose.compose(position,q,size);let gap=Infinity;
          for(let j=0;j<supports.count;j++){point.fromBufferAttribute(supports,j).applyMatrix4(pose);gap=Math.min(gap,point.z-field.heightAt(point.x,point.y));}
          if(gap>.025*scale)low=angle;else high=angle;
        }
        entry.angle=low;
      }
      dummy.position.set(site.x,site.y,z);
      dummy.quaternion.setFromAxisAngle(zAxis,site.angle);
      if(state){axis.set(-state.direction[1],state.direction[0],0);q.setFromAxisAngle(axis,entry.angle*t*t);dummy.quaternion.premultiply(q);}
      dummy.scale.setScalar(present?scale:0);dummy.updateMatrix();bodies.setMatrixAt(i,dummy.matrix);
      dummy.position.set(lights[i].position.x,lights[i].position.y,field.heightAt(site.x,site.y)+4.92*scale);
      dummy.rotation.set(0,0,site.angle);dummy.scale.setScalar(state?0:scale);dummy.updateMatrix();lenses.setMatrixAt(i,dummy.matrix);
    }
    if(changed){bodies.instanceMatrix.needsUpdate=true;lenses.instanceMatrix.needsUpdate=true;revision++;}
    return changed;
  }
  return {root,update,lights,get revision(){return revision;},get visibleCount(){return visibleCount;}};
}
