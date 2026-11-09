import {DAM_WIDTH,DAM_HEIGHT,DAM_OUTLETS,damBow} from './dam-layout.js';
import {sceneryBuilder} from './environment-geometry.js';

export function createDamModel(T,addFog){
 const root=new T.Group();root.name='western_dam_structure';root.userData.decorative=true;
 const tex=new T.TextureLoader().load(new URL('../assets/maps/alpha/materials/weathered-concrete.jpg',import.meta.url).href);tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.colorSpace=T.SRGBColorSpace;
 const concrete=new T.MeshStandardMaterial({color:'#b0aa96',map:tex,roughness:1});
 concrete.customProgramCacheKey=()=> 'dam_concrete_v1';
 concrete.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#ifdef USE_MAP
  vec3 concreteSample=texture2D(map,vMapUv).rgb;
  diffuseColor.rgb*=.81+.25*dot(concreteSample,vec3(.299,.587,.114));
 #endif`);};
 const edge=new T.MeshStandardMaterial({color:'#817b67',roughness:.98});
 const steel=new T.MeshStandardMaterial({color:'#353c36',roughness:.85,metalness:.4});
 const rust=new T.MeshStandardMaterial({color:'#77503b',roughness:.92,metalness:.3});
 const faded=new T.MeshStandardMaterial({color:'#a18a4e',roughness:.9});
 const dark=new T.MeshStandardMaterial({color:'#222b28',roughness:1});
 const light=new T.MeshStandardMaterial({color:'#e4bc73',emissive:'#dc8a35',emissiveIntensity:1.8});
 for(const m of [concrete,edge,steel,rust,faded,dark,light])addFog(m);
 const {box,rod,shape,section,finish}=sceneryBuilder(T,root),half=DAM_WIDTH/2,h=DAM_HEIGHT;
 const bow=damBow;
 function monolith(a,b){
  const p=[[a,bow(a)-3,0],[b,bow(b)-3,0],[b,bow(b)+4,0],[a,bow(a)+4,0],
   [a,bow(a),h],[b,bow(b),h],[b,bow(b)+3,h],[a,bow(a)+3,h]];
  const indices=[0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7,4,5,6,4,6,7,0,3,2,0,2,1],positions=[],uv=[];
  for(const i of indices){positions.push(...p[i]);uv.push(p[i][0]*.22,p[i][2]*.22);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.computeVertexNormals();shape(g,concrete);
 }
 // Independently addressable concrete sections, never one inseparable backdrop.
 for(let i=0;i<14;i++){
  const a=-half+i*6,b=a+6;
  section('monolith_'+String(i).padStart(2,'0'),()=>{
   if(i===6||i===7){box([6,4,4.8],[(a+b)/2,bow((a+b)/2)+1.1,h-2.4],concrete);return;}
   monolith(a,b);
   // Projecting buttress feet give the wall its retaining structure and scale.
   box([.42,1,19.8],[a+.1,bow(a)-1.45,h/2],edge,[-Math.atan(3/h),0,0]);
   // Dark vertical runoff and narrow construction joints, following the batter.
   for(let n=0;n<3;n++){const x=a+.7+n*1.8,z=4+n*2.3;box([.16,.035,7+n],[x,bow(x)-3+z*3/h-.035,z],edge,[-Math.atan(3/h),0,0]);}
  });
 }
 section('spillway_gate',()=>{
  box([11.9,.5,15.25],[0,-7.4,7.63],rust);
  for(const x of [-5.7,-3.8,0,3.8,5.7])box([.24,.42,15],[x,-7.75,7.65],steel);
  for(const z of [1,4,7,10,13,15])box([11.8,.45,.22],[0,-7.81,z],steel);
  for(const x of [-5.6,5.6])for(let j=0;j<16;j++)box([.17,.11,.17],[x,-8.06,.6+j*.9],faded);
 });
 // Full-depth lintel closes the offset between the vertical gate and battered wall.
 box([12.2,5.8,.65],[0,-4.9,15.48],concrete);
 // Each deck slab follows the same two end coordinates as its neighbour.
 // Axis-aligned overlapping boxes left sawtooth edges on the curved crest.
 for(let i=0;i<28;i++){
  const x=-half+1.5+i*3,y=bow(x);
  const a=x-1.5,b=x+1.5,pts=[[a,bow(a)-1.2,h],[b,bow(b)-1.2,h],[b,bow(b)+3.8,h],[a,bow(a)+3.8,h],
   [a,bow(a)-1.2,h+.35],[b,bow(b)-1.2,h+.35],[b,bow(b)+3.8,h+.35],[a,bow(a)+3.8,h+.35]],v=[],uv=[];
  for(const k of [0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7,4,5,6,4,6,7,0,3,2,0,2,1]){v.push(...pts[k]);uv.push(pts[k][0],pts[k][1]);}
  const deck=new T.BufferGeometry();deck.setAttribute('position',new T.Float32BufferAttribute(v,3));deck.setAttribute('uv',new T.Float32BufferAttribute(uv,2));deck.computeVertexNormals();shape(deck,edge);
  for(const side of [-.8,3.4]){
   rod([a,bow(a)+side,h+.4],[a,bow(a)+side,h+1.5],.055,steel);
   rod([x-1.5,bow(x-1.5)+side,h+1.5],[x+1.5,bow(x+1.5)+side,h+1.5],.055,steel);
   rod([x-1.5,bow(x-1.5)+side,h+.95],[x+1.5,bow(x+1.5)+side,h+.95],.04,steel);
  }
 }
 for(const side of [-.8,3.4])rod([half,bow(half)+side,h+.4],[half,bow(half)+side,h+1.5],.055,steel);
 for(const x of [-38,-27,-16,-5,6,17,28,39]){
  const y=bow(x)+2.9;rod([x,y,h+.4],[x,y,h+3.5],.075,steel);rod([x,y,h+3.5],[x,y-1,h+3.5],.06,steel);box([.6,.6,.15],[x,y-1,h+3.45],light);
 }
 for(const x of [-31,33])section('control_house_'+x,()=>{
  const y=bow(x)+1.6;box([4.4,4.1,3.3],[x,y,h+1.9],concrete);box([4.9,4.6,.25],[x,y,h+3.65],edge);
  box([1.1,.08,2.2],[x,y-2.09,h+1.5],steel);
  for(const dx of [-1.45,1.45])box([.9,.1,1.1],[x+dx,y-2.09,h+2.25],dark);
  rod([x+.8,y,h+3.8],[x+.8,y,h+9],.055,steel);for(const z of [5,6.2,7.4])rod([x-.2,y,h+z],[x+1.8,y,h+z],.035,steel);
 });
 // Ladder, service platform, drain culverts and a small gantry.
 for(const x of [-10.3,-9.3])rod([x,-8.5,.8],[x,-5.4,h],.065,rust);
 for(let j=0;j<40;j++){const z=.8+j*.48;rod([-10.3,-8.5+z*3.1/h,z],[-9.3,-8.5+z*3.1/h,z],.055,steel);}
 box([5,2.8,.3],[-9.8,-7,9],edge);
 for(const x of [18,23])for(const y of [-2,1])box([.22,.22,3.5],[x,y,h+2.3],faded);
 box([6,.45,.5],[20.5,-.5,h+4.2],rust);rod([20.5,-.5,h+4],[20.5,-.5,h+2.5],.035,steel);
 box([2.5,1.4,.5],[20.5,-.5,h+2.25],steel);
 for(const [i,p] of DAM_OUTLETS.entries())section('penstock_'+i,()=>{
  box([4.7,3,5.7],[p.x,bow(p.x)-3.7,2.85],concrete);
  box([5.1,3.4,.3],[p.x,bow(p.x)-3.7,5.85],edge);
  const points=[[p.x,bow(p.x)-5.3,4.1],[p.x,-11,4.1],[p.x,-13,2.2],[p.x,-19.8,2.2]];
  for(let j=1;j<points.length;j++)rod(points[j-1],points[j],.85,rust,12);
  for(const p of points.slice(1,-1))shape(new T.SphereGeometry(.85,12,8),rust,p);
  for(const y of [-10.2,-15,-18.9]){
   shape(new T.TorusGeometry(.91,.12,5,16),steel,[p.x,y,y>-12?4.1:2.2],[Math.PI/2,0,0]);
   for(let k=0;k<8;k++){const a=k*Math.PI/4;box([.14,.16,.14],[p.x+Math.cos(a)*.96,y-.13,(y>-12?4.1:2.2)+Math.sin(a)*.96],faded);}
  }
  shape(new T.CircleGeometry(.76,16),dark,[p.x,-19.83,2.2],[Math.PI/2,0,0]);
  for(const y of [-14.5,-18])box([2.3,1.2,1.5],[p.x,y,.7],edge);
  box([4.6,8,.25],[p.x,-23,.03],edge);
  for(const side of [-2.3,2.3])box([.35,8,.75],[p.x+side,-23,.25],concrete);
 });
 finish();return root;
}
