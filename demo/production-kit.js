import * as THREE from 'three';
import { GLTFExporter } from './vendor/exporters/GLTFExporter.js';
import { mergeGeometries, mergeVertices } from './vendor/utils/BufferGeometryUtils.js';

function signature(m){return JSON.stringify([m.type,m.color?.getHex(),m.emissive?.getHex(),m.emissiveIntensity,m.metalness,m.roughness,m.side,m.transparent,m.opacity,m.map?.uuid]);}
function cleanGeometry(source){
 let g=source.index?source.toNonIndexed():source.clone();
 const p=g.getAttribute('position'),keep=[];let removed=0;
 for(let i=0;i<p.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(p,i),b=new THREE.Vector3().fromBufferAttribute(p,i+1),c=new THREE.Vector3().fromBufferAttribute(p,i+2);const area=b.clone().sub(a).cross(c.clone().sub(a)).lengthSq();if(!Number.isFinite(area)||area<1e-16){removed++;continue;}keep.push(i,i+1,i+2);}
 const out=new THREE.BufferGeometry();
 for(const [name,attribute] of Object.entries(g.attributes)){if(!['position','normal','uv'].includes(name))continue;const array=new Float32Array(keep.length*attribute.itemSize);keep.forEach((idx,n)=>{for(let j=0;j<attribute.itemSize;j++)array[n*attribute.itemSize+j]=attribute.array[idx*attribute.itemSize+j];});out.setAttribute(name,new THREE.BufferAttribute(array,attribute.itemSize));}
 if(!out.getAttribute('normal'))out.computeVertexNormals();
 if(!out.getAttribute('uv'))out.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(keep.length*2),2));
 g.dispose();const welded=mergeVertices(out,1e-6);out.dispose();return {geometry:welded,removed};
}

export function createProductionExporter(parts,lod){
 return async function exportParts(){
  const files=[],report=[];
  for(const [id,source] of Object.entries(parts)){
   const root=source.clone(true);root.position.set(0,0,0);root.rotation.set(0,0,0);root.scale.set(1,1,1);
   const discard=[];
   root.traverse(o=>{if(o.userData.exportExclude||(id==='C01'&&o.name==='B01_BUKHANKA')||(id==='B01'&&o.name==='U01_KORD')||o.isLight||o.isLine||o.name==='attachment_guides'||o.name==='light_target')discard.push(o);if(o.name==='sprung_frame'){o.position.set(0,0,0);o.rotation.set(0,0,0);}if(o.name.includes('_wheel')||o.name.includes('_steer'))o.rotation.set(0,0,0);});
   discard.forEach(o=>o.removeFromParent());
   if(id==='B01'){
    root.updateMatrixWorld(true);const inverse=new THREE.Matrix4().copy(root.matrixWorld).invert(),all=[];
    root.traverse(o=>{if(o.isMesh)all.push(o);});
    for(const o of all){const relative=new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld);root.attach(o);o.matrix.copy(relative);o.matrix.decompose(o.position,o.quaternion,o.scale);}
    for(const child of [...root.children])if(!child.isMesh&&!['mount','upper_mount','headlamp_L','headlamp_R','rear_marker_L','rear_marker_R'].includes(child.name)&&!child.name.startsWith('pad_'))child.removeFromParent();
   }
   const instanced=[];root.traverse(o=>{if(o.isInstancedMesh)instanced.push(o);});
   for(const inst of instanced){inst.updateMatrix();for(let i=0;i<inst.count;i++){const mat=new THREE.Matrix4();inst.getMatrixAt(i,mat);mat.premultiply(inst.matrix);const item=new THREE.Mesh(inst.geometry,inst.material);item.applyMatrix4(mat);inst.parent.add(item);}inst.removeFromParent();}
   const materials=new Map();let before=0,degenerate=0;
   root.traverse(o=>{if(!o.isMesh)return;before+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;const key=signature(o.material);if(!materials.has(key)){const m=o.material.clone();m.bumpMap=null;m.normalMap=null;m.bumpScale=1;materials.set(key,m);}o.material=materials.get(key);});
   let batchIndex=0;
   function batch(node){for(const child of [...node.children])if(!child.isMesh)batch(child);const groups=new Map();for(const item of node.children)if(item.isMesh){const key=item.material;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);}for(const [mat,items] of groups){const geometries=[];for(const item of items){item.updateMatrix();const result=cleanGeometry(item.geometry);result.geometry.applyMatrix4(item.matrix);geometries.push(result.geometry);degenerate+=result.removed;node.remove(item);}const geometry=geometries.length===1?geometries[0]:mergeGeometries(geometries,false);if(geometries.length>1)geometries.forEach(g=>g.dispose());const indexed=mergeVertices(geometry,1e-6);geometry.dispose();const m=new THREE.Mesh(indexed,mat);m.name=id+'_surface_'+String(batchIndex++).padStart(2,'0');node.add(m);}}
   batch(root);root.updateMatrixWorld(true);
   let triangles=0,vertices=0,primitives=0;root.traverse(o=>{if(o.isMesh){triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;vertices+=o.geometry.attributes.position.count;primitives++;}});
   const bounds=new THREE.Box3().setFromObject(root);const wrap=new THREE.Group();wrap.name=id+'_LOD'+lod;wrap.rotation.x=-Math.PI/2;wrap.add(root);wrap.userData={id,lod,units:'metres',sourceAxes:'X right, Y forward, Z up',geometry:'indexed welded triangles; independent module'};
   const bytes=await new GLTFExporter().parseAsync(wrap,{binary:true,onlyVisible:true,trs:true});
   const entry={id,lod,triangles,vertices,primitives,materials:materials.size,removedDegenerate:degenerate,inputTriangles:before,bytes:bytes.byteLength,boundsMm:{min:bounds.min.toArray().map(v=>Math.round(v*1000)),max:bounds.max.toArray().map(v=>Math.round(v*1000))}};
   const view=new Uint8Array(bytes);let binary='';for(let i=0;i<view.length;i+=32768)binary+=String.fromCharCode(...view.subarray(i,i+32768));
   files.push({name:id+'-lod'+lod+'.glb',base64:btoa(binary)});report.push(entry);
   root.traverse(o=>{if(o.isMesh)o.geometry.dispose();});
  }
  return {files,report};
 };
}
