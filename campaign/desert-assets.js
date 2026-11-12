import {mergeGeometries} from '../demo/vendor/utils/BufferGeometryUtils.js';
import {createBirchGeometry} from './birch-geometry.js';

// The same geometry, colours and seeded variation for every campaign map.
export function createDesertAssets(T,random,addFog=()=>{}){
 const pebble=new T.MeshStandardMaterial({color:'#99886a',roughness:1,flatShading:true});
 const bark=new T.MeshStandardMaterial({color:'#61543b',roughness:1});
 const leaves=new T.MeshStandardMaterial({color:'#4e5840',roughness:1,flatShading:true});
 const brush=new T.MeshStandardMaterial({color:'#7d7950',roughness:1,flatShading:true});
 for(const m of [pebble,bark,leaves,brush])addFog(m);
 const batches=[];
 function batch(name,geometry,material){const item={name,geometry,material,poses:[]};batches.push(item);return item;}
 const stones=batch('small_stones',new T.IcosahedronGeometry(1,0),pebble);
 function merged(parts){const g=mergeGeometries(parts,false);parts.forEach(p=>p.dispose());return g;}
 const twigs=[],clumps=[];
 for(let i=0;i<7;i++){
  const a=i*2.4,r=i?.25+random()*.24:0,h=.42+random()*.4,x=Math.cos(a)*r,y=Math.sin(a)*r;
  twigs.push(new T.CylinderGeometry(.017,.04,h,4).rotateX(Math.PI/2).translate(x,y,h*.5).toNonIndexed());
  clumps.push(new T.IcosahedronGeometry(.24+random()*.16,0).scale(1,.8,.6).translate(x,y,h*.72).toNonIndexed());
 }
 const scrub=batch('scrub_branches',merged(twigs),bark),bush=batch('low_bushes',merged(clumps),brush);
 const trunks=batch('pine_trunks',new T.CylinderGeometry(.075,.19,6.3,6).rotateX(Math.PI/2).translate(0,0,3.15),bark);
 // Uneven, drooping branch skirts rather than stacked perfect cones.
 const pinePositions=[];
 for(let tier=0;tier<7;tier++){
  const z=1.5+tier*.77,r=1.85-tier*.235,n=11,apex=[.05*Math.sin(tier),0,z+1.8];
  for(let j=0;j<n;j++){
   const a=j/n*Math.PI*2+tier*.41,b=(j+1)/n*Math.PI*2+tier*.41,mid=(a+b)/2;
   const p=[Math.cos(a)*r*(.74+random()*.25),Math.sin(a)*r*(.74+random()*.25),z+random()*.14],
    q=[Math.cos(b)*r*(.74+random()*.25),Math.sin(b)*r*(.74+random()*.25),z+random()*.14],
    tip=[Math.cos(mid)*r*1.15,Math.sin(mid)*r*1.15,z-.24-random()*.18];
   for(const v of [apex,p,tip,apex,tip,q,[0,0,z+.13],tip,p,[0,0,z+.13],q,tip])pinePositions.push(...v);
  }
 }
 const pineGeometry=new T.BufferGeometry();pineGeometry.setAttribute('position',new T.Float32BufferAttribute(pinePositions,3));pineGeometry.computeVertexNormals();
 const pine=batch('small_pines',pineGeometry,leaves);
 const birchGeometry=createBirchGeometry(T);
 const birchBark=new T.MeshStandardMaterial({color:'#ffffff',vertexColors:true,roughness:1});
 const birchLeaves=new T.MeshStandardMaterial({color:'#ffffff',vertexColors:true,roughness:1,flatShading:true,side:T.DoubleSide});
 addFog(birchBark);addFog(birchLeaves);
 const birchTrunks=batch('birch_trunks',birchGeometry.bark,birchBark),birches=batch('small_birches',birchGeometry.leaves,birchLeaves);
 return {batches,stones,scrub,bush,trunks,pine,birchTrunks,birches,birchGeometry};
}
