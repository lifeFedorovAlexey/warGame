import assert from 'node:assert/strict';
import {createFogMask} from '../campaign/fog-mask.js';
globalThis.document={createElement:()=>({getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)})})})};
const T={DataTexture:class{constructor(data){this.image={data};}}},mask=createFogMask(T);
const sources=Array.from({length:100},(_,i)=>({x:2+(i*3.37)%123,y:2+(i*7.19)%123,radius:i%7===0?.5:3+i%20}));
const mission={state:{bounds:[0,0,127,127]},explored:new Uint8Array(128**2),visionSources:sources,fogRevision:1};mask.update(mission);
const expected=new Uint8Array(512**2),step=127/512,feather=1.35;
for(const s of sources)for(let y=0;y<512;y++)for(let x=0;x<512;x++){
 const t=Math.max(0,Math.min(1,(s.radius-Math.hypot((x+.5)*step-s.x,(y+.5)*step-s.y))/feather)),light=255*t*t*(3-2*t),i=y*512+x;
 if(light>expected[i])expected[i]=light;
}
for(let i=0;i<expected.length;i++)assert.equal(mask.texture.image.data[i*2],expected[i],'Visible fog byte '+i);
console.log(JSON.stringify({passed:true,sources:sources.length,identicalPixels:expected.length}));
