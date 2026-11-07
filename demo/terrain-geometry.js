// Refine road cells and stitch their neighbours; distant ground retains its
// original triangles. All chunks share compacted attributes and smooth normals.
export function createTerrainGeometry(T,field,material){
 const n=field.renderSize,coarse=field.coarseSize??n,step=field.coarseSize?2:1,cells=coarse-1,fine=new Uint8Array(cells*cells),chunkIndices=new Map();
 if(step===2)for(let y=0;y<cells;y++)for(let x=0;x<cells;x++){for(let dy=0;dy<=2;dy++)for(let dx=0;dx<=2;dx++)if(field.fineMask[(y*2+dy)*n+x*2+dx])fine[y*cells+x]=1;}
 const remap=new Map(),gridIds=[],indices=[],chunkSize=64;
 const compact=id=>{if(!remap.has(id)){remap.set(id,gridIds.length);gridIds.push(id);}return remap.get(id);};
 const neighbour=(x,y)=>x>=0&&y>=0&&x<cells&&y<cells&&fine[y*cells+x];
 for(let y=0;y<cells;y++)for(let x=0;x<cells;x++){
  const key=Math.floor(y/chunkSize)+','+Math.floor(x/chunkSize);if(!chunkIndices.has(key))chunkIndices.set(key,[]);const chunk=chunkIndices.get(key),gx=x*step,gy=y*step,id=(dx,dy)=>(gy+dy)*n+gx+dx,push=(...tri)=>{const mapped=tri.map(compact);indices.push(...mapped);chunk.push(...mapped);};
  if(step===2&&fine[y*cells+x]){for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){const a=id(dx,dy),b=id(dx+1,dy),c=id(dx,dy+1),d=id(dx+1,dy+1);push(a,c,b,b,c,d);}}
  else if(step===2&&(neighbour(x-1,y)||neighbour(x+1,y)||neighbour(x,y-1)||neighbour(x,y+1))){const boundary=[id(0,0)];if(neighbour(x-1,y))boundary.push(id(0,1));boundary.push(id(0,2));if(neighbour(x,y+1))boundary.push(id(1,2));boundary.push(id(2,2));if(neighbour(x+1,y))boundary.push(id(2,1));boundary.push(id(2,0));if(neighbour(x,y-1))boundary.push(id(1,0));for(let i=0;i<boundary.length;i++)push(id(1,1),boundary[i],boundary[(i+1)%boundary.length]);}
  else push(id(0,0),id(0,step),id(step,0),id(step,0),id(0,step),id(step,step));
 }
 const vertices=new Float32Array(gridIds.length*3),uv=new Float32Array(gridIds.length*2),colors=new Float32Array(gridIds.length*3);
 // Broad horizon occlusion is baked once into vertex colour. It gives valleys
 // depth without a screen-space pass or extra texture reads during rendering.
 const directions=Array.from({length:8},(_,i)=>[Math.cos(i*Math.PI/4),Math.sin(i*Math.PI/4)]);
 gridIds.forEach((id,i)=>{const x=id%n,y=Math.floor(id/n),wx=x*field.renderCell-field.half,wy=field.half-y*field.renderCell,h=field.renderSamples[id],g=field.gradientAt(wx,wy);let occlusion=0;
  for(const [dx,dy] of directions){let horizon=0;for(const radius of [48,112])horizon=Math.max(horizon,(field.heightAt(wx+dx*radius,wy+dy*radius)-h)/radius);occlusion+=Math.min(.65,Math.max(0,horizon-.035));}
  const shade=(1-Math.min(.15,Math.hypot(g.x,g.y)*.16))*(1-occlusion/8*.34);
  vertices.set([wx,wy,h+.03],i*3);uv.set([x/(n-1),1-y/(n-1)],i*2);colors.set([shade,shade,shade],i*3);});
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(vertices,3));geometry.setAttribute('uv',new T.BufferAttribute(uv,2));geometry.setAttribute('color',new T.BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
 const meshes=[];for(const [key,list] of chunkIndices){const part=new T.BufferGeometry();for(const [name,attribute] of Object.entries(geometry.attributes))part.setAttribute(name,attribute);part.setIndex(list);const bounds=new T.Box3();for(const index of list)bounds.expandByPoint(new T.Vector3(vertices[index*3],vertices[index*3+1],vertices[index*3+2]));part.boundingBox=bounds;part.boundingSphere=bounds.getBoundingSphere(new T.Sphere());const mesh=new T.Mesh(part,material);mesh.name='alpha_terrain_chunk_'+key;mesh.receiveShadow=true;meshes.push(mesh);}
 return {meshes,vertices:gridIds.length,triangles:indices.length/3,fineCells:fine.reduce((a,b)=>a+b,0)};
}
