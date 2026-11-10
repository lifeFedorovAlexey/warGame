import assert from 'node:assert/strict';

// Chromium performance.now() is quantized to 0.1 ms in these recordings.
// Require one constant clock offset that places EVERY measured CPU interval
// inside its trace callback (allowing only timer resolution), and one unique
// contiguous callback sequence. GC before perf.begin is inside that callback.
export function alignFrameTrace(callbacks,frames,toleranceMs=.11){
 assert(frames.length>0,'No measured frames');const candidates=[];
 for(let first=0;first<=callbacks.length-frames.length;first++){
  let low=-Infinity,high=Infinity;
  for(let i=0;i<frames.length;i++){
   const e=callbacks[first+i],f=frames[i];
   low=Math.max(low,e.ts/1000-f.start-toleranceMs);
   high=Math.min(high,(e.ts+e.dur)/1000-f.start-f.cpuMs+toleranceMs);
   if(low>high)break;
  }
  if(low<=high)candidates.push({first,low,high});
 }
 assert.equal(candidates.length,1,`Ambiguous trace alignment: ${candidates.length} valid callback sequences`);
 const candidate=candidates[0],main=callbacks.slice(candidate.first,candidate.first+frames.length),offset=(candidate.low+candidate.high)/2;
 const offsets=main.map((e,i)=>e.ts/1000-frames[i].start),spread=Math.max(...offsets)-Math.min(...offsets);
 return {main,offset,spread,clockOffsetBoundsMs:[candidate.low,candidate.high],firstCallback:candidate.first,toleranceMs,uniqueSequence:true};
}
