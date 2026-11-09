import {DAM_OUTLETS} from './dam-layout.js';
import {sceneryBuilder} from './environment-geometry.js';
import {damWaterNormals} from './dam-water.js';

// Shallow stilling troughs feed one covered collector. Decorative only.
export function createDamDrainage(T,addFog){
 const root=new T.Group();root.name='dam_drainage';root.userData.decorative=true;
 const concrete=new T.MeshStandardMaterial({color:'#918b73',roughness:1});
 const damp=new T.MeshStandardMaterial({color:'#515b48',roughness:.78});
 const iron=new T.MeshStandardMaterial({color:'#4e4e3c',metalness:.5,roughness:.86}),dark=new T.MeshStandardMaterial({color:'#1c2722',roughness:1});
 const normals=damWaterNormals(T),water=new T.MeshStandardMaterial({color:'#405d56',roughness:.42,metalness:.08,normalMap:normals,normalScale:new T.Vector2(.12,.12),transparent:true,opacity:.91,depthWrite:false});
 const wet=new T.MeshStandardMaterial({color:'#465347',roughness:.58,transparent:true,opacity:.5,depthWrite:false,side:T.DoubleSide});
 const clock={value:0};water.customProgramCacheKey=()=> 'dam_drainage_water_v2';
 water.onBeforeCompile=s=>{s.uniforms.drainClock=clock;s.vertexShader='varying vec2 vDrainXY;\n'+s.vertexShader;s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvDrainXY=position.xy;');s.fragmentShader='varying vec2 vDrainXY;uniform float drainClock;\n'+s.fragmentShader;s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
  float ripple=.5*sin(vDrainXY.y*4.+sin(vDrainXY.x*1.3+drainClock*.7)*.7-drainClock*1.8)+.3*sin(dot(vDrainXY,vec2(.9,8.))-drainClock*2.5)+.2*sin(dot(vDrainXY,vec2(-1.4,12.))+drainClock*.8);diffuseColor.rgb*=.97+.03*ripple;
 `);};
 for(const material of [concrete,damp,iron,dark,water,wet])addFog(material);
 const {box,shape,finish}=sceneryBuilder(T,root);
 function surface(x0,x1,y0,y1,z,material,name){
  const outline=new T.Shape();outline.moveTo(x0,y0);outline.lineTo(x1,y0);outline.lineTo(x1,y1);outline.lineTo(x0,y1);outline.closePath();
  const mesh=new T.Mesh(new T.ShapeGeometry(outline),material);mesh.position.z=z;mesh.name=name;root.add(mesh);return mesh;
 }
 function curb(x,y,length){
  // Chamfered cap catches light; the lower edge is embedded in the sand.
  const p=[[-.22,0],[.22,0],[.22,.50],[.13,.60],[-.13,.60],[-.22,.50]],v=[],uv=[];
  for(let i=0;i<p.length;i++){
   const a=p[i],b=p[(i+1)%p.length];
   for(const [q,t] of [[a,-1],[b,1],[b,-1],[a,-1],[a,1],[b,1]]){v.push(x+q[0],y+t*length/2,q[1]);uv.push(q[0],t*length/2);}
  }
  for(const end of [-1,1])for(let i=1;i<p.length-1;i++)for(const q of end<0?[p[0],p[i],p[i+1]]:[p[0],p[i+1],p[i]]){v.push(x+q[0],y+end*length/2,q[1]);uv.push(q[0],q[1]);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(v,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.computeVertexNormals();shape(g,concrete);
 }
 for(const [i,p] of DAM_OUTLETS.entries()){
  box([4.9,7.3,.24],[p.x,-22.65,-.015],concrete);
  box([4.15,7.1,.045],[p.x,-22.7,.122],damp);
  for(const side of [-1,1])curb(p.x+side*2.3,-22.65,7.3);
  box([4.9,.35,.50],[p.x,-19.15,.22],concrete);
  surface(p.x-2.075,p.x+2.075,-26.48,-19.35,.205,water,'dam_catch_pool_'+i);
  // Wet, irregular waterline on the inner faces, darker underneath the jet.
  for(const side of [-1,1]){
   const vertices=[],x=p.x+side*2.077;
   for(let j=0;j<28;j++){
    const a=-26.3+j*.248,b=a+.248,za=.32+.055*Math.sin(j*2.1+i),zb=.32+.055*Math.sin((j+1)*2.1+i);
    vertices.push(x,a,.13,x,b,.13,x,b,zb,x,a,.13,x,b,zb,x,a,za);
   }
   const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.computeVertexNormals();root.add(new T.Mesh(g,wet));
  }
 }
 // One cross drain ties the three troughs together. Water continues below it.
 box([17.7,1.75,.23],[19,-27.15,-.02],concrete);
 box([17.25,1.35,.05],[19,-27.15,.12],dark);
 surface(10.4,27.6,-27.8,-26.4,.18,water,'dam_collector_water');
 box([17.7,.18,.38],[19,-27.99,.14],concrete);
 for(const [a,b] of [[10.15,10.925],[15.075,16.925],[21.075,22.925],[27.075,27.85]])box([b-a,.18,.38],[(a+b)/2,-26.32,.14],concrete);
 for(const x of [10.16,27.84])box([.22,1.85,.38],[x,-27.15,.14],concrete);
 for(let panel=0;panel<6;panel++){
  const x=11.7+panel*2.92;
  for(const y of [-27.82,-26.48])box([2.84,.085,.105],[x,y,.34],iron);
  for(const dx of [-1.42,1.42])box([.085,1.42,.105],[x+dx,-27.15,.34],iron);
  for(let k=0;k<9;k++)box([.075,1.28,.09],[x-1.2+k*.3,-27.15,.335],iron);
  box([2.8,.065,.07],[x,-27.15,.32],iron);
  for(const dx of [-1.32,1.32])for(const dy of [-.57,.57])shape(new T.CylinderGeometry(.045,.045,.04,6).rotateX(Math.PI/2),dark,[x+dx,-27.15+dy,.41]);
 }
 // Covered inspection sump at the collector end: the discharge has an outlet.
 box([2.3,2.05,.38],[28.9,-27.15,.14],concrete);
 box([1.85,1.62,.09],[28.9,-27.15,.38],iron);
 for(const y of [-27.7,-26.6])for(const x of [28.2,29.6])box([.11,.11,.04],[x,y,.445],dark);
 for(const x of [28.5,29.3])box([.18,.38,.02],[x,-27.15,.435],dark);
 finish();return {root,update(time){clock.value=time;normals.offset.set(time*.007,-time*.026);}};
}
