// B01 shell. Source: the user's olive SGR side and front-quarter photographs.
// All coordinates are metres in the independent body module's local space.
export function buildBukhanka(T, body, m, h) {
 const {box,mesh,rod,cylinder,line,rounded,lod=0}=h;
 const {olive,edge,dark,rubber,steel,glass,lampMat,redMat}=m;
 const glassOffset=[.006,.011,.022][lod],sealOffset=glassOffset+.003;
 body.userData.rearDoorLowerZ=.08;body.userData.glassOffsetMm=glassOffset*1000;body.userData.sealOffsetMm=sealOffset*1000;
 function conformGlassTriangles(triangles){
  const bins=new Map(),points=new Map(),cell=.07,key=p=>Math.round(p[0]*1e7)+','+Math.round(p[1]*1e7);
  for(let i=0;i<triangles.length;i+=3){const p=[triangles[i],triangles[i+1]],id=key(p);if(points.has(id))continue;points.set(id,p);const bucket=Math.floor(p[0]/cell)+','+Math.floor(p[1]/cell);if(!bins.has(bucket))bins.set(bucket,[]);bins.get(bucket).push(p);}
  const result=[];
  for(let i=0;i<triangles.length;i+=9){const tri=[[triangles[i],triangles[i+1]],[triangles[i+3],triangles[i+4]],[triangles[i+6],triangles[i+7]]],boundary=[];let split=false;
   for(let edge=0;edge<3;edge++){const a=tri[edge],b=tri[(edge+1)%3],dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy,inside=[];boundary.push(a);for(let by=Math.floor(Math.min(a[1],b[1])/cell);by<=Math.floor(Math.max(a[1],b[1])/cell);by++)for(let bx=Math.floor(Math.min(a[0],b[0])/cell);bx<=Math.floor(Math.max(a[0],b[0])/cell);bx++)for(const p of bins.get(bx+','+by)??[]){const t=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(length||1);if(t>1e-5&&t<1-1e-5&&Math.abs((p[0]-a[0])*dy-(p[1]-a[1])*dx)<1e-7*Math.sqrt(length))inside.push({p,t});}inside.sort((p,q)=>p.t-q.t);for(const p of inside)boundary.push(p.p);split||=inside.length>0;}
   if(!split){result.push(...triangles.slice(i,i+9));continue;}const center=[tri.reduce((sum,p)=>sum+p[0],0)/3,tri.reduce((sum,p)=>sum+p[1],0)/3];for(let j=0;j<boundary.length;j++)for(const p of [center,boundary[j],boundary[(j+1)%boundary.length]])result.push(p[0],p[1],0);
  }return result;
 }
 const surfaceMaterials=new Map();const surfaceMaterial=mat=>{if(!surfaceMaterials.has(mat)){const copy=mat.clone();copy.side=T.FrontSide;surfaceMaterials.set(mat,copy);}return surfaceMaterials.get(mat);};
 const smooth=(points,r=.045)=>{const s=new T.Shape();for(let i=0;i<points.length;i++){const a=new T.Vector2(...points[(i+points.length-1)%points.length]),b=new T.Vector2(...points[i]),c=new T.Vector2(...points[(i+1)%points.length]);const p=b.clone().add(a.sub(b).normalize().multiplyScalar(r)),q=b.clone().add(c.sub(b).normalize().multiplyScalar(r));if(!i)s.moveTo(p.x,p.y);else s.lineTo(p.x,p.y);s.quadraticCurveTo(b.x,b.y,q.x,q.y);}s.closePath();return s;};
 function denseShape(points,r,holeInset=0,curvature=null){if(holeInset)return frameGeometry(points,r,holeInset);const shape=smooth(points,r);if(holeInset)shape.holes.push(smooth(inset(points,holeInset),Math.max(.005,r-holeInset)));const src=new T.ShapeGeometry(shape,[8,5,3][lod]);const flat=src.index?src.toNonIndexed():src;const a=flat.attributes.position.array,out=[];const dist=(p,q)=>(p[0]-q[0])**2+(p[1]-q[1])**2;function split(p,q,r,depth=0){const lens=[dist(p,q),dist(q,r),dist(r,p)];const max=Math.max(...lens);const curvedError=curvature?Math.max(...[[p,q],[q,r],[r,p]].map(([a,b])=>Math.abs(curvature((a[0]+b[0])/2,(a[1]+b[1])/2)-(curvature(...a)+curvature(...b))/2)),Math.abs(curvature((p[0]+q[0]+r[0])/3,(p[1]+q[1]+r[1])/3)-(curvature(...p)+curvature(...q)+curvature(...r))/3)):0;if((max<[.14,.22,.35][lod]**2&&curvedError<[.001,.003,.008][lod])||depth>12){out.push(p[0],p[1],0,q[0],q[1],0,r[0],r[1],0);return;}if(lens[0]===max){const m=[(p[0]+q[0])/2,(p[1]+q[1])/2];split(p,m,r,depth+1);split(m,q,r,depth+1);}else if(lens[1]===max){const m=[(q[0]+r[0])/2,(q[1]+r[1])/2];split(p,q,m,depth+1);split(p,m,r,depth+1);}else{const m=[(r[0]+p[0])/2,(r[1]+p[1])/2];split(p,q,m,depth+1);split(m,q,r,depth+1);}}for(let i=0;i<a.length;i+=9)split([a[i],a[i+1]],[a[i+3],a[i+4]],[a[i+6],a[i+7]]);const vertices=curvature?conformGlassTriangles(out):out;const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new T.Float32BufferAttribute(vertices.flatMap((v,i)=>i%3===2?[]:[v]),2));src.dispose();if(flat!==src)flat.dispose();return g;}
 function frameGeometry(points,r,d){const inner=inset(points,d),outerCorners=[],innerCorners=[];function cornerAt(poly,i,radius){const a=new T.Vector2(...poly[(i+poly.length-1)%poly.length]),b=new T.Vector2(...poly[i]),c=new T.Vector2(...poly[(i+1)%poly.length]);return [b.clone().add(a.sub(b).normalize().multiplyScalar(radius)),b,b.clone().add(c.sub(b).normalize().multiplyScalar(radius))];}for(let i=0;i<points.length;i++){outerCorners.push(cornerAt(points,i,r));innerCorners.push(cornerAt(inner,i,Math.max(.004,r-d)));}const out=[],inside=[];const curvePoint=(c,t)=>c[0].clone().multiplyScalar((1-t)**2).addScaledVector(c[1],2*t*(1-t)).addScaledVector(c[2],t*t);for(let i=0;i<points.length;i++){const a=outerCorners[i],b=innerCorners[i],next=outerCorners[(i+1)%points.length],nextInner=innerCorners[(i+1)%points.length];const count=[5,3,2][lod];for(let j=0;j<count;j++){out.push(curvePoint(a,j/count));inside.push(curvePoint(b,j/count));}const steps=Math.max(1,Math.ceil(a[2].distanceTo(next[0])/[.10,.15,.20][lod]));for(let j=0;j<steps;j++){out.push(a[2].clone().lerp(next[0],j/steps));inside.push(b[2].clone().lerp(nextInner[0],j/steps));}}const vertices=[];for(let i=0;i<out.length;i++){const j=(i+1)%out.length;for(const v of [out[i],out[j],inside[i],out[j],inside[j],inside[i]])vertices.push(v.x,v.y,0);}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new T.Float32BufferAttribute(vertices.flatMap((v,i)=>i%3===2?[]:[v]),2));g.userData.gasketLoops=[out.map(v=>[v.x,v.y]),inside.map(v=>[v.x,v.y])];return g;}
 const sections=[[0,.94,2.00,-2.00],[.12,.953,2.065,-2.02],[.36,.97,2.13,-2.03],[.60,.975,2.15,-2.03],[.84,.963,2.105,-2.02],[.98,.951,1.98,-2.01],[1.15,.929,1.88,-1.99],[1.31,.886,1.77,-1.95],[1.41,.79,1.61,-1.85],[1.47,.62,1.46,-1.68]];
 function section(z){z=T.MathUtils.clamp(z,0,1.47);let n=1;while(n<sections.length-1&&z>sections[n][0])n++;const a=sections[n-1],b=sections[n],t=(z-a[0])/(b[0]-a[0]);return [T.MathUtils.lerp(a[1],b[1],t),T.MathUtils.lerp(a[2],b[2],t),T.MathUtils.lerp(a[3],b[3],t)];}
 const corner=.19;
 function sideWidth(y,z){const [w,f,b]=section(z);if(y>f-corner)return w-corner+Math.sqrt(Math.max(0,corner**2-(y-f+corner)**2));if(y<b+corner)return w-corner+Math.sqrt(Math.max(0,corner**2-(y-b-corner)**2));return w;}
 function sidePoint(sign,y,z,offset=.006){return [sign*(sideWidth(y,z)+offset),y,z];}
 const seamMaterial=new T.MeshStandardMaterial({name:'door_seal',color:'#293127',metalness:.05,roughness:.85,side:T.DoubleSide});
 function closeGasket(geometry,map,offset,parity){
  const loops=geometry.userData.gasketLoops;if(!loops)return geometry;const walls=[];
  loops.forEach((loop,inner)=>{for(let i=0;i<loop.length;i++){const a=loop[i],b=loop[(i+1)%loop.length],ta=map(a[0],a[1],offset),tb=map(b[0],b[1],offset),ba=map(a[0],a[1],-.001),bb=map(b[0],b[1],-.001);const triangle=inner?[ta,tb,ba,tb,bb,ba]:[ta,ba,tb,tb,ba,bb];if(parity<0)for(let j=0;j<triangle.length;j+=3)[triangle[j+1],triangle[j+2]]=[triangle[j+2],triangle[j+1]];for(const p of triangle)walls.push(...p);}});
  const wall=new T.BufferGeometry();wall.setAttribute('position',new T.Float32BufferAttribute(walls,3));wall.computeVertexNormals();const top=geometry.index?geometry.toNonIndexed():geometry,result=new T.BufferGeometry();
  for(const name of ['position','normal','uv']){const first=top.getAttribute(name),last=wall.getAttribute(name),size=name==='uv'?2:3,data=new Float32Array((first.count+walls.length/3)*size);data.set(first.array);if(last)data.set(last.array,first.array.length);result.setAttribute(name,new T.BufferAttribute(data,size));}
  if(top!==geometry)top.dispose();geometry.dispose();wall.dispose();return result;
 }
 function seam(points,map){if(lod===2)return;const vertices=[],halfWidth=.0035;for(let n=0;n<points.length-1;n++){const a=points[n],b=points[n+1],length=Math.hypot(b[0]-a[0],b[1]-a[1]),steps=Math.max(1,Math.ceil(length/[.045,.09][lod])),dx=-(b[1]-a[1])/length*halfWidth,dy=(b[0]-a[0])/length*halfWidth;for(let i=0;i<steps;i++){const p=[T.MathUtils.lerp(a[0],b[0],i/steps),T.MathUtils.lerp(a[1],b[1],i/steps)],q=[T.MathUtils.lerp(a[0],b[0],(i+1)/steps),T.MathUtils.lerp(a[1],b[1],(i+1)/steps)];const ap=map(p[0]+dx,p[1]+dy),am=map(p[0]-dx,p[1]-dy),bp=map(q[0]+dx,q[1]+dy),bm=map(q[0]-dx,q[1]-dy);vertices.push(...am,...ap,...bm,...bm,...ap,...bp);}}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.computeVertexNormals();mesh(body,g,seamMaterial);}
 function reverseWinding(geo){const count=geo.attributes.position.count;geo.setIndex(Array.from({length:count/3},(_,i)=>[i*3,i*3+2,i*3+1]).flat());}
 function side(points,x,mat,r=.045){const center=points.reduce((a,p)=>[a[0]+p[0]/points.length,a[1]+p[1]/points.length],[0,0]);const geo=denseShape(points,r,mat===rubber?.035:0,mat===glass?sideWidth:null);const pos=geo.attributes.position,norm=[];const sign=Math.sign(x),offset=mat===rubber?sealOffset:mat===glass?glassOffset:Math.abs(x)-.97+.012;for(let i=0;i<pos.count;i++){const y=pos.getX(i),z=pos.getY(i);pos.setXYZ(i,sign*(sideWidth(y,z)+offset),y,z);const dy=(sideWidth(y+.025,z)-sideWidth(y-.025,z))/.05,dz=(sideWidth(y,z+.025)-sideWidth(y,z-.025))/.05;const normalY=mat===glass?(sideWidth(center[0]+.025,center[1])-sideWidth(center[0]-.025,center[1]))/.05:dy,normalZ=mat===glass?(sideWidth(center[0],center[1]+.025)-sideWidth(center[0],center[1]-.025))/.05:dz;const n=new T.Vector3(sign,-normalY,-normalZ).normalize();norm.push(n.x,n.y,n.z);}geo.setAttribute('normal',new T.Float32BufferAttribute(norm,3));if(sign<0)reverseWinding(geo);const closed=mat===rubber?closeGasket(geo,(u,v,o)=>[sign*(sideWidth(u,v)+o),u,v],offset,sign):geo;return mesh(body,closed,surfaceMaterial(mat));}
 const noseY=(x,z)=>{const [w,f]=section(z);const d=Math.max(0,Math.abs(x)-(w-corner));return d?f-corner+Math.sqrt(Math.max(0,corner**2-d*d)):f;};
 const windY=(x,z)=>noseY(x,z);
 function inset(points,d){return points.map((b,i)=>{const a=points[(i+points.length-1)%points.length],c=points[(i+1)%points.length];const e1=new T.Vector2(b[0]-a[0],b[1]-a[1]).normalize(),e2=new T.Vector2(c[0]-b[0],c[1]-b[1]).normalize();const p=new T.Vector2(b[0]-e1.y*d,b[1]+e1.x*d),q=new T.Vector2(b[0]-e2.y*d,b[1]+e2.x*d);const det=e1.x*e2.y-e1.y*e2.x;const t=((q.x-p.x)*e2.y-(q.y-p.y)*e2.x)/det;return [p.x+t*e1.x,p.y+t*e1.y];});}
 function curvedFace(points,mat,offset=0,r=.045,wind=false){const surface=wind?windY:noseY;const center=points.reduce((a,p)=>[a[0]+p[0]/points.length,a[1]+p[1]/points.length],[0,0]);const geo=denseShape(points,r,wind&&mat===rubber?.035:0,mat===glass?surface:null);const pos=geo.attributes.position,norm=[],f=surface;const depth=wind?(mat===rubber?sealOffset:glassOffset):offset+.012;for(let i=0;i<pos.count;i++){const x=pos.getX(i),z=pos.getY(i);pos.setXYZ(i,x,f(x,z)+depth,z);const dx=(f(x+.025,z)-f(x-.025,z))/.05,dz=(f(x,z+.025)-f(x,z-.025))/.05;const nx=mat===glass?(f(center[0]+.025,center[1])-f(center[0]-.025,center[1]))/.05:dx,nz=mat===glass?(f(center[0],center[1]+.025)-f(center[0],center[1]-.025))/.05:dz;const n=new T.Vector3(-nx,1,-nz).normalize();norm.push(n.x,n.y,n.z);}geo.setAttribute('normal',new T.Float32BufferAttribute(norm,3));reverseWinding(geo);const closed=wind&&mat===rubber?closeGasket(geo,(u,v,o)=>[u,f(u,v)+o,v],depth,-1):geo;return mesh(body,closed,surfaceMaterial(mat));}
 function rearY(x,z){const [w,,b]=section(z),d=Math.max(0,Math.abs(x)-(w-corner));return d?b+corner-Math.sqrt(Math.max(0,corner**2-d*d)):b;}
 function rearFace(points,mat,offset,r){const center=points.reduce((a,p)=>[a[0]+p[0]/points.length,a[1]+p[1]/points.length],[0,0]);const geo=denseShape(points,r,mat===rubber?.035:0,mat===glass?rearY:null);offset=mat===rubber?sealOffset:mat===glass?glassOffset:offset;const pos=geo.attributes.position,norm=[];for(let i=0;i<pos.count;i++){const x=pos.getX(i),z=pos.getY(i);pos.setXYZ(i,x,rearY(x,z)-offset,z);const dx=(rearY(x+.025,z)-rearY(x-.025,z))/.05,dz=(rearY(x,z+.025)-rearY(x,z-.025))/.05;const nx=mat===glass?(rearY(center[0]+.025,center[1])-rearY(center[0]-.025,center[1]))/.05:dx,nz=mat===glass?(rearY(center[0],center[1]+.025)-rearY(center[0],center[1]-.025))/.05:dz;const n=new T.Vector3(nx,-1,nz).normalize();norm.push(n.x,n.y,n.z);}geo.setAttribute('normal',new T.Float32BufferAttribute(norm,3));const closed=mat===rubber?closeGasket(geo,(u,v,o)=>[u,rearY(u,v)-o,v],offset,1):geo;return mesh(body,closed,surfaceMaterial(mat));}
 function front(points,y,mat,r=.045){return curvedFace(points,mat,y-2.05,r);}
 // Pressed shell, rounded roof and sloping windscreen. Narrow metal seams, no stacked bus boxes.
 const vertices=[],indices=[];const baseRings=[16,8,1][lod];const heights=[...new Set([...sections.map(s=>s[0]),...Array.from({length:baseRings+1},(_,i)=>i/baseRings*1.47)])].sort((a,b)=>a-b);const ringCount=heights.length-1,perCorner=[8,5,3][lod],ringSize=4*(perCorner+1);
 for(let row=0;row<=ringCount;row++){const z=heights[row],[w,f,b]=section(z);for(const [cx,cy,start] of [[w-corner,f-corner,0],[-w+corner,f-corner,Math.PI/2],[-w+corner,b+corner,Math.PI],[w-corner,b+corner,Math.PI*1.5]])for(let j=0;j<=perCorner;j++){const angle=start+j/perCorner*Math.PI/2;vertices.push(cx+Math.cos(angle)*corner,cy+Math.sin(angle)*corner,z);}}
 for(let row=0;row<ringCount;row++)for(let j=0;j<ringSize;j++){const a=row*ringSize+j,b=row*ringSize+(j+1)%ringSize,c=(row+1)*ringSize+j,d=(row+1)*ringSize+(j+1)%ringSize;indices.push(a,b,c,b,d,c);}
 const topCenter=vertices.length/3;vertices.push(0,(sections.at(-1)[2]+sections.at(-1)[3])/2,1.49);for(let j=0;j<ringSize;j++)indices.push(topCenter,ringCount*ringSize+j,ringCount*ringSize+(j+1)%ringSize);
 const shell=new T.BufferGeometry();shell.setAttribute('position',new T.Float32BufferAttribute(vertices,3));shell.setAttribute('uv',new T.Float32BufferAttribute(vertices.flatMap((v,i)=>i%3===2?[]:[v]),2));shell.setIndex(indices);shell.computeVertexNormals();mesh(body,shell,olive,[0,0,0],'B01_rounded_steel_shell');
 // Split, rounded windscreen; plane follows the front slope.
 for(const sx of [-1,1]){
  const center=sx*.43;
  curvedFace([[center-.403,.97],[center+.403,.97],[center+.403,1.31],[center-.403,1.31]],rubber,.006,.045,true);
  curvedFace([[center-.367,1.006],[center+.367,1.006],[center+.367,1.274],[center-.367,1.274]],glass,.014,.025,true);
  rod(body,[center-.24,windY(center-.24,1.012)+glassOffset+.009,1.012],[center+.18,windY(center+.18,1.05)+glassOffset+.009,1.05],.009,dark);
 }
 // A separate convex pressed-steel nose catches continuous reflections, rather than a flat box face.
 // Headlamps: recessed dark bowl, metal bezel, glass lens. Separate amber indicators below.
 for(const sx of [-1,1]){
  const y=noseY(sx*.62,.56);
  cylinder(body,.167,.035,[sx*.62,y+.004,.56],dark,'Y');
  const bezel=mesh(body,new T.TorusGeometry(.147,.016,[6,4,3][lod],[24,16,10][lod]),steel,[sx*.62,y+.028,.56]);bezel.rotation.x=Math.PI/2;
  cylinder(body,.129,.021,[sx*.62,y+.031,.56],lampMat,'Y');
  const turnY=noseY(sx*.73,.15);cylinder(body,.064,.020,[sx*.73,turnY+.006,.15],dark,'Y');cylinder(body,.048,.022,[sx*.73,turnY+.021,.15],m.indicator,'Y');
 }
 // The source has a trapezoid mesh radiator opening, not vertical prison-like bars.
 front([[-.47,.04],[.47,.04],[.34,.34],[-.34,.34]],2.071,rubber,.045);
 const grilleLines=[];
 for(let z=.075;z<=.30;z+=.028){const half=.47-(z-.04)/.30*.13-.025;for(let x=-half;x<half;x+=.08)grilleLines.push([[x,noseY(x,z)+.024,z],[Math.min(x+.08,half),noseY(Math.min(x+.08,half),z)+.024,z]]);}
 for(let x=-.41;x<=.41;x+=.035){const top=Math.min(.31,.34-Math.max(0,Math.abs(x)-.32)*2);for(let z=.065;z<top;z+=.07)grilleLines.push([[x,noseY(x,z)+.025,z],[x,noseY(x,Math.min(z+.07,top))+.025,Math.min(z+.07,top)]]);}
 if(lod<2){const ribbons=[];grilleLines.forEach(([a,b],i)=>{if(lod===1&&i%2)return;const dx=b[0]-a[0],dz=b[2]-a[2],len=Math.hypot(dx,dz)||1,px=-dz/len*.0009,pz=dx/len*.0009;const am=[a[0]-px,a[1],a[2]-pz],ap=[a[0]+px,a[1],a[2]+pz],bm=[b[0]-px,b[1],b[2]-pz],bp=[b[0]+px,b[1],b[2]+pz];ribbons.push(...am,...ap,...bm,...bm,...ap,...bp);});const grilleGeometry=new T.BufferGeometry();grilleGeometry.setAttribute('position',new T.Float32BufferAttribute(ribbons,3));grilleGeometry.setAttribute('uv',new T.Float32BufferAttribute(new Float32Array(ribbons.length/3*2),2));grilleGeometry.computeVertexNormals();mesh(body,grilleGeometry,new T.MeshStandardMaterial({color:'#30372f',metalness:.6,roughness:.65}));}
 box(body,[1.88,.10,.10],[0,2.025,.05],dark);
 // Cab doors wrap around the sloping front; the right passenger entrance is a distinct single panel.
 for(const sign of [-1,1]){
  const x=sign*.974;
  const cab=[[.57,.025],[.57,1.39],[1.50,1.39],[1.74,.99],[1.92,.91],[1.92,.025],[.57,.025]];
  seam(cab,(y,z)=>sidePoint(sign,y,z,.007));
  const cabWindow=[[.67,.97],[1.67,.97],[1.49,1.31],[.67,1.31]];
  side(cabWindow,sign*.976,rubber,.055);side(inset(cabWindow,.035),sign*.984,glass,.020);
  box(body,[.018,.17,.045],sidePoint(sign,.75,.82,.014),dark);
  for(const z of [.20,.72]){for(const leaf of [-1,1])box(body,[.028,.043,.095],sidePoint(sign,1.92+leaf*.025,z,.014),steel);cylinder(body,.022,.11,sidePoint(sign,1.92,z,.028),dark,'Z');}
  // Short blind panel behind cab, followed by two long compartment windows, as in the photos.
  for(const [center,len] of [[-.42,.88],[-1.46,.72]]){
   const belt=[[center-len/2,.97],[center+len/2,.97],[center+len/2,1.31],[center-len/2,1.31]];side(belt,sign*.976,rubber,.055);side(inset(belt,.035),sign*.984,glass,.020);
  }
  if(sign===1){seam([[.11,.025],[.11,.94],[-.92,.94],[-.92,.025],[.11,.025]],(y,z)=>sidePoint(sign,y,z,.007));box(body,[.018,.15,.045],sidePoint(sign,-.02,.78,.014),dark);for(const z of [.21,.76]){for(const leaf of [-1,1])box(body,[.028,.035,.085],sidePoint(sign,-.92+leaf*.022,z,.014),steel);cylinder(body,.018,.10,sidePoint(sign,-.92,z,.028),dark,'Z');}}
  // Mirror faces rearward (-Y); two physical stalks carry the rounded housing.
  rod(body,[sign*.94,1.73,.84],[sign*1.07,1.78,.86],.018,steel);rod(body,[sign*1.07,1.78,.86],[sign*1.07,1.78,1.075],.016,steel);
  const mirrorGroup=new T.Group();mirrorGroup.position.set(sign*1.07,1.78,1.21);mirrorGroup.rotation.set(Math.PI/2,0,sign*.06);body.add(mirrorGroup);
  const casing=new T.ExtrudeGeometry(smooth([[-.08,-.13],[.08,-.13],[.08,.13],[-.08,.13]],.026),{depth:.035,bevelEnabled:lod<2,bevelSize:.005,bevelThickness:.005,bevelSegments:lod===0?2:1,curveSegments:[5,3,1][lod]});mesh(mirrorGroup,casing,dark);
  const mirrorSurface=new T.ShapeGeometry(smooth([[-.064,-.112],[.064,-.112],[.064,.112],[-.064,.112]],.018));const reflective=glass.clone();reflective.metalness=1;reflective.roughness=.12;reflective.envMapIntensity=.8;mesh(mirrorGroup,mirrorSurface,reflective,[0,0,.043]);
 }
 function rearPad(points,material,depth,r,name){const faceY=Math.min(...points.map(p=>rearY(p[0],p[1])))-depth,shape=smooth(points,r),geometry=new T.ExtrudeGeometry(shape,{depth:1,bevelEnabled:false,curveSegments:[5,3,2][lod]}),p=geometry.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getY(i),t=p.getZ(i);p.setXYZ(i,x,T.MathUtils.lerp(rearY(x,z)+.002,faceY,t),z);}geometry.computeVertexNormals();mesh(body,geometry,material,[0,0,0],name);return faceY;}
 // Two arched rear doors. Window and trim sit OUTSIDE the skin rather than being hidden in it.
 for(const sx of [-1,1]){
  const x=sx*.43;
  const outline=[[x-.38,.08],[x-.38,1.29],[x-.29,1.40],[x+.27,1.40],[x+.38,1.29],[x+.38,.08],[x-.38,.08]];seam(outline,(px,pz)=>[px,rearY(px,pz)-.007,pz]);
  const backWindow=[[x-.32,.97],[x+.32,.97],[x+.32,1.31],[x-.32,1.31]];rearFace(backWindow,rubber,.024,.055);rearFace(inset(backWindow,.035),glass,.032,.020);
  box(body,[.13,.025,.035],[sx*.12,rearY(sx*.12,.62)-.009,.62],dark);for(const z of [.52,1.20])rearPad([[sx*.84-.04,z-.0525],[sx*.84+.04,z-.0525],[sx*.84+.04,z+.0525],[sx*.84-.04,z+.0525]],steel,.008,.005,'rear_door_hinge_'+sx+'_'+z);
  const faceY=rearY(sx*.77,.29)-.018;
  const lampShape=smooth([[sx*.77-.075,.14],[sx*.77+.075,.14],[sx*.77+.075,.44],[sx*.77-.075,.44]],.024);
  const housing=new T.ExtrudeGeometry(lampShape,{depth:1,bevelEnabled:false,curveSegments:[5,3,2][lod]}),hp=housing.attributes.position;
  for(let i=0;i<hp.count;i++){const px=hp.getX(i),pz=hp.getY(i),depth=hp.getZ(i);hp.setXYZ(i,px,T.MathUtils.lerp(rearY(px,pz)+.002,faceY,depth),pz);}housing.computeVertexNormals();mesh(body,housing,rubber,[0,0,0],'rear_lamp_housing_'+sx);
  const stop=rounded(body,.106,.14,.012,.015,[sx*.77,faceY+.001,.35],redMat);stop.rotation.x=Math.PI/2;
  const turn=rounded(body,.106,.065,.012,.012,[sx*.77,faceY+.001,.238],m.indicator);turn.rotation.x=Math.PI/2;
  const reverse=rounded(body,.106,.042,.012,.008,[sx*.77,faceY+.001,.174],steel);reverse.rotation.x=Math.PI/2;
 }
}
