// Optional, lightweight graph of browser frame intervals; no background panel.
export function createStabilityGraph(){
 const samples=new Float32Array(120);let count=0,next=0,last=null,lastPaint=0,canvas=null,ctx=null,visible=false;
 function ensureCanvas(){
  if(canvas)return;
  canvas=document.createElement('canvas');canvas.id='stability-graph';canvas.setAttribute('role','img');
  canvas.setAttribute('aria-label','График времени кадров и частоты кадров');
  canvas.style.cssText='position:fixed;right:12px;top:48px;width:min(220px,30vw);height:76px;z-index:9999;pointer-events:none';
  document.body.append(canvas);ctx=canvas.getContext('2d');
 }
 function paint(now,interval){
  const rect=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2),w=rect.width,h=rect.height;
  if(!w||!h)return;
  const pw=Math.round(w*dpr),ph=Math.round(h*dpr);
  if(canvas.width!==pw||canvas.height!==ph){canvas.width=pw;canvas.height=ph;}
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  ctx.font='11px sans-serif';ctx.textBaseline='top';ctx.lineWidth=3;ctx.strokeStyle='rgba(20,16,12,.9)';ctx.fillStyle='#f4dfb3';
  const label=`${Math.round(1000/interval)} FPS  ·  ${interval.toFixed(1)} мс`;
  ctx.strokeText(label,0,0);ctx.fillText(label,0,0);
  const top=19,bottom=h-3,graphHeight=bottom-top;
  // Two reference lines mark 60 and 30 FPS, not a decorative border.
  ctx.setLineDash([3,4]);ctx.lineWidth=1;ctx.strokeStyle='rgba(235,211,167,.5)';
  for(const ms of [16.67,33.33]){const y=bottom-graphHeight*ms/100;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
  ctx.setLineDash([]);
  const bar=Math.max(1,w/120);
  for(let i=0;i<count;i++){
   const value=samples[(next-count+i+120)%120],x=w-(count-i)*bar,y=bottom-graphHeight*Math.min(value,100)/100;
   ctx.fillStyle=value>33.33?'#ed8455':value>16.67?'#e9c476':'#d6d8af';ctx.fillRect(x,y,Math.max(1,bar-0.5),bottom-y);
  }
  lastPaint=now;
 }
 return {
  toggle(){
   visible=!visible;
   if(visible){ensureCanvas();canvas.hidden=false;count=0;next=0;last=null;lastPaint=0;}
   else if(canvas){canvas.hidden=true;last=null;}
   return visible;
  },
  sample(now){
   if(!visible)return;
   if(last!==null){const interval=now-last;if(interval>0){samples[next]=interval;next=(next+1)%120;count=Math.min(count+1,120);if(now-lastPaint>=250)paint(now,interval);}}
   last=now;
  },
 };
}
