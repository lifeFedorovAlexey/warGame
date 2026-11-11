// Local rotor throb and filtered air noise; no shared simulation randomness.
export function createKorovnikAudio(sound){
 let graph=null;
 return {update({active,speed,distance}){
  const ctx=sound.context;if(!ctx||!sound.output)return;
  if(!graph){const gain=ctx.createGain(),osc=ctx.createOscillator(),second=ctx.createOscillator(),filter=ctx.createBiquadFilter(),noise=ctx.createBufferSource(),lfo=ctx.createOscillator(),pulse=ctx.createGain();
   const buffer=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate),data=buffer.getChannelData(0);let seed=26;
   for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=(seed/4294967296-.5)*.35;}
   noise.buffer=buffer;noise.loop=true;filter.type='lowpass';filter.frequency.value=220;noise.connect(filter);osc.type='sine';second.type='triangle';osc.connect(filter);second.connect(filter);filter.connect(gain);gain.gain.value=0;gain.connect(sound.output);lfo.connect(pulse);pulse.connect(gain.gain);pulse.gain.value=0;osc.start();second.start();noise.start();lfo.start();graph={gain,osc,second,lfo,pulse};
  }
  const level=active ? .09/(1+(distance/550)**2) : 0,now=ctx.currentTime;
  graph.gain.gain.setTargetAtTime(level,now,.2);graph.pulse.gain.setTargetAtTime(level*.3,now,.2);graph.osc.frequency.setTargetAtTime(34+speed*1.6,now,.2);graph.second.frequency.setTargetAtTime(67+speed*2.4,now,.2);graph.lfo.frequency.setTargetAtTime(4+speed*.45,now,.2);
 }};
}
