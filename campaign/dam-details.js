import {damBow,DAM_HEIGHT} from './dam-layout.js';

export function addDamDetails(T,root,addFog){
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=160;
 const ctx=canvas.getContext('2d');ctx.fillStyle='#383c31';ctx.font='bold 104px Arial';ctx.textAlign='center';ctx.textBaseline='middle';
 const text='ЦОЙ ЖИВ';for(let i=0;i<text.length;i++){ctx.save();ctx.translate(48+i*68,82+Math.sin(i*4)*3);ctx.rotate(Math.sin(i*6)*.035);ctx.fillText(text[i],0,0);ctx.restore();}
 ctx.globalCompositeOperation='destination-out';for(let i=0;i<1300;i++){const x=(i*73.37)%512,y=(i*41.19)%160;ctx.fillRect(x,y,.5+i%3,.5+i%2);}
 const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;
 const material=new T.MeshStandardMaterial({map,transparent:true,opacity:.68,roughness:1,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});addFog(material);
 const positions=[],uv=[];const left=-29,right=-15,bottom=5.2,top=9.5;
 for(let i=0;i<7;i++)for(const [col,row] of [[i,0],[i+1,0],[i+1,1],[i,0],[i+1,1],[i,1]]){
  const x=left+(right-left)*col/7,z=bottom+(top-bottom)*row;positions.push(x,damBow(x)-3+z*3/DAM_HEIGHT-.035,z);uv.push(col/7,row);
 }
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.computeVertexNormals();
 const graffiti=new T.Mesh(g,material);graffiti.name='tsoi_graffiti';root.add(graffiti);
 const glowCanvas=document.createElement('canvas');glowCanvas.width=glowCanvas.height=64;
 const gc=glowCanvas.getContext('2d'),gradient=gc.createRadialGradient(32,32,1,32,32,31);gradient.addColorStop(0,'rgba(255,255,255,.9)');gradient.addColorStop(.18,'rgba(255,255,255,.36)');gradient.addColorStop(1,'rgba(255,255,255,0)');gc.fillStyle=gradient;gc.fillRect(0,0,64,64);
 const glowMap=new T.CanvasTexture(glowCanvas),lampGlows=new T.Group();lampGlows.name='dam_lamp_glows';root.add(lampGlows);
 const lightMaterial=new T.MeshBasicMaterial({map:glowMap,color:'#ffcc77',transparent:true,opacity:.3,depthWrite:false,blending:T.AdditiveBlending});addFog(lightMaterial);
 function spriteFog(m){m.customProgramCacheKey=()=> 'dam_fog_glow_v1';m.onBeforeCompile=s=>{s.vertexShader=s.vertexShader.replace('void main() {','void main() {\nvec3 transformed=vec3(0.);\n#include <worldpos_vertex>');s.fragmentShader=s.fragmentShader.replace('#include <fog_fragment>','#include <fog_fragment>\n#include <dithering_fragment>');};addFog(m);}
 const haloMaterial=new T.SpriteMaterial({map:glowMap,color:'#ffe6ac',transparent:true,opacity:.58,depthWrite:false,blending:T.AdditiveBlending});spriteFog(haloMaterial);
 for(const x of [-38,-27,-16,-5,6,17,28,39]){
  const y=damBow(x)+1.9;
  const glow=new T.Sprite(haloMaterial);glow.position.set(x,y,DAM_HEIGHT+3.42);glow.scale.set(1.7,1.7,1);lampGlows.add(glow);
  const pool=new T.Mesh(new T.PlaneGeometry(4.2,3.9),lightMaterial);pool.position.set(x,y,DAM_HEIGHT+.365);lampGlows.add(pool);
 }
 const beaconMaterial=new T.MeshBasicMaterial({color:'#f13f23'});addFog(beaconMaterial);
 const beaconGlowMaterial=new T.SpriteMaterial({map:glowMap,color:'#ff3b21',transparent:true,opacity:.6,depthWrite:false,blending:T.AdditiveBlending});spriteFog(beaconGlowMaterial);
 const beacons=new T.Group();beacons.name='dam_red_beacons';root.add(beacons);
 for(const x of [-31,33]){
  const y=damBow(x)+1.6,z=DAM_HEIGHT+9.15;
  const diode=new T.Mesh(new T.SphereGeometry(.13,8,6),beaconMaterial);diode.position.set(x+.8,y,z);beacons.add(diode);
  const glow=new T.Sprite(beaconGlowMaterial);glow.position.copy(diode.position);glow.scale.set(1.3,1.3,1);beacons.add(glow);
 }
 return {update(time){const lit=time%2.4<.16||(time%2.4>.3&&time%2.4<.46);beaconMaterial.color.set(lit?'#ff5533':'#581d14');beaconGlowMaterial.opacity=lit?.72:0;}};
}
