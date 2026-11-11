import {createM03Field,m03Roads} from './mission03-terrain.js';
import {createTerrainMaterials} from '../demo/terrain-material.js';
import {createTerrainGeometry} from '../demo/terrain-geometry.js';
import {createTerrainSurround} from '../demo/terrain-surround.js';
import {m03SurfaceMaps} from './mission03-surfaces.js';
import {createM03Scenery} from './mission03-scenery.js';
import {m03SurfaceAt} from './mission03-surface-layout.js';

export async function createM03Map(T){
 const field=createM03Field(),root=new T.Group();root.name='m03_original_sub1_1';
 const materials=await createTerrainMaterials(T,field.extent,{surfaceMaps:m03SurfaceMaps(T,field)}),terrain=createTerrainGeometry(T,field,materials.close);
 field.roadBlendAt=materials.roadBlendAt;for(const mesh of terrain.meshes)root.add(mesh);root.add(createTerrainSurround(T,field,materials.surround));
 const scenery=createM03Scenery(T,field);root.add(scenery.root);
 const baseOutline=new T.Group(),path=new T.Group();root.add(baseOutline,path);
 const terrainMaterials=[materials.close,materials.overview,materials.surround,...scenery.materials];
 return {root,field,path,baseOutline,roadPaths:m03Roads,terrainMaterials,setViewMode(mode){for(const mesh of terrain.meshes)mesh.material=mode==='close'?materials.close:materials.overview;},setLocalRoads:materials.setLocalRoads,heightAt:field.heightAt,statistics:{map:'sub1-1',terrainTriangles:terrain.triangles,trees:scenery.trees,brush:scenery.brush,sourceSize:[44,93]}};
}
export function m03Minimap(field){
 const c=document.createElement('canvas');c.width=c.height=512;const ctx=c.getContext('2d'),image=ctx.createImageData(512,512);
 for(let y=0;y<512;y++)for(let x=0;x<512;x++){const gx=x/511*127,gy=y/511*127,wx=gx*32-field.half,wy=field.half-gy*32,g=field.gradientAt(wx,wy),shade=Math.max(.45,Math.min(1.25,.9+(g.x-g.y)*.24)),{color,type}=m03SurfaceAt(field,gx,gy),i=(y*512+x)*4;image.data.set([...color.map(v=>v*shade),255],i);}
 ctx.putImageData(image,0,0);for(const road of m03Roads){ctx.strokeStyle=road.surface==='asphalt'?'#615b50':'#aa9676';ctx.lineWidth=road.width/field.extent*512;ctx.beginPath();road.points.forEach((p,i)=>{const x=(p.x+field.half)/field.extent*512,y=(field.half-p.y)/field.extent*512;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();}
 return c.toDataURL();
}
