export class MissionSound{
 constructor(story,audio,base,onCaption){Object.assign(this,{story,audio,base,onCaption});this.buffers=new Map();this.nextAllowed=0;this.enabled=true;this.serial=0;}
 async unlock(){if(!this.context){this.context=new AudioContext();this.gain=this.context.createGain();this.gain.gain.value=.7;this.gain.connect(this.context.destination);}await this.context.resume();}
 stop(){this.serial++;if(this.source){try{this.source.stop();}catch{}this.source=null;}this.onCaption?.('');}
 async say(id,{important=false}={}){
  if(!this.context||!this.enabled||(!important&&(this.source||this.context.currentTime<this.nextAllowed)))return;const cue=this.story.barks.find(item=>item.id===id);if(!cue)return;
  this.stop();const serial=this.serial;this.nextAllowed=this.context.currentTime+3;
  try{const clip=this.audio.clips[id];if(!this.buffers.has(id))this.buffers.set(id,fetch(this.base+clip.file).then(r=>{if(!r.ok)throw new Error('Recording '+r.status);return r.arrayBuffer();}).then(bytes=>this.context.decodeAudioData(bytes)));const buffer=await this.buffers.get(id);if(serial!==this.serial||!this.enabled)return;const source=this.context.createBufferSource();source.buffer=buffer;source.connect(this.gain);source.onended=()=>{if(this.source===source){this.source=null;this.onCaption?.('');}};this.source=source;this.onCaption?.(this.story.speakers[cue.speaker].name+': '+cue.text);source.start();}catch(error){this.buffers.delete(id);console.warn('Mission voice:',error.message);}
 }
}
