import {vehiclePose} from './builder-kinematics.js';
import {combatContact} from './combat-contact.js';
import {buildLayerHeight} from './builder-optics.js';
import {CAGE_COUNT,MAX_MARKS,MAX_PARTS,VEHICLE_PARTS,damageLOD,applyStructuralImpact} from './damage-state.js';
import {ATLAS_WIDTH,PART_OFFSET,MARK_OFFSET,META_OFFSET,attachDamageShader} from './damage-shader.js';
import {prepareDamageGeometry,createDamageCollider,collectDamageRegions} from './damage-geometry.js';
import {createDamageDebris} from './damage-debris.js';
import {createSalvageLayer} from './salvage-layer.js';

export function createDamageSystem(T,scene,field,config){
  const capacity=1024,data=new Float32Array(ATLAS_WIDTH*capacity*4),atlas=new T.DataTexture(data,ATLAS_WIDTH,capacity,T.RGBAFormat,T.FloatType);
  atlas.magFilter=atlas.minFilter=T.NearestFilter;atlas.generateMipmaps=false;atlas.needsUpdate=true;
  const enabled={value:1},clock={value:0},records=new Map(),free=Array.from({length:capacity-1},(_,i)=>capacity-i-1),templates=new Map(),debris=createDamageDebris(T,scene,field,config.worldScale);
  const geometryVersions=new Map(),instanceVersions=new Map();
  const dummy=new T.Object3D(),inverse=new T.Matrix4(),normalMatrix=new T.Matrix3(),origin=new T.Vector3(),direction=new T.Vector3();
  const frustum=new T.Frustum(),projection=new T.Matrix4(),sphere=new T.Sphere(),position=new T.Vector3();
  let mission=null,templateProvider=null,frame=0;
  const salvage=createSalvageLayer(T,scene,field,config.worldScale,getTemplate);
  const stats={hitCount:0,hitCpuMs:0,hitStateCpuMs:0,deformationCpuMs:0,geometryUpdates:0,instanceBufferUpdates:0,textureRows:0,textureBytes:0,visibleDamaged:0,deferred:0};
  function matrixFor(entity){
    if(config.units[entity.kind]){const pose=vehiclePose(entity,field,config.worldScale);dummy.position.set(...pose.position);dummy.rotation.set(pose.pitch,pose.roll,entity.heading??0,'ZXY');}
    else{dummy.position.set(entity.x,entity.y,entity.groundHeight??field.heightAt(entity.x,entity.y));dummy.rotation.set(0,0,entity.rotation??0);}
    dummy.scale.setScalar(config.worldScale);dummy.updateMatrix();return dummy.matrix;
  }
  function getTemplate(entity){
    const key=(config.units[entity.kind]?'vehicle:':'building:')+entity.kind+(!config.units[entity.kind]?':'+entity.owner+':'+(entity.campId??''):'');
    if(!templates.has(key)&&templateProvider){const model=templateProvider(entity);if(model)templates.set(key,model);}
    const template=templates.get(key);if(template&&!template.collider)template.collider=createDamageCollider(T,template.bindings);
    if(template&&!template.regions)template.regions=collectDamageRegions(template.bindings);
    return template;
  }
  function registerVehicle(kind,bindings,pose,options={}){templates.set('vehicle:'+kind,{bindings,parts:options.parts??VEHICLE_PARTS,pose});}
  function buildingCeiling(entity){const spec=config.buildings[entity.kind];return entity.owner==='rai'&&!entity.completed&&spec?.realSizeMetres?buildLayerHeight({...entity,groundHeight:entity.groundHeight??field.heightAt(entity.x,entity.y)},spec,config.worldScale):Infinity;}
  function trace(entity,worldOrigin,worldDirection){
    const start=performance.now(),template=getTemplate(entity);if(!template)return null;
    const transforms=template.pose?.(entity),matrix=matrixFor(entity);inverse.copy(matrix).invert();
    origin.fromArray(worldOrigin).applyMatrix4(inverse);direction.fromArray(worldDirection).transformDirection(inverse);
    const localDirection=direction.toArray(),heightLimit=(buildingCeiling(entity)-(entity.groundHeight??field.heightAt(entity.x,entity.y)))/config.worldScale,hit=template.collider.trace(origin.toArray(),localDirection,entity.damage,transforms,heightLimit);
    stats.hitCpuMs+=performance.now()-start;
    if(!hit)return null;
    normalMatrix.getNormalMatrix(matrix);
    return {...hit,entityId:entity.id,partSpec:template.parts[hit.partId]??{material:config.units[entity.kind]?'metal':'concrete'},
      direction:localDirection,worldPoint:new T.Vector3(...hit.point).applyMatrix4(matrix).toArray(),worldNormal:new T.Vector3(...hit.normal).applyMatrix3(normalMatrix).normalize().toArray(),worldDirection:worldDirection.slice()};
  }
  function resolveContact(source,target,options={}){
    const approximate=options.contact??combatContact(source??{x:target.x,y:target.y-100},target,config,field);
    const from=source?[source.x,source.y,field.heightAt(source.x,source.y)+(source.kind==='mg-tower'?10.8:3.15)*config.worldScale]:[target.x,target.y-100,approximate.z];
    // Deterministic small spread avoids every burst striking the identical texel.
    const h=target.damage?.hits??0,spread=options.exact?0:.09*config.worldScale;
    const ceiling=buildingCeiling(target),base=target.groundHeight??field.heightAt(target.x,target.y);
    const to=[approximate.x+Math.sin(h*2.399)*spread,approximate.y+Math.cos(h*2.399)*spread,Math.min(approximate.z+Math.sin(h*1.73)*spread,base+(ceiling-base)*.7)];
    const dir=new T.Vector3(...to).sub(new T.Vector3(...from)).normalize().toArray();
    const hit=trace(target,from,dir);
    return hit?{...hit,type:options.type??(source?.kind==='flamer'?'fire':'bullet'),power:options.power}:null;
  }
  function prepare(node,category,lod,profile){const binding=prepareDamageGeometry(T,node,category,lod,profile),p=binding.geometry.attributes.position;geometryVersions.set(p,p.version);return binding;}
  function trackGeometry(geometry){const p=geometry.attributes.position;geometryVersions.set(p,p.version);}
  function attach(mesh,binding,options){if(mesh.isInstancedMesh)instanceVersions.set(mesh,mesh.instanceMatrix.version);return attachDamageShader(T,mesh,binding,atlas,enabled,{...options,clock});}
  function getRecord(entity){
    let r=records.get(entity.id);
    if(r&&r.entity!==entity){release(entity.id);r=null;}
    if(!r){r={entity,row:0,revision:-1,lod:2,lastSeen:frame,detached:new Set(Object.entries(entity.damage?.parts??{}).filter(([,s])=>s.detached).map(([id])=>Number(id)))};records.set(entity.id,r);}
    r.lastSeen=frame;return r;
  }
  function upload(r){
    const state=r.entity.damage;if(!state||r.revision===state.revision)return;
    if(!r.row){
      if(!free.length){const victim=[...records.values()].filter(v=>v.row&&v.lastVisible<frame-1).sort((a,b)=>a.lastVisible-b.lastVisible)[0];if(victim){free.push(victim.row);victim.row=0;victim.revision=-1;}}
      r.row=free.pop()??0;if(!r.row)return;
    }
    const base=r.row*ATLAS_WIDTH*4;data.fill(0,base,base+ATLAS_WIDTH*4);
    if(state.cage)for(let i=0;i<CAGE_COUNT;i++){const off=base+i*4;data[off]=state.cage[i*3];data[off+1]=state.cage[i*3+1];data[off+2]=state.cage[i*3+2];}
    for(const [id,s] of Object.entries(state.parts)){const i=Number(id);if(i>=MAX_PARTS)continue;data[base+(PART_OFFSET+i)*4]=Number(s.detached);data[base+(PART_OFFSET+i)*4+1]=s.damage;}
    // Keep recent impacts also in the medium-distance aggregate.
    state.marks.slice().reverse().forEach((m,i)=>{
      const off=base+(MARK_OFFSET+i*3)*4;data.set([...m.point,m.radius,...m.normal,m.part,m.kind,m.part,m.material,0],off);
    });
    data.set([state.marks.length,state.burn,Number(!!state.cage),Number(state.wreck)],base+META_OFFSET*4);
    data.set([r.entity.destroyedAt??0,r.entity.removeAt??0,0,0],base+(META_OFFSET+1)*4);
    atlas.addUpdateRange(base,ATLAS_WIDTH*4);atlas.needsUpdate=true;r.revision=state.revision;
    stats.textureRows++;stats.textureBytes+=ATLAS_WIDTH*16;
  }
  function representation(entity,matrix,radius=18){
    const r=getRecord(entity);position.setFromMatrixPosition(matrix);sphere.center.copy(position);sphere.radius=radius;
    const visible=frustum.intersectsSphere(sphere),distance=position.distanceTo(currentCamera.position);
    r.lod=damageLOD(distance,r.lod,visible);r.visible=visible;
    if(entity.damage){
      if(visible){r.lastVisible=frame;upload(r);stats.visibleDamaged++;}
      else if(r.revision!==entity.damage.revision)stats.deferred++;
      for(const [key,s] of Object.entries(entity.damage.parts))if(s.detached&&!r.detached.has(Number(key))){
        const id=Number(key);r.detached.add(id);
        if(visible&&r.lod===0&&enabled.value&&!s.salvageId){
          const template=getTemplate(entity),impact=entity.damage.lastImpact;
          if(template&&impact)debris.spawn(template.bindings,id,entity.damage,matrix,impact.direction,impact.power,template.pose?.(entity));
        }
      }
    }
    return {row:enabled.value?r.row:0,lod:r.lod,visible};
  }
  let currentCamera=null;
  function begin(camera,dt){
    currentCamera=camera;clock.value=mission?.state.time??0;frame++;stats.visibleDamaged=stats.deferred=0;
    camera.updateMatrixWorld();frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    debris.update(enabled.value?dt:0,camera);debris.root.visible=!!enabled.value;
    salvage.update(mission,camera);
  }
  function release(id){const r=records.get(id);if(r?.row)free.push(r.row);records.delete(id);}
  function end(){
    for(const [id,r] of records)if(r.lastSeen<frame-1)release(id);
    for(const [attribute,version] of geometryVersions)if(attribute.version!==version){stats.geometryUpdates+=Math.max(1,attribute.version-version);geometryVersions.set(attribute,attribute.version);}
    for(const [mesh,version] of instanceVersions)if(mesh.instanceMatrix.version!==version){stats.instanceBufferUpdates+=Math.max(1,mesh.instanceMatrix.version-version);instanceVersions.set(mesh,mesh.instanceMatrix.version);}
  }
  function bindMission(m){
    mission=m;m.resolveDamageContact=resolveContact;
    m.resolveVehicleImpact=(entity,point,into)=>trace(entity,point.map((v,k)=>v-into[k]*3*config.worldScale),into);
    m.damagePartWorldPosition=(entity,id)=>{
      const region=getTemplate(entity)?.regions.find(r=>r.id===id);if(!region)return null;
      return new T.Vector3(...region.min.map((v,k)=>(v+region.max[k])*.5)).applyMatrix4(matrixFor(entity)).toArray();
    };
    m.onDamageMeasured=(ms,deformationMs)=>{stats.hitCount++;stats.hitStateCpuMs+=ms;stats.deformationCpuMs+=deformationMs??0;};
    m.onDamageImpact=(entity,hit)=>{
      const template=getTemplate(entity);if(!template)return [];
      return applyStructuralImpact(entity.damage,hit,template.regions,template.parts);
    };
    m.onDamageDestroyed=(entity,hit)=>{
      if(config.units[entity.kind]||!hit)return;
      const template=getTemplate(entity);if(!template)return;
      const point=hit.restPoint??hit.point;
      const candidates=template.regions.filter(r=>template.parts[r.id]?.detachable&&!entity.damage.parts[r.id]?.detached);
      const distance=r=>Math.hypot(...point.map((v,k)=>v-Math.max(r.min[k],Math.min(r.max[k],v))));
      candidates.sort((a,b)=>distance(a)-distance(b));
      for(const r of candidates.slice(0,3))entity.damage.parts[r.id]={damage:1,detached:true};
      if(candidates.length)entity.damage.revision++;
    };
  }
  function attachBuilding(root,entity){
    root.updateMatrixWorld(true);
    const bindings=[],hooks=[],template=getTemplate(entity),prepared=new Map(template?.bindings.map(b=>[b.node.geometry,b])??[]);
    // Bind in prefab-local coordinates, before its world pose is applied.
    // All copies of a prefab share its prepared attributes and collider. Only
    // material uniforms belong to an individual building.
    root.traverse(node=>{if(node.isMesh){const b=prepared.get(node.geometry)??prepare(node,'building',0);node.geometry=b.geometry;bindings.push(b);hooks.push(attach(node,b));}});
    root.userData.damageBinding={bindings,hooks};return root.userData.damageBinding;
  }
  function updateBuilding(root,entity){
    const binding=root.userData.damageBinding;if(!binding)return;
    root.updateMatrix();const rep=representation(entity,root.matrix,Math.max(entity.halfWidth,entity.halfDepth,30));
    for(const hook of binding.hooks)hook.objectDamage.value.set(rep.row,rep.lod);
  }
  function releaseBuilding(root){for(const hook of root.userData.damageBinding?.hooks??[])hook.dispose();delete root.userData.damageBinding;}
  return {atlas,prepare,trackGeometry,attach,registerVehicle,attachBuilding,updateBuilding,releaseBuilding,bindMission,begin,end,representation,trace,resolveContact,matrixFor,
    setTemplateProvider(fn){templateProvider=fn;},getTemplate,
    set enabled(value){enabled.value=Number(value);},get enabled(){return !!enabled.value;},
    reset(){for(const id of [...records.keys()])release(id);debris.reset();salvage.reset();},
    resetMetrics(){for(const k of Object.keys(stats))stats[k]=0;},
    get statistics(){return {...stats,activePhysics:debris.active,debris:debris.count,recoverableParts:salvage.count,activePhysicsLimit:debris.activeLimit,atlasBytes:data.byteLength,residentRows:[...records.values()].filter(r=>r.row).length};},
    get records(){return records;},debris};
}
