// Reuse the game's output/mute/ducking bus. Sources are bounded and created only
// after the player unlocks audio; pause and distance both silence the discharge.
export function createDamAudio(sound){
 let context=null,water,hiss,panner;
 function layer(ctx,buffer,type,hz,q){const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();source.buffer=buffer;source.loop=true;filter.type=type;filter.frequency.value=hz;filter.Q.value=q;gain.gain.value=0;source.connect(filter).connect(gain).connect(panner);source.start();return {source,filter,gain};}
 function update(level,pan,live){
  if(!sound?.context||!sound.enabled||sound.context.state!=='running'){if(context){water.gain.gain.setTargetAtTime(0,context.currentTime,.08);hiss.gain.gain.setTargetAtTime(0,context.currentTime,.08);}return;}
  if(!context){
   context=sound.context;panner=context.createStereoPanner();panner.connect(sound.effectsOutput);
   const buffer=context.createBuffer(1,context.sampleRate*3,context.sampleRate),samples=buffer.getChannelData(0);let low=0,seed=314159;
   for(let i=0;i<samples.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const white=seed/2147483648-1;low=.97*low+.03*white;samples[i]=white*.35+low*3;}
   water=layer(context,buffer,'lowpass',750,.65);hiss=layer(context,buffer,'bandpass',3400,.55);
  }
  const now=context.currentTime,value=live?Math.max(0,Math.min(1,level)):0;
  panner.pan.setTargetAtTime(Math.max(-.85,Math.min(.85,pan)),now,.15);
  water.gain.gain.setTargetAtTime(value*.26,now,.14);hiss.gain.gain.setTargetAtTime(value*.11,now,.09);
 }
 return {update,get active(){return !!context;}};
}
