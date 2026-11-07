// Story timing comes from the delivered Russian recordings, not estimated text length.
export function buildTimeline(story,audio,sceneIds){
 const cues=new Map(story.dialogue.map(c=>[c.id,c])),segments=[];let time=0;
 for(const entry of sceneIds){const id=typeof entry==='string'?entry:entry.scene,scene=story.scenes.find(s=>s.id===id);if(!scene)throw new Error('Unknown scene '+id);const start=time,lines=[];time+=1;
  for(const key of typeof entry==='string'?scene.cues:entry.cues){const cue=cues.get(key),clip=audio.clips[key];if(!clip||!(clip.duration>0))throw new Error('Missing recording '+key);lines.push({...cue,start:time,end:time+clip.duration,clip});time+=clip.duration+cue.pauseAfter;}
  time+=1.3;segments.push({scene,start,end:time,lines});
 }
 return {segments,duration:time};
}

export class CinematicPlayer{
 constructor({canvas,story,audio,base,onState=()=>{},onFinish=()=>{}}){
  Object.assign(this,{canvas,story,audio,base,onState,onFinish});this.context=canvas.getContext('2d',{alpha:false});this.buffers=new Map();this.images=new Map();this.time=0;this.playing=false;this.loading=false;this.finished=false;this.generation=0;this.volume=.85;this.motion=!matchMedia('(prefers-reduced-motion: reduce)').matches;this.activeCue=null;this.sceneId=null;this.lastUi=0;this.ambienceNodes=[];
  this.frame=this.frame.bind(this);this.raf=requestAnimationFrame(this.frame);
 }
 state(){return {time:this.clock(),duration:this.timeline?.duration??0,playing:this.playing,loading:this.loading,finished:this.finished,scene:this.segmentAt(this.clock())?.scene.id??null,cue:this.cueAt(this.clock())?.id??null,motion:this.motion,volume:this.volume};}
 clock(){return this.playing?Math.min(this.timeline.duration,this.time+this.audioContext.currentTime-this.startedAt):this.time;}
 segmentAt(t){return this.timeline?.segments.find(s=>t>=s.start&&t<s.end)??this.timeline?.segments.at(-1);}
 cueAt(t){return this.segmentAt(t)?.lines.find(c=>t>=c.start&&t<c.end);}
 async initAudio(){if(!this.audioContext){this.audioContext=new AudioContext();this.master=this.audioContext.createGain();this.master.gain.value=this.volume;this.master.connect(this.audioContext.destination);this.speech=this.audioContext.createGain();this.speech.connect(this.master);this.ambience=this.audioContext.createGain();this.ambience.gain.value=.45;this.ambience.connect(this.master);}await this.audioContext.resume();}
 async buffer(file){if(!this.buffers.has(file)){const task=fetch(this.base+file).then(r=>{if(!r.ok)throw new Error('Audio '+r.status+': '+file);return r.arrayBuffer();}).then(bytes=>this.audioContext.decodeAudioData(bytes));this.buffers.set(file,task);}return this.buffers.get(file);}
 async image(file){if(!this.images.has(file)){const task=new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('Illustration missing: '+file));image.src=this.base+file;});this.images.set(file,task);}return this.images.get(file);}
 async preload(segment){if(!segment)return;const image=await this.image(segment.scene.art);segment.image=image;await Promise.all(segment.lines.map(c=>this.buffer(c.clip.file)));const ambience=this.audio.ambience[segment.scene.ambience];if(ambience)await this.buffer(ambience.file);}
 async load(sceneIds){
  this.pause();const generation=++this.generation;this.timeline=buildTimeline(this.story,this.audio,sceneIds);this.time=0;this.finished=false;this.loading=true;this.onState(this.state());
  try{await this.initAudio();if(generation!==this.generation)return;await this.preload(this.timeline.segments[0]);if(generation!==this.generation)return;this.draw(0);}finally{if(generation===this.generation){this.loading=false;this.onState(this.state());}}
 }
 async play(){
  if(!this.timeline)throw new Error('No selected chapter');const generation=++this.generation;this.loading=true;this.onState(this.state());
  try{await this.initAudio();if(generation!==this.generation)return;if(this.finished){this.time=0;this.finished=false;}await this.preload(this.segmentAt(this.time));if(generation!==this.generation)return;this.startedAt=this.audioContext.currentTime;this.playing=true;}finally{if(generation===this.generation){this.loading=false;this.onState(this.state());}}
 }
 pause(){if(this.playing)this.time=this.clock();this.playing=false;this.loading=false;this.generation++;this.stopAudio();this.onState(this.state());}
 async seek(time){
  const resume=this.playing;this.pause();const generation=++this.generation;this.time=Math.max(0,Math.min(this.timeline.duration,time));this.finished=false;this.loading=true;this.onState(this.state());
  try{await this.preload(this.segmentAt(this.time));if(generation!==this.generation)return;this.draw(this.time);this.loading=false;if(resume)await this.play();else this.onState(this.state());}finally{if(generation===this.generation){this.loading=false;this.onState(this.state());}}
 }
 skip(){if(!this.timeline||this.finished)return;this.pause();this.time=this.timeline.duration;this.finished=true;this.draw(this.time);this.onState(this.state());this.onFinish();}
 setVolume(value){this.volume=Math.max(0,Math.min(1,value));if(this.master)this.master.gain.setTargetAtTime(this.volume,this.audioContext.currentTime,.025);}
 stopAudio(){if(this.source){try{this.source.stop();}catch{}this.source=null;}for(const node of this.ambienceNodes){try{node.source.stop();}catch{}}this.ambienceNodes=[];this.activeCue=null;this.sceneId=null;}
 async startAmbience(segment){
  const id=segment.scene.id,generation=this.generation,clip=this.audio.ambience[segment.scene.ambience];if(!clip)return;const buffer=await this.buffer(clip.file);if(!this.playing||this.sceneId!==id||generation!==this.generation)return;
  const now=this.audioContext.currentTime;for(const node of this.ambienceNodes){node.gain.gain.setTargetAtTime(0,now,.18);node.source.stop(now+.8);}this.ambienceNodes=[];
  const source=this.audioContext.createBufferSource(),gain=this.audioContext.createGain();source.buffer=buffer;source.loop=true;gain.gain.value=0;source.connect(gain);gain.connect(this.ambience);gain.gain.setTargetAtTime(1,now,.2);source.start(0,Math.max(0,this.clock()-segment.start)%buffer.duration);this.ambienceNodes.push({source,gain});
 }
 async startCue(cue){
  const key=cue.id,generation=this.generation;this.activeCue=key;if(this.source){try{this.source.stop();}catch{}this.source=null;}
  const buffer=await this.buffer(cue.clip.file);if(!this.playing||this.activeCue!==key||generation!==this.generation)return;const offset=Math.max(0,this.clock()-cue.start);if(offset>=buffer.duration)return;
  const source=this.audioContext.createBufferSource();source.buffer=buffer;source.connect(this.speech);source.onended=()=>{if(this.source===source)this.source=null;};source.start(0,offset);this.source=source;
 }
 async transition(segment){
  this.pause();const generation=++this.generation;this.loading=true;this.onState(this.state());try{await this.preload(segment);if(generation!==this.generation)return;this.startedAt=this.audioContext.currentTime;this.playing=true;this.loading=false;this.onState(this.state());}catch(error){if(generation===this.generation){this.loading=false;this.onState({...this.state(),error:error.message});}}
 }
 frame(){
  this.raf=requestAnimationFrame(this.frame);if(!this.timeline)return;const time=this.clock(),segment=this.segmentAt(time);if(!segment)return;
  if(this.playing&&!segment.image){this.transition(segment);return;}
  if(this.playing&&this.sceneId!==segment.scene.id){this.sceneId=segment.scene.id;this.startAmbience(segment);const next=this.timeline.segments[this.timeline.segments.indexOf(segment)+1];this.preload(next).catch(()=>{});
   // Keep decoded memory bounded to current and next scenes.
   const keep=new Set([segment,next].filter(Boolean).flatMap(s=>s.lines.map(c=>c.clip.file).concat(this.audio.ambience[s.scene.ambience]?.file??[])));for(const file of this.buffers.keys())if(!keep.has(file))this.buffers.delete(file);for(const file of this.images.keys())if(file!==segment.scene.art&&file!==next?.scene.art)this.images.delete(file);for(const old of this.timeline.segments)if(old!==segment&&old!==next)old.image=null;
  }
  const cue=this.cueAt(time);if(this.playing&&cue?.id!==this.activeCue){if(cue)this.startCue(cue);else{this.activeCue=null;if(this.source){try{this.source.stop();}catch{}this.source=null;}}}
  if(this.playing)this.ambience.gain.setTargetAtTime(cue ? .20 : .55,this.audioContext.currentTime,.12);
  if(this.playing||this.lastDrawTime!==time){this.draw(time);this.lastDrawTime=time;}
  if(performance.now()-this.lastUi>100){this.lastUi=performance.now();this.onState(this.state());}
  if(this.playing&&time>=this.timeline.duration){this.pause();this.finished=true;this.onState(this.state());this.onFinish();}
 }
 draw(time){
  const ctx=this.context,w=this.canvas.width,h=this.canvas.height,segment=this.segmentAt(time);ctx.fillStyle='#080b0c';ctx.fillRect(0,0,w,h);if(!segment?.image)return;
  const phase=Math.max(0,Math.min(1,(time-segment.start)/(segment.end-segment.start))),motion=segment.scene.motion,zoom=this.motion?motion.from[2]+(motion.to[2]-motion.from[2])*phase:1.035,panX=this.motion?(motion.from[0]+(motion.to[0]-motion.from[0])*phase)*w:0,panY=this.motion?(motion.from[1]+(motion.to[1]-motion.from[1])*phase)*h:0;
  const image=segment.image,scale=Math.max(w/image.width,h/image.height)*zoom,iw=image.width*scale,ih=image.height*scale;ctx.drawImage(image,(w-iw)/2+panX,(h-ih)/2+panY,iw,ih);
  const fade=Math.min(1,(time-segment.start)/.75,(segment.end-time)/.75);if(fade<1){ctx.fillStyle='rgba(0,0,0,'+(1-Math.max(0,fade))+')';ctx.fillRect(0,0,w,h);}
  const gradient=ctx.createLinearGradient(0,h*.62,0,h);gradient.addColorStop(0,'transparent');gradient.addColorStop(1,'rgba(0,0,0,.82)');ctx.fillStyle=gradient;ctx.fillRect(0,h*.62,w,h*.38);
  const cue=this.cueAt(time);if(cue){const size=Math.round(w/48),max=w*.84;ctx.font='500 '+size+'px "Segoe UI",Arial,sans-serif';const words=cue.text.split(' '),lines=[];let line='';for(const word of words){const next=line?line+' '+word:word;if(ctx.measureText(next).width>max&&line){lines.push(line);line=word;}else line=next;}if(line)lines.push(line);const bottom=h*.91,start=bottom-(lines.length-1)*size*1.4;ctx.textAlign='left';ctx.fillStyle='#c7d1a6';ctx.font='600 '+Math.round(size*.66)+'px "Segoe UI",Arial,sans-serif';ctx.fillText(this.story.speakers[cue.speaker].name.toUpperCase(),w*.08,start-size*1.25);ctx.fillStyle='#f1eee4';ctx.font='500 '+size+'px "Segoe UI",Arial,sans-serif';lines.forEach((text,i)=>ctx.fillText(text,w*.08,start+i*size*1.4));}
  if(time-segment.start<4&&!cue){ctx.font='600 '+Math.round(w/70)+'px "Segoe UI",Arial,sans-serif';ctx.textAlign='left';ctx.fillStyle='#e8e5d7';ctx.fillText(segment.scene.title.toUpperCase(),w*.08,h*.84);}
  if(segment.scene.number===1){const last=segment.lines.at(-1),elapsed=time-last.end;if(elapsed>=0&&elapsed<.42){ctx.fillStyle='rgba(255,250,226,'+(1-elapsed/.42)+')';ctx.fillRect(0,0,w,h);}}
 }
 dispose(){cancelAnimationFrame(this.raf);this.stopAudio();this.audioContext?.close();this.buffers.clear();this.images.clear();}
}
