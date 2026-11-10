import * as T from '../demo/vendor/three.module.js';
import {createLocalRoadMask} from '../demo/local-road-mask.js';

globalThis.onmessage=({data:{revision,roads}})=>{
 const mask=createLocalRoadMask(T);
 mask.setRoads(roads);
 const {localRoadMask,localRoadBounds}=mask.uniforms,{data,width:size}=localRoadMask.value.image;
 globalThis.postMessage({revision,bounds:localRoadBounds.value.toArray(),data,size},[data.buffer]);
};
