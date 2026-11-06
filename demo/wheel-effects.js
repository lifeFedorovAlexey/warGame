// Two bounded, instanced batches: tire imprints and camera-facing dust.
export function createWheelEffects(T,scene,heightAt){
 const root=new T.Group();root.name='wheel_effects';scene.add(root);
 const trackLimit=384,dustLimit=64,trackLife=18,dustLife=1.7;
 function texture(draw){const c=document.createElement('canvas');c.width=c.height=128;draw(c.getContext('2d'));const t=new T.CanvasTexture(c);return t;}
 const tireTexture=texture(c=>{c.fillStyle='rgba(255,255,255,.2)';c.fillRect(14,0,100,128);c.fillStyle='#fff';for(let y=-12;y<145;y+=23){c.beginPath();c.moveTo(12,y);c.lineTo(60,y+12);c.lineTo(60,y+23);c.lineTo(12,y+11);c.fill();c.beginPath();c.moveTo(116,y);c.lineTo(68,y+12);c.lineTo(68,y+23);c.lineTo(116,y+11);c.fill();}});
 const dustTexture=texture(c=>{const g=c.createRadialGradient(64,64,2,64,64,63);g.addColorStop(0,'rgba(255,255,255,.6)');g.addColorStop(.45,'rgba(255,255,255,.32)');g.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=g;c.fillRect(0,0,128,128);});
 function batch(count,map,color){
  const geometry=new T.PlaneGeometry(1,1),alpha=new T.InstancedBufferAttribute(new Float32Array(count),1);alpha.setUsage(T.DynamicDrawUsage);geometry.setAttribute('effectAlpha',alpha);
  const material=new T.ShaderMaterial({transparent:true,depthWrite:false,forceSinglePass:true,uniforms:{map:{value:map},tint:{value:new T.Color(color)}},vertexShader:'attribute float effectAlpha; varying vec2 vUv; varying float vAlpha; void main(){vUv=uv; vAlpha=effectAlpha; gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);}',fragmentShader:'uniform sampler2D map; uniform vec3 tint; varying vec2 vUv; varying float vAlpha; void main(){float a=texture2D(map,vUv).a*vAlpha; if(a<0.005) discard; gl_FragColor=vec4(tint,a);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'});
  const mesh=new T.InstancedMesh(geometry,material,count);mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);mesh.frustumCulled=false;root.add(mesh);
  const hidden=new T.Matrix4().makeScale(0,0,0);for(let i=0;i<count;i++)mesh.setMatrixAt(i,hidden);
  return {mesh,alpha};
 }
 const tracks=batch(trackLimit,tireTexture,'#332a20'),dust=batch(dustLimit,dustTexture,'#a09d91');
 const imprints=Array.from({length:trackLimit},()=>({age:trackLife})),particles=Array.from({length:dustLimit},()=>({age:dustLife,pos:new T.Vector3(),velocity:new T.Vector3(),size:0,angle:0}));
 const previous=[],dummy=new T.Object3D(),matrix=new T.Matrix4(),normal=new T.Vector3(),right=new T.Vector3(),forward=new T.Vector3();let ti=0,di=0,emission=0,seed=4271;
 const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
 function stamp(p,heading,scale){const i=ti++%trackLimit;imprints[i].age=0;const e=.13,dx=(heightAt(p.x+e,p.y)-heightAt(p.x-e,p.y))/(2*e),dy=(heightAt(p.x,p.y+e)-heightAt(p.x,p.y-e))/(2*e);normal.set(-dx,-dy,1).normalize();forward.set(-Math.sin(heading),Math.cos(heading),0).projectOnPlane(normal).normalize();right.crossVectors(forward,normal).normalize();dummy.position.set(p.x,p.y,heightAt(p.x,p.y)+.052);dummy.quaternion.setFromRotationMatrix(matrix.makeBasis(right,forward,normal));dummy.scale.set(.28*scale,.34*scale,1);dummy.updateMatrix();tracks.mesh.setMatrixAt(i,dummy.matrix);}
 function clear(){for(const t of imprints)t.age=trackLife;for(const p of particles)p.age=dustLife;previous.length=0;emission=0;ti=di=0;tracks.mesh.count=dust.mesh.count=0;tracks.alpha.array.fill(0);dust.alpha.array.fill(0);tracks.alpha.needsUpdate=dust.alpha.needsUpdate=true;}
 function update(dt,{driving,speed,slip,grade,heading,contacts,camera,night,lowCost,scale=1}){
  root.visible=driving;
  if(driving&&speed>.08){
   for(let i=0;i<contacts.length;i++){const p=contacts[i];if(!previous[i]||previous[i].distanceTo(p)>.29*scale){stamp(p,heading,scale);if(!previous[i])previous[i]=p.clone();else previous[i].copy(p);}}
   emission+=dt*Math.min(lowCost?12:24,speed*(4+slip*30+Math.max(0,grade)*4));
   while(emission>=1){emission--;const p=particles[di++%dustLimit],contact=contacts[di%contacts.length];p.age=0;p.pos.copy(contact);p.pos.z=heightAt(contact.x,contact.y)+.13*scale;p.velocity.set(Math.sin(heading)*speed*.16+(random()-.5)*.25,-Math.cos(heading)*speed*.16+(random()-.5)*.25,.24+random()*.20);p.size=(.22+random()*.14)*scale;p.angle=random()*Math.PI*2;}
  }else previous.length=0;
  let trackCount=0,dustCount=0;
  for(let i=0;i<trackLimit;i++){const t=imprints[i];t.age=Math.min(trackLife,t.age+dt);if(t.age<trackLife)trackCount++;tracks.alpha.array[i]=.26*Math.min(1,(trackLife-t.age)/3);}
  for(let i=0;i<dustLimit;i++){const p=particles[i];p.age=Math.min(dustLife,p.age+dt);const t=p.age/dustLife;if(t<1){dustCount++;p.pos.addScaledVector(p.velocity,dt);dummy.position.copy(p.pos);dummy.quaternion.copy(camera.quaternion);dummy.rotateZ(p.angle);const s=p.size*(1+t*2.4);dummy.scale.set(s,s,1);dummy.updateMatrix();dust.mesh.setMatrixAt(i,dummy.matrix);}dust.alpha.array[i]=t<1?.22*Math.sin(Math.PI*t)*(night?.55:1):0;}
  tracks.alpha.needsUpdate=dust.alpha.needsUpdate=true;tracks.mesh.instanceMatrix.needsUpdate=dust.mesh.instanceMatrix.needsUpdate=true;
  tracks.mesh.count=Math.min(ti,trackLimit);dust.mesh.count=Math.min(di,dustLimit);tracks.mesh.visible=trackCount>0;dust.mesh.visible=dustCount>0;
  return {trackCount,dustCount,trackLimit,dustLimit,drawCalls:driving?Number(trackCount>0)+Number(dustCount>0):0};
 }
 return {update,clear};
}
