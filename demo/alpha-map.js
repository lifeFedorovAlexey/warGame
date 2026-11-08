import {createHeightfield,createMapRoute} from './map-route.js';
import {createTerrainMaterials} from './terrain-material.js';
import {applyRoadGrades} from './road-grading.js';
import {shapeMesaRims} from './mesa-shaping.js';
import {createTerrainSurround} from './terrain-surround.js';
import {refineRoadHeightfield} from './road-heightfield.js';
import {createTerrainGeometry} from './terrain-geometry.js';

export async function createAlphaMap(T,{lightweightOverview=false}={}){
 const base='../assets/maps/alpha/';
 const [heightData,routeData,roads]=await Promise.all([
  fetch(base+'heightfield.json').then(r=>{if(!r.ok)throw new Error('Heightfield '+r.status);return r.json();}),
  fetch(base+'route.json').then(r=>{if(!r.ok)throw new Error('Route '+r.status);return r.json();}),
  fetch(base+'roads.json').then(r=>{if(!r.ok)throw new Error('Roads '+r.status);return r.json();})
 ]);
 const baseField=createHeightfield(heightData),mesaShaping=shapeMesaRims(baseField),field=refineRoadHeightfield(baseField),grading=applyRoadGrades(field,roads),route=createMapRoute(field,routeData),root=new T.Group();root.name='Alpha_4064m_heightfield';
 const materials=await createTerrainMaterials(T,field.extent,{lightweightOverview});
 field.roadBlendAt=materials.roadBlendAt;
 const meshSize=field.renderSize,terrainMesh=createTerrainGeometry(T,field,materials.overview),meshes=terrainMesh.meshes;for(const mesh of meshes)root.add(mesh);
 const surround=createTerrainSurround(T,field,materials.surround);root.add(surround);
 const path=new T.LineLoop(new T.BufferGeometry().setFromPoints(route.points.map(p=>new T.Vector3(p.x,p.y,p.z+.16))),new T.LineBasicMaterial({color:'#f4d083',transparent:true,opacity:.85}));path.name='driving_route';path.visible=false;root.add(path);
 const baseCenter=field.gridToWorld(routeData.baseFootprint.gridCenter),w=routeData.baseFootprint.widthMetres/2,h=routeData.baseFootprint.depthMetres/2;
 const basePoints=[];for(const [a,b] of [[[-w,-h],[w,-h]],[[w,-h],[w,h]],[[w,h],[-w,h]],[[-w,h],[-w,-h]]])for(let i=0;i<30;i++){const x=baseCenter.x+a[0]+(b[0]-a[0])*i/30,y=baseCenter.y+a[1]+(b[1]-a[1])*i/30;basePoints.push(new T.Vector3(x,y,field.heightAt(x,y)+.2));}
 const baseOutline=new T.LineLoop(new T.BufferGeometry().setFromPoints(basePoints),new T.LineBasicMaterial({color:'#85d4ce'}));root.add(baseOutline);
 const paint=[];
 function paintStrip(x,y,ex,ey,nx,ny,offset,width){const ox=nx*offset,oy=ny*offset,wx=nx*width/2,wy=ny*width/2,vertex=(px,py)=>[px,py,field.heightAt(px,py)+.10],ap=vertex(x+ox+wx,y+oy+wy),am=vertex(x+ox-wx,y+oy-wy),bp=vertex(ex+ox+wx,ey+oy+wy),bm=vertex(ex+ox-wx,ey+oy-wy);paint.push(...am,...ap,...bm,...bm,...ap,...bp);}
 for(const road of roads.paths){let travelled=0;for(let i=0;i<road.points.length-1;i++){const a=road.points[i],b=road.points[i+1],length=Math.hypot(b.x-a.x,b.y-a.y),count=Math.max(1,Math.ceil(length/3)),nx=-(b.y-a.y)/length,ny=(b.x-a.x)/length;
  for(let j=0;j<count;j++){const begin=travelled+length*j/count;if(roads.nodes?.some(node=>(node.degree>2||node.base)&&Math.hypot(node.x-a.x,node.y-a.y)<110))continue;const x=a.x+(b.x-a.x)*j/count,y=a.y+(b.y-a.y)*j/count,ex=a.x+(b.x-a.x)*(j+1)/count,ey=a.y+(b.y-a.y)*(j+1)/count;
   if(begin%12<4.5&&Math.sin(begin*.09+i)*.5+.5>.16)paintStrip(x,y,ex,ey,nx,ny,0,.54);
   for(const side of [-1,1])if(Math.sin(begin*.052+side*4.)*.5+Math.cos(begin*.17)*.2>.08)paintStrip(x,y,ex,ey,nx,ny,side*((a.width??road.width)/2-2),.34);
  }travelled+=length;}}
 const markingGeometry=new T.BufferGeometry();markingGeometry.setAttribute('position',new T.Float32BufferAttribute(paint,3));markingGeometry.computeVertexNormals();const markings=new T.Mesh(markingGeometry,materials.markings);markings.name='worn_road_centre_markings';root.add(markings);
 return {root,field,route,path,baseOutline,setLocalRoads:materials.setLocalRoads,terrainMaterials:[materials.close,materials.overview,materials.surround,materials.markings],roadPaths:roads.paths,heightAt:field.heightAt,baseFootprint:routeData.baseFootprint,setViewMode(mode){const material=mode==='close'?materials.close:materials.overview;for(const mesh of meshes)if(mesh.material!==material)mesh.material=material;},statistics:{extentMetres:field.extent,areaKm2:field.extent**2/1e6,heightMin:Math.min(...field.samples)*field.heightUnitMetres,heightMax:Math.max(...field.samples)*field.heightUnitMetres,terrainVertices:terrainMesh.vertices,terrainTriangles:terrainMesh.triangles,refinedRoadCells:terrainMesh.fineCells,surroundTriangles:surround.geometry.index.count/3,routeLengthMetres:route.length,sourceSamples:field.size**2,mesaShaping,roadGrading:grading,roadComponents:roads.statistics?.components,roadCorridors:roads.paths.length,roadSource:roads.source,mesaRefinement:meshSize,terrainChunks:meshes.length,materials:materials.statistics}};
}
