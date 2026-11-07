import {SCAV_PROFILES,isInfantry} from './scav-unit-profiles.js';
function treadTexture(T) {
  const canvas = document.createElement('canvas');
  canvas.width = 48;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff26';
  ctx.fillRect(5,0,38,64);
  ctx.strokeStyle = '#ffffffb0';
  ctx.lineWidth = 4;
  for (let y=-8;y<70;y+=10) {
    ctx.beginPath();
    ctx.moveTo(6,y); ctx.lineTo(23,y+7); ctx.lineTo(42,y);
    ctx.stroke();
  }
  return new T.CanvasTexture(canvas);
}

export function createGroundEffects(T, scene, field, scale) {
  const trackLimit = 768, trackLife = 17, previous = new Map();
  const trackGeometry = new T.PlaneGeometry(.26*scale,.42*scale);
  const alpha = new T.InstancedBufferAttribute(new Float32Array(trackLimit),1).setUsage(T.DynamicDrawUsage);
  trackGeometry.setAttribute('markAlpha',alpha);
  const tracks = new T.InstancedMesh(trackGeometry,new T.ShaderMaterial({
    transparent:true,depthWrite:false,uniforms:{tread:{value:treadTexture(T)},tint:{value:new T.Color('#392b21')}},
    vertexShader:'attribute float markAlpha;varying float vAlpha;varying vec2 vUv;void main(){vUv=uv;vAlpha=markAlpha;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',
    fragmentShader:'uniform sampler2D tread;uniform vec3 tint;varying float vAlpha;varying vec2 vUv;void main(){float a=vAlpha*texture2D(tread,vUv).a;if(a<.007)discard;gl_FragColor=vec4(tint,a);\n#include <colorspace_fragment>\n}',
  }),trackLimit);
  tracks.name = 'tire_imprints';
  tracks.frustumCulled = false;
  tracks.instanceMatrix.setUsage(T.DynamicDrawUsage);
  tracks.count = 0;
  scene.add(tracks);
  const born = new Float32Array(trackLimit).fill(-Infinity), dummy = new T.Object3D(), basis = new T.Matrix4();
  const forward = new T.Vector3(), normal = new T.Vector3(), right = new T.Vector3();
  let cursor=0, clock=0, count=0;

  function stamp(x,y,heading) {
    const i=cursor++%trackLimit, g=field.gradientAt(x,y);
    normal.set(-g.x,-g.y,1).normalize();
    forward.set(-Math.sin(heading),Math.cos(heading),0).projectOnPlane(normal).normalize();
    right.crossVectors(forward,normal).normalize();
    dummy.position.set(x,y,field.heightAt(x,y)+.07);
    dummy.quaternion.setFromRotationMatrix(basis.makeBasis(right,forward,normal));
    dummy.updateMatrix();
    tracks.setMatrixAt(i,dummy.matrix);
    born[i]=clock;
  }

  return {
    reset(){previous.clear();born.fill(-Infinity);cursor=count=0;tracks.count=0;},
    update(dt, visible, cameraDistance) {
      clock+=dt;
      const before=cursor;
      const ids=new Set();
      if(cameraDistance<1100)for(const unit of visible){
        if(isInfantry(unit))continue;
        ids.add(unit.id);
        const old=previous.get(unit.id);
        if(!old){previous.set(unit.id,{x:unit.x,y:unit.y,heading:unit.heading});continue;}
        const length=Math.hypot(unit.x-old.x,unit.y-old.y),stride=.35*scale;
        if(length<stride)continue;
        if(length>95){previous.set(unit.id,{x:unit.x,y:unit.y,heading:unit.heading});continue;}
        const turn=Math.atan2(Math.sin(unit.heading-old.heading),Math.cos(unit.heading-old.heading));
        const stamps=Math.min(42,Math.floor(length/stride));
        for(let i=1;i<=stamps;i++){
          const t=i*stride/length,h=old.heading+turn*t,c=Math.cos(h),s=Math.sin(h),x=old.x+(unit.x-old.x)*t,y=old.y+(unit.y-old.y)*t;
          const profile=SCAV_PROFILES[unit.kind],width=profile?.track??.73,rear=profile?.rear??-1.25;
          for(const side of [-1,1])stamp(x+(c*side*width-s*rear)*scale,y+(s*side*width+c*rear)*scale,h);
        }
        const used=stamps*stride/length;
        previous.set(unit.id,{x:old.x+(unit.x-old.x)*used,y:old.y+(unit.y-old.y)*used,heading:old.heading+turn*used});
      }
      for(const id of previous.keys())if(!ids.has(id))previous.delete(id);
      tracks.count=Math.min(cursor,trackLimit);
      if(cursor!==before)tracks.instanceMatrix.needsUpdate=true;
      count=0;
      for(let i=0;i<tracks.count;i++){
        const life=Math.max(0,Math.min(1,(trackLife-(clock-born[i]))/4));
        alpha.setX(i,life*.36);
        if(life>0)count++;
      }
      tracks.visible=count>0&&cameraDistance<1100;
      if(tracks.visible)alpha.needsUpdate=true;
    },
    get statistics(){return{tireMarks:count,tireLimit:trackLimit};},
  };
}
