import {createMuzzleFlash} from '../demo/vehicle-effects.js';
import {createFlameEffects} from './flame-effects.js';

export function createCombatEffects(T,scene,scale,sound) {
  const limit=128,impactLimit=32,source=new T.Vector3(),target=new T.Vector3();
  const shots=[],impacts=[],matrix=new T.Object3D(),forward=new T.Vector3(0,1,0);
  const tracer=new T.InstancedMesh(new T.CylinderGeometry(.27,.5,1,5),new T.MeshBasicMaterial({
    color:'#ffe39a',transparent:true,opacity:.91,depthWrite:false,toneMapped:false,blending:T.AdditiveBlending
  }),limit);
  tracer.name='short_tracer';
  const original=createMuzzleFlash(T);
  const flashes=new T.InstancedMesh(original.geometry,original.material,limit);
  flashes.name='field_muzzle_flash';
  for(const mesh of [tracer,flashes]){
    mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);scene.add(mesh);
  }
  const flareLight=new T.PointLight('#ffc46a',0,5*scale);
  scene.add(flareLight);

  const sparkGeometry=new T.BufferGeometry();
  const sparks=new T.Float32BufferAttribute(new Float32Array(impactLimit*8*3),3).setUsage(T.DynamicDrawUsage);
  const shades=new T.Float32BufferAttribute(new Float32Array(impactLimit*8*3),3).setUsage(T.DynamicDrawUsage);
  sparkGeometry.setAttribute('position',sparks);sparkGeometry.setAttribute('color',shades);sparkGeometry.setDrawRange(0,0);
  const sparkMesh=new T.Points(sparkGeometry,new T.PointsMaterial({size:.31*scale,vertexColors:true,transparent:true,opacity:.85,depthWrite:false}));
  sparkMesh.name='field_impact_particles';sparkMesh.frustumCulled=false;scene.add(sparkMesh);
  const flame=createFlameEffects(T,scene,scale);
  const shade=new T.Color();

  function spatial(position,camera) {
    const relative=source.copy(position).sub(camera.position),right=target.setFromMatrixColumn(camera.matrixWorld,0);
    return {gain:Math.max(0,1-relative.length()/1050),pan:T.MathUtils.clamp(relative.dot(right)/370,-.8,.8)};
  }
  function hit(end,details,now,camera) {
    impacts.push({end,born:now,weapon:details.weapon,surface:details.surface,destroyed:details.destroyed});
    if(impacts.length>impactLimit)impacts.shift();
    if(details.weapon==='flame'||details.destroyed)flame.scorch(end,now,details.destroyed);
    const {gain,pan}=spatial(end,camera);
    sound?.impact(gain,pan,details.destroyed?'debris':details.weapon==='flame'?'flame':details.surface);
  }

  return {
    spawn(start,end,weapon,now,camera,{targetId,surface='armor',destroyed=false}={}) {
      const direction=end.clone().sub(start),length=direction.length();
      if(length<.001)return;
      direction.multiplyScalar(1/length);
      const flight=weapon==='flame'?T.MathUtils.clamp(length/(27*scale),.14,.50):
        T.MathUtils.clamp(length/(105*scale),.055,.26);
      shots.push({start,end,direction,length,flight,weapon,born:now,targetId,surface,destroyed});
      if(weapon==='flame')flame.spawn(start,end,now,flight);
      if(shots.length>limit)shots.shift();
      const {gain,pan}=spatial(start,camera);
      sound?.shot(weapon,gain,pan);
    },
    hit,
    reset(){shots.length=impacts.length=0;flame.reset();},
    update(now,camera,viewportHeight,resolveImpact) {
      let tracerCount=0,flashCount=0,lightDistance=Infinity;
      flareLight.intensity=0;
      for(let i=shots.length-1;i>=0;i--){
        const shot=shots[i],age=now-shot.born,fire=shot.weapon==='flame';
        if(age>=shot.flight){
          hit(resolveImpact?.(shot)??shot.end,shot,now,camera);
          shots.splice(i,1);
          continue;
        }
        if(age<.105&&!fire){
          matrix.position.copy(shot.start).addScaledVector(shot.direction,.10*scale);
          matrix.quaternion.setFromUnitVectors(forward,shot.direction);
          matrix.scale.set(.92*scale,2.4*scale,.92*scale);
          matrix.updateMatrix();flashes.setMatrixAt(flashCount++,matrix.matrix);
          const distance=camera.position.distanceToSquared(shot.start);
          if(distance<lightDistance){lightDistance=distance;flareLight.position.copy(shot.start);flareLight.intensity=22*scale**2;}
        }
        if(!fire){
          const length=Math.min(shot.length,1.48*scale);
          const head=Math.max(length*.62,shot.length*age/shot.flight),tail=Math.max(0,head-length);
          const width=Math.max(.073*scale,camera.position.distanceTo(shot.start)*.00155);
          matrix.position.copy(shot.start).addScaledVector(shot.direction,(head+tail)*.5);
          matrix.quaternion.setFromUnitVectors(forward,shot.direction);
          matrix.scale.set(width,head-tail,width);
          matrix.updateMatrix();tracer.setMatrixAt(tracerCount++,matrix.matrix);
        }
      }
      let sparkCount=0;
      for(let i=impacts.length-1;i>=0;i--){
        const {end,born,surface,weapon,destroyed}=impacts[i],age=now-born;
        const duration=destroyed?.72:weapon==='flame'?.49:.43;
        if(age>duration){impacts.splice(i,1);continue;}
        const fire=weapon==='flame';
        shade.set(fire?'#df6935':surface==='structure'?'#c8a277':'#f6bb6e').multiplyScalar(1-.78*age/duration);
        for(let j=0;j<8;j++){
          const angle=j*2.399,radius=age*(destroyed?17+j:7+j*.75);
          sparks.setXYZ(sparkCount,end.x+Math.cos(angle)*radius,end.y+Math.sin(angle)*radius,end.z+age*(3+j*.9)-age*age*7);
          shades.setXYZ(sparkCount++,shade.r,shade.g,shade.b);
        }
      }
      tracer.count=tracerCount;if(tracerCount)tracer.instanceMatrix.needsUpdate=true;
      flashes.count=flashCount;if(flashCount)flashes.instanceMatrix.needsUpdate=true;
      flame.update(now,viewportHeight);
      sparkGeometry.setDrawRange(0,sparkCount);
      if(sparkCount)sparks.needsUpdate=shades.needsUpdate=true;
    },
    get statistics(){return {shots:shots.length,shotLimit:limit,tracers:tracer.count,impacts:impacts.length,...flame.statistics};},
  };
}
