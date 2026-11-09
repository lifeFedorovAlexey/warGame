import {damWorld} from './dam-layout.js';
import {terrainShadeAt} from '../demo/terrain-geometry.js';

export function createDamBanks(T,field,layout,shore,terrainMaterial){
 const rim=[[-41,-20],[-42,-9],...shore,[42,-9],[41,-20]],points=[];
 for(let i=1;i<rim.length;i++)for(let j=0;j<5;j++){const t=j/5;points.push([rim[i-1][0]*(1-t)+rim[i][0]*t,rim[i-1][1]*(1-t)+rim[i][1]*t]);}points.push(rim.at(-1));
 const positions=[],uv=[],colors=[],indices=[],edgeNormals=[],edgeFade=[],rows=18;
 const ground=(x,y)=>{const p=damWorld(layout,x,y);return(field.heightAt(p.x,p.y)-layout.z)/layout.scale;};
 const vertex=(x,y,z)=>{
  const p=damWorld(layout,x,y,z),shade=terrainShadeAt(field,p.x,p.y),height=field.heightAt(p.x,p.y),e=field.renderCell*(field.coarseSize?2:1),c=Math.cos(layout.rotation),s=Math.sin(layout.rotation);
  const nx=-(field.heightAt(p.x+e,p.y)-field.heightAt(p.x-e,p.y))/(2*e),ny=-(field.heightAt(p.x,p.y+e)-field.heightAt(p.x,p.y-e))/(2*e);
  const t=Math.max(0,Math.min(1,(p.z-height)/7)),blend=1-t*t*(3-2*t);
  const fade=Math.max(0,Math.min(1,(p.z-height-.65)/4));edgeFade.push(fade*fade*(3-2*fade));
  edgeNormals.push([nx*c+ny*s,-nx*s+ny*c,1,blend]);
  positions.push(x,y,z);uv.push(p.x/field.extent+.5,p.y/field.extent+.5);colors.push(shade,shade,shade);
 };
 for(const [i,p] of points.entries()){
  const dx=p[0]/43,dy=Math.max(.02,p[1]/28),n=Math.hypot(dx,dy),ridge=[p[0]+dx/n*2,Math.min(30,p[1]+dy/n*1.5)],outer=[p[0]+dx/n*27,Math.min(32,p[1]+dy/n*15)];
  const end=Math.max(0,Math.min(1,(p[1]+20)/20)),blend=end*end*(3-2*end),innerZ=ground(...p)*(1-blend)+(layout.reservoir.level-.2)*blend;
  const crestZ=ground(...ridge)*(1-blend)+(20.25+Math.sin(i*.15)*.35)*blend;
  vertex(...p,innerZ);vertex(...ridge,crestZ);
  for(let row=2;row<rows;row++){
   const t=(row-1)/(rows-2),x=ridge[0]*(1-t)+outer[0]*t,y=ridge[1]*(1-t)+outer[1]*t,h=ground(x,y),ease=Math.cos(t*Math.PI/2)**2;
   vertex(x,y,h+Math.max(0,crestZ-h)*ease-.16*t);
  }
  if(i)for(let row=0;row<rows-1;row++){const a=(i-1)*rows+row,b=i*rows+row;indices.push(a,b,a+1,a+1,b,b+1);}
 }
 // Close the inner shoulder down to the native slope. A top surface alone
 // left an open underside visible beside the wall from a low side camera.
 const skirtStart=positions.length/3;
 for(const [i,p] of points.entries()){
  vertex(p[0],p[1],positions[i*rows*3+2]);
  const x=p[0]-Math.sign(p[0])*5,y=p[1]-(p[1]<3?4:0);vertex(x,y,ground(x,y)-.2);
  if(i){const a=skirtStart+(i-1)*2,b=a+2;indices.push(a,a+1,b,a+1,b+1,b);}
 }
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
 geometry.setAttribute('bankEdgeFade',new T.Float32BufferAttribute(edgeFade,1));
 // Merge the lighting smoothly into the underlying terrain at the contact edge.
 const normals=geometry.getAttribute('normal'),normal=new T.Vector3(),native=new T.Vector3();
 edgeNormals.forEach(([x,y,z,blend],i)=>{normal.fromBufferAttribute(normals,i).lerp(native.set(x,y,z).normalize(),blend).normalize();normals.setXYZ(i,...normal);});
 // Exactly the map's material, world UVs and scale: no second sand palette.
 const bank=new T.Mesh(geometry,terrainMaterial);bank.name='reservoir_earth_banks';bank.receiveShadow=true;
 const variants=new Map();bank.userData.materialForTerrain=source=>{
  if(!variants.has(source)){
   const material=source.clone();material.transparent=true;material.depthWrite=true;
   material.customProgramCacheKey=()=>source.customProgramCacheKey()+'_bank_edge_v1';
   material.onBeforeCompile=shader=>{
    source.onBeforeCompile(shader);
    shader.vertexShader='attribute float bankEdgeFade;varying float vBankEdgeFade;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvBankEdgeFade=bankEdgeFade;');
    shader.fragmentShader='varying float vBankEdgeFade;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.a*=vBankEdgeFade;');
   };variants.set(source,material);
  }
  bank.userData.terrainSourceMaterial=source;return variants.get(source);
 };return bank;
}
