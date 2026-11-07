import {navigationSnapshot} from './navigation-state.js';
import {vehicleEnvelope} from './vehicle-collision.js';

// Loaded only on request. The canvas is transparent and never intercepts
// map controls; disabled diagnostics perform no projection or neighbour work.
export function installNavigationDebug(world,mission,selection){
 const canvas=document.createElement('canvas');canvas.id='navigation-debug';
 Object.assign(canvas.style,{position:'fixed',inset:'0',width:'100%',height:'100%',pointerEvents:'none',zIndex:'12'});
 canvas.setAttribute('aria-hidden','true');canvas.hidden=true;document.body.append(canvas);
 const ctx=canvas.getContext('2d');let enabled=false;
 const point=p=>world.screen(p,1);
 const line=(a,b,color,dashed=false)=>{
  const p=point(a),q=point(b);if(!p.visible&&!q.visible)return;
  ctx.strokeStyle=color;ctx.setLineDash(dashed?[5,5]:[]);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();
 };
 const cross=(p,color,size=5)=>{const s=point(p);if(!s.visible)return;ctx.strokeStyle=color;ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(s.x-size,s.y);ctx.lineTo(s.x+size,s.y);ctx.moveTo(s.x,s.y-size);ctx.lineTo(s.x,s.y+size);ctx.stroke();};
 const hull=(u,color)=>{
  const e=vehicleEnvelope(u,mission.config.worldScale,mission.field),corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>({x:e.x+x*e.width*e.c-y*e.depth*e.s,y:e.y+x*e.width*e.s+y*e.depth*e.c}));
  for(let i=0;i<4;i++)line(corners[i],corners[(i+1)%4],color);
 };
 function update(){
  if(!enabled)return;
  const w=innerWidth,h=innerHeight;
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  ctx.clearRect(0,0,w,h);ctx.lineWidth=1.5;
  const ids=Array.from(selection()),units=ids.slice(0,24).map(id=>mission.entity(id)).filter(u=>u&&mission.config.units[u.kind]);
  const drawnPassages=new Set(),drawnGroups=new Set();
  for(const u of units){
   const data=navigationSnapshot(mission,u);let previous=u;
   for(const p of data.path){line(previous,p,'#b7d57b');previous=p;}
   if(data.destination)cross(data.destination,'#f3cf79',7);
   if(data.goal)cross(data.goal,'#ffffff',10);
   if(data.localTarget){line(u,data.localTarget,'#ee8f3a',true);cross(data.localTarget,'#ee8f3a',4);}
   hull(u,data.potentialDefect?'#ff655b':'#f3cf79');
   const blocker=mission.entity(data.blockerId);if(blocker){line(u,blocker,'#ff655b',true);hull(blocker,'#ff655b');}
   const lease=mission.trafficCoordinator.decisions.get(u.id),leader=lease&&mission.entity(lease.yieldTo);
   if(leader)line(u,leader,'#e9ab5a',true);
   if(data.group&&!drawnGroups.has(data.group.id)){
    drawnGroups.add(data.group.id);
    if(data.group.goal)cross(data.group.goal,'#f4f0b0',13);
    for(const id of data.group.members.slice(0,100)){
     const member=mission.entity(id),goal=member?.routeOrder?.destination;
     if(member?.hp>0&&goal)cross(goal,'#b7d57b',4);
    }
   }
   if(data.reservation&&!drawnPassages.has(data.reservation.key)){
    const reservation=data.reservation,t=reservation.throat;drawnPassages.add(reservation.key);
    const at=(along,side)=>t.along==='x'?{x:along,y:side}:{x:side,y:along};
    for(const side of [-1,1])line(at(t.low,t.centre+side*t.width/2),at(t.high,t.centre+side*t.width/2),'#e9ab5a',true);
    line(at(reservation.stopAt,t.centre-t.width/2),at(reservation.stopAt,t.centre+t.width/2),reservation.admitted?'#b7d57b':'#ff655b');
   }
  }
  if(units[0]){
   const u=units[0],data=navigationSnapshot(mission,u),nav=mission.nav,[cx,cy]=nav.grid(u.x,u.y);
   // A small local sample shows forbidden terrain/occupied planning cells.
   for(let y=cy-7;y<=cy+7;y++)for(let x=cx-7;x<=cx+7;x++){
    if(x<0||y<0||x>=nav.size||y>=nav.size||nav.allowed(x,y))continue;
    cross(nav.position(x,y),'#b36550',2);
   }
   const labels=[`F8 · Навигация · ${u.id} · ${data.state}`,
    `${data.reason}${data.blockerId?' → '+data.blockerId:''}`,
    `Скорость ${data.speed.toFixed(1)} · ожидание ${data.waitSeconds.toFixed(1)} с · попытка ${data.attempt}`,
    data.nextAction??'',data.group?`${data.group.formation} · ${data.group.members.length} · ведущий ${data.group.leaderId}`:'',
    data.potentialDefect?'Простой > 500 мс: требуется разбор':''];
   ctx.font=(w<900?'11':'13')+'px monospace';ctx.textAlign='left';ctx.fillStyle='#f1e6c2';ctx.shadowColor='#17170d';ctx.shadowBlur=3;
   labels.filter(Boolean).forEach((text,i)=>ctx.fillText(text,16,62+i*18,w-32));ctx.shadowBlur=0;
  }else{
   ctx.font='13px monospace';ctx.fillStyle='#f1e6c2';ctx.fillText('F8 · Навигация: выберите машину',16,62);
  }
 }
 return {get enabled(){return enabled;},setEnabled(value){enabled=!!value;canvas.hidden=!enabled;if(!enabled)ctx.clearRect(0,0,canvas.width,canvas.height);else update();},update,
  snapshot:id=>navigationSnapshot(mission,mission.entity(id)),dispose(){canvas.remove();enabled=false;}};
}
