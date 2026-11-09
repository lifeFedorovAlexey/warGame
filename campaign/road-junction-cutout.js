import {createLocalRoadMask} from '../demo/local-road-mask.js';

// The paving and paint already share two static batches. Cut new driveways
// in those batches using their asphalt footprint; no extra draw calls or
// per-frame geometry rebuilds, and removing a road restores the original yard.
export function createRoadJunctionCutout(T){
 const mask=createLocalRoadMask(T);
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
 return {apply,setRoads:mask.setRoads};
}
