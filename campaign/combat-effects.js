import {createMuzzleFlash} from '../demo/vehicle-effects.js';
import {createFlameEffects} from './flame-effects.js';

export function createCombatEffects(T,scene,scale,sound) {
  const limit=128, impactLimit=32, source=new T.Vector3(), target=new T.Vector3();
  const shots=[],impacts=[],matrix=new T.Object3D(),forward=new T.Vector3(0,1,0);
  const beam=new T.BufferGeometry(),vertices=new T.Float32BufferAttribute(new Float32Array(limit*6),3).setUsage(T.DynamicDrawUsage);
  beam.setAttribute('position',vertices);
  beam.setDrawRange(0,0);
  const tracer=new T.LineSegments(beam,new T.LineBasicMaterial({color:'#ffe48e',transparent:true,opacity:.95}));
  tracer.name='short_tracer';tracer.frustumCulled=false;scene.add(tracer);
  const original=createMuzzleFlash(T);
  const flashes=new T.InstancedMesh(original.geometry,original.material,limit);
  flashes.count=0;flashes.frustumCulled=false;flashes.instanceMatrix.setUsage(T.DynamicDrawUsage);scene.add(flashes);
  const flareLight=new T.PointLight('#ffc46a',0,5*scale);
  scene.add(flareLight);

  const sparkGeometry=new T.BufferGeometry();
  const sparks=new T.Float32BufferAttribute(new Float32Array(impactLimit*8*3),3).setUsage(T.DynamicDrawUsage);
  sparkGeometry.setAttribute('position',sparks);sparkGeometry.setDrawRange(0,0);
  const sparkMesh=new T.Points(sparkGeometry,new T.PointsMaterial({color:'#f6ba65',size:.22*scale,transparent:true,opacity:.82,depthWrite:false}));
  sparkMesh.frustumCulled=false;scene.add(sparkMesh);
  const flame=createFlameEffects(T,scene,scale);

  function spatial(position,camera) {
    const relative=source.copy(position).sub(camera.position),right=target.setFromMatrixColumn(camera.matrixWorld,0);
    return {gain:Math.max(0,1-relative.length()/900),pan:T.MathUtils.clamp(relative.dot(right)/320,-.8,.8)};
  }
  return {
    spawn(start,end,weapon,now,camera) {
      const direction=end.clone().sub(start),length=direction.length();
      if(length<.001)return;
      direction.multiplyScalar(1/length);
      shots.push({start,end,direction,length,weapon,born:now});
      if(weapon==='flame')flame.spawn(start,end,now);
      if(shots.length>limit)shots.shift();
      const {gain,pan}=spatial(start,camera);
      sound?.shot(weapon,gain,pan);
    },
    reset(){shots.length=impacts.length=0;flame.reset();},
    update(now,camera,viewportHeight) {
      let lines=0,flashCount=0,lightDistance=Infinity;
      flareLight.intensity=0;
      for(let i=shots.length-1;i>=0;i--){
        const shot=shots[i],age=now-shot.born,fire=shot.weapon==='flame';
        const speed=(fire?33:65)*scale,travel=age*speed;
        if(travel>shot.length){
          impacts.push({end:shot.end,born:now});
          if(impacts.length>impactLimit)impacts.shift();
          shots.splice(i,1);
          const {gain,pan}=spatial(shot.end,camera);
          sound?.impact(gain,pan);
          continue;
        }
        if(age<.065&&!fire){
          matrix.position.copy(shot.start).addScaledVector(shot.direction,.10*scale);
          matrix.quaternion.setFromUnitVectors(forward,shot.direction);
          matrix.scale.set(.8*scale,2.4*scale,.8*scale);
          matrix.updateMatrix();flashes.setMatrixAt(flashCount++,matrix.matrix);
          const distance=camera.position.distanceToSquared(shot.start);
          if(distance<lightDistance){lightDistance=distance;flareLight.position.copy(shot.start);flareLight.intensity=22*scale**2;}
        }
        if(!fire){
          const head=Math.max(.8*scale,travel),tail=Math.max(0,head-.8*scale);
          source.copy(shot.start).addScaledVector(shot.direction,tail);
          target.copy(shot.start).addScaledVector(shot.direction,head);
          vertices.setXYZ(lines++,source.x,source.y,source.z);
          vertices.setXYZ(lines++,target.x,target.y,target.z);
        }
      }
      let sparkCount=0;
      for(let i=impacts.length-1;i>=0;i--){
        const {end,born}=impacts[i],age=now-born;
        if(age>.24){impacts.splice(i,1);continue;}
        for(let j=0;j<8;j++){
          const angle=j*2.399,radius=age*(8+j*.45);
          sparks.setXYZ(sparkCount++,end.x+Math.cos(angle)*radius,end.y+Math.sin(angle)*radius,end.z+age*(4+j*.55)-age*age*9);
        }
      }
      beam.setDrawRange(0,lines);if(lines)vertices.needsUpdate=true;
      flashes.count=flashCount;if(flashCount)flashes.instanceMatrix.needsUpdate=true;
      flame.update(now,viewportHeight);
      sparkGeometry.setDrawRange(0,sparkCount);if(sparkCount)sparks.needsUpdate=true;
    },
    get statistics(){return {shots:shots.length,shotLimit:limit,impacts:impacts.length,...flame.statistics};},
  };
}
