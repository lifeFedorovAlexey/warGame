import {mergeGeometries} from '../demo/vendor/utils/BufferGeometryUtils.js';

// Shared, low-poly silver birch. Z is up, as in the other landscape prefabs.
export function createBirchGeometry(T){
 let seed=0xb17c4;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const wood=[],foliage=[],up=new T.Vector3(0,1,0),colour=new T.Color();
 function tinted(geometry,tint){
  const g=geometry.index?geometry.toNonIndexed():geometry;
  if(g!==geometry)geometry.dispose();
  g.deleteAttribute('uv');
  colour.set(tint);const values=[];
  for(let i=0;i<g.attributes.position.count;i++)values.push(colour.r,colour.g,colour.b);
  g.setAttribute('color',new T.Float32BufferAttribute(values,3));return g;
 }
 function branch(a,b,base,tip,white=false){
  const start=new T.Vector3(...a),end=new T.Vector3(...b),length=start.distanceTo(end);
  const rotation=new T.Quaternion().setFromUnitVectors(up,end.clone().sub(start).normalize());
  const transform=new T.Matrix4().compose(start.clone().add(end).multiplyScalar(.5),rotation,new T.Vector3(1,1,1));
  wood.push(tinted(new T.CylinderGeometry(tip,base,length,6,1,true),white?'#dfddd0':'#625b49').applyMatrix4(transform));
  if(!white)return;
  // Broken horizontal lenticels follow the bark, rather than floating decals.
  for(let i=0;i<5;i++){
   const f=.12+i*.17,angle=random()*Math.PI*2,width=.6+random()*1.1,height=.035+random()*.06;
   const radius=base+(tip-base)*f+.002,positions=[];
   for(let j=0;j<3;j++){
    const p=angle+j*width/3,q=angle+(j+1)*width/3,y=(f-.5)*length;
    positions.push(Math.sin(p)*radius,y,Math.cos(p)*radius,Math.sin(q)*radius,y+.012,Math.cos(q)*radius,Math.sin(p)*radius,y+height,Math.cos(p)*radius,
     Math.sin(q)*radius,y+.012,Math.cos(q)*radius,Math.sin(q)*radius,y+height*.8,Math.cos(q)*radius,Math.sin(p)*radius,y+height,Math.cos(p)*radius);
   }
   const marks=new T.BufferGeometry();marks.setAttribute('position',new T.Float32BufferAttribute(positions,3));marks.computeVertexNormals();
   wood.push(tinted(marks,'#444239').applyMatrix4(transform));
  }
 }
 const stem=[[0,0,0],[.04,-.015,.35],[.10,.025,2.3],[.02,.08,4.05],[-.16,.10,5.45],[-.24,.07,6.5]];
 const radii=[.17,.145,.112,.078,.044,.009];
 for(let i=1;i<stem.length;i++)branch(stem[i-1],stem[i],radii[i-1],radii[i],i>1);
 function leaves(x,y,z,size){
  const palette=['#89915b','#a0a365','#778653','#aaa56b'];
  // Separate rhombic leaves form open sprays, with no solid crown blobs.
  for(let i=0;i<22;i++){
   const a=random()*Math.PI*2,r=Math.sqrt(random())*size,h=(random()-.5)*size*1.8;
   const length=.13+random()*.10,width=length*(.55+random()*.2);
   const g=new T.BufferGeometry();
   g.setAttribute('position',new T.Float32BufferAttribute([0,length,0,-width,0,0,0,-length*.7,0,0,length,0,0,-length*.7,0,width,0,0],3));
   g.rotateX((random()-.5)*1.7).rotateY((random()-.5)*1.7).rotateZ(random()*6.28);g.computeVertexNormals();
   foliage.push(tinted(g,palette[Math.floor(random()*palette.length)]).translate(x+Math.cos(a)*r*.9,y+Math.sin(a)*r*.74,z+h));
  }
 }
 for(let i=0;i<12;i++){
  const z=2.55+i*.265,a=i*2.4,reach=1.65-Math.max(0,z-4.1)*.55+random()*.24;
  const start=[.03,.06,z],fork=[Math.cos(a)*reach*.65,Math.sin(a)*reach*.65,z+.7];
  branch(start,fork,.047,.019,i%3===0);
  for(const side of [-1,1]){
   const angle=a+side*.24,tip=[Math.cos(angle)*reach,Math.sin(angle)*reach,z+.18];
   branch(fork,tip,.019,.004);
   leaves(tip[0]*.82,tip[1]*.82,z+.64,.45+random()*.17);
   // Smaller pendulous sprays keep daylight between the outer branches.
   leaves(tip[0]*1.04,tip[1]*1.04,z+.03,.24+random()*.1);
  }
 }
 leaves(-.22,.08,6.25,.55);leaves(.13,-.16,5.8,.5);
 function merge(parts){const result=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());return result;}
 return{bark:merge(wood),leaves:merge(foliage),radius:2.25};
}
