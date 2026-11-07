import assert from 'node:assert/strict';
globalThis.document={querySelectorAll:()=>[]};
const {FieldSound}=await import('../campaign/field-sound.js');
const sound=Object.create(FieldSound.prototype),captions=[],sources=[];
sound.context={currentTime:1,
 createBufferSource(){const s={connect(node){return node;},disconnect(){},start(){},stop(){this.stopped=true;}};sources.push(s);return s;},
 createGain(){return{gain:{value:1,setTargetAtTime(){}},connect(){return this;},disconnect(){}};}};
sound.ready=()=>true;sound.updateDialogueMix=()=>{};
const request=()=>({buffer:{duration:2},chapter:'story-test',cue:{id:'line',text:'Вопрос и ответ.',clip:{trailingSilence:.05},pauseAfter:.2},
 keepCaptionUntil:value=>captions.push(value),releaseCaption:()=>captions.push('subtitles')});
sound.pendingStory=request();sound.playPendingStory();
assert.equal(captions.at(-1),Infinity,'Only the actual audio end can advance a voiced line');
const before=performance.now();sources[0].onended();
assert(captions.at(-1)>=before+140&&captions.at(-1)<performance.now()+160);
assert.equal(sound.storyPlayback,null);
sound.pendingStory=request();sound.playPendingStory();sound.stopStory();
assert.equal(captions.at(-1),'subtitles','Muting a live recording releases the caption, without freezing the conversation');
const count=captions.length;sources[1].onended();assert.equal(captions.length,count,'A stopped old source cannot advance a replacement line');
assert(sources[1].stopped);
sound.pendingStory={...request(),cue:null};sound.playPendingStory();
assert(Number.isFinite(captions.at(-1)),'Legacy notification captions retain their finite deadline');
sources[2].onended();
console.log('PASS: actual audio completion, recorded pause, voice mute fallback and obsolete audio callbacks');
