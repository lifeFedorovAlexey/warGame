import {navigationSnapshot} from './navigation-state.js';
import {checkManeuver} from './vehicle-motion.js';
import {vehicleEnvelope} from './vehicle-collision.js';
import {isInfantry} from './scav-unit-profiles.js';

// F8-only, read-only diagnostics. No searches, orders, reservations or simulation
// steps are run here. Lines come from published paths and remaining maneuver legs.
export function installNavigationDebug(world,mission,selection){
 const canvas=document.createElement('canvas');canvas.id='navigation-debug';
 Object.assign(canvas.style,{position:'fixed',inset:'0',width:'100%',height:'100%',pointerEvents:'none',zIndex:'12'});
 canvas.setAttribute('aria-hidden','true');canvas.hidden=true;document.body.append(canvas);
 const ctx=canvas.getContext('2d'),colors=new Map();let enabled=false;
 const point=p=>world.screen(p,1),valid=p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y);
 const color=id=>{if(!colors.has(id))colors.set(id,`hsl(${(colors.size*137.508+38)%360} 85% 72%)`);return colors.get(id);};
 function line(a,b,stroke,dash=[],width=1.6,arrows=false){
  if(!valid(a)||!valid(b))return;
  const p=point(a),q=point(b);if(!p.visible||!q.visible)return;
  ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();
  const dx=q.x-p.x,dy=q.y-p.y,length=Math.hypot(dx,dy);
  if(!arrows||length<12)return;
  const ux=dx/length,uy=dy/length;ctx.setLineDash([]);
  for(let t=Math.min(28,length*.65);t<length-3;t+=85){
   const x=p.x+ux*t,y=p.y+uy*t;if(x<0||y<0||x>innerWidth||y>innerHeight)continue;
   ctx.beginPath();ctx.moveTo(x-ux*7-uy*4,y-uy*7+ux*4);ctx.lineTo(x,y);ctx.lineTo(x-ux*7+uy*4,y-uy*7-ux*4);ctx.stroke();
  }
 }
 function cross(p,stroke){
  if(!valid(p))return;const s=point(p);if(!s.visible)return;
  ctx.strokeStyle=stroke;ctx.lineWidth=1.5;ctx.setLineDash([]);ctx.beginPath();
  ctx.moveTo(s.x-5,s.y-5);ctx.lineTo(s.x+5,s.y+5);ctx.moveTo(s.x-5,s.y+5);ctx.lineTo(s.x+5,s.y-5);ctx.stroke();
 }
 function maneuver(start,legs,stroke,future=false){
  let pose=start;
  for(const leg of legs??[]){
   if(!(leg.remaining>0))continue;
   const points=[pose];
   // Reuse the executor's arc geometry solely to collect drawing coordinates.
   // This callback never admits movement and never changes a game object.
   pose=checkManeuver(pose,[leg],mission.config.worldScale,(_from,to)=>{points.push(to);return true;});
   const dash=future?[2,5]:leg.direction<0?[7,4]:[];
   let previous=points[0];
   for(let i=1;i<points.length;i++){
    const a=point(previous),b=point(points[i]);
    if(i<points.length-1&&Math.hypot(b.x-a.x,b.y-a.y)<14)continue;
    line(previous,points[i],stroke,dash,future?2:3,true);previous=points[i];
   }
  }
  return pose;
 }
 function text(value,x,y,fill){
  ctx.setLineDash([]);ctx.lineWidth=3;ctx.strokeStyle='#17170d';ctx.fillStyle=fill;
  ctx.strokeText(value,x,y);ctx.fillText(value,x,y);
 }
 function update(){
  if(!enabled)return;
  const w=innerWidth,h=innerHeight,dpr=Math.min(devicePixelRatio||1,2);
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  const selected=new Set(selection()),coordinator=mission.trafficCoordinator;
  const units=mission.state.units.filter(u=>u.hp>0&&!isInfantry(u)&&(u.owner==='rai'||mission.visibleAt(u.x,u.y)));
  const labels=[];
  for(const u of units){
   const stroke=color(u.id),p=point(u),path=u.path??[],pending=!!u.pendingOrder;
   const body=vehicleEnvelope(u,mission.config.worldScale,mission.field);
   if(body.ellipse&&p.visible){
    let last;
    for(let i=0;i<=32;i++){
     const angle=i*Math.PI/16,x=body.width*Math.cos(angle),y=body.depth*Math.sin(angle);
     const next={x:body.x+x*body.c-y*body.s,y:body.y+x*body.s+y*body.c};
     if(last)line(last,next,stroke,[],1);last=next;
    }
   }
   let previous=u;
   // A pending replacement order has not published a new path yet.
   for(const next of path){line(previous,next,stroke,pending?[2,6]:[],selected.has(u.id)?2:1.4,true);previous=next;}
   if(path.length)cross(path.at(-1),stroke);
   const jointOwner=u.jointTraffic&&mission.entity(u.jointTraffic.owner),joint=jointOwner?.detour?.joint;
   let hasManeuver=false;
   if(joint&&joint.token===u.jointTraffic.token){
    let pose=u;
    for(let i=joint.cursor;i<joint.phases.length;i++){
     const phase=joint.phases[i];if(phase.id!==u.id)continue;
     pose=maneuver(pose,phase.legs,stroke,i!==joint.cursor);hasManeuver||=!!phase.legs?.length;
    }
   }else if(u.detour?.legs?.length){maneuver(u,u.detour.legs,stroke);hasManeuver=true;}
   const search=!!(pending||coordinator.routes?.has(u.id)||coordinator.planner?.pendingFor(u));
   if(p.visible&&p.x>=0&&p.x<=w&&p.y>=0&&p.y<=h){
    const status=[u.id,u.combatRetreat?'ОТСТУПЛЕНИЕ':'',search?'ПОИСК':'',hasManeuver?'МАНЁВР':!path.length?'НЕТ ПУТИ':''].filter(Boolean).join(' · ');
    labels.push({p,stroke,status});
   }
  }
  // Stagger crowded labels without displacing routes or vehicle endpoints.
  ctx.font='12px monospace';ctx.textAlign='left';const placed=[];
  for(const {p,stroke,status} of labels.sort((a,b)=>a.p.y-b.p.y)){
   const width=ctx.measureText(status).width;let x=Math.max(6,Math.min(w-width-6,p.x+10)),y=Math.max(200,Math.min(h-12,p.y-15));
   for(let i=0;i<24&&placed.some(r=>x<r.x+r.width&&x+width>r.x&&Math.abs(y-r.y)<16);i++)y=y+18<h-12?y+18:Math.max(200,p.y-35-i*18);
   placed.push({x,y,width});ctx.strokeStyle=stroke;ctx.lineWidth=.8;ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(x,y-5);ctx.stroke();
   text(status,x,y,stroke);
  }
  text('F8 · ПУТИ ВСЕХ МАШИН · цвет линии = ID машины',16,145,'#f1e6c2');
  text('Тонкая → маршрут; толстая → манёвр; штрихи → задний ход',16,163,'#f1e6c2');
  text('Точки → будущая фаза / старый путь при новом приказе; × конец пути',16,181,'#f1e6c2');
 }
 return {get enabled(){return enabled;},setEnabled(value){enabled=!!value;canvas.hidden=!enabled;if(!enabled)ctx.clearRect(0,0,canvas.width,canvas.height);else update();},update,
  snapshot:id=>navigationSnapshot(mission,mission.entity(id)),dispose(){canvas.remove();enabled=false;}};
}
