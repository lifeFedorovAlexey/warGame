import assert from 'node:assert/strict';
import {mgRecoil,twinBarrelDelay} from '../campaign/mg-burst.js';
globalThis.document={querySelectorAll:()=>[]};
const {FieldSound}=await import('../campaign/field-sound.js');
for(const [i,time] of [.015,.075,.135,.195,.255,.315].entries()){
 const left=mgRecoil(time),right=mgRecoil(time-twinBarrelDelay);
 assert(i%2?right>left*20:left>right*20,'The firing barrel kicks while the other finishes settling');
}
assert.equal(mgRecoil(.4),0);assert.equal(mgRecoil(.4-twinBarrelDelay),0);
const sources=[],node=()=>({connect(){return this;},disconnect(){}});
const context={state:'running',currentTime:1,
 createBufferSource(){const s={...node(),playbackRate:{value:1},start(time){this.startedAt=time;}};sources.push(s);return s;},
 createGain(){return{...node(),gain:{value:1}};},createStereoPanner(){return{...node(),pan:{value:0}};}};
const sound=Object.assign(Object.create(FieldSound.prototype),{context,enabled:true,last:new Map(),combatClips:new Map([['mg',{}],['flame',{}]]),combatVoices:new Set(),combatOutput:node()});
sound.shot('mg',1,0,2);assert.equal(sources.length,2);assert.equal(sources[0].startedAt,1);assert.equal(sources[1].startedAt,1.06);assert(sources.every(s=>s.playbackRate.value===1));
sound.shot('mg',1,0,2);assert.equal(sources.length,2,'The second barrel must not bypass the per-shot rate limit');
for(let i=0;i<20;i++){context.currentTime+=.1;sound.shot('mg',1,0,2);}
assert.equal(sources.length,10,'The existing ten-voice ceiling is preserved');
for(const s of sources)s.onended();assert.equal(sound.combatVoices.size,0);
context.currentTime+=1;sound.enabled=false;sound.shot('mg',1,0,2);assert.equal(sources.length,10,'Muted combat schedules no second barrel');
sound.enabled=true;sound.shot('mg',1,0);assert.equal(sources.length,11,'Single guns still use one recording');
context.currentTime+=1;sound.shot('flame',1,0,2);assert.equal(sources.length,12,'Flamethrowers retain one recording');
sound.shot('grenade',1,0,2);assert.equal(sources.length,12);
console.log('PASS: alternating recoil, synchronized audio, rate limiting, bounded voices, cleanup, mute and other weapons.');
