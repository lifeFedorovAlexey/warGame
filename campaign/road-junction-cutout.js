import {createLocalRoadMask} from '../demo/local-road-mask.js';

// The paving and paint already share two static batches. Cut new driveways
// in those batches using their asphalt footprint; no extra draw calls or
// per-frame geometry rebuilds, and removing a road restores the original yard.
export function createRoadJunctionCutout(T){
 const mask=createLocalRoadMask(T);
 let worker,revision=0,latest=[],pending=null,busy=false;
 function sendPending(){
  if(busy||!pending)return;
  busy=true;
  worker.postMessage(pending);
  pending=null;
 }
 function setRoads(roads){
  latest=roads;
  const request=++revision;
  if(!roads.some(road=>road.points.length>1)){
   pending=null;
   mask.uniforms.localRoadEnabled.value=0;
   return;
  }
  if(worker===undefined){
   worker=null;
   if(typeof Worker==='function')try{
    worker=new Worker(new URL('./road-junction-mask-worker.js',import.meta.url),{type:'module'});
    worker.onmessage=({data:{revision:ready,bounds,data,size}})=>{
     busy=false;
     sendPending();
     if(ready!==revision)return;
     const {localRoadMask,localRoadBounds,localRoadEnabled}=mask.uniforms;
     if(localRoadMask.value.image.width===size)localRoadMask.value.image.data=data;
     else{
      localRoadMask.value.dispose();
      localRoadMask.value=new T.DataTexture(data,size,size,T.RGBAFormat);
      localRoadMask.value.minFilter=localRoadMask.value.magFilter=T.LinearFilter;
     }
     localRoadMask.value.needsUpdate=true;
     localRoadBounds.value.fromArray(bounds);
     localRoadEnabled.value=1;
    };
    worker.onerror=()=>{
     worker.terminate();worker=null;busy=false;pending=null;
     mask.setRoads(latest);
    };
   }catch{/* Fall back to synchronous rendering when workers are unavailable. */}
  }
  if(worker){pending={revision:request,roads};sendPending();}
  else mask.setRoads(roads);
 }
 function apply(material){
  const before=material.onBeforeCompile,cache=material.customProgramCacheKey.bind(material);
  material.onBeforeCompile=shader=>{
   before.call(material,shader);
   Object.assign(shader.uniforms,{
    junctionMask:mask.uniforms.localRoadMask,
    junctionBounds:mask.uniforms.localRoadBounds,
    junctionEnabled:mask.uniforms.localRoadEnabled
   });
   shader.vertexShader='attribute float roadCuttable;varying float vRoadCuttable;varying vec2 vJunctionXY;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',
    '#include <worldpos_vertex>\nvRoadCuttable=roadCuttable;vJunctionXY=(modelMatrix*vec4(transformed,1.)).xy;');
   shader.fragmentShader='uniform sampler2D junctionMask;uniform vec4 junctionBounds;uniform float junctionEnabled;varying float vRoadCuttable;varying vec2 vJunctionXY;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
    if(junctionEnabled>.5&&vRoadCuttable>.5){
     vec2 junctionUv=(vJunctionXY-junctionBounds.xy)/junctionBounds.zw;
     if(all(greaterThanEqual(junctionUv,vec2(0.)))&&all(lessThanEqual(junctionUv,vec2(1.)))){
      // Include the asphalt's soft shoulder so a thin slab/paint strip cannot
      // survive between its hard edge and the filtered terrain mask.
      if(texture2D(junctionMask,junctionUv).r>(.5-.7/24.))discard;
     }
    }`);
  };
  material.customProgramCacheKey=()=>cache()+'_road_junction_cutout_v1';
 }
 return {apply,setRoads};
}
