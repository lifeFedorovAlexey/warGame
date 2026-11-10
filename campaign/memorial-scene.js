import {graveAppearance,MemorialGraveArt} from './memorial-graves.js';
import {layoutMemorialGraves} from './memorial-layout.js';
// All coordinates belong to this memorial scene, never to the tactical map.
// There is exactly one grave mound and one three-bar cross per casualty.
const tau=Math.PI*2;
const random=i=>{const x=Math.sin(i*127.1+13.7)*43758.5453;return x-Math.floor(x);};
const mix=(a,b,t)=>a+(b-a)*t;
const halton=(n,b)=>{let v=0,f=1;for(;n;n=Math.floor(n/b)){f/=b;v+=f*(n%b);}return v;};
const ridge=x=>{const p=[[0,.95],[.4,.72],[.58,.62],[.7,.51],[.8,.40],[.9,.34],[1,.36]];for(let i=1;i<p.length;i++)if(x<=p[i][0]){const [a,b]=p[i-1],[c,d]=p[i];return mix(b,d,(x-a)/(c-a));}return .36;};
const firstPlots=[[.61,.88],[.13,.72],[.88,.46],[.42,.39],[.73,.16],[.04,.22],[.91,.80],[.40,.66]];
export function gravePosition(index){
 // Compatibility for older diagnostic tools. The actual scene uses
 // layoutMemorialGraves: placement now depends on rank and free space.
 const [u,depth]=firstPlots[index]??[halton(index+13,2),.08+halton(index+11,3)*.43];
 const x=.57+u*.40,y=mix(ridge(x),.93,depth);
 return {x,y,depth,scale:.038+.137*depth*depth,rotation:(random(index+9)-.5)*.05,yaw:-.30+random(index+5)*.70};
}
export const orthodoxCrossBeams=Object.freeze([
 {x:0,y:50,z:0,w:7,h:100,d:7,angle:0},
 {x:0,y:86,z:4,w:27,h:5.4,d:5,angle:0},
 {x:0,y:66,z:4,w:53,h:7,d:6,angle:0},
 // In the front view the left end is higher, the right end lower.
 {x:0,y:25,z:4,w:31,h:5.4,d:5,angle:-Math.PI/9},
]);
const polygon=(ctx,pts)=>{ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();};
function crossFaces(yaw,seed){
 const cs=Math.cos(yaw),sn=Math.sin(yaw),project=([x,y,z])=>({x:x*cs+z*sn,y:-y+(z*cs-x*sn)*.20,depth:z*cs-x*sn});
 const faces=[];
 for(const [index,b] of orthodoxCrossBeams.entries()){
  const c=Math.cos(b.angle),s=Math.sin(b.angle),at=(x,y,z)=>project([b.x+x*c-y*s,b.y+x*s+y*c,b.z+z]);
  const vertices=[];for(const z of [-b.d/2,b.d/2])for(const y of [-b.h/2,b.h/2])for(const x of [-b.w/2,b.w/2])vertices.push(at(x,y,z));
  const specs=[[[0,1,3,2],.23],[[4,6,7,5],.40],[[0,2,6,4],.78],[[1,5,7,3],.24],[[2,3,7,6],.91]];
  for(const [ids,light] of specs){const points=ids.map(i=>vertices[i]);faces.push({points,depth:points.reduce((n,p)=>n+p.depth,0)/4,light,beam:index});}
  // Long broken fibres follow each timber, with stable wear per grave.
  const grain=[];
  for(let j=0;j<22;j++){
   const along=random(seed*31+index*79+j),cross=random(seed*17+index*59+j+100);
   const vertical=index===0,x=vertical?(cross-.5)*b.w:(along-.5)*b.w,y=vertical?(along-.5)*b.h:(cross-.5)*b.h;
   const length=(vertical?b.h:b.w)*(.06+random(j+seed)*.30),endX=vertical?x+.15:Math.min(b.w/2,x+length),endY=vertical?Math.min(b.h/2,y+length):y+.1;
   grain.push([at(x,y,b.d/2+.03),at(endX,endY,b.d/2+.03)]);
  }
  faces.findLast(f=>f.beam===index&&f.light===.40).grain=grain;
 }
 return faces.sort((a,b)=>a.depth-b.depth);
}
function shadow(ctx,g,art){
 if(g.zone==='hill'){
  ctx.save();ctx.translate(g.x,g.y-g.size*.024);ctx.fillStyle='#17120f38';ctx.shadowColor='#17120f55';ctx.shadowBlur=Math.max(1,g.size*.055);
  ctx.beginPath();ctx.ellipse(0,0,g.size*.32,g.size*.047,0,0,tau);ctx.fill();ctx.restore();
 }
 const away=Math.max(-.9,Math.min(.9,(g.x-(art.ox+art.iw*.75))/(art.iw*.33)));
 const {x,y,size,yaw}=g;ctx.save();ctx.translate(x,y-size*.10);ctx.scale(size*.87/100,size*.87/100);
 ctx.fillStyle='#17120f30';ctx.shadowColor='#17120f35';ctx.shadowBlur=3.5;
 for(const face of crossFaces(yaw,g.index).filter(f=>f.light===.40)){
  polygon(ctx,face.points.map(p=>({x:p.x-p.y*away,y:-p.y*.24})));ctx.fill();
 }
 ctx.restore();
}
function bird(ctx,x,y,size,t,direction,bank){
 ctx.save();ctx.translate(x,y);ctx.rotate(bank);ctx.scale(size*direction,size);ctx.fillStyle='#1c2421';
 // Brief wingbeats between long glides; the body stays level when travelling left.
 const phase=t%9,flapping=phase<1.5,wing=flapping?.65+Math.sin(phase*tau*2)*.48:.79+Math.sin(t*.7)*.04;
 ctx.beginPath();ctx.ellipse(0,0,.52,.13,0,0,tau);ctx.fill();
 ctx.beginPath();ctx.arc(.43,-.035,.14,0,tau);ctx.fill();
 polygon(ctx,[{x:.52,y:-.07},{x:.76,y:-.015},{x:.51,y:.04}]);ctx.fill();
 polygon(ctx,[{x:-.35,y:-.06},{x:-.98,y:-.15},{x:-.91,y:.16},{x:-.35,y:.07}]);ctx.fill();
 for(const side of [-1,1]){
  ctx.beginPath();ctx.moveTo(.13,0);ctx.bezierCurveTo(-.12,side*wing,-.65,side*wing*1.35,-1.35,side*wing*1.6);
  ctx.lineTo(-1.18,side*wing*1.05);ctx.lineTo(-1.28,side*wing*.94);ctx.lineTo(-.72,side*.23);ctx.lineTo(-.28,side*.08);ctx.closePath();ctx.fill();
 }
 ctx.restore();
}

