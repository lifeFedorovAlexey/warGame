import {transportPoint} from './transport-site.js';

// Paved touchdown area inside the unchanged 36 × 64 m protected plot.
// Rotors may overhang the pavement; the whole plot stays clear for flight.
export function createHelipad(T,root,field,site,addFog){
 const loader=new T.TextureLoader(),texture=loader.load(new URL('../assets/maps/alpha/materials/ruined-asphalt.jpg',import.meta.url).href);
 texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.colorSpace=T.SRGBColorSpace;
 const normal=loader.load(new URL('../assets/maps/alpha/materials/pbr/asphalt_03/normal.jpg',import.meta.url).href);normal.wrapS=normal.wrapT=T.RepeatWrapping;
 const asphalt=new T.MeshStandardMaterial({map:texture,normalMap:normal,normalScale:new T.Vector2(.35,.35),color:'#938e7f',roughness:.97,polygonOffset:true,polygonOffsetFactor:-1});
 asphalt.onBeforeCompile=s=>{s.fragmentShader=s.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\ndiffuseColor.rgb=mix(diffuseColor.rgb,vec3(.085,.081,.071),.35);');};asphalt.customProgramCacheKey=()=> 'mu26_touchdown_asphalt_v3';
 const concrete=new T.MeshStandardMaterial({color:'#9b9483',roughness:1,polygonOffset:true,polygonOffsetFactor:-1});
 const white=new T.MeshStandardMaterial({color:'#e6e1cb',roughness:.93,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
 const yellow=new T.MeshStandardMaterial({color:'#bb8e37',roughness:.95,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
 const steel=new T.MeshStandardMaterial({color:'#3b3930',roughness:.9}),lamp=new T.MeshStandardMaterial({color:'#d5b879',emissive:'#ab782b',emissiveIntensity:.7});
 [asphalt,concrete,white,yellow,steel,lamp].forEach(addFog);
 function mesh(name,polygons,material,z=.12){const positions=[],uv=[];for(const polygon of polygons)for(let i=1;i<polygon.length-1;i++)for(const [x,y] of [polygon[0],polygon[i],polygon[i+1]]){const p=transportPoint(site,x,y);positions.push(p.x,p.y,field.heightAt(p.x,p.y)+z);uv.push(x/7,y/7);}const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geometry.computeVertexNormals();const object=new T.Mesh(geometry,material);object.name=name;object.receiveShadow=z<.2;root.add(object);return object;}
 const perimeter=[[-10,-24],[10,-24],[17,-17],[17,15],[10,22],[-10,22],[-17,15],[-17,-17]];
 const outer=perimeter.map(([x,y])=>[x*1.055,(y+1)*1.04-1]),shoulder=perimeter.map((p,i)=>[outer[i],outer[(i+1)%8],perimeter[(i+1)%8],p]);
 mesh('helipad_concrete_shoulder',[...shoulder,[[-8,-32],[8,-32],[8,-24],[-8,-24]]],concrete);
 mesh('helipad_asphalt',[perimeter],asphalt,.15);
 const paint=[],access=[];
 function stripe(list,x,y,w,d){list.push([[x-w/2,y-d/2],[x+w/2,y-d/2],[x+w/2,y+d/2],[x-w/2,y+d/2]]);}
 // The H stays legible from the base's normal south-facing camera.
 for(const y of [-4.2,4.2])stripe(paint,0,y,13.5,1.9);stripe(paint,0,0,1.9,10.3);
 for(let i=0;i<128;i++){const a=i*Math.PI/64,b=(i+1)*Math.PI/64;paint.push([[Math.cos(a)*13.6,Math.sin(a)*13.6],[Math.cos(a)*14.35,Math.sin(a)*14.35],[Math.cos(b)*14.35,Math.sin(b)*14.35],[Math.cos(b)*13.6,Math.sin(b)*13.6]]);}
 for(let i=0;i<perimeter.length;i++){if(i===0)continue;const a=perimeter[i],b=perimeter[(i+1)%perimeter.length],inward=([x,y])=>[x*.965,(y+1)*.965-1];paint.push([a,b,inward(b),inward(a)]);}
 for(const x of [-7,7])stripe(access,x,-27,.28,9);
 for(let y=-30.8;y<-24;y+=2.2)stripe(access,0,y,.28,1.15);
 for(const sign of [-1,1])for(let y=-30;y<-24;y+=2.2)access.push([[sign*5,y],[sign*6.7,y+1.7],[sign*6.7,y+2.1],[sign*5,y+.4]]);
 // Reverse the left hatching so all top faces have the same winding.
 for(const p of access){let area=0;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];area+=a[0]*b[1]-b[0]*a[1];}if(area<0)p.reverse();}
 mesh('helipad_H_circle_and_edge',paint,white,.22);mesh('helipad_ramp_access',access,yellow,.22);
 for(const [x,y] of perimeter){const p=transportPoint(site,x*1.025,(y+1)*1.02-1),z=field.heightAt(p.x,p.y);const base=new T.Mesh(new T.CylinderGeometry(.55,.65,.25,8).rotateX(Math.PI/2),steel);base.position.set(p.x,p.y,z+.3);root.add(base);const bulb=new T.Mesh(new T.SphereGeometry(.29,8,6),lamp);bulb.position.set(p.x,p.y,z+.5);root.add(bulb);}
}
