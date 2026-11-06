// Non-playable continuation hides the rectangular cut of the source heightmap.
// Its inner rim uses the same samples as collision/render terrain, without a gap.
export function createTerrainSurround(T,field,material){
 const edge=[],n=field.renderSize-1,scale=(field.size-1)/n;
 for(let x=0;x<=n;x++)edge.push([x*scale,0]);
 for(let y=1;y<=n;y++)edge.push([field.size-1,y*scale]);
 for(let x=n-1;x>=0;x--)edge.push([x*scale,field.size-1]);
 for(let y=n-1;y>0;y--)edge.push([0,y*scale]);
 const edgeHeights=edge.map(grid=>{const p=field.gridToWorld(grid);return field.heightAt(p.x,p.y);});
 const rings=[0,128,256,512,1024,2048,4096,8192],vertices=[],uv=[],indices=[];
 const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
 rings.forEach((distance,r)=>edge.forEach((grid,i)=>{
  const p=field.gridToWorld(grid),factor=1+distance/field.half,x=p.x*factor,y=p.y*factor;
  // Increasing lateral smoothing prevents each boundary sample becoming a ray.
  const radius=Math.ceil(Math.min(80,distance/field.renderCell*.75));let h=0,total=0;
  for(let k=-radius;k<=radius;k++){const weight=Math.exp(-k*k/Math.max(1,radius*radius*.32));h+=edgeHeights[(i+k+edge.length)%edge.length]*weight;total+=weight;}h/=total;
  const broadDunes=10+Math.sin(x/360+Math.sin(y/700)*.8)*4+Math.cos(y/510-x/1100)*5,blend=smooth(0,1400,distance),height=h*(1-blend)+broadDunes*blend;
  vertices.push(x,y,height+.03);uv.push((x+field.half)/field.extent,(y+field.half)/field.extent);
  if(r){const a=(r-1)*edge.length+i,b=(r-1)*edge.length+(i+1)%edge.length,c=r*edge.length+i,d=r*edge.length+(i+1)%edge.length;indices.push(a,b,c,b,d,c);}
 }));
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geometry.setAttribute('color',new T.Float32BufferAttribute(new Float32Array(vertices.length).fill(1),3));geometry.setIndex(indices);geometry.computeVertexNormals();
 const mesh=new T.Mesh(geometry,material);mesh.name='non_playable_desert_surround';mesh.receiveShadow=false;return mesh;
}
