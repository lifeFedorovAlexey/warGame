import {createMuzzleFlash} from '../demo/vehicle-effects.js';
import {createFlameEffects} from './flame-effects.js';
import {mgRoundCount,mgRoundSpacing,mgFlashDuration} from './mg-burst.js';

export function createCombatEffects(T,scene,scale,sound) {
  const limit=128,impactLimit=32,source=new T.Vector3(),target=new T.Vector3();
  const roundLimit=limit*mgRoundCount;
  const shots=[],impacts=[],matrix=new T.Object3D(),forward=new T.Vector3(0,1,0);
  const tracer=new T.InstancedMesh(new T.CylinderGeometry(.27,.5,1,5),new T.MeshBasicMaterial({
    color:'#ffe39a',transparent:true,opacity:.91,depthWrite:false,toneMapped:false,blending:T.AdditiveBlending
  }),roundLimit);
  tracer.name='short_tracer';
  const original=createMuzzleFlash(T);
  const flashes=new T.InstancedMesh(original.geometry,original.material,roundLimit);
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
  const grenades=new T.InstancedMesh(new T.IcosahedronGeometry(.095*scale,1),new T.MeshStandardMaterial({color:'#605c3c',roughness:.95}),limit);
  grenades.name='thrown_grenades';grenades.frustumCulled=false;grenades.count=0;grenades.instanceMatrix.setUsage(T.DynamicDrawUsage);scene.add(grenades);
  const shade=new T.Color();

  function spatial(position,camera) {
    const relative=source.copy(position).sub(camera.position),right=target.setFromMatrixColumn(camera.matrixWorld,0);
    return {gain:Math.max(0,1-relative.length()/1050),pan:T.MathUtils.clamp(relative.dot(right)/370,-.8,.8)};
  }
  function hit(end,details,now,camera,audible=true) {
    if(details.surface==='infantry'&&details.weapon!=='flame'){
      if(audible)flame.dustImpact(end,now);
      return;
    }
    const destroyed=audible&&details.destroyed;
    impacts.push({end,born:now,weapon:details.weapon,surface:details.surface,destroyed});
    if(impacts.length>impactLimit)impacts.shift();
    if(!audible)return;
    if(details.weapon==='flame'||destroyed)flame.scorch(end,now,destroyed);
    const {gain,pan}=spatial(end,camera);
    sound?.impact(gain,pan,details.destroyed?'debris':details.weapon==='flame'?'flame':details.surface);
  }

  function roundFrom(start,end,weapon) {
    const direction=end.clone().sub(start),length=direction.length();
    if(length<.001)return null;
    direction.multiplyScalar(1/length);
    const flight=weapon==='flame'?T.MathUtils.clamp(length/(27*scale),.14,.50):
      T.MathUtils.clamp(length/(105*scale),.055,.26);
    return {start,end,direction,length,flight};
  }

  return {
    spawn(start,end,weapon,now,camera,{from,targetId,surface='armor',destroyed=false}={}) {
      if(weapon==='grenade')return;
      const round=roundFrom(start,end,weapon);
      if(!round)return;
      shots.push({from,start,end,weapon,born:now,targetId,surface,destroyed,rounds:[round]});
      if(weapon==='flame')flame.spawn(start,end,now,round.flight);
      if(shots.length>limit)shots.shift();
      const {gain,pan}=spatial(start,camera);
      sound?.shot(weapon,gain,pan);
    },
    hit,
    explode(point,radius,now,camera){flame.blast(point,now,radius);const {gain,pan}=spatial(point,camera);sound?.impact(gain,pan,'debris');},
    reset(){shots.length=impacts.length=0;grenades.count=0;flame.reset();},
    updateGrenades(projectiles,time,visible){
      let count=0;
      for(const shot of projectiles){
        if(count>=limit)break;
        const t=T.MathUtils.clamp((time-shot.born)/(shot.impactAt-shot.born),0,1);
        const x=T.MathUtils.lerp(shot.from.x,shot.to.x,t),y=T.MathUtils.lerp(shot.from.y,shot.to.y,t);
        if(!visible(x,y))continue;
        matrix.position.set(x,y,T.MathUtils.lerp(shot.from.z,shot.to.z,t)+Math.sin(t*Math.PI)*3.6*scale);
        matrix.rotation.set(t*9,t*6,0);matrix.scale.setScalar(1);matrix.updateMatrix();grenades.setMatrixAt(count++,matrix.matrix);
      }
      grenades.count=count;if(count)grenades.instanceMatrix.needsUpdate=true;
    },
    update(now,camera,viewportHeight,resolveImpact,resolveMuzzle) {
      let tracerCount=0,flashCount=0,lightDistance=Infinity;
      flareLight.intensity=0;
      for(let i=shots.length-1;i>=0;i--){
        const shot=shots[i],age=now-shot.born,fire=shot.weapon==='flame';
        const burst=shot.weapon==='mg',roundCount=burst?mgRoundCount:1;
        const liveMuzzle=burst?resolveMuzzle?.(shot.from):null;
        let finished=true;
        for(let j=0;j<roundCount;j++){
          const elapsed=age-j*mgRoundSpacing;
          if(elapsed< -1e-9){finished=false;break;}
          if(shot.rounds[j]===undefined){
            if(liveMuzzle===null)shot.rounds[j]=null;
            else{
              const start=liveMuzzle?.clone()??shot.start;
              shot.rounds[j]=roundFrom(start,resolveImpact?.(shot,start)??shot.end,shot.weapon);
            }
          }
          const round=shot.rounds[j],pulseAge=Math.max(0,elapsed);
          if(!round)continue;
          if(pulseAge>=round.flight&&!round.impact){
            round.impact=true;
            const end=j===0?resolveImpact?.(shot)??round.end:round.end;
            hit(end,shot,now,camera,j===0);
          }
          const flashTime=burst?mgFlashDuration:Math.min(.105,round.flight);
          if(!fire&&(!burst||liveMuzzle!==null)&&pulseAge<flashTime){
            const muzzle=liveMuzzle??round.start,fade=1-pulseAge/flashTime;
            matrix.position.copy(muzzle).addScaledVector(round.direction,.10*scale);
            matrix.quaternion.setFromUnitVectors(forward,round.direction);
            const radius=burst?(.74+.68*fade):.28;
            const length=burst?(1.75+2.55*fade):.72;
            matrix.scale.set(radius*scale,length*scale,radius*scale);
            matrix.updateMatrix();flashes.setMatrixAt(flashCount++,matrix.matrix);
            const distance=camera.position.distanceToSquared(muzzle);
            if(distance<lightDistance){lightDistance=distance;flareLight.position.copy(muzzle);flareLight.intensity=(burst?8+18*fade:6)*scale**2;}
            finished=false;
          }
          if(pulseAge>=round.flight)continue;
          finished=false;
          if(fire)continue;
          const length=Math.min(round.length*(burst?.55:1),(burst?2.5:1.48)*scale);
          const head=Math.max(length*.62,round.length*pulseAge/round.flight),tail=Math.max(0,head-length);
          const width=Math.max(.073*scale,camera.position.distanceTo(round.start)*.00155);
          matrix.position.copy(round.start).addScaledVector(round.direction,(head+tail)*.5);
          matrix.quaternion.setFromUnitVectors(forward,round.direction);
          matrix.scale.set(width,head-tail,width);
          matrix.updateMatrix();tracer.setMatrixAt(tracerCount++,matrix.matrix);
        }
        if(finished)shots.splice(i,1);
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
    get statistics(){return {shots:shots.length,shotLimit:limit,tracers:tracer.count,grenades:grenades.count,impacts:impacts.length,...flame.statistics};},
  };
}
