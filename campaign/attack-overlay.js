// Transient attack feedback is a functional map indicator, not a HUD panel.
// A single non-interactive canvas handles all concurrent attack locations.
export function createAttackOverlay(host,project){
 let canvas=null,ctx=null,drawn=false;
 function ensure(){
  if(canvas)return;
  canvas=document.createElement('canvas');canvas.id='attack-overlay';canvas.setAttribute('aria-hidden','true');
  canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1;display:none';
  host.append(canvas);ctx=canvas.getContext('2d');
 }
 function clear(){if(canvas&&!canvas.hidden){ctx.clearRect(0,0,canvas.width,canvas.height);canvas.hidden=true;canvas.style.display='none';drawn=false;}}
 function render(pings,now){
  if(!pings.some(p=>p.kind==='attack'&&now<p.until)){clear();return;}
  ensure();canvas.hidden=false;canvas.style.display='block';
  const rect=host.getBoundingClientRect(),ratio=Math.min(1.5,globalThis.devicePixelRatio||1);
  const width=Math.round(rect.width*ratio),height=Math.round(rect.height*ratio);
  if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
  ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,rect.width,rect.height);drawn=true;
  for(const ping of pings){
   if(ping.kind!=='attack'||now>=ping.until)continue;
   const p=project(ping,0);if(!p.visible||p.x<rect.left-45||p.x>rect.right+45||p.y<rect.top-45||p.y>rect.bottom+45)continue;
   const phase=((now-ping.born)%1200)/1200,radius=20+phase*10;
   ctx.save();ctx.translate(p.x-rect.left,p.y-rect.top);ctx.globalAlpha=.9-phase*.4;ctx.lineCap='square';
   const arcs=()=>{ctx.beginPath();for(let i=0;i<4;i++){const a=i*Math.PI/2+.13;ctx.moveTo(radius*Math.cos(a),radius*Math.sin(a));ctx.arc(0,0,radius,a,a+Math.PI/2-.26);}};
   ctx.lineWidth=5;ctx.strokeStyle='rgba(25,16,13,.85)';arcs();ctx.stroke();
   ctx.lineWidth=2.5;ctx.strokeStyle='#ff514b';arcs();ctx.stroke();ctx.restore();
  }
 }
 return {render,clear,get visible(){return !!canvas&&!canvas.hidden&&drawn;}};
}
