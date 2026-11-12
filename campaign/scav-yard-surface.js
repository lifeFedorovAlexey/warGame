// Soil and foundations only. This renderer never registers navigation solids,
// entities or pick targets; props belong to the destructible building prefabs.
export function createScavYardSurface(T,field,addFog){
 const root=new T.Group();root.name='scav_workshop_ground';
 const loader=new T.TextureLoader(),materials={};
 for(const [kind,file,color] of [['gravel','desert-gravel','#ccb28c'],['concrete','weathered-concrete','#ac9d80']]){
  const map=loader.load('../assets/maps/alpha/materials/'+file+'.jpg');
  map.colorSpace=T.SRGBColorSpace;map.wrapS=map.wrapT=T.RepeatWrapping;
  const material=new T.MeshLambertMaterial({map,color,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
  material.onBeforeCompile=shader=>{
   shader.vertexShader='attribute float groundAlpha;varying float vGroundAlpha;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvGroundAlpha=groundAlpha;');
   shader.fragmentShader='varying float vGroundAlpha;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.a*=vGroundAlpha;if(diffuseColor.a<.02)discard;');
  };
  material.customProgramCacheKey=()=> 'scav_ground_alpha_v1';addFog(material);materials[kind]=material;
 }
 function patch(camp,rect,kind,fade,outline=null,step=field.renderCell){
  const [l,b,r,t]=rect.map((v,i)=>v+(i%2?camp.y:camp.x)),vertices=[],uv=[],alpha=[];
  const opacity=(x,y)=>{
   let edge=Math.min(x-l,r-x,y-b,t-y);
   if(outline){
    const px=x-camp.x,py=y-camp.y;let inside=false,gap=Infinity;
    for(let i=0,j=outline.length-1;i<outline.length;j=i++){
     const [ax,ay]=outline[j],[bx,by]=outline[i],dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/(dx*dx+dy*dy)));
     gap=Math.min(gap,Math.hypot(px-ax-dx*t,py-ay-dy*t));
     if((ay>py)!==(by>py)&&px<(bx-ax)*(py-ay)/(by-ay)+ax)inside=!inside;
    }
    edge=inside?gap:-gap;
   }
   const wear=Math.sin(x*.13+y*.19)*1.4+Math.sin(y*.31-x*.07)*.8;
   const a=Math.max(0,Math.min(1,(edge+wear)/fade));
   return a*a*(3-2*a)*(kind==='gravel'?.66:.88);
  };
  const put=(x,y,a)=>{vertices.push(x,y,field.heightAt(x,y)+.2);uv.push(x/23,y/23);alpha.push(a);};
  for(let y=Math.floor(b/step)*step;y<t;y+=step)for(let x=Math.floor(l/step)*step;x<r;x+=step){
   const east=x+step,north=y+step;
   const sw=opacity(x,y),se=opacity(east,y),ne=opacity(east,north),nw=opacity(x,north);
   if(Math.max(sw,se,ne,nw)<.02)continue;
   put(x,y,sw);put(east,y,se);put(east,north,ne);
   put(x,y,sw);put(east,north,ne);put(x,north,nw);
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setAttribute('groundAlpha',new T.Float32BufferAttribute(alpha,1));g.computeVertexNormals();
  const mesh=new T.Mesh(g,materials[kind]);mesh.receiveShadow=true;mesh.userData.decorative=true;root.add(mesh);
  return mesh;
 }

 function trail(points,width){
  const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(p.x,p.y,0)));
  const centre=curve.getSpacedPoints(Math.ceil(curve.getLength()/10));
  const left=[],right=[];
  for(let i=0;i<centre.length;i++){
   const p=centre[i],a=centre[Math.max(0,i-1)],b=centre[Math.min(centre.length-1,i+1)];
   const taper=Math.min(1,i/3,(centre.length-1-i)/3),radius=(width/2+1.8*Math.sin(i*.8))*taper;
   const scale=radius/Math.hypot(b.x-a.x,b.y-a.y),dx=(b.y-a.y)*scale,dy=(a.x-b.x)*scale;
   left.push([p.x-dx,p.y-dy]);right.push([p.x+dx,p.y+dy]);
  }
  const outline=[...left,...right.reverse().slice(1,-1)],xs=outline.map(p=>p[0]),ys=outline.map(p=>p[1]);
  const bounds=[Math.min(...xs)-3,Math.min(...ys)-3,Math.max(...xs)+3,Math.max(...ys)+3];
  return patch({x:0,y:0},bounds,'gravel',6,outline,field.renderCell/2);
 }
 let signature='';
 function update(mission){
  const camps=mission.state.camps.filter(c=>c.siteLayout?.design==='square-workshop');
  const southern=mission.state.m02?.version>=2?mission.state.buildings.filter(b=>b.m02Base&&['scav-factory','scav-generator','generator','scav-sensor','scav-barracks','scav-store'].includes(b.kind)):[];
  const key=[...camps,...southern].map(c=>[c.id,c.x,c.y,c.rotation].join(':')).join('|');if(key===signature)return;signature=key;
  for(const mesh of [...root.children]){mesh.geometry.dispose();root.remove(mesh);}
  for(const c of camps){
   patch(c,[-118,16,42,108],'gravel',10,[[-118,108],[-42,108],[-30,82],[13,70],[42,43],[25,16],[-30,23],[-72,43],[-111,53]]);
   patch(c,[-49,-34,43,59],'gravel',13,[[-49,-7],[-31,-34],[33,-29],[43,38],[25,59],[-34,49]]);
   patch(c,[-34,-23,29,24],'concrete',6);
   patch(c,[-164,-4,-106,41],'concrete',5);
   patch(c,[-157,-101,-119,-64],'concrete',5);
  }
  for(const b of southern){
   const w=b.halfWidth,d=b.halfDepth,l=-w-13,r=w+15,front=-d-19,back=d+14;
   patch(b,[l,front,r,back],'gravel',12,[[l+7,front+9],[-w*.45,front],[r-10,front+4],[r,3],[r-7,back-5],[w*.3,back],[l+4,back-8],[l,-d*.2]]);
   patch(b,[-w*.94,-d*.92,w*.94,d*.92],'concrete',5);
   if(b.kind==='scav-factory'){
    const direction=Math.cos(b.rotation??0)<0?1:-1;
    const apron={x:b.x,y:b.y+direction*(d+17)};
    patch(apron,[-w*1.12,-33,w*1.12,33],'gravel',12);
    // The paved access ends at an actual loading/turning court, with a short
    // worn concrete transition to the workshop door rather than bare sand.
    patch(apron,[-w*.95,-26,w*.95,26],'concrete',5);
   }
  }
 }
 return {root,update,patch,trail,materials:Object.values(materials)};
}
