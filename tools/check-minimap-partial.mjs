import assert from 'node:assert/strict';
import {createFogMask} from '../campaign/fog-mask.js';
import {createFogMask as fullFog} from './fixtures/fog-mask-reference.mjs';

// A persistent canvas backing store: the dirty rectangle copies only its rows.
// Comparing ImageData itself would miss stale rows in the actual canvas.
const canvases=[];
globalThis.document={createElement(){
 const canvas={width:0,height:0,pixels:null,writes:[]};canvases.push(canvas);
 canvas.getContext=()=>({
  createImageData:(width,height)=>({width,height,data:new Uint8ClampedArray(width*height*4)}),
  putImageData(image,dx,dy,sx=0,sy=0,sw=image.width,sh=image.height){
   canvas.pixels??=new Uint8ClampedArray(canvas.width*canvas.height*4);
   canvas.writes.push({sx,sy,sw,sh});
   for(let y=sy;y<sy+sh;y++)for(let x=sx;x<sx+sw;x++){
    if(x+dx<0||x+dx>=canvas.width||y+dy<0||y+dy>=canvas.height)continue;
    const i=(y*image.width+x)*4,j=((y+dy)*canvas.width+x+dx)*4;
    canvas.pixels.set(image.data.subarray(i,i+4),j);
   }
  }
 });return canvas;
}};
const T={DataTexture:class{constructor(data){this.image={data};}}};
const partial=createFogMask(T),full=fullFog(T),state={state:{bounds:[0,0,127,127]},explored:new Uint8Array(128**2),visionSources:[],fogRevision:0};
let comparisons=0,updates=0;
const draw=()=>{
 let actual,expected;
 partial.drawMinimap({drawImage:c=>actual=c.pixels.slice()},256);
 full.drawMinimap({drawImage:c=>expected=c.pixels.slice()},256);
 assert.deepEqual(actual,expected,'Persistent minimap pixels after update '+updates);comparisons++;
};
const update=()=>{state.fogRevision++;partial.update(state,++updates*250);full.update(state);};
update();draw();
// Top/bottom edges, odd/even source rows, disappearance and shrinking radius.
for(let i=0;i<96;i++){
 state.visionSources=i%13===0?[]:[{x:15+i%17*.31,y:[.1,126.9,20.05,20.3,70.125,110.7][i%6],radius:i%4===0?.3:3.1}];
 state.explored[(i*997)%state.explored.length]=255;
 if(i===30)state.state.bounds=[12,8,112,120];
 if(i===60){state.state={bounds:[0,0,127,127]};state.explored.fill(0);}
 update();
 // Union disjoint dirty ranges while no minimap draw occurs between updates.
 if(i%3===2)draw();
}
draw();const writes=canvases[0].writes.length;draw();
assert.equal(canvases[0].writes.length,writes,'No putImageData without an update');
const partialWrites=canvases[0].writes.filter(r=>r.sh<256);
if(partial.stats)assert(partialWrites.length>10,'Exercise partial uploads, not only full redraw');
console.log(JSON.stringify({passed:true,updates,comparisons,partialWrites:partialWrites.length,fullWrites:canvases[0].writes.length-partialWrites.length}));
