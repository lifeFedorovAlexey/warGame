// One playhead follows the film, including pause/resume. Detonations use the downloaded
// SamsterBirdies recording; room tone and missile flybys remain procedural.
const explosionUrl=new URL('../assets/campaign/alpha/mission01/opening-sfx/astronomical-explosion.mp3',import.meta.url).href;
const recordings=new WeakMap();
export function loadDreamExplosion(context){
 if(!recordings.has(context)){
  const task=fetch(explosionUrl).then(response=>{if(!response.ok)throw new Error('Explosion recording: '+response.status);return response.arrayBuffer();}).then(bytes=>context.decodeAudioData(bytes));
  recordings.set(context,task);task.catch(()=>recordings.delete(context));
 }
 return recordings.get(context);
}
export function createDreamScore(context,movieDuration,tailDuration,explosion=null) {
 const rate=context.sampleRate,length=Math.ceil((movieDuration+tailDuration)*rate),buffer=context.createBuffer(2,length,rate),left=buffer.getChannelData(0),right=buffer.getChannelData(1);
 let state=117,low=0;
 const noise=()=>{state=(Math.imul(state,1664525)+1013904223)|0;return(state>>>0)/2147483648-1;};
 for(let i=0;i<length;i++){
  const t=i/rate,end=Math.max(0,Math.min(1,(movieDuration+13.4-t)/1.4));
  low=low*.99+noise()*.01;
  const breath=Math.exp(-Math.pow((t-1.5)/1.1,2))*.07;
  const room=t<movieDuration?(.004*Math.sin(t*Math.PI*100)+low*.025+noise()*breath):0;
  left[i]=right[i]=room*end;
 }
 function layer(start,seconds,render,pan=0){
  const offset=Math.round(start*rate),n=Math.ceil(seconds*rate),l=Math.sqrt((1-pan)/2),r=Math.sqrt((1+pan)/2);let filtered=0;
  for(let j=0;j<n;j++){const i=offset+j;if(i<0||i>=length)continue;const t=j/rate,white=noise();filtered=filtered*.96+white*.04;const value=render(t,white,filtered);left[i]+=value*l;right[i]+=value*r;}
 }
 for(const [offset,pan] of [[-5.6,-.7],[-3.8,.65]])layer(movieDuration+offset,5.8,(t,n,low)=>{const rise=Math.sin(Math.min(1,t/5.8)*Math.PI);return (low*.35+n*.018+Math.sin(2*Math.PI*(120*t-7*t*t))*.016)*rise*rise;},pan);
 function impact(at,power,pan,seconds,pitch=1){
  if(!explosion)return;
  const sourceL=explosion.getChannelData(0),sourceR=explosion.getChannelData(Math.min(1,explosion.numberOfChannels-1));
  const count=Math.ceil(Math.min(seconds,explosion.duration/pitch)*rate),offset=Math.round(at*rate),step=explosion.sampleRate/rate*pitch;
  for(let j=0;j<count;j++){
   const i=offset+j;if(i>=length)break;const index=j*step,k=Math.floor(index),fraction=index-k;if(k+1>=sourceL.length)break;
   const envelope=Math.min(1,j/(rate*.005),(count-j)/(rate*.22))*power;
   left[i]+=(sourceL[k]+(sourceL[k+1]-sourceL[k])*fraction)*envelope*Math.sqrt(1-pan);
   right[i]+=(sourceR[k]+(sourceR[k+1]-sourceR[k])*fraction)*envelope*Math.sqrt(1+pan);
  }
 }
 impact(movieDuration+.68,.92,-.1,12.3);impact(movieDuration+1.65,.28,.45,4.8,.94);
 for(const [t,p,pan] of [[3.65,.20,-.4],[5.8,.23,.4],[8.2,.25,-.35],[10.5,.22,.3]])impact(movieDuration+t,p,pan,2.9,.86);
 layer(movieDuration+.8,4,(t)=>Math.sin(2*Math.PI*1780*t)*Math.exp(-t*.8)*Math.min(1,t/.15)*.018);
 // Soft saturation and a deliberate silence before the time card. No hard clipping.
 for(let i=0;i<length;i++){const fade=Math.max(0,Math.min(1,(movieDuration+13.8-i/rate)/1.1));left[i]=Math.tanh(left[i]*1.5)*.8*fade;right[i]=Math.tanh(right[i]*1.5)*.8*fade;}
 return buffer;
}

export class DreamSoundtrack {
 constructor(context,destination,movieDuration,tailDuration,explosion=null){this.context=context;this.destination=destination;this.duration=movieDuration;this.tailDuration=tailDuration;this.explosion=explosion;this.buffer=createDreamScore(context,movieDuration,tailDuration,explosion);}
 setExplosion(explosion){if(this.explosion===explosion)return;this.stop();this.explosion=explosion;this.buffer=createDreamScore(this.context,this.duration,this.tailDuration,explosion);}
 sync(time,playing){
  if(!playing){this.stop();return;}
  if(this.source&&Math.abs(this.offset+this.context.currentTime-this.started-time)<.2)return;
  this.stop();if(time>=this.buffer.duration)return;
  const source=this.context.createBufferSource();source.buffer=this.buffer;source.connect(this.destination);source.start(0,Math.max(0,time));
  this.source=source;this.offset=time;this.started=this.context.currentTime;source.onended=()=>{source.disconnect();if(this.source===source)this.source=null;};
 }
 stop(){if(this.source){this.source.stop();this.source.disconnect();this.source=null;}}
}
