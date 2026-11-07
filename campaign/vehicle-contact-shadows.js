import {SCAV_PROFILES,isInfantry} from './scav-unit-profiles.js';
// Small ambient contact patches complement the coarse sun shadow map. They
// follow the terrain and actual wheel locations, never move the vehicle mesh.
export function createVehicleContactShadows(T,scene,field,scale){
 const geometry=new T.PlaneGeometry(1,1),material=new T.ShaderMaterial({
  transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,
  vertexShader:'varying vec2 contactUV;void main(){contactUV=uv*2.-1.;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',
  fragmentShader:'varying vec2 contactUV;void main(){float r=dot(contactUV,contactUV);float a=(1.-smoothstep(.02,1.,r))*.34;if(a<.003)discard;gl_FragColor=vec4(.075,.055,.035,a);}',
 });
 let capacity=256,mesh=new T.InstancedMesh(geometry,material,capacity);
 mesh.name='vehicle_tyre_contacts';mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);mesh.count=0;scene.add(mesh);
 const dummy=new T.Object3D(),basis=new T.Matrix4(),normal=new T.Vector3(),forward=new T.Vector3(),right=new T.Vector3();
 function update(units,camera){
  let index=0,dirty=false;
  for(const unit of units){
   if((unit.x-camera.position.x)**2+(unit.y-camera.position.y)**2+(unit.z-camera.position.z)**2>720**2)continue;
   const c=Math.cos(unit.heading),s=Math.sin(unit.heading),custom=unit.kind==='raider'||unit.kind==='command',profile=SCAV_PROFILES[unit.kind],width=profile?.track??(custom?.79:.7),front=profile?.front??(custom?1.21:1.3),rear=profile?.rear??(custom?-1.29:-1.3);
   const fallen=isInfantry(unit)&&unit.damage?.wreck;
   const points=isInfantry(unit)?[[0,0,fallen?-.82:0]]:[[1,-width,front],[2,width,front],[3,-width,rear],[4,width,rear]];
   for(const [part,x,y] of points){
    if(unit.damage?.parts?.[part]?.detached)continue;
    if(index>=capacity){capacity*=2;const grown=new T.InstancedBufferAttribute(new Float32Array(capacity*16),16).setUsage(T.DynamicDrawUsage);grown.array.set(mesh.instanceMatrix.array);mesh.dispose();mesh.instanceMatrix=grown;dirty=true;}
    const wx=unit.x+(x*c-y*s)*scale,wy=unit.y+(x*s+y*c)*scale,g=field.gradientAt(wx,wy);
    normal.set(-g.x,-g.y,1).normalize();forward.set(-s,c,0).projectOnPlane(normal).normalize();right.crossVectors(forward,normal).normalize();
    dummy.position.set(wx,wy,field.heightAt(wx,wy)+.045);dummy.quaternion.setFromRotationMatrix(basis.makeBasis(right,forward,normal));dummy.scale.set((fallen?.85:.57)*scale,(fallen?1.95:.64)*scale,1);dummy.updateMatrix();
    const a=mesh.instanceMatrix.array,e=dummy.matrix.elements;let changed=false;for(let k=0;k<16;k++)if(a[index*16+k]!==Math.fround(e[k])){changed=true;break;}
    if(changed){mesh.setMatrixAt(index,dummy.matrix);dirty=true;}index++;
   }
  }
  mesh.count=index;mesh.visible=index>0;if(dirty)mesh.instanceMatrix.needsUpdate=true;
 }
 return {update,mesh};
}
