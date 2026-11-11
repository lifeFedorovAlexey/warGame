import {createKorovnik} from './korovnik-model.js';
import {KOROVNIK,transportSite,transportPoint} from './transport-site.js';
import {transportPose,cargoPose} from './korovnik-transport.js';

export function createKorovnikView(T,scene,field,config,vehicles,addFog){
 const site=transportSite(field,config),root=new T.Group();root.name='mu26_landing_ground';scene.add(root);
 const texture=new T.TextureLoader().load(new URL('../assets/maps/alpha/materials/weathered-concrete.jpg',import.meta.url).href);texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.colorSpace=T.SRGBColorSpace;
 const concrete=new T.MeshStandardMaterial({map:texture,color:'#8c816a',roughness:1,vertexColors:true,polygonOffset:true,polygonOffsetFactor:-1});
 const paint=new T.MeshStandardMaterial({color:'#c3ab76',roughness:1,transparent:true,opacity:.72,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
 const steel=new T.MeshStandardMaterial({color:'#514738',roughness:.95});
 const light=new T.MeshStandardMaterial({color:'#c89a55',emissive:'#b47b32',emissiveIntensity:.5});
 [concrete,paint,steel,light].forEach(addFog);
 const pos=[],uv=[],colors=[];
 // Individual, stained slabs and broken edge lines belong to the terrain.
 for(let x=-18;x<18;x+=3)for(let y=-32;y<32;y+=4){
  const tint=.74+((Math.abs(x*31+y*71)%19)/19)*.23;
  for(const [dx,dy] of [[.025,.025],[2.975,.025],[2.975,3.975],[.025,.025],[2.975,3.975],[.025,3.975]]){
   const p=transportPoint(site,x+dx,y+dy);pos.push(p.x,p.y,field.heightAt(p.x,p.y)+.12);uv.push((x+dx)/5,(y+dy)/5);colors.push(tint,tint,tint);
  }
 }
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.computeVertexNormals();
 const slabs=new T.Mesh(g,concrete);slabs.receiveShadow=true;root.add(slabs);
 const marks=[];
 function stripe(x,y,w,d){for(const [a,b] of [[-1,-1],[1,-1],[1,1],[-1,-1],[1,1],[-1,1]]){const p=transportPoint(site,x+a*w/2,y+b*d/2);marks.push(p.x,p.y,field.heightAt(p.x,p.y)+.2);}}
 for(const x of [-16,16])for(let y=-28;y<=28;y+=7)stripe(x,y,.22,3);
 for(const y of [-30,30])for(let x=-14;x<=14;x+=7)stripe(x,y,3,.22);
 // Touchdown bars, wheel tracks and ramp centre line. No decorative map icon.
 for(const x of [-6.3,6.3]){stripe(x,-7,.3,8);stripe(x,16,2.4,.3);}
 for(const x of [-3.9,3.9])for(let y=-29;y<-15;y+=3)stripe(x,y,.22,1.3);
 const mg=new T.BufferGeometry();mg.setAttribute('position',new T.Float32BufferAttribute(marks,3));mg.computeVertexNormals();root.add(new T.Mesh(mg,paint));
 for(const x of [-17,17])for(const y of [-30,0,30]){
  const p=transportPoint(site,x,y),z=field.heightAt(p.x,p.y);
  const base=new T.Mesh(new T.CylinderGeometry(.8,1.1,.7,8).rotateX(Math.PI/2),steel);base.position.set(p.x,p.y,z+.35);root.add(base);
  const bulb=new T.Mesh(new T.SphereGeometry(.5,8,6),light);bulb.position.set(p.x,p.y,z+.9);root.add(bulb);
 }
 // A small physical site stencil identifies why this plot cannot be built on.
 const label=document.createElement('canvas');label.width=1024;label.height=128;const ctx=label.getContext('2d');ctx.font='bold 58px Arial';ctx.textAlign='center';ctx.fillStyle='#c9b68c';ctx.fillText('МУ-26 / ПОСАДОЧНАЯ',512,85);
 const map=new T.CanvasTexture(label);map.colorSpace=T.SRGBColorSpace;const mat=new T.MeshStandardMaterial({map,transparent:true,depthWrite:false,roughness:1,polygonOffset:true,polygonOffsetFactor:-3});addFog(mat);
 const stencil=new T.Mesh(new T.PlaneGeometry(75,9.4),mat),lp=transportPoint(site,12,0);stencil.position.set(lp.x,lp.y,field.heightAt(lp.x,lp.y)+.24);stencil.rotation.z=site.heading+Math.PI/2;root.add(stencil);
 let helicopter=null,lastPhase='',lastDoor=-1,lastRotor=-1;const cargo=new Map();
 function update(mission){
  const t=mission.state.transport,visible=!!t&&!['absent','departed'].includes(t.phase);
  // The plot exists from mission one, while the aircraft is created on demand.
  if(!helicopter&&visible){helicopter=createKorovnik(T);helicopter.materials.forEach(addFog);scene.add(helicopter.root);helicopter.root.scale.setScalar(config.worldScale);}
  if(!helicopter)return false;
  helicopter.root.visible=visible;if(!visible)return lastPhase!==t?.phase?(lastPhase=t?.phase,true):false;
  const p=transportPose(t),ground=field.heightAt(t.site.x,t.site.y);
  helicopter.root.position.set(p.x,p.y,ground+p.z);helicopter.root.rotation.set(p.tilt,0,p.heading);helicopter.pose(p);
  const ids=new Set(t.manifest.map(c=>c.unit.id));
  for(const [id,model] of cargo)if(!ids.has(id)){helicopter.root.remove(model.root);model.dispose?.();cargo.delete(id);}
  for(const c of t.manifest){
   let model=cargo.get(c.unit.id);
   if(!model){model=vehicles.makeCargoModel(c.unit);if(!model)continue;model.root.name='cargo_'+c.unit.id;model.root.traverse(n=>{if(n.isMesh){for(const material of Array.isArray(n.material)?n.material:[n.material])addFog(material);}});cargo.set(c.unit.id,model);helicopter.root.add(model.root);}
   const pose=cargoPose(t,c);model.root.position.set(pose.x,pose.y,pose.z);model.root.rotation.set(pose.pitch??0,0,pose.heading??0);
  }
  const dirty=lastPhase!==t.phase||lastDoor!==t.door||lastRotor!==t.rotor;lastPhase=t.phase;lastDoor=t.door;lastRotor=t.rotor;return dirty;
 }
 return {root,site,update,get helicopter(){return helicopter;}};
}
