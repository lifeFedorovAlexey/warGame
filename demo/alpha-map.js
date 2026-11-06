import {createHeightfield,createMapRoute} from './map-route.js';
import {createTerrainMaterials} from './terrain-material.js';
import {applyRoadGrades} from './road-grading.js';
import {shapeMesaRims} from './mesa-shaping.js';
import {createTerrainSurround} from './terrain-surround.js';

export async function createAlphaMap(T){
 const base='../assets/maps/alpha/';
 const [heightData,routeData,roads]=await Promise.all([
  fetch(base+'heightfield.json').then(r=>{if(!r.ok)throw new Error('Heightfield '+r.status);return r.json();}),
  fetch(base+'route.json').then(r=>{if(!r.ok)throw new Error('Route '+r.status);return r.json();}),
  fetch(base+'roads.json').then(r=>{if(!r.ok)throw new Error('Roads '+r.status);return r.json();})
 ]);
 const field=createHeightfield(heightData),mesaShaping=shapeMesaRims(field),grading=applyRoadGrades(field,roads),route=createMapRoute(field,routeData),root=new T.Group();root.name='Alpha_4064m_heightfield';
 const materials=await createTerrainMaterials(T,field.extent);
 const meshSize=field.renderSize,count=meshSize**2,vertices=new Float32Array(count*3),uv=new Float32Array(count*2),colors=new Float32Array(count*3),indices=[];
 const white=new T.Color('#ffffff'),rock=new T.Color('#aab2ab');
 for(let row=0;row<meshSize;row++)for(let col=0;col<meshSize;col++){
  const i=row*meshSize+col,p=field.gridToWorld([col/2,row/2]);vertices.set([p.x,p.y,field.renderSamples[i]+.03],i*3);uv.set([col/(meshSize-1),1-row/(meshSize-1)],i*2);
  const g=field.gradientAt(p.x,p.y),c=white.clone().lerp(rock,Math.min(.5,Math.hypot(g.x,g.y)*.25));colors.set([c.r,c.g,c.b],i*3);
  if(row<meshSize-1&&col<meshSize-1){const a=i,b=i+1,c=i+meshSize,d=c+1;indices.push(a,c,b,b,c,d);}
 }
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(vertices,3));geometry.setAttribute('uv',new T.BufferAttribute(uv,2));geometry.setAttribute('color',new T.BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
 const meshes=[];
 for(let ry=0;ry<meshSize-1;ry+=64)for(let cx=0;cx<meshSize-1;cx+=64){
  const endY=Math.min(ry+64,meshSize-1),endX=Math.min(cx+64,meshSize-1),chunkIndices=[];let low=Infinity,high=-Infinity;
  for(let y=ry;y<=endY;y++)for(let x=cx;x<=endX;x++){const i=y*meshSize+x;low=Math.min(low,field.renderSamples[i]);high=Math.max(high,field.renderSamples[i]);if(y<endY&&x<endX){const a=i,b=a+1,c=a+meshSize,d=c+1;chunkIndices.push(a,c,b,b,c,d);}}
  const chunk=new T.BufferGeometry();for(const [name,attribute] of Object.entries(geometry.attributes))chunk.setAttribute(name,attribute);chunk.setIndex(chunkIndices);
  const a=field.gridToWorld([cx/2,endY/2]),b=field.gridToWorld([endX/2,ry/2]);chunk.boundingBox=new T.Box3(new T.Vector3(a.x,a.y,low),new T.Vector3(b.x,b.y,high+.03));chunk.boundingSphere=chunk.boundingBox.getBoundingSphere(new T.Sphere());
  const mesh=new T.Mesh(chunk,materials.overview);mesh.name='alpha_mesa_chunk_'+ry+'_'+cx;mesh.receiveShadow=true;root.add(mesh);meshes.push(mesh);
 }
 const surround=createTerrainSurround(T,field,materials.surround);root.add(surround);
 const path=new T.LineLoop(new T.BufferGeometry().setFromPoints(route.points.map(p=>new T.Vector3(p.x,p.y,p.z+.16))),new T.LineBasicMaterial({color:'#f4d083',transparent:true,opacity:.85}));path.name='driving_route';path.visible=false;root.add(path);
 const baseCenter=field.gridToWorld(routeData.baseFootprint.gridCenter),w=routeData.baseFootprint.widthMetres/2,h=routeData.baseFootprint.depthMetres/2;
 const basePoints=[];for(const [a,b] of [[[-w,-h],[w,-h]],[[w,-h],[w,h]],[[w,h],[-w,h]],[[-w,h],[-w,-h]]])for(let i=0;i<30;i++){const x=baseCenter.x+a[0]+(b[0]-a[0])*i/30,y=baseCenter.y+a[1]+(b[1]-a[1])*i/30;basePoints.push(new T.Vector3(x,y,field.heightAt(x,y)+.2));}
 const baseOutline=new T.LineLoop(new T.BufferGeometry().setFromPoints(basePoints),new T.LineBasicMaterial({color:'#85d4ce'}));root.add(baseOutline);
 const paint=[];
 function paintStrip(x,y,ex,ey,nx,ny,offset,width){const ox=nx*offset,oy=ny*offset,wx=nx*width/2,wy=ny*width/2,vertex=(px,py)=>[px,py,field.heightAt(px,py)+.10],ap=vertex(x+ox+wx,y+oy+wy),am=vertex(x+ox-wx,y+oy-wy),bp=vertex(ex+ox+wx,ey+oy+wy),bm=vertex(ex+ox-wx,ey+oy-wy);paint.push(...am,...ap,...bm,...bm,...ap,...bp);}
 for(const road of roads.paths){let travelled=0;for(let i=0;i<road.points.length-1;i++){const a=road.points[i],b=road.points[i+1],length=Math.hypot(b.x-a.x,b.y-a.y),count=Math.max(1,Math.ceil(length/3)),nx=-(b.y-a.y)/length,ny=(b.x-a.x)/length;
  for(let j=0;j<count;j++){const begin=travelled+length*j/count;if(roads.nodes?.some(node=>node.degree>2&&Math.hypot(node.x-a.x,node.y-a.y)<35))continue;const x=a.x+(b.x-a.x)*j/count,y=a.y+(b.y-a.y)*j/count,ex=a.x+(b.x-a.x)*(j+1)/count,ey=a.y+(b.y-a.y)*(j+1)/count;
   if(begin%12<4.5&&Math.sin(begin*.09+i)*.5+.5>.16)paintStrip(x,y,ex,ey,nx,ny,0,.54);
   for(const side of [-1,1])if(Math.sin(begin*.052+side*4.)*.5+Math.cos(begin*.17)*.2>.08)paintStrip(x,y,ex,ey,nx,ny,side*(road.width/2-2),.34);
  }travelled+=length;}}
 const markingGeometry=new T.BufferGeometry();markingGeometry.setAttribute('position',new T.Float32BufferAttribute(paint,3));markingGeometry.computeVertexNormals();const markings=new T.Mesh(markingGeometry,new T.MeshLambertMaterial({color:'#d1c8ad',transparent:true,opacity:.38,depthWrite:false,side:T.DoubleSide}));markings.name='worn_road_centre_markings';root.add(markings);
 return {root,field,route,path,baseOutline,roadPaths:roads.paths,heightAt:field.heightAt,baseFootprint:routeData.baseFootprint,setViewMode(mode){const material=mode==='close'?materials.close:materials.overview;for(const mesh of meshes)if(mesh.material!==material)mesh.material=material;},statistics:{extentMetres:field.extent,areaKm2:field.extent**2/1e6,heightMin:Math.min(...field.samples)*field.heightUnitMetres,heightMax:Math.max(...field.samples)*field.heightUnitMetres,terrainVertices:count,terrainTriangles:(meshSize-1)**2*2,surroundTriangles:surround.geometry.index.count/3,routeLengthMetres:route.length,sourceSamples:field.size**2,mesaShaping,roadGrading:grading,roadComponents:roads.statistics?.components,roadCorridors:roads.paths.length,roadSource:roads.source,mesaRefinement:meshSize,terrainChunks:meshes.length,materials:materials.statistics}};
}
