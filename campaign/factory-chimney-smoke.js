import {factoryBoardState} from './factory-status-board.js';
import {partMissing} from './damage-state.js';

export function factoryChimneyLoad(m,f){
 if(f.hp<=0||!f.completed)return 0;
 const status=factoryBoardState(m,f),working=status.active==='repair'
  ||status.active==='production'&&(f.queue[0]?.progress??0)<1;
 // A backlog amplifies a running furnace. An unfunded or blocked queue alone
 // must not look like production; only a little residual heat remains idle.
 return working ? .22+.73*(1-Math.exp(-(status.repairs+status.orders)/5)) : .035;
}

export function createFactoryChimneySmoke(T,scene,scale,smokeMap){
 const perFactory=12,limit=64*perFactory,states=new Map(),anchors=new WeakMap();
 const geometry=new T.PlaneGeometry(1,1),alpha=new T.InstancedBufferAttribute(new Float32Array(limit),1).setUsage(T.DynamicDrawUsage);
 geometry.setAttribute('smokeAlpha',alpha);
 const material=new T.ShaderMaterial({transparent:true,depthWrite:false,
  uniforms:{smokeMap:{value:smokeMap},tint:{value:new T.Color('#686257')}},
  vertexShader:'attribute float smokeAlpha;varying float vAlpha;varying vec2 vUv;void main(){vUv=uv;vAlpha=smokeAlpha;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',
  fragmentShader:'uniform sampler2D smokeMap;uniform vec3 tint;varying float vAlpha;varying vec2 vUv;void main(){float a=texture2D(smokeMap,vUv).a*vAlpha;if(a<.002)discard;gl_FragColor=vec4(tint,a);\n#include <colorspace_fragment>\n}',
 });
 const mesh=new T.InstancedMesh(geometry,material,limit);mesh.name='factory_chimney_smoke';mesh.frustumCulled=false;mesh.count=0;
 mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);scene.add(mesh);
 const pose=new T.Object3D(),origin=new T.Vector3();let previousState,lastTime;
 function anchor(model){
  let a=anchors.get(model);if(a)return a;
  const [w,d,h]=model.userData.dimensionsMetres??[26,20,9];
  const part=Object.entries(model.userData.damageParts??{}).find(([,p])=>p.name.startsWith('stack_'))?.[0];
  a={part,point:new T.Vector3(w*.287,d*.303,h-.08)};anchors.set(model,a);return a;
 }
 return {
  update(m,models,time,camera){
   if(previousState!==m.state||time<lastTime){states.clear();previousState=m.state;lastTime=time;}
   const elapsed=Math.max(0,time-(lastTime??time));lastTime=time;
   const candidates=[];
   for(const f of m.state.buildings){
    if(f.kind!=='factory'||f.hp<=0||!f.completed||f.owner!=='rai'&&!m.visibleAt(f.x,f.y))continue;
    const model=models.get(f.id);if(!model?.visible)continue;
    const chimney=anchor(model);if(chimney.part!==undefined&&partMissing(f.damage,chimney.part))continue;
    candidates.push({f,model,chimney,distance:camera?model.position.distanceToSquared(camera.position):0});
   }
   candidates.sort((a,b)=>a.distance-b.distance||a.f.id.localeCompare(b.f.id));
   const live=new Set(),loads=[];let count=0;
   // All chimneys share one draw call and a bounded pool. The nearest visible
   // factories retain smoke even on unusually large construction maps.
   for(const {f,model,chimney} of candidates.slice(0,limit/perFactory)){
    live.add(f.id);const target=factoryChimneyLoad(m,f);let state=states.get(f.id);
    if(!state){const seed=[...f.id].reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,0);state={level:target,phase:(seed%997)/997};states.set(f.id,state);}
    state.level+=(target-state.level)*(1-Math.exp(-elapsed/1.2));
    state.phase=(state.phase+elapsed*(.13+state.level*.10))%1;
    model.updateWorldMatrix(true,false);origin.copy(chimney.point).applyMatrix4(model.matrixWorld);
    const intensity=state.level;let maxOpacity=0;
    for(let i=0;i<perFactory;i++){
     const age=(state.phase+i/perFactory)%1,drift=age*age*(1.4+intensity*3.4)*scale;
     pose.position.set(origin.x+drift+Math.sin(i*2.4+time*.3)*age*.25*scale,
      origin.y+drift*.38,origin.z+(.08+age*(4+intensity*10))*scale);
     if(camera)pose.quaternion.copy(camera.quaternion);else pose.quaternion.identity();pose.rotateZ(i*2.399);
     const size=(.65+age*(1.6+intensity*2.5))*scale;pose.scale.set(size,size,1);pose.updateMatrix();mesh.setMatrixAt(count,pose.matrix);
     const opacity=Math.sin(age*Math.PI)**.8*intensity*(.16+intensity*.6);
     maxOpacity=Math.max(maxOpacity,opacity);alpha.setX(count++,opacity);
    }
    loads.push({id:f.id,target,intensity,maxOpacity,origin:origin.toArray(),particles:perFactory});
   }
   for(const id of states.keys())if(!live.has(id))states.delete(id);
   mesh.count=count;mesh.visible=count>0;mesh.userData.loads=loads;
   if(count){mesh.instanceMatrix.needsUpdate=true;alpha.needsUpdate=true;}
  },
  preloadMaterials(parent){parent.add(new T.InstancedMesh(geometry,material,1));},
 };
}
