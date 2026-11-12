// Ground-conforming warning arcs share one bounded draw call. They mark the
// attacked friendly position, never the unseen attacker or its direction.
export function createAttackPulses(T,scene,field,transforms){
 const capacity=16,segments=32,vertices=capacity*segments*6;
 const positions=new Float32Array(vertices*3),tints=new Float32Array(vertices*4),geometry=new T.BufferGeometry();
 geometry.setAttribute('position',new T.BufferAttribute(positions,3).setUsage(T.DynamicDrawUsage));
 geometry.setAttribute('tint',new T.BufferAttribute(tints,4).setUsage(T.DynamicDrawUsage));geometry.setDrawRange(0,0);
 const material=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,
  vertexShader:'attribute vec4 tint; varying vec4 vTint; void main(){vTint=tint;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader:'varying vec4 vTint; void main(){gl_FragColor=vTint;}'});
 const mesh=new T.Mesh(geometry,material);mesh.name='friendly_attack_pulses';mesh.frustumCulled=false;mesh.visible=false;scene.add(mesh);
 const projected=new T.Vector3();let pings=[],count=0;
 function update(mission,camera,now,height){
  count=0;let cursor=0;
  const vertex=(x,y,alpha)=>{
   positions.set([x,y,field.heightAt(x,y)+1.2],cursor*3);tints.set([1,.28,.12,alpha],cursor*4);cursor++;
  };
  for(const p of pings){
   if(p.kind!=='attack'||now>=p.until||count>=capacity)continue;
   const entity=mission.entity(p.target);if(entity?.factoryVisit?.phase==='inside')continue;
   const pose=transforms.get(p.target)?.position,x=pose?.x??p.x,y=pose?.y??p.y,z=field.heightAt(x,y);
   projected.set(x,y,z);const unitsPerPixel=2*camera.position.distanceTo(projected)*Math.tan(camera.fov*Math.PI/360)/Math.max(1,height);
   projected.project(camera);if(projected.z<-1||projected.z>1||Math.abs(projected.x)>1.2||Math.abs(projected.y)>1.2)continue;
   const wave=(1-Math.cos((now-p.born)/1000*Math.PI*2))/2;
   const base=entity?.halfWidth?Math.hypot(entity.halfWidth,entity.halfDepth)+5:14;
   const radius=Math.max(base,6*unitsPerPixel)*(1+wave*.25),width=Math.max(1.4,1.8*unitsPerPixel),alpha=(.55+.4*wave)*Math.min(1,(p.until-now)/400);
   for(let i=0;i<segments;i++){
    if(i%8>=6)continue;
    const a=i/segments*Math.PI*2,b=(i+1)/segments*Math.PI*2,outer=radius+width;
    const ax=x+Math.cos(a)*radius,ay=y+Math.sin(a)*radius,bx=x+Math.cos(b)*radius,by=y+Math.sin(b)*radius;
    const cx=x+Math.cos(a)*outer,cy=y+Math.sin(a)*outer,dx=x+Math.cos(b)*outer,dy=y+Math.sin(b)*outer;
    vertex(ax,ay,alpha);vertex(bx,by,alpha);vertex(cx,cy,alpha);vertex(cx,cy,alpha);vertex(bx,by,alpha);vertex(dx,dy,alpha);
   }
   count++;
  }
  geometry.setDrawRange(0,cursor);mesh.visible=count>0;
  if(cursor){geometry.attributes.position.needsUpdate=true;geometry.attributes.tint.needsUpdate=true;}
 }
 return {set(value){pings=value;},update,get count(){return count;}};
}
