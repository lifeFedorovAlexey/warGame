import {MinimapAlerts,MINIMAP_COLORS as colors,MINIMAP_PING_MS} from './minimap-alerts.js';

export function minimapViewport(bounds=[0,0,127,127]){
 const [left,top,right,bottom]=bounds,span=Math.max(1,right-left,bottom-top);
 return {left:(left+right-span)/2,top:(top+bottom-span)/2,span};
}
export function minimapPosition(field,p,width,height,bounds){
 const v=minimapViewport(bounds),[x,y]=field.worldToGrid(p.x,p.y);return [(x-v.left)/v.span*width,(y-v.top)/v.span*height];
}
export function minimapPoint(field,rect,x,y,bounds){
 const v=minimapViewport(bounds);
 return field.gridToWorld([v.left+Math.max(0,Math.min(1,(x-rect.left)/rect.width))*v.span,v.top+Math.max(0,Math.min(1,(y-rect.top)/rect.height))*v.span]);
}
const visibleEntity=(m,e)=>e.hp>0&&!m.config.buildings[e.kind]?.storyOnly&&e.factoryVisit?.phase!=='inside'&&(e.owner==='rai'||m.visibleAt(e.x,e.y));
export function minimapTarget(mission,rect,x,y){
 let best=null,distance=Infinity;
 for(const group of [mission.state.units,mission.state.buildings])for(const e of group){
  if(!visibleEntity(mission,e))continue;
  const [px,py]=minimapPosition(mission.field,e,rect.width,rect.height,mission.state.bounds),d=Math.hypot(px+rect.left-x,py+rect.top-y),radius=mission.config.buildings[e.kind]?4:3;
  if(d<=radius&&d<distance){best=e;distance=d;}
 }
 return best;
}
export function installMinimapInput(canvas,{mission,enabled,mode,building,order,centre,cancel}){
 let dragging=null;
 const at=e=>minimapPoint(mission.field,canvas.getBoundingClientRect(),e.clientX,e.clientY,mission.state.bounds);
 canvas.title='ЛКМ — камера · ПКМ — приказ · с «Атакой» — атака';
 canvas.setAttribute('aria-label','Миникарта. ЛКМ — камера, ПКМ — приказ выбранной группе. В режиме атаки — атаковать.');
 canvas.addEventListener('contextmenu',e=>e.preventDefault());
 canvas.addEventListener('pointerdown',e=>{
  if(!enabled()||![0,2].includes(e.button))return;
  e.preventDefault();e.stopPropagation();
  if(e.button===2||mode()==='attack'||mode()==='move'){
   if(building()){cancel();return;}
   order(at(e),minimapTarget(mission,canvas.getBoundingClientRect(),e.clientX,e.clientY),mode());return;
  }
  dragging=e.pointerId;canvas.setPointerCapture(e.pointerId);centre(at(e));
 });
 canvas.addEventListener('pointermove',e=>{if(dragging===e.pointerId&&enabled())centre(at(e));});
 const release=e=>{if(dragging!==e.pointerId)return;dragging=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);};
 for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,release);
}

