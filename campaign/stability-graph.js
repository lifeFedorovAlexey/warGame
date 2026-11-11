// Optional diagnostic: a 15-second, peak-preserving history of frame and CPU work.
export function createStabilityGraph(){
 const size=120,bucketMs=125;
 const frames=new Float32Array(size),ids=new Float64Array(size).fill(-1);
 const framePeak=new Float32Array(size),simulation=new Float32Array(size),world=new Float32Array(size),other=new Float32Array(size);
 const unitPeak=new Float32Array(size),rateMin=new Float32Array(size),rateAtSpeed=new Float32Array(size);
 let count=0,next=0,last=null,lastPaint=0,canvas=null,ctx=null,visible=false;
 let rateStart=null,rateTicks=0,rate=null,rateSpeed=null,wasRunning=false,runningStarted=0;
 function ensureCanvas(){
  if(canvas)return;
  canvas=document.createElement('canvas');canvas.id='stability-graph';canvas.setAttribute('role','img');
  canvas.setAttribute('aria-label','Стабильность кадров, скорость симуляции и загрузка процессора за 15 секунд');
  canvas.style.cssText='position:fixed;right:12px;top:36px;width:min(260px,36vw);height:108px;z-index:9999;pointer-events:none';
  document.body.append(canvas);ctx=canvas.getContext('2d');
 }
 function bucket(now){
  const id=Math.floor(now/bucketMs),i=id%size;
  if(ids[i]!==id){ids[i]=id;framePeak[i]=simulation[i]=world[i]=other[i]=unitPeak[i]=0;rateMin[i]=Infinity;rateAtSpeed[i]=0;}
  return i;
 }
 function recent(now,fn){
  const id=Math.floor(now/bucketMs);
  for(let i=0;i<size;i++)if(ids[i]>id-size&&ids[i]<=id)fn(i,id-ids[i]);
 }
 function unitAge(mission,now){
  if(!mission?.unitFrameTimes)return null;
  let age=null;
  for(const unit of mission.state.units){
   if(unit.hp<=0||!unit.path?.length)continue;
   const at=mission.unitFrameTimes.get(unit);
   if(Number.isFinite(at)&&at>=runningStarted)age=Math.max(age??0,Math.max(0,now-at));
  }
  return age;
 }
 function paint(now,interval,info){
  const rect=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2),w=rect.width,h=rect.height;
  if(!w||!h)return;
  const pw=Math.round(w*dpr),ph=Math.round(h*dpr);
  if(canvas.width!==pw||canvas.height!==ph){canvas.width=pw;canvas.height=ph;}
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  ctx.font='11px sans-serif';ctx.textBaseline='top';ctx.lineWidth=3;ctx.strokeStyle='rgba(20,16,12,.95)';ctx.fillStyle='#f4dfb3';
  const label=(s,y)=>{ctx.strokeText(s,0,y);ctx.fillText(s,0,y);};
  const values=Array.from({length:count},(_,i)=>frames[(next-count+i+size)%size]).sort((a,b)=>a-b);
  const p95=values[Math.min(values.length-1,Math.floor(values.length*.95))]??0;
  const age=info.running?unitAge(info.mission,info.finishedAt):null;
  if(age!==null){const i=bucket(now);unitPeak[i]=Math.max(unitPeak[i],age);}
  let f=0,s=0,v=0,o=0,u=0,min=Infinity;
  recent(now,i=>{f=Math.max(f,framePeak[i]);s=Math.max(s,simulation[i]);v=Math.max(v,world[i]);o=Math.max(o,other[i]);u=Math.max(u,unitPeak[i]);if(rateAtSpeed[i]===info.speed)min=Math.min(min,rateMin[i]);});
  const fps=1000/interval;
  label(`${fps<1?fps.toFixed(1):Math.round(fps)} FPS · p95 ${p95.toFixed(0)} · пик 15с ${f.toFixed(0)} мс`,0);
  const sim=info.running?(rate===null?'Игра: замер…':`Игра ${rate.toFixed(1)}× / ${info.speed}×${Number.isFinite(min)?' · мин '+min.toFixed(1)+'×':''}`):'Игра: пауза';
  label(sim,15);
  label(`CPU 15с: сим ${s.toFixed(1)} · мир ${v.toFixed(1)} · проч ${o.toFixed(1)} мс`,30);
  label(`Юниты ${age===null?'—':Math.round(age)+' мс'} · пик 15с ${u?Math.round(u)+' мс':'—'}`,45);
  const top=65,bottom=h-3,graphHeight=bottom-top;
  ctx.setLineDash([3,4]);ctx.lineWidth=1;ctx.strokeStyle='rgba(235,211,167,.5)';
  for(const ms of [16.67,33.33]){const y=bottom-graphHeight*ms/100;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
  ctx.setLineDash([]);
  const bar=Math.max(1,w/size);
  recent(now,(i,back)=>{
   const value=framePeak[i],x=w-(back+1)*bar,y=bottom-graphHeight*Math.min(value,100)/100;
   ctx.fillStyle=value>33.33?'#ed8455':value>16.67?'#e9c476':'#d6d8af';ctx.fillRect(x,y,Math.max(1,bar-.5),bottom-y);
  });
 }
 return {
  get enabled(){return visible;},
  toggle(){
   visible=!visible;
   if(visible){ensureCanvas();canvas.hidden=false;count=0;next=0;last=null;lastPaint=0;ids.fill(-1);rateStart=null;rateTicks=0;rate=null;rateSpeed=null;wasRunning=false;}
   else if(canvas){canvas.hidden=true;last=null;}
   return visible;
  },
  sample(now,info){
   if(!visible)return;
   if(!info.running){rateStart=null;rateTicks=0;rate=null;wasRunning=false;}
   else{
    if(!wasRunning){runningStarted=info.finishedAt;}
    if(!wasRunning||rateSpeed!==info.speed){rateStart=now;rateTicks=0;rate=null;rateSpeed=info.speed;}
    wasRunning=true;rateTicks+=info.ticks;
    if(now-rateStart>=1000){
     rate=rateTicks*info.step*1000/(now-rateStart);rateStart=now;rateTicks=0;
     const i=bucket(now);if(rateAtSpeed[i]!==info.speed){rateAtSpeed[i]=info.speed;rateMin[i]=Infinity;}rateMin[i]=Math.min(rateMin[i],rate);
    }
   }
   if(last!==null){
    const interval=now-last;
    if(interval>0){
     frames[next]=interval;next=(next+1)%size;count=Math.min(count+1,size);
     const i=bucket(now);framePeak[i]=Math.max(framePeak[i],interval);simulation[i]=Math.max(simulation[i],info.simulationMs);world[i]=Math.max(world[i],info.worldMs);other[i]=Math.max(other[i],info.otherMs);
     if(now-lastPaint>=250){paint(now,interval,info);lastPaint=now;}
    }
   }
   last=now;
  },
 };
}
