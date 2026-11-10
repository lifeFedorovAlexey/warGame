import assert from 'node:assert/strict';
import {alignFrameTrace} from './frame-trace-alignment.mjs';
const frames=Array.from({length:30},(_,i)=>({start:100+i*17+(i===13?7:0),cpuMs:1+(i*7)%9}));
const callbacks=frames.map((f,i)=>({ts:(10000+100+i*17)*1000,dur:(f.cpuMs+(i===13?7:0)+.03)*1000}));
const aligned=alignFrameTrace(callbacks,frames);assert.equal(aligned.main.length,30);assert.equal(aligned.spread,7);assert(aligned.clockOffsetBoundsMs[0]<=10000&&aligned.clockOffsetBoundsMs[1]>=10000);
assert.throws(()=>alignFrameTrace(callbacks.filter((_,i)=>i!==14),frames),/0 valid/);
assert.throws(()=>alignFrameTrace([...callbacks,...callbacks.map(c=>({...c,ts:c.ts+1000000}))],frames),/2 valid/);
const invalid=frames.map((f,i)=>i===4?{...f,cpuMs:30}:f);assert.throws(()=>alignFrameTrace(callbacks,invalid),/0 valid/);
console.log('PASS: entry GC accepted with exact containment; missing callback, duplicate sequence and impossible CPU interval rejected');