// Only the transparent cloth is deformed. The hoist and the background never move.
export function flagVertex(flag,u,v,t){
 const free=Math.max(0,(.984-u)/.984),gust=.78+.22*Math.sin(t*.63),phase=t*3.1+free*7.5;
 return {u,v,x:flag.x+u*flag.w+free*flag.w*.018*gust*Math.sin(phase+v*2),
  y:flag.y+v*flag.h+free*flag.h*gust*(.105*Math.sin(phase-v*1.8)+.035*Math.sin(t*5.2+free*13+v*3))};
}
class FlagCloth{
 constructor(texture){
  this.texture=texture;this.canvas=document.createElement('canvas');
  this.canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.ready=false;});
  this.canvas.addEventListener('webglcontextrestored',()=>this.setup());
  this.gl=this.canvas.getContext('webgl',{alpha:true,antialias:false,premultipliedAlpha:true,preserveDrawingBuffer:true});
  if(this.gl)this.setup();
 }
 setup(){
  const gl=this.gl,shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
  const program=this.program=gl.createProgram();
  gl.attachShader(program,shader(gl.VERTEX_SHADER,'attribute vec2 position;attribute vec2 uv;varying vec2 texcoord;void main(){texcoord=uv;gl_Position=vec4(position,0.,1.);}'));
  gl.attachShader(program,shader(gl.FRAGMENT_SHADER,'precision mediump float;uniform sampler2D cloth;varying vec2 texcoord;void main(){gl_FragColor=texture2D(cloth,texcoord);}'));
  gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);this.cols=24;this.rows=6;
  this.vertices=new Float32Array((this.cols+1)*(this.rows+1)*4);
  this.vertexBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.vertexBuffer);
  for(const [name,offset] of [['position',0],['uv',8]]){const loc=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,16,offset);}
  const indices=[];for(let y=0;y<this.rows;y++)for(let x=0;x<this.cols;x++){const i=y*(this.cols+1)+x;indices.push(i,i+1,i+this.cols+1,i+1,i+this.cols+2,i+this.cols+1);}
  this.indexBuffer=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.indexBuffer);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);this.indexCount=indices.length;
  this.gpuTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.gpuTexture);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,this.texture);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.uniform1i(gl.getUniformLocation(program,'cloth'),0);this.ready=true;
 }
 draw(ctx,flag,t,dpr){
  if(!this.ready){ctx.drawImage(this.texture,flag.x,flag.y,flag.w,flag.h);return;}
  const gl=this.gl,w=Math.ceil(flag.w*1.08*dpr),h=Math.ceil(flag.h*1.4*dpr);
  if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}
  gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
  const local={x:0,y:0,w:1,h:1};let k=0;
  for(let y=0;y<=this.rows;y++)for(let x=0;x<=this.cols;x++){
   const p=flagVertex(local,x/this.cols,y/this.rows,t);
   this.vertices[k++]=(p.x+.04)/1.08*2-1;this.vertices[k++]=1-(p.y+.2)/1.4*2;this.vertices[k++]=p.u;this.vertices[k++]=p.v;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER,this.vertexBuffer);gl.bufferData(gl.ARRAY_BUFFER,this.vertices,gl.DYNAMIC_DRAW);
  gl.drawElements(gl.TRIANGLES,this.indexCount,gl.UNSIGNED_SHORT,0);
  ctx.drawImage(this.canvas,flag.x-flag.w*.04,flag.y-flag.h*.2,flag.w*1.08,flag.h*1.4);
 }
}

