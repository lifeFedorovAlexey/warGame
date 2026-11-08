// Brief, bounded 2D effects for the dream. No bodies, terrain changes or gameplay damage.
import {drawDreamGlobe} from './dream-globe.js';
export const DREAM_BLAST_SECONDS=12;
const clamp=x=>Math.max(0,Math.min(1,x));
const ease=x=>1-Math.pow(1-clamp(x),3);
const random=i=>{const n=Math.sin(i*127.1+311.7)*43758.5453;return n-Math.floor(n);};

function polygon(ctx,x,y,rx,ry,seed,color) {
  ctx.fillStyle=color;ctx.beginPath();
  for(let i=0;i<11;i++){
    const angle=i/11*Math.PI*2,r=.86+random(seed+i)*.2;
    const px=x+Math.cos(angle)*rx*r,py=y+Math.sin(angle)*ry*r;
    if(i)ctx.lineTo(px,py);else ctx.moveTo(px,py);
  }
  ctx.closePath();ctx.fill();
  // Broad facets catch light without glossy gradients or outlined cartoon puffs.
  if(color!=='#171c14'&&ry>12){
    ctx.save();ctx.clip();ctx.fillStyle='#090f0c';ctx.globalAlpha*=.16;
    ctx.beginPath();ctx.moveTo(x-rx,y+ry);ctx.lineTo(x+rx*.15,y-ry*.2);ctx.lineTo(x+rx,y);ctx.lineTo(x+rx,y+ry);ctx.closePath();ctx.fill();ctx.restore();
  }
}

function mushroom(ctx,age,x,scale,seed) {
  if(age<0)return;
  const grow=ease(age/4.8),cap=ease((age-.2)/3.8),rise=170*grow;
  ctx.save();ctx.translate(x,410);ctx.scale(scale,scale);
  // Dust front spreads along the ground before the column fills the cap.
  ctx.globalAlpha=.42*(1-clamp((age-4)/3));
  for(let i=0;i<20;i++){
    const r=random(seed+i),dx=(i/19-.5)*(130+age*100);
    polygon(ctx,dx,-5-r*16,28+age*4,8+r*11,seed+i,'#776c4d');
  }
  ctx.globalAlpha=1;
  const smoke=['#4f5140','#64624b','#7f7353','#a58b57','#c5a66b'];
  for(let i=0;i<34;i++){
    const f=i/33,r=random(seed+60+i),y=-rise*f;
    const width=(15+Math.sin(f*Math.PI)*12+(1-f)*35)*grow;
    polygon(ctx,Math.sin(f*13+seed)*width*.3,y,width*(.8+r*.5),10+grow*18,seed+80+i,smoke[2+Math.floor(r*3)]);
  }
  // The shelf of dark underside and rolling lobes gives a mushroom silhouette.
  polygon(ctx,0,-rise,125*cap,35*cap,seed+400,'#4e4c3a');
  for(let i=0;i<44;i++){
    const a=i*2.39996,r=Math.sqrt(random(seed+120+i));
    const dx=Math.cos(a)*100*r*cap,dy=Math.sin(a)*36*r*cap;
    const light=clamp((.7-dy/65)+(random(seed+i)-.5)*.55);
    polygon(ctx,dx,-rise-18*cap+dy,(22+random(seed+150+i)*26)*cap,(17+random(seed+170+i)*20)*cap,seed+200+i,smoke[Math.floor(light*4)]);
  }
  ctx.globalAlpha=clamp(1-age/3)*.8;
  polygon(ctx,0,-rise*.62,18*grow,50*grow,seed+500,'#e3bf78');
  ctx.restore();
}

export function drawDreamBlasts(canvas,seconds,{reducedMotion=false}={}) {
  const width=Math.max(1,Math.round(canvas.clientWidth)),height=Math.max(1,Math.round(canvas.clientHeight));
  // Opening-only raster budget is independent of desktop resolution / device DPR.
  const scale=Math.min(1,1280/width,800/height);
  const w=Math.round(width*scale),h=Math.round(height*scale);
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  const c=canvas.getContext('2d');c.clearRect(0,0,w,h);c.fillStyle='#060906';c.fillRect(0,0,w,h);
  c.save();
  const fit=Math.min(w/960,h/570);c.translate((w-960*fit)/2,(h-570*fit)/2);c.scale(fit,fit);
  const light=clamp(Math.exp(-Math.max(0,seconds-.12)*2.5)+ (seconds>2.1?.5*Math.exp(-(seconds-2.1)*3):0));
  polygon(c,480,460,640,90,28,'#171c14');
  mushroom(c,seconds-2.1,650,.65,400);
  mushroom(c,seconds-.12,400,1.23,50);
  // A distant industrial horizon, faceted and muted like the map's buildings.
  for(let i=0;i<24;i++){
    const x=i*42-20,r=random(i+800),bh=18+r*48;
    c.fillStyle=i%3?'#161b13':'#202519';c.fillRect(x,418-bh,33+r*17,bh+25);
    if(i%5===0){c.fillRect(x+9,370-bh,6,70);c.fillStyle='#342f1d';c.fillRect(x+9,378-bh,6,4);}
    c.fillStyle=`rgba(203,170,100,${light*.55})`;
    for(let j=0;j<3;j++)c.fillRect(x+5+j*8,428-bh,3,5);
  }
  c.fillStyle='#080c08';c.beginPath();c.moveTo(0,440);c.lineTo(230,432);c.lineTo(560,453);c.lineTo(960,435);c.lineTo(960,600);c.lineTo(0,600);c.fill();
  c.restore();
  // Two separated, soft pulses, never a strobe. Respect reduced-motion settings.
  c.fillStyle=`rgba(229,215,172,${light*(reducedMotion?.14:.48)})`;c.fillRect(0,0,w,h);
  if(seconds>5.3)drawDreamGlobe(c,w,h,seconds-5.3,{reducedMotion});
}

export function playDreamBlast(context,destination,seed=1) {
  if(!context||context.state!=='running')return null;
  const length=Math.floor(context.sampleRate*3.5),buffer=context.createBuffer(1,length,context.sampleRate),data=buffer.getChannelData(0);
  let state=seed|0,low=0;
  for(let i=0;i<length;i++){state=(Math.imul(state,1664525)+1013904223)|0;const noise=(state>>>0)/2147483648-1;low=low*.98+noise*.02;data[i]=low*2+noise*.08;}
  const source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain(),now=context.currentTime;
  source.buffer=buffer;filter.type='lowpass';filter.frequency.setValueAtTime(650,now);filter.frequency.exponentialRampToValueAtTime(90,now+3.4);
  gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(.65,now+.07);gain.gain.exponentialRampToValueAtTime(.001,now+3.4);
  source.connect(filter).connect(gain).connect(destination);source.start();
  source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
  return source;
}