export function createMinimap(canvas,{world,mission,selected,background,notify}){
 const base=document.createElement('canvas'),ctx=canvas.getContext('2d'),cached=base.getContext('2d'),alerts=new MinimapAlerts(notify);
 const surface=document.createElement('canvas'),surfaceContext=surface.getContext('2d');
 let refreshed=-Infinity,boundsKey='',cachedCssSize=canvas.clientWidth||132;
 new ResizeObserver(entries=>{cachedCssSize=entries[0].contentRect.width||132;refreshed=-Infinity;}).observe(canvas);
 const position=p=>minimapPosition(world.field,p,canvas.width,canvas.height,mission.state.bounds);
 function rebuild(scale){
  // Square viewports may extend beyond the map. Match unexplored fog instead
  // of exposing a green rectangle that looks like a straight water boundary.
  const size=canvas.width;cached.clearRect(0,0,size,size);cached.fillStyle='#0b0e0f';cached.fillRect(0,0,size,size);
  const view=minimapViewport(mission.state.bounds),fullSize=size*127/view.span;
  // Composite at integer edges first. Drawing the map and fog separately at
  // a fractional offset blends their edges twice and leaks a bright seam.
  const surfaceSize=Math.ceil(fullSize);
  if(surface.width!==surfaceSize||surface.height!==surfaceSize)surface.width=surface.height=surfaceSize;
  surfaceContext.clearRect(0,0,surfaceSize,surfaceSize);
  if(background.complete&&background.naturalWidth)surfaceContext.drawImage(background,0,0,surfaceSize,surfaceSize);
  world.drawMinimapFog(surfaceContext,surfaceSize);
  cached.drawImage(surface,-view.left/view.span*size,-view.top/view.span*size,fullSize,fullSize);
  for(const grid of mission.config.oilFields){const p=world.field.gridToWorld(grid);if(!mission.exploredAt(p.x,p.y))continue;const [x,y]=position(p);cached.fillStyle='#d5b869';cached.fillRect(x-scale,y-scale,2*scale,2*scale);}
  // Structures are drawn first; units remain visible over them.
  for(const [group,isBuilding] of [[mission.state.buildings,true],[mission.state.units,false]])for(const e of group){
   if(!visibleEntity(mission,e))continue;
   const [x,y]=position(e),r=(isBuilding?2:1.3)*scale;
   cached.fillStyle=colors[e.owner==='rai'?(isBuilding?'friendlyBuilding':'friendlyUnit'):(isBuilding?'enemyBuilding':'enemyUnit')];
   cached.fillRect(Math.round(x-r),Math.round(y-r),r*2,r*2);
   if(selected.has(e.id)){cached.strokeStyle='#f0f3d5';cached.lineWidth=scale*.65;cached.strokeRect(x-r-scale,y-r-scale,r*2+scale*2,r*2+scale*2);}
  }
  const headquarters=mission.state.camps[3];
  if(mission.state.flags.lastRevealed&&headquarters&&!headquarters.cleared&&!mission.visibleAt(headquarters.x,headquarters.y)){
   const [x,y]=position(headquarters);cached.strokeStyle=colors.enemyBuilding;cached.lineWidth=scale;cached.strokeRect(x-2*scale,y-2*scale,4*scale,4*scale);
  }
  for(const a of mission.state.artifacts){if(a.collected||!mission.exploredAt(a.x,a.y))continue;const [x,y]=position(a),r=2.3*scale;
   cached.fillStyle=colors.artifact;cached.beginPath();cached.moveTo(x,y-r);cached.lineTo(x+r,y);cached.lineTo(x,y+r);cached.lineTo(x-r,y);cached.closePath();cached.fill();
  }
 }
 function render(now){
  const cssSize=cachedCssSize,pixelRatio=Math.min(2,globalThis.devicePixelRatio||1),size=Math.round(cssSize*pixelRatio);
  const nextBounds=mission.state.bounds.join(',');if(nextBounds!==boundsKey){boundsKey=nextBounds;refreshed=-Infinity;}
  if(canvas.width!==size){canvas.width=canvas.height=base.width=base.height=size;refreshed=-Infinity;}
  if(base.width!==size){base.width=base.height=size;refreshed=-Infinity;}
  const scale=size/cssSize,pings=alerts.active(now),refresh=now-refreshed>=200;
  if(refresh){rebuild(scale);refreshed=now;}
  // Background/fog only update at 5 Hz; light pulse and camera overlays are cheap.
  ctx.clearRect(0,0,size,size);ctx.drawImage(base,0,0);
  const [cx,cy]=position(world.controls.target);ctx.strokeStyle='#e3d4a3';ctx.lineWidth=scale*.7;ctx.strokeRect(cx-5*scale,cy-4*scale,10*scale,8*scale);
  for(const p of pings){const [x,y]=position(p),age=(now-p.born)/MINIMAP_PING_MS,wave=(1-Math.cos(age*Math.PI*8))/2,r=(5+wave*3)*scale,arm=3*scale;
   ctx.save();ctx.globalAlpha=.5+wave*.5;ctx.lineCap='square';ctx.strokeStyle=colors[p.kind];ctx.lineWidth=1.6*scale;
   ctx.beginPath();
   for(const sx of [-1,1])for(const sy of [-1,1]){
    ctx.moveTo(x+sx*(r-arm),y+sy*r);ctx.lineTo(x+sx*r,y+sy*r);ctx.lineTo(x+sx*r,y+sy*(r-arm));
   }
   ctx.stroke();ctx.restore();
  }
 }
 return {alerts,render,observe:(tasks,now)=>alerts.observe(mission,tasks,now),reset(silent){alerts.reset(silent);refreshed=-Infinity;},invalidate(){refreshed=-Infinity;}};
}
