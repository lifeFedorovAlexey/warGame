import * as T from '../demo/vendor/three.module.js';

export const clamp=x=>Math.max(0,Math.min(1,x));
export const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
export const random=i=>{const n=Math.sin(i*127.1+311.7)*43758.5453;return n-Math.floor(n);};

export function glowTexture() {
 const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
 const c=canvas.getContext('2d'),g=c.createRadialGradient(32,32,0,32,32,32);
 g.addColorStop(0,'rgba(255,251,226,1)');g.addColorStop(.12,'rgba(255,226,162,.92)');
 g.addColorStop(.35,'rgba(222,147,66,.27)');g.addColorStop(1,'rgba(166,101,49,0)');
 c.fillStyle=g;c.fillRect(0,0,64,64);return new T.CanvasTexture(canvas);
}

export function boxBatch(root,items,color,{emissive=0}={}) {
 const mat=new T.MeshStandardMaterial({color,roughness:.94,metalness:0,emissive:color,emissiveIntensity:emissive});
 const batch=new T.InstancedMesh(new T.BoxGeometry(1,1,1),mat,items.length),pose=new T.Object3D();
 for(let i=0;i<items.length;i++){
  const {position,size}=items[i];pose.position.set(...position);pose.scale.set(...size);pose.updateMatrix();batch.setMatrixAt(i,pose.matrix);
 }
 batch.castShadow=true;batch.receiveShadow=true;root.add(batch);return batch;
}

export function createMushroom(position,scale,seed,glow) {
 const root=new T.Group();root.position.set(...position);root.scale.setScalar(scale);
 const count=126,geo=new T.IcosahedronGeometry(1,2),vertices=geo.attributes.position;
 // Shared rough surface; rotations and overlapping volumes break repeated lobes.
 for(let i=0;i<vertices.count;i++){
  const x=vertices.getX(i),y=vertices.getY(i),z=vertices.getZ(i);
  const f=1+.07*Math.sin(x*9+y*5)*Math.cos(z*7-x*3);vertices.setXYZ(i,x*f,y*f,z*f);
 }
 // Keep the sphere's smooth normals: recomputing non-indexed normals makes smoke look like rock.
 const material=new T.MeshStandardMaterial({color:'#b3a18a',roughness:1,metalness:0,emissive:'#c48646',emissiveIntensity:.2});
 const smoke=new T.InstancedMesh(geo,material,count);smoke.instanceMatrix.setUsage(T.DynamicDrawUsage);smoke.frustumCulled=false;
 smoke.castShadow=true;smoke.receiveShadow=true;root.add(smoke);
 const flare=new T.Sprite(new T.SpriteMaterial({map:glow,color:'#ffe4ac',transparent:true,depthWrite:false,blending:T.AdditiveBlending}));
 root.add(flare);
 const point=new T.PointLight('#ffb45c',0,270,2);root.add(point);
 const pose=new T.Object3D(),shade=new T.Color();
 for(let i=0;i<count;i++){shade.setRGB(.76+random(seed+i)*.24,.74+random(seed+i)*.23,.67+random(seed+i)*.23);smoke.setColorAt(i,shade);}
 function update(age,{reducedMotion=false}={}) {
  root.visible=age>=0;if(age<0)return;
  const rise=smooth(age/3.8),cap=smooth((age-.3)/2.8),height=7+55*rise;
  material.emissiveIntensity=.055+Math.exp(-age*.55)*.72;
  for(let i=0;i<count;i++){
   const r=random(seed+i*3),a=i*2.39996+seed,twist=age*.10;
   let x,y,z,sx,sy,sz;
   if(i<48){
    const f=i/47,wide=3.5+4*Math.sin(f*Math.PI)+4*(1-f);
    x=Math.cos(a+twist)*wide*.65;y=Math.sin(a+twist)*wide*.65;z=height*f;
    sx=sy=(3+2.5*r)*(Math.min(1,age*2));sz=(4+2*r)*Math.min(1,age*2);
   }else if(i<100){
    const f=(i-48)/52,ring=Math.sqrt(f)*25*cap;
    x=Math.cos(a+twist)*ring;y=Math.sin(a+twist)*ring;z=height+(1-f)*10*cap+Math.sin(a*1.7)*2;
    sx=(7+5*r)*cap;sy=(7+4*random(i+seed+100))*cap;sz=(6+4*r)*cap;
   }else{
    const ring=8+age*15;x=Math.cos(a)*ring;y=Math.sin(a)*ring;z=1+r;
    sx=(4+age*2)*(1+r*.5);sy=sx;sz=1.3+age*.3;
   }
   pose.position.set(x,y,z);pose.rotation.set(i<100?r*3:0,i<100?a:0,r*5+age*.02);pose.scale.set(Math.max(.001,sx),Math.max(.001,sy),Math.max(.001,sz));pose.updateMatrix();smoke.setMatrixAt(i,pose.matrix);
  }
  smoke.instanceMatrix.needsUpdate=true;
  const pulse=Math.exp(-age*2.5);flare.position.z=5+height*.2;flare.scale.setScalar(70*(.75+age*.6));flare.material.opacity=pulse*(reducedMotion?.45:1);
  point.position.z=12;point.intensity=pulse*(reducedMotion?9000:24000);
 }
 return {root,update};
}

export function disposeScene(scene) {
 const geometries=new Set(),materials=new Set(),textures=new Set();
 scene.traverse(node=>{if(node.geometry)geometries.add(node.geometry);for(const m of Array.isArray(node.material)?node.material:node.material?[node.material]:[])materials.add(m);if(node.isInstancedMesh)node.dispose();if(node.shadow)node.shadow.dispose();});
 for(const m of materials){for(const value of Object.values(m))if(value?.isTexture)textures.add(value);m.dispose();}
 for(const g of geometries)g.dispose();for(const t of textures)t.dispose();
}