export class MemorialScene{
 constructor(canvas){
  this.canvas=canvas;this.ctx=canvas.getContext('2d');this.cache=document.createElement('canvas');this.cacheCtx=this.cache.getContext('2d');
  this.graveSprites=new WeakMap();
  this.image=new Image();this.image.src='../assets/campaign/personnel/memorial-hill-clean-v2.png';this.image.onload=()=>this.resize();
  this.graveImage=new Image();this.graveImage.src='../assets/campaign/personnel/grave-private-v2.png';this.graveImage.onload=()=>this.resize();
  this.graveArt=new MemorialGraveArt(()=>this.resize());
  this.flagImage=new Image();this.flagImage.src='../assets/campaign/personnel/rai-flag-cloth.png';this.flagImage.onload=()=>{
   this.flagTexture=document.createElement('canvas');this.flagTexture.width=this.flagImage.width;this.flagTexture.height=this.flagImage.height;
   const ctx=this.flagTexture.getContext('2d');ctx.filter='saturate(.68) brightness(.65) contrast(.9)';ctx.drawImage(this.flagImage,0,0);this.flagCloth=new FlagCloth(this.flagTexture);this.canvas.dataset.memorialFlag='ready';this.resize();
  };
  this.graves=[];this.current=-1;this.frameCount=0;this.animationFrames=0;this.time=0;this.running=false;
  this.motion=matchMedia('(prefers-reduced-motion: reduce)');this.motion.addEventListener('change',()=>{this.stop();if(!this.canvas.closest('[hidden]'))this.start();});
  this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)this.stop();else if(!this.canvas.closest('[hidden]'))this.start();});
 }
 setData(graves){this.graves=graves;this.layoutKey=null;this.current=-1;this.time=0;this.graveArt.ensure(graves);this.resize();}
 start(){if(this.running)return;this.running=true;this.last=performance.now();this.resize();if(!this.motion.matches)this.raf=requestAnimationFrame(t=>this.animate(t));}
 stop(){this.running=false;cancelAnimationFrame(this.raf);this.raf=null;}
 animate(now){
  if(!this.running||this.motion.matches||document.hidden)return;
  if(now-this.last>=1000/24){this.time+=Math.min(.1,(now-this.last)/1000);this.last=now;this.animationFrames++;this.canvas.dataset.memorialAnimationFrames=String(this.animationFrames);this.draw();}
  this.raf=requestAnimationFrame(t=>this.animate(t));
 }
 inspect(index){if(this.current===index)return;this.current=index;this.draw();}
 resize(){
  const w=this.canvas.clientWidth,h=this.canvas.clientHeight;if(!w||!h||!this.image.naturalWidth||!this.graveImage.naturalWidth)return;
  this.width=w;this.height=h;this.dpr=Math.min(2,window.devicePixelRatio||1);
  for(const c of [this.canvas,this.cache]){c.width=Math.round(w*this.dpr);c.height=Math.round(h*this.dpr);}
  const ctx=this.cacheCtx;ctx.setTransform(this.dpr,0,0,this.dpr,0,0);
  const sx=Math.max(w/this.image.width,h/this.image.height),iw=this.image.width*sx,ih=this.image.height*sx;
  const ox=(w-iw)/2,oy=(h-ih)/2;
  ctx.drawImage(this.image,ox,oy,iw,ih);
  // A cool atmospheric veil in the shadows preserves the amber horizon.
  ctx.fillStyle='#152c3725';ctx.fillRect(0,0,w,h);
  this.art={ox,oy,iw,ih};
  const fw=iw*.18,fh=fw*.5,pole=ox+iw*.922;
  this.flag={x:pole-fw*.984,y:oy+ih*.086-fh*.074,w:fw,h:fh,pole};
  const canvasBox=this.canvas.getBoundingClientRect(),root=this.canvas.closest('#result');
  const excluded=[...root?.querySelectorAll('.result-copy h1,#result-message,.result-copy dl,.result-copy h2,.result-rank,.result-honour,#result-history-note,.result-actions')??[]]
   .filter(node=>node.getClientRects().length).map(node=>{const r=node.getBoundingClientRect();return {left:r.left-canvasBox.left-5,right:r.right-canvasBox.left+5,top:r.top-canvasBox.top-4,bottom:r.bottom-canvasBox.top+4};});
  const layoutKey=JSON.stringify([w,h,ox,oy,iw,ih,excluded]);
  if(this.layoutKey!==layoutKey){this.hitAreas=layoutMemorialGraves(this.graves,{width:w,height:h,art:this.art,excluded});this.layoutKey=layoutKey;}
  this.windPlots=this.hitAreas.filter(g=>g.size>=35).sort((a,b)=>b.size-a.size).slice(0,24);
  for(const g of this.hitAreas){shadow(ctx,g,this.art);this.drawGrave(ctx,g);}
  this.draw();
 }
 draw(){
  if(!this.width||!this.image.naturalWidth||!this.graveImage.naturalWidth)return;
  const {ctx,width:w,height:h}=this;ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,this.canvas.width,this.canvas.height);ctx.drawImage(this.cache,0,0);ctx.setTransform(this.dpr,0,0,this.dpr,0,0);
  const t=this.motion.matches?0:this.time;
  this.waveFlag(ctx,t);
  this.atmosphere(ctx,w,h,t);
  const selected=this.hitAreas?.find(g=>g.index===this.current);
  if(selected)this.drawGrave(ctx,selected,true);
  this.birds(ctx,w,h,t);
  this.frameCount++;this.canvas.dataset.memorialFrames=String(this.frameCount);this.canvas.dataset.memorialGraves=String(this.graves.length);
  const art=this.graveArt.status(this.graves);this.canvas.dataset.memorialArtReady=String(art.ready);this.canvas.dataset.memorialArtErrors=art.failed.join(',');
 }
 drawGrave(ctx,g,active=false){
  const source=this.graveArt.get(g.soldier)??this.graveImage;
  let image=this.graveSprites.get(source);
  if(!image){
   image=document.createElement('canvas');const scale=512/Math.max(source.width,source.height);
   image.width=Math.round(source.width*scale);image.height=Math.round(source.height*scale);
   const sprite=image.getContext('2d'),split=Math.floor(image.height*.80);
   // Broaden the round earth mound gradually, keeping the cross and its
   // masonry proportions intact. Source art and casualty records stay intact.
   sprite.drawImage(source,0,0,source.width,split/scale,0,0,image.width,split);
   for(let y=split;y<image.height;y+=2){
    const h=Math.min(2,image.height-y),t=Math.min(1,(y/image.height-.80)/.14),spread=1+.28*t*t*(3-2*t),width=image.width*spread;
    sprite.drawImage(source,0,y/scale,source.width,h/scale,(image.width-width)/2,y,width,h);
   }
   // Ground bounce is weaker on the front of the mound. Let its lowest
   // soil edge settle into the terrain instead of reading as a bright cutout.
   const groundShade=sprite.createLinearGradient(0,image.height*.78,0,image.height);
   groundShade.addColorStop(0,'#211a1400');groundShade.addColorStop(.45,'#211a1418');groundShade.addColorStop(1,'#211a1470');
   sprite.globalCompositeOperation='source-atop';sprite.fillStyle=groundShade;sprite.fillRect(0,image.height*.78,image.width,image.height*.22);
   const groundEdge=sprite.createLinearGradient(0,image.height*.96,0,image.height);
   groundEdge.addColorStop(0,'#fff');groundEdge.addColorStop(1,'#fff0');
   sprite.globalCompositeOperation='destination-in';sprite.fillStyle=groundEdge;sprite.fillRect(0,0,image.width,image.height);
   this.graveSprites.set(source,image);
  }
  const height=g.size,width=image.width/image.height*height;
  ctx.save();ctx.translate(g.x,g.y);ctx.rotate(g.rotation);
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  const hill=g.zone==='hill',brightness=((hill?.82:.53)+g.depth*(hill?.10:.22)+(active?.04:0))*(g.appearance??graveAppearance(g.soldier)).light;
  // Use the material's baked side light rather than outlining the silhouette.
  // Near monuments are opaque; only the distant field fades into the haze.
  ctx.globalAlpha=hill?1:.72+g.depth*.27;
  ctx.filter=`saturate(${hill?.76:.54}) brightness(${brightness}) contrast(${hill?1.04:.87}) blur(${hill?.18-g.depth*.09:.36-g.depth*.24}px)`;
  ctx.drawImage(image,-width*.5,-height*.99,width,height);
  ctx.restore();
 }
 waveFlag(ctx,t){
  const f=this.flag;if(!f||!this.flagTexture)return;
  this.flagCloth.draw(ctx,f,t,this.dpr);
  // The rigid mast occludes the fixed eyelets; it comes from the clean plate.
  const mx=f.pole-1.5,my=Math.max(0,f.y),mh=Math.min(this.height-my,f.h+4);
  ctx.drawImage(this.cache,mx*this.dpr,my*this.dpr,3*this.dpr,mh*this.dpr,mx,my,3,mh);
 }
 birds(ctx,w,h,t){
  const {ox,oy,iw,ih}=this.art,focal=iw*.8;
  // Equal world-size birds at distant depths. Perspective controls both their
  // screen speed and wingspan; resets happen entirely outside the scene.
  for(let i=0;i<3;i++){
   const u=((t+i*27)%(96+i*14))/(96+i*14),direction=i===1?-1:1,z=190+i*38+Math.sin(u*Math.PI)*12;
   const worldX=(-245+u*490)*direction,worldY=24+i*8+Math.sin(u*Math.PI*1.3+i)*1.8;
   const x=ox+iw*.5+focal*worldX/z,y=oy+ih*.43-focal*worldY/z,size=focal*.36/z;
   if(x<-12||x>w+12||y<-12||y>h+12)continue;
   ctx.save();ctx.globalAlpha=.64-i*.08;bird(ctx,x,y,size,t+i*2.7,direction,Math.sin(t*.3+i)*.055);ctx.restore();
  }
 }
 atmosphere(ctx,w,h,t){
  // Wind-driven valley haze is scenery, with no screen-space UI backplate.
  for(let i=0;i<6;i++){
   const drift=((t*(.004+i*.0005)+i*.193)%1.2)-.1,x=w*(.40+drift*.70),y=h*(.57+i*.057);
   ctx.save();ctx.translate(x,y);ctx.scale(w*.17,h*.038);const fog=ctx.createRadialGradient(0,0,0,0,0,1);fog.addColorStop(0,'rgba(139,156,153,0.095)');fog.addColorStop(1,'rgba(139,156,153,0)');ctx.fillStyle=fog;ctx.fillRect(-1,-1,2,2);ctx.restore();
  }
  const gust=Math.sin(t*.61)*1.4+Math.sin(t*1.17)*.5;
  for(const g of this.windPlots??[]){
   for(let i=0;i<7;i++){
    const x=g.x+(random(g.index*11+i)-.1)*g.size*.64,y=g.y+g.size*(.12+random(i+g.index*3)*.22),len=g.size*(.035+random(i+30)*.055);
    ctx.strokeStyle=i%3?'#74765766':'#b3a37566';ctx.lineWidth=.7;
    ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+gust*len*.3,y-len*.7,x+gust*len*.65+len*.3,y-len);ctx.stroke();
   }
  }
  for(let i=0;i<42;i++){
   const f=(t*.022+random(i+90))%1,x=w*(.50+f*.50),y=h*(.53+random(i+8)*.40)+Math.sin(t+i)*2;
   ctx.fillStyle=`rgba(184,171,130,${.06+random(i)*.12})`;ctx.fillRect(x,y,1+random(i)*1.3,.65);
  }
 }
}
