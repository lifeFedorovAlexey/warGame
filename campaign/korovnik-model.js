import {mergeGeometries} from '../demo/vendor/utils/BufferGeometryUtils.js';

// Z up, nose +Y. Twin main rotors and reinforced landing gear, per owner request.
export function createKorovnik(T){
 const root=new T.Group();root.name='MU26_Korovnik';const materials=[];
 function mat(name,color,roughness=.82,metalness=.32,extra={}){const m=new T.MeshStandardMaterial({name,color,roughness,metalness,...extra});materials.push(m);return m;}
 const hull=mat('mu26_warm_grey','#797967'),light=mat('mu26_alloy','#a69a81'),shade=mat('mu26_engine_paint','#626859'),steel=mat('mu26_structural','#343a39',.69,.68),edge=mat('mu26_edges','#8b8b7e',.64,.63),rubber=mat('mu26_tyres','#242724',.96,.02),inside=mat('mu26_hold','#514c40',.97,.16),dark=mat('mu26_intakes','#181f1e',.92,.18),yellow=mat('mu26_ochre','#bf9444',.76,.35),red=mat('mu26_tip','#944c38',.86,.18),blade=mat('mu26_blade','#565c57',.72,.55),glass=mat('mu26_glass','#142c35',.22,.46,{side:T.DoubleSide,emissive:'#203a43',emissiveIntensity:.24}),lamp=mat('mu26_lights','#f1cb8b',.38,.1,{emissive:'#ffc772',emissiveIntensity:2});
 if(typeof document!=='undefined'){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const c=canvas.getContext('2d');c.fillStyle='#eeeade';c.fillRect(0,0,256,256);let seed=73;const rnd=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  for(let i=0;i<9500;i++){c.fillStyle=`rgba(54,47,34,${.025+rnd()*.04})`;c.fillRect(rnd()*256,rnd()*256,1+rnd()*3,1+rnd()*2);}
  c.strokeStyle='rgba(48,47,38,.3)';c.lineWidth=1.2;c.strokeRect(1,1,254,254);c.strokeStyle='rgba(255,247,218,.24)';c.strokeRect(3,3,250,250);
  for(let q=15;q<250;q+=32)for(const [x,y] of [[q,8],[q,248],[8,q],[248,q]]){c.fillStyle='rgba(38,39,34,.55)';c.beginPath();c.arc(x,y,1.45,0,Math.PI*2);c.fill();c.fillStyle='rgba(255,247,220,.6)';c.fillRect(x-.7,y-1,.8,.8);}
  for(let i=0;i<90;i++){const x=rnd()*256,y=rnd()>.5?rnd()*3:253-rnd()*3;c.fillStyle='rgba(75,60,44,.3)';c.fillRect(x,y,1+rnd()*9,.3+rnd()*1.2);}
  const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;tex.wrapS=tex.wrapT=T.RepeatWrapping;for(const m of [hull,light,shade,yellow,blade])m.map=tex;
 }
 // Muted painted camouflage and fine surface variation, without heavy rust.
 for(const material of [hull,shade]){
  material.onBeforeCompile=shader=>{
   shader.vertexShader='varying vec3 muLocal;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nmuLocal=position;');
   shader.fragmentShader='varying vec3 muLocal;float muHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}float muNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(muHash(i),muHash(i+vec3(1,0,0)),f.x),mix(muHash(i+vec3(0,1,0)),muHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(muHash(i+vec3(0,0,1)),muHash(i+vec3(1,0,1)),f.x),mix(muHash(i+vec3(0,1,1)),muHash(i+vec3(1,1,1)),f.x),f.y),f.z);}\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nfloat camo=smoothstep(.45,.59,muNoise(muLocal*.34)+.1*muNoise(muLocal*.9));diffuseColor.rgb*=mix(vec3(.6,.64,.6),vec3(1.1,1.05,.94),camo)*(.94+.09*muNoise(muLocal*14.));');
  };material.customProgramCacheKey=()=>'mu26-clean-camo-v1';
 }
 const batches=new Map(),fineDetails=new T.Group();fineDetails.name='mu26_near_details';root.add(fineDetails);
 function part(parent,g,m,p=[0,0,0],r=[0,0,0]){if(!g.getAttribute('uv'))g.setAttribute('uv',new T.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count*2),2));const mesh=new T.Mesh(g,m);mesh.position.set(...p);mesh.rotation.set(...r);mesh.updateMatrix();g.applyMatrix4(mesh.matrix);if(parent===root&&(m===edge||m===steel)){g.computeBoundingBox();const b=g.boundingBox;if(Math.max(b.max.x-b.min.x,b.max.y-b.min.y,b.max.z-b.min.z)<.65)parent=fineDetails;}let e=batches.get(parent);if(!e)batches.set(parent,e=new Map());if(!e.has(m))e.set(m,[]);e.get(m).push(g.index?g.toNonIndexed():g);if(g.index)g.dispose();}
 const box=(p,size,at,m=hull,r)=>part(p,new T.BoxGeometry(...size),m,at,r),cyl=(p,a,b,h,at,m=steel,r=[Math.PI/2,0,0],n=16)=>part(p,new T.CylinderGeometry(a,b,h,n),m,at,r);
 function beam(p,a,b,r=.07,m=steel){const u=new T.Vector3(...a),v=new T.Vector3(...b),g=new T.CylinderGeometry(r,r,u.distanceTo(v),8);g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),v.clone().sub(u).normalize()));part(p,g,m,u.add(v).multiplyScalar(.5).toArray());}
 function poly(p,points,m=hull,uv){const xyz=[],tex=[];for(let i=1;i<points.length-1;i++)for(const j of [0,i,i+1]){xyz.push(...points[j]);tex.push(...(uv?.[j]??[[0,0],[1,0],[1,1],[0,1]][j%4]));}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(xyz,3));g.setAttribute('uv',new T.Float32BufferAttribute(tex,2));g.computeVertexNormals();part(p,g,m);}
 function solidProfile(p,pts,thickness,m=hull){const shape=new T.Shape();shape.moveTo(...pts[0]);for(const point of pts.slice(1))shape.lineTo(...point);shape.closePath();const depth=Math.max(.04,thickness-.1),g=new T.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelThickness:.05,bevelSize:.09,bevelSegments:3,steps:1});g.translate(0,0,-depth/2);g.applyMatrix4(new T.Matrix4().makeBasis(new T.Vector3(0,1,0),new T.Vector3(0,0,1),new T.Vector3(1,0,0)));part(p,g,m);}
 function torus(p,r,t,at,m=steel,rotation=[0,0,0]){part(p,new T.TorusGeometry(r,t,6,24),m,at,rotation);}
 function ball(p,at,s,m=steel){const g=new T.SphereGeometry(1,12,8);g.scale(...s);part(p,g,m,at);}
 // Monotone cubic lofts retain the reference's changing sections without kinks.
 function sectionAt(rows,at){let i=0;while(i<rows.length-2&&at>rows[i+1][0])i++;const a=rows[i],b=rows[i+1],d=b[0]-a[0],t=Math.max(0,Math.min(1,(at-a[0])/d));
  const tangent=(j,k)=>{const left=j?((rows[j][k]-rows[j-1][k])/(rows[j][0]-rows[j-1][0])):((rows[1][k]-rows[0][k])/(rows[1][0]-rows[0][0])),right=j<rows.length-1?((rows[j+1][k]-rows[j][k])/(rows[j+1][0]-rows[j][0])):left;return left*right<=0?0:2*left*right/(left+right);};
  return a.map((v,k)=>k===0?at:(2*t*t*t-3*t*t+1)*v+(t*t*t-2*t*t+t)*d*tangent(i,k)+(-2*t*t*t+3*t*t)*b[k]+(t*t*t-t*t)*d*tangent(i+1,k));
 }
 const stations=[[-15,5.05,6.2,9.15],[-11.5,5.55,6.35,10],[-4,6.05,6.35,10.55],[4,5.8,6.35,10.25],[10,5,6.1,9.25],[13,4.25,5.9,8.7]];
 const section=y=>sectionAt(stations,y);
 function profile(y){const [,w,s,t]=section(y),shoulder=s+.65,a=[[-w*.8,2.05],[-w*.94,2.8],[-w,4.2]];for(let i=0;i<=18;i++){const q=(-90+i*10)*Math.PI/180;a.push([w*Math.sin(q),shoulder+(t-shoulder)*Math.cos(q)]);}a.push([w,4.2],[w*.94,2.8],[w*.8,2.05]);return a;}
 function skinWidth(y,z){const p=profile(y).filter(([x])=>x>=-1e-6).sort((a,b)=>a[1]-b[1]);let i=0;while(i<p.length-2&&z>p[i+1][1])i++;const a=p[i],b=p[i+1],t=(z-a[1])/(b[1]-a[1]||1);return a[0]+(b[0]-a[0])*Math.max(0,Math.min(1,t));}
 // Broad load-bearing sides and an uneven shoulder/spine, with real panel joints.
 const panelYs=[-15,-12,-8.8,-5.6,-2.4,.8,4,7.2,10.2,13];
 for(let j=0;j<panelYs.length-1;j++){
  const y=panelYs[j],yy=panelYs[j+1],a=profile(y),b=profile(yy);
  for(let k=0;k<a.length-1;k++)poly(root,[[b[k][0]*.975,yy,b[k][1]-.1],[b[k+1][0]*.975,yy,b[k+1][1]-.1],[a[k+1][0]*.975,y,a[k+1][1]-.1],[a[k][0]*.975,y,a[k][1]-.1]],inside);
  for(let k=0;k<a.length-1;k++)beam(root,[a[k][0]*1.001,y,a[k][1]+.008],[a[k+1][0]*1.001,y,a[k+1][1]+.008],.009,shade);
 }
 const hullPos=[],hullUv=[],hullIndices=[],hullColumns=profile(0).length,hullRows=57;
 for(let j=0;j<hullRows;j++){const y=-15+j*.5;for(const [k,p] of profile(y).entries()){hullPos.push(p[0],y,p[1]);hullUv.push(k/4,y/3);}if(j)for(let k=0;k<hullColumns-1;k++){const a=(j-1)*hullColumns+k,b=j*hullColumns+k;hullIndices.push(a,a+1,b+1,a,b+1,b);}}
 const hullGeometry=new T.BufferGeometry();hullGeometry.setAttribute('position',new T.Float32BufferAttribute(hullPos,3));hullGeometry.setAttribute('uv',new T.Float32BufferAttribute(hullUv,2));hullGeometry.setIndex(hullIndices);hullGeometry.computeVertexNormals();part(root,hullGeometry,hull);
 poly(root,profile(13).map(([x,z])=>[x,13,z]),hull);
 poly(root,profile(12.8).map(([x,z])=>[x,12.8,z]).reverse(),inside);
 for(const x of [-3,0,3])beam(root,[x,12.68,2.05],[x,12.68,7.2],.07,edge);
 box(root,[9.8,28,.45],[0,-1,1.76],steel);box(root,[9.5,28,.1],[0,-1,2],inside);
 for(const s of [-1,1]){for(let j=0;j<panelYs.length-1;j++){const y=(panelYs[j]+panelYs[j+1])/2,w=section(y)[1];box(root,[.16,panelYs[j+1]-panelYs[j]-.16,1.45],[s*(w+.055),y,3.45],hull);for(const dy of [-1,1])for(const z of [2.87,4.02])cyl(root,.045,.045,.08,[s*(w+.16),y+dy*(panelYs[j+1]-panelYs[j]-.36)/2,z],edge,[0,0,Math.PI/2],6);const a=panelYs[j],b=panelYs[j+1];beam(root,[s*(section(a)[1]+.12),a,2.5],[s*(section(b)[1]+.12),b,2.5],.085,steel);}for(const y of [-10,-3.5,3,9]){const x=s*(section(y)[1]+.2);beam(root,[x,y-.32,2.42],[x,y+.32,2.42],.06,yellow);}}
 for(let y=-14.8;y<12;y+=4.7){const a=profile(y);for(let j=0;j<a.length-1;j++)beam(root,[a[j][0]*.94,y,a[j][1]-.13],[a[j+1][0]*.94,y,a[j+1][1]-.13],.085,edge);}
 for(let y=-12;y<12;y+=4.8)box(root,[1.65,.24,.13],[0,y,section(y)[3]-.25],lamp);
 for(const s of [-1,1])for(let y=-13;y<12;y+=5){const x=s*(section(y)[1]-.32);box(root,[.2,.85,.16],[x,y,6.65],lamp);beam(root,[x,y,6.65],[x+s*.18,y,6.95],.045,steel);}
 for(const x of [-2.25,2.25])for(let y=-13;y<12;y+=5.2)box(root,[.08,4.3,.018],[x,y,2.06],yellow);
 // A few recessed access panels and cabin ports, instead of roof baggage.
 for(const s of [-1,1]){
  for(const y of [6.3,-5.6,-11.4]){
   const x=s*(section(y)[1]+.1);box(root,[.17,2.25,1.7],[x,y,5.05],shade);
   for(const yy of [y-1.12,y+1.12])beam(root,[x+s*.1,yy,4.2],[x+s*.1,yy,5.9],.035,edge);
   for(const z of [4.2,5.9])beam(root,[x+s*.1,y-1.12,z],[x+s*.1,y+1.12,z],.035,edge);
   for(const dy of [-.88,.88])for(const z of [4.38,5.72])cyl(root,.055,.055,.07,[x+s*.12,y+dy,z],steel,[0,0,Math.PI/2],8);
   beam(root,[x+s*.2,y-.3,4.9],[x+s*.2,y+.3,4.9],.055,steel);for(const z of [4.4,5.5])box(root,[.25,.35,.12],[x+s*.12,y-1.05,z],edge);
  }
  for(const y of [6.4,-4.7,-11.5]){const x=s*(section(y)[1]+.04);cyl(root,.38,.38,.09,[x,y,6.65],glass,[0,0,Math.PI/2],24);torus(root,.42,.065,[x+s*.07,y,6.65],edge,[0,Math.PI/2,0]);}
  for(let j=0;j<panelYs.length-1;j++){const a=panelYs[j],b=panelYs[j+1],x=y=>s*section(y)[1]*.974;poly(root,[[x(a),a,3.35],[x(a),a,3.57],[x(b),b,3.57],[x(b),b,3.35]],yellow);}
 }
 // Blunt wraparound Mi-26 flight deck. Windows are a steep upright belt,
 // not long panes laid over a pointed aeroplane nose.
 const cabinRings=[[1.9,2.6,3.9,15.7],[2.7,3.2,5.3,15.55],[4.15,3.8,6,15.4],[5.35,4.9,4.2,15.3],[7.35,4.35,3.45,15.15],[8.15,3.7,2.85,14.8],[8.65,2.3,1.65,14.2]];
 const angles=[-90,-60,-30,0,30,60,90];
 function cabinRing(r){const [z,w,d,y]=r;return [[-Math.min(4.85,w+1)*.86,12.75,z],...angles.map(a=>[Math.sin(a*Math.PI/180)*w*.86,y+Math.cos(a*Math.PI/180)*d,z]),[Math.min(4.85,w+1)*.86,12.75,z]];}
 const cabinPos=[],cabinUv=[],cabinIndices=[],cabinCount=cabinRing(cabinRings[0]).length;
 for(let j=0;j<cabinRings.length;j++)for(const [i,p] of cabinRing(cabinRings[j]).entries()){cabinPos.push(...p);cabinUv.push(i/2,j/2);}
 for(let j=0;j<cabinRings.length-1;j++){
  const a=cabinRing(cabinRings[j]),b=cabinRing(cabinRings[j+1]);
  for(let i=0;i<a.length-1;i++){
   const pane=j===3,pts=[a[i],b[i],b[i+1],a[i+1]],index=j*cabinCount+i;cabinIndices.push(index,index+cabinCount,index+cabinCount+1,index,index+cabinCount+1,index+1);
   if(pane||j===1&&i>=2&&i<=5){const centre=pts.reduce((c,p)=>c.map((v,k)=>v+p[k]/4),[0,0,0]),inset=!pane?.76:i===0||i===7?.68:i===1||i===6?.72:.88,glassPts=pts.map(p=>p.map((v,k)=>centre[k]+(v-centre[k])*inset+(k===1?.045:0)));poly(root,glassPts,glass);for(let k=0;k<4;k++)beam(root,glassPts[k],glassPts[(k+1)%4],.045,edge);if(pane&&i>1&&i<6){const p=glassPts[0],q=glassPts[1];beam(root,[p[0],p[1]+.045,p[2]+.12],[q[0]*.95,q[1]+.045,q[2]-.5],.025,steel);}}
  }
  if(j===1||j===3)for(let i=0;i<a.length-1;i++)beam(root,a[i],a[i+1],.012,shade);
 }
 const cabinGeometry=new T.BufferGeometry();cabinGeometry.setAttribute('position',new T.Float32BufferAttribute(cabinPos,3));cabinGeometry.setAttribute('uv',new T.Float32BufferAttribute(cabinUv,2));cabinGeometry.setIndex(cabinIndices);cabinGeometry.computeVertexNormals();part(root,cabinGeometry,hull);
 poly(root,[...cabinRing(cabinRings.at(-1))].reverse(),hull);
 cyl(root,.6,.6,.1,[0,21.39,3.8],shade,[0,0,0],24);box(root,[3.1,.52,.27],[0,20.45,1.98],edge);
 for(const s of [-1,1]){
  cyl(root,.36,.42,.46,[s*1.45,20.55,2.2],steel,[0,0,0]);cyl(root,.28,.28,.025,[s*1.45,20.79,2.2],lamp,[0,0,0]);
  const x=s*(section(9.9)[1]+.08);box(root,[.13,1.65,3],[x,9.9,4.7],shade);box(root,[.16,1.15,.9],[x+s*.07,9.9,5.65],glass);
  for(const yy of [9.04,10.76])beam(root,[x+s*.15,yy,3.15],[x+s*.15,yy,6.2],.045,edge);
  for(const z of [3.15,6.2])beam(root,[x+s*.15,9.04,z],[x+s*.15,10.76,z],.045,edge);
  for(const yy of [9.2,10.6])beam(root,[x+s*.4,yy,.75],[x+s*.4,yy,3.3],.065,yellow);
  for(let z=.85;z<3.3;z+=.44)beam(root,[x+s*.4,9.2,z],[x+s*.4,10.6,z],.07,yellow);
  beam(root,[x+s*.22,9.2,4.15],[x+s*.22,9.2,4.65],.055,yellow);
 }
 // Integrated power deck feeding the two tandem rotor transmissions.
 const engineSections=[[-6.5,2.5,9.8,11.65],[-3.6,3.4,9.8,12.8],[1.5,3.35,9.6,13.35],[5,3.35,9.2,12.9],[8,3.1,9.1,11.6]];
 const enginePos=[],engineUv=[],engineIndices=[],engineRows=30,engineColumns=33;
 function engineProfile(row){const a=[];for(let k=0;k<engineColumns;k++){const t=-Math.PI/2+k*Math.PI/(engineColumns-1);a.push([Math.sin(t)*row[1],row[0],row[2]+Math.max(0,Math.cos(t))**.65*(row[3]-row[2])]);}return a;}
 for(let j=0;j<engineRows;j++){const row=sectionAt(engineSections,-6.5+j*.5);for(const [k,p] of engineProfile(row).entries()){enginePos.push(...p);engineUv.push(k/8,row[0]/3);}if(j)for(let k=0;k<engineColumns-1;k++){const a=(j-1)*engineColumns+k,b=j*engineColumns+k;engineIndices.push(a,a+1,b+1,a,b+1,b);}}
 const engineGeometry=new T.BufferGeometry();engineGeometry.setAttribute('position',new T.Float32BufferAttribute(enginePos,3));engineGeometry.setAttribute('uv',new T.Float32BufferAttribute(engineUv,2));engineGeometry.setIndex(engineIndices);engineGeometry.computeVertexNormals();part(root,engineGeometry,hull);poly(root,engineProfile(engineSections.at(-1)),hull);
 for(const s of [-1,1]){
  const x=s*1.85,z=11.3;
  cyl(root,1.12,.97,6.4,[x,5.1,z],hull,[0,0,0],32);
  for(const y of [2.1,4.5,6.8,8.25])torus(root,1.055,.065,[x,y,z],edge,[Math.PI/2,0,0]);
  cyl(root,.89,.89,.035,[x,8.33,z],dark,[0,0,0],32);torus(root,.96,.11,[x,8.37,z],edge,[Math.PI/2,0,0]);
  cyl(root,.26,.26,.06,[x,8.37,z],steel,[0,0,0],16);
  for(let i=0;i<16;i++){const a=i*Math.PI/8;beam(root,[x+Math.sin(a)*.27,8.38,z+Math.cos(a)*.27],[x+Math.sin(a+.15)*.83,8.38,z+Math.cos(a+.15)*.83],.025,steel);}
  // Prominent framed intake grilles in the sides of the power deck.
  box(root,[.45,3.3,2.45],[s*3.12,.5,11.45],dark);
  for(const y of [-1.2,2.2])beam(root,[s*3.38,y,10.2],[s*3.38,y,12.7],.14,hull);
  for(const zz of [10.2,12.7])beam(root,[s*3.38,-1.2,zz],[s*3.38,2.2,zz],.14,hull);
  for(let y=-1.03;y<2.1;y+=.25)beam(root,[s*3.39,y,10.35],[s*3.39,y,12.55],.025,edge);
  for(let zz=10.4;zz<12.6;zz+=.25)beam(root,[s*3.4,-1.03,zz],[s*3.4,2.03,zz],.023,edge);
  cyl(root,.74,.92,1.75,[s*2.3,-5.1,11.3],steel,[.2,0,s*.1],24);
  cyl(root,.62,.62,.045,[s*2.3,-5.95,11.15],dark,[.2,0,s*.1],24);
 }
 const rotorSites=[{x:0,y:9.4,z:13.9},{x:0,y:-10.8,z:14.9}],rotors=[];
 // Blended gearbox fairings remain part of the curved aircraft skin.
 for(const [index,site] of rotorSites.entries()){
  const base=index?8.6:8.2,top=site.z-1.3,positions=[],uv=[],indices=[],rows=19,cols=33;
  const fairingSections=[[0,3.15,3.95],[.23,2.7,3.4],[.4,2.45,3],[.78,2.35,2.8],[.94,1.95,2.3],[1,1.28,1.55]];
  for(let j=0;j<rows;j++){
   const t=j/(rows-1),[,rx,ry]=sectionAt(fairingSections,t),z=base+(top-base)*t;
   for(let k=0;k<cols;k++){const a=k/(cols-1)*Math.PI*2;positions.push(site.x+Math.sin(a)*rx,site.y+Math.cos(a)*ry,z);uv.push(k/8,z/3);}
   if(j)for(let k=0;k<cols-1;k++){const a=(j-1)*cols+k,b=j*cols+k;indices.push(a,b,b+1,a,b+1,a+1);}
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();part(root,g,hull);
  cyl(root,1.16,1.22,.18,[site.x,site.y,top],hull);
  cyl(root,.68,.82,1.1,[site.x,site.y,site.z-.65],steel);torus(root,.92,.14,[site.x,site.y,site.z-.55],edge);
  for(let i=0;i<8;i++){const a=i*Math.PI/4;beam(root,[site.x+Math.sin(a)*1.25,site.y+Math.cos(a)*1.25,top-.15],[site.x+Math.sin(a)*.6,site.y+Math.cos(a)*.6,site.z-.2],.09,edge);}
 const r=new T.Group();r.name=index?'main_rotor_aft':'main_rotor_forward';r.position.set(site.x,site.y,site.z);root.add(r);rotors.push(r);
 cyl(r,.95,1.15,.4,[0,0,-.12],steel);torus(r,1,.13,[0,0,.05],edge);cyl(r,.62,.9,.38,[0,0,.27],shade);
 for(let i=0;i<8;i++){
  const arm=new T.Group();arm.rotation.z=i*Math.PI/4;r.add(arm);
  box(arm,[1.4,.56,.38],[1.35,0,.04],steel);cyl(arm,.24,.24,.8,[1.7,0,.03],edge,[Math.PI/2,0,0],12);
  for(const s of [-1,1]){beam(arm,[.45,s*.38,-.2],[2.6,s*.38,.15],.09,edge);ball(arm,[2.6,s*.38,.15],[.18,.18,.18],steel);}
  beam(arm,[.6,.4,.26],[2.3,.6,.3],.08,steel);cyl(arm,.16,.16,.6,[2.3,0,.15],shade);
  const span=[[2,.38,0,.04],[2.8,.82,-.05,.22],[5.7,1.14,-.14,.4],[10.3,1.3,-.28,.32],[12.7,.94,-.48,.02],[13.2,.72,-.55,-.12]];
  for(let j=0;j<span.length-1;j++){
   const a=span[j],b=span[j+1],p=[[a[0],a[2]-a[1]/2,a[3]],[b[0],b[2]-b[1]/2,b[3]],[b[0],b[2]+b[1]/2,b[3]],[a[0],a[2]+a[1]/2,a[3]]];
   poly(arm,p,j===span.length-2?red:blade);poly(arm,p.map(v=>[v[0],v[1],v[2]-.13]).reverse(),blade);
   for(const side of [-1,1])poly(arm,[[a[0],a[2]+side*a[1]/2,a[3]],[a[0],a[2]+side*a[1]/2,a[3]-.13],[b[0],b[2]+side*b[1]/2,b[3]-.13],[b[0],b[2]+side*b[1]/2,b[3]]],edge);
  }
  poly(arm,[[12.1,-.96,.08],[12.45,-.97,.04],[12.45,.02,.04],[12.1,.06,.08]],light);
 }
 }
 // Raised, profiled boom and a thick swept fin keep the loading portal clear.
 const tailSections=[[-30,11.05,.55,.5],[-26,10.65,1,.7],[-22,10.3,1.65,.96],[-18,9.9,2.4,1.2],[-13.5,8.95,3.35,1.7],[-9,8.15,4.5,2]],tailPos=[],tailUv=[],tailIndices=[],tailRows=43,tailColumns=32;
 for(let j=0;j<tailRows;j++){const row=sectionAt(tailSections,-30+j*.5);for(let k=0;k<=tailColumns;k++){const a=k/tailColumns*Math.PI*2;tailPos.push(Math.sin(a)*row[2],row[0],row[1]+Math.cos(a)*row[3]);tailUv.push(k/8,row[0]/3);}if(j)for(let k=0;k<tailColumns;k++){if(row[0]>-16.5&&Math.cos((k+.5)/tailColumns*Math.PI*2)<0)continue;const a=(j-1)*(tailColumns+1)+k,b=j*(tailColumns+1)+k;tailIndices.push(a,a+1,b+1,a,b+1,b);}}
 const tailGeometry=new T.BufferGeometry();tailGeometry.setAttribute('position',new T.Float32BufferAttribute(tailPos,3));tailGeometry.setAttribute('uv',new T.Float32BufferAttribute(tailUv,2));tailGeometry.setIndex(tailIndices);tailGeometry.computeVertexNormals();part(root,tailGeometry,hull);
 solidProfile(root,[[-26,10.55],[-30.45,10.9],[-31.3,15.2],[-29.65,15.4],[-27.2,11.8]],.44,hull);for(const s of [-1,1])poly(root,[[0,-23.8,11.1],[s*3.5,-25.1,11],[s*3.3,-26.1,11.05],[0,-25.1,11.2]][s>0?'reverse':'slice'](),shade);
 const tailAxis=new T.Group();tailAxis.position.set(.57,-29,14.8);tailAxis.rotation.y=Math.PI/2;root.add(tailAxis);beam(root,[0,-30,14.8],[.57,-29,14.8],.18,steel);const tail=new T.Group();tail.name='tail_rotor';tailAxis.add(tail);cyl(tail,.31,.37,.42,[0,0,0],steel);for(let i=0;i<5;i++){const a=new T.Group();a.rotation.z=i*Math.PI*2/5;tail.add(a);box(a,[.45,2.6,.11],[0,1.55,0],blade,[0,0,.07]);box(a,[.48,.44,.12],[-.1,2.7,.015],red);beam(a,[.13,0,0],[.12,.8,.1],.065,edge);}
 const landingGear=[];
 function wheel(x,y,r,width){landingGear.push({x,y,r,width});cyl(root,r,r,width,[x,y,r],rubber,[0,0,Math.PI/2],24);for(const s of [-1,1]){torus(root,r*.76,r*.105,[x+s*width/2,y,r],rubber,[0,Math.PI/2,0]);cyl(root,r*.48,r*.48,.035,[x+s*(width/2+.025),y,r],light,[0,0,Math.PI/2],16);cyl(root,r*.22,r*.22,.07,[x+s*(width/2+.05),y,r],steel,[0,0,Math.PI/2],12);for(let i=0;i<6;i++){const a=i*Math.PI/3;cyl(root,.045,.045,.05,[x+s*(width/2+.06),y+Math.sin(a)*r*.32,r+Math.cos(a)*r*.32],edge,[0,0,Math.PI/2],6);}}}
 for(const s of [-1,1]){
  // Six wheels per main bogie; the central pair spreads the loaded hold's mass.
  box(root,[.42,5.95,.38],[s*5.7,-8.4,1.55],steel);
  for(const y of [-11,-8.4,-5.8]){beam(root,[s*4.6,y-.6,3.1],[s*6,y,1.35],.22,steel);beam(root,[s*4.7,y+.7,2.8],[s*6,y,1.35],.15,edge);cyl(root,.16,.16,1.65,[s*5.2,y,2.35],edge,[0,0,-s*.5]);wheel(s*6,y,1.23,.72);wheel(s*6.76,y,1.23,.72);}
  box(root,[1.2,6.7,.22],[s*5.25,-8.4,3],shade);
  for(const x of [5.8,6.48])wheel(s*x,3.2,1.06,.64);
  beam(root,[s*4.8,2.7,3],[s*6,3.2,1.15],.2,steel);beam(root,[s*4.8,4,2.8],[s*6,3.2,1.15],.14,edge);cyl(root,.14,.14,1.55,[s*5.25,3.2,2.15],edge,[0,0,-s*.5]);
 }
 box(root,[.35,2.7,.26],[0,15.4,1.1],steel);
 for(const y of [14.3,16.5]){beam(root,[0,y+.2,2.5],[0,y,1],.22,steel);beam(root,[0,y-1,2.1],[0,y,1],.13,edge);wheel(-.56,y,.92,.54);wheel(.56,y,.92,.54);}
 // Clamshell upper shoulders match the fuselage; the independent ramp is plated.
 const doors=[];
 for(const s of [-1,1]){
  const d=new T.Group();d.name=s<0?'cargo_door_left':'cargo_door_right';d.position.set(s*5.05,-15.08,2.05);root.add(d);doors.push({root:d,side:s});
  const rows=19,cols=13,height=section(-15)[3]-2.05,positions=[],uv=[],indices=[];
  const doorPoint=(f,z)=>[s*f*skinWidth(-15,z+2.05)-s*5.05,-.12-1.45*(1-f*f)*Math.max(0,Math.sin(Math.PI*z/height))**.6,z];
  for(let j=0;j<rows;j++){const z=j*height/(rows-1);for(let k=0;k<cols;k++){positions.push(...doorPoint(k/(cols-1),z));uv.push(k/(cols-1)*2,z/3);}if(j)for(let k=0;k<cols-1;k++){const a=(j-1)*cols+k,b=j*cols+k;const face=[a,b,b+1,a,b+1,a+1];if(s>0)for(let q=0;q<face.length;q+=3)[face[q+1],face[q+2]]=[face[q+2],face[q+1]];indices.push(...face);}}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();const liner=g.clone();liner.translate(0,.16,0);const reverse=indices.slice();for(let i=0;i<reverse.length;i+=3)[reverse[i+1],reverse[i+2]]=[reverse[i+2],reverse[i+1]];liner.setIndex(reverse);liner.computeVertexNormals();part(d,g,hull);part(d,liner,inside);
  for(const f of [0,1])for(let j=0;j<rows-1;j++)beam(d,doorPoint(f,j*height/(rows-1)),doorPoint(f,(j+1)*height/(rows-1)),.055,edge);
  for(const z of [1.4,3.65])for(let k=0;k<cols-1;k++){const a=doorPoint(k/(cols-1),z),b=doorPoint((k+1)/(cols-1),z);a[1]+=.22;b[1]+=.22;beam(d,a,b,.065,steel);}
 }
 const ramp=new T.Group();ramp.name='cargo_ramp';ramp.position.set(0,-15.1,1.95);root.add(ramp);box(ramp,[10.1,7.4,.26],[0,-3.7,0],steel);for(const x of [-2.5,2.5])for(let j=0;j<3;j++)box(ramp,[4.7,2.35,.06],[x,-1.24-j*2.45,.16],j%2?hull:shade);for(const x of [-4.85,4.85]){box(ramp,[.22,7.4,.28],[x,-3.7,.2],edge);for(let y=-.4;y>-7.3;y-=1)box(ramp,[.55,.4,.035],[x*.89,y,.21],yellow,[0,0,.35]);}for(let y=-.5;y>-7.3;y-=.7)box(ramp,[9.4,.045,.035],[0,y,.22],edge);for(const x of [-2.25,2.25])box(ramp,[.25,7.3,.025],[x,-3.7,.235],yellow);
 function decal(canvas,name){const map=new T.CanvasTexture(canvas);map.flipY=true;map.colorSpace=T.SRGBColorSpace;return mat(name,'#ffffff',1,0,{map,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,side:T.DoubleSide});}
 if(typeof document!=='undefined'){
  const hullX=skinWidth;
  function sideMark(material,cy,cz,width,height){for(const s of [-1,1]){const points=[],uv=[],indices=[],n=18,rows=4;for(let i=0;i<=n;i++){const y=cy-width/2+i*width/n;for(let k=0;k<=rows;k++){const z=cz-height/2+k*height/rows;points.push(s*(hullX(y,z)+.045),y,z);uv.push(s>0?i/n:1-i/n,k/rows);}}for(let i=0;i<n;i++)for(let k=0;k<rows;k++){const j=i*(rows+1)+k;indices.push(j,j+rows+1,j+rows+2,j,j+rows+2,j+1);}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(points,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();root.add(new T.Mesh(g,material));}}
  const label=document.createElement('canvas');label.width=1024;label.height=256;const c=label.getContext('2d');c.textAlign='center';c.fillStyle='#e0d6b9';c.font='bold 160px Arial';c.fillText('РАЙ',512,155);c.font='bold 40px Arial';c.fillText('МУ-26  КОРОВНИК',512,220);const lm=decal(label,'mu26_hull_stencil');sideMark(lm,-.4,6.5,8.2,2.9);
  const badge=document.createElement('canvas');badge.width=badge.height=512;const d=badge.getContext('2d');d.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?75:178,x=256+Math.cos(a)*r,y=225+Math.sin(a)*r;i?d.lineTo(x,y):d.moveTo(x,y);}d.closePath();d.fillStyle='#9c4c3c';d.fill();d.strokeStyle='#dacead';d.lineWidth=10;d.stroke();d.fillStyle='#dacead';d.font='bold 70px Arial';d.textAlign='center';d.fillText('26',256,477);const bm=decal(badge,'mu26_badge');sideMark(bm,-8.1,6.7,3.3,3.2);
  const number=document.createElement('canvas');number.width=number.height=256;const nc=number.getContext('2d');nc.fillStyle='#e0d6b9';nc.font='bold 190px Arial';nc.textAlign='center';nc.fillText('26',128,205);sideMark(decal(number,'mu26_number'),12,4.9,2,1.9);
  for(const s of [-1,1]){const mesh=new T.Mesh(new T.PlaneGeometry(1.4,1.9),bm);mesh.position.set(s*.23,-29.9,12.6);mesh.rotation.set(Math.PI/2,s*Math.PI/2,0);root.add(mesh);}
 }
 for(const [parent,entries] of batches)for(const [m,parts] of entries){const g=mergeGeometries(parts,false);parts.forEach(p=>p.dispose());const mesh=new T.Mesh(g,m);mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);}
 function pose({door=0,rotor=0}={}){for(const [i,r] of rotors.entries())r.rotation.z=(i?-1:1)*rotor+i*Math.PI/8;tail.rotation.z=rotor*1.65;for(const d of doors)d.root.rotation.z=-d.side*door*Math.PI*.56;ramp.rotation.x=(1-door)*-Math.PI/2+door*.255;}
 root.userData.korovnik={mainRotors:rotors.length,wheels:landingGear.length,cargoCapacity:10};
 pose();return {root,materials,rotors,doors,ramp,landingGear,pose,setDetail:near=>{fineDetails.visible=near;}};
}
