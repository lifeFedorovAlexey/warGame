import {KOROVNIK,transportSite,transportPoint} from './transport-site.js';

const clamp=v=>Math.max(0,Math.min(1,v));
const smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
export const cargoSlot=index=>({x:index%2?-2.25:2.25,y:10-Math.floor(index/2)*5.2,z:2.05});
export const cargoGate=(site,index=0)=>transportPoint(site,cargoSlot(index).x,-29);
export function ensureTransport(m){
 return m.state.transport??={version:1,kind:'mu26',phase:'absent',elapsed:0,door:0,rotor:0,manifest:[],queue:[],site:transportSite(m.field,m.config)};
}
export function transportObstacles(m){
 const t=m.state.transport;if(!t||['absent','departed'].includes(t.phase)||t.phase==='departing'&&t.airborne)return [];
 const p=transportPoint(t.site,0,-1);
 return [{...p,id:'mu26-hull',hp:1,environment:true,halfWidth:22*t.site.scale,halfDepth:7.4*t.site.scale}];
}
function clearLanding(m,t){
 const p=t.site;
 if(m.state.units.some(u=>(u.hp>0||u.damage?.wreck)&&Math.abs(u.x-p.x)<p.halfWidth+12&&Math.abs(u.y-p.y)<p.halfDepth+12))return false;
 return !m.state.buildings.some(b=>(b.hp>0||b.damage?.wreck)&&Math.abs(b.x-p.x)<p.halfWidth+b.halfWidth&&Math.abs(b.y-p.y)<p.halfDepth+b.halfDepth);
}
function setPhase(m,t,phase){t.phase=phase;t.elapsed=0;m.emit('transport-phase',{phase,cargo:t.manifest.length});}
export function requestTransport(m){
 m.finishPendingStep();const t=ensureTransport(m);
 if(!['absent','departed'].includes(t.phase))return m.fail('МУ-26 уже выполняет рейс');
 if(!clearLanding(m,t))return m.fail('Освободите посадочную площадку МУ-26');
 t.door=0;t.airborne=false;setPhase(m,t,'approaching');m.rebuildNavigation();return {ok:true};
}
export function loadTransport(m,ids){
 m.finishPendingStep();const t=ensureTransport(m);
 if(t.phase!=='ready')return m.fail('Дождитесь посадки и открытия рампы');
 if(t.unloading)return m.fail('Сначала завершите выгрузку');
 const unique=[...new Set(ids)].filter(id=>!t.queue.some(q=>q.id===id)&&!t.manifest.some(c=>c.unit.id===id));
 if(!unique.length)return m.fail('Выберите технику для погрузки');
 if(unique.length+t.queue.length+t.manifest.length>KOROVNIK.capacity)return m.fail('МУ-26 вмещает не более 10 машин');
 const units=unique.map(id=>m.entity(id));
 if(units.some(u=>!u||u.owner!=='rai'||u.hp<=0||u.factoryVisit||!u.path||!m.unitSpec(u)?.components||m.unitSpec(u)?.infantry))return m.fail('Для погрузки нужна исправная наземная техника РАЯ вне завода');
 for(const u of units)t.queue.push({id:u.id,issued:false,queuedAt:m.state.time});
 return {ok:true,accepted:unique.length};
}
export function cancelTransportLoading(m){
 m.finishPendingStep();const t=ensureTransport(m);m.stop(t.queue.map(q=>q.id),{expandGroup:false});t.queue=[];return {ok:true};
}
export function departTransport(m){
 m.finishPendingStep();const t=ensureTransport(m);
 if(t.phase!=='ready')return m.fail('МУ-26 ещё не готов к вылету');
 if(t.queue.length||t.manifest.some(c=>c.phase!=='aboard')||t.unloading)return m.fail('Завершите погрузку или выгрузку перед вылетом');
 setPhase(m,t,'closing');return {ok:true};
}
export function unloadTransport(m){
 m.finishPendingStep();const t=ensureTransport(m);
 if(t.phase!=='ready'||t.queue.length||t.manifest.some(c=>c.phase!=='aboard'))return m.fail('Выгрузка возможна после посадки и завершения погрузки');
 if(!t.manifest.length)return m.fail('Грузовой отсек пуст');
 t.unloading=true;return {ok:true};
}
function cargoExit(m,t,c){
 // Offload onto the apron's east access, leaving both ramp lanes free.
 for(let row=0;row<12;row++)for(let col=0;col<2;col++){
   const x=13+row*6,y=-34-col*7,p=transportPoint(t.site,x,y),heading=t.site.heading+Math.atan2(2*(x-cargoSlot(c.slot).x),-y-26.5),pose={...c.unit,...p,heading};
  if(m.inBounds(p.x,p.y)&&m.vehicleMotionClear(pose,pose,pose))return p;
 }
 return null;
}
export function transportPose(t){
 const p=t.site,phase=t.phase,e=t.elapsed;
 let x=0,y=0,z=0,tilt=0;
 if(phase==='approaching'){
  const u=smooth(e/14);y=170*(1-u);z=36+30*(1-u);tilt=.07*Math.sin(Math.PI*u);
 }else if(phase==='landing')z=36*(1-smooth(e/9));
 else if(phase==='spooling')z=0;
 else if(phase==='departing'){const u=clamp(e/16);z=65*smooth(u);y=-210*smooth(Math.max(0,(u-.25)/.75));tilt=-.1*Math.sin(Math.PI*u);}
 const pos=transportPoint(p,x,y,z);
 return {...pos,heading:p.heading,tilt,door:t.door,rotor:t.rotor};
}
export function cargoPose(t,c){
 const end=cargoSlot(c.slot),p=smooth(c.progress??1);
 if(c.phase==='aboard')return end;
 if(c.phase==='boarding'){
  const a=c.from,b={x:end.x,y:-23.2},h=c.from.heading??0;
  if(p<.28){
   const u=p/.28,v=1-u,c1={x:a.x-Math.sin(h)*4,y:a.y+Math.cos(h)*4},c2={x:b.x,y:b.y-4};
   const x=v*v*v*a.x+3*v*v*u*c1.x+3*v*u*u*c2.x+u*u*u*b.x,y=v*v*v*a.y+3*v*v*u*c1.y+3*v*u*u*c2.y+u*u*u*b.y;
   const dx=3*v*v*(c1.x-a.x)+6*v*u*(c2.x-c1.x)+3*u*u*(b.x-c2.x),dy=3*v*v*(c1.y-a.y)+6*v*u*(c2.y-c1.y)+3*u*u*(b.y-c2.y);
   return {x,y,z:0,heading:Math.atan2(-dx,dy)};
  }
  const y=b.y+(end.y-b.y)*(p-.28)/.72;
  return {x:end.x,y,z:y<-22.5?0:y<-15.1?2.05*(y+22.5)/7.4:2.05,heading:0,pitch:y>-22.5&&y<-15.1?.255:0};
 }
 // Reverse down the same lane before turning on the open apron.
 const u=Math.min(1,p/.68),v=Math.max(0,(p-.68)/.32),to=c.exitLocal;
 const x=end.x+(to.x-end.x)*v*v,y=p<.68?end.y+(-26.5-end.y)*u:-26.5+(to.y+26.5)*v;
 const z=y<-22.5?0:y<-15.1?2.05*(y+22.5)/7.4:2.05;
 return {x,y,z,heading:p<.68?0:Math.atan2(2*(to.x-end.x)*v,-to.y-26.5),pitch:y>-22.5&&y<-15.1?.255:0};
}
export function updateTransport(m,dt){
 const t=m.state.transport;if(!t||['absent','departed'].includes(t.phase))return;
 t.elapsed+=dt;
 t.rotor=(t.rotor+dt*(['ready','opening'].includes(t.phase)?1.2:22))%(Math.PI*2);
 if(t.phase==='approaching'&&t.elapsed>=14)setPhase(m,t,'landing');
 else if(t.phase==='landing'&&t.elapsed>=9)setPhase(m,t,'opening');
 else if(t.phase==='opening'){t.door=clamp(t.elapsed/4);if(t.door===1)setPhase(m,t,'ready');}
 else if(t.phase==='closing'){t.door=1-clamp(t.elapsed/4);if(t.door===0)setPhase(m,t,'spooling');}
 else if(t.phase==='spooling'&&t.elapsed>=3)setPhase(m,t,'departing');
 else if(t.phase==='departing'&&t.elapsed>=16){setPhase(m,t,'departed');m.emit('transport-departed',{ids:t.manifest.map(c=>c.unit.id)});}
 if(t.phase==='departing'&&t.elapsed>=4&&!t.airborne){t.airborne=true;m.rebuildNavigation();}
 if(t.phase!=='ready')return;
 for(const c of [...t.manifest])if(c.phase!=='aboard'){
  c.progress=clamp(c.progress+dt/(c.phase==='boarding'?11:13));
  if(c.progress<1)continue;
  if(c.phase==='boarding'){c.phase='aboard';m.emit('transport-loaded',{id:c.unit.id,slot:c.slot});}
  else{
   const pose={...c.unit,...c.exit,heading:t.site.heading+(cargoPose(t,c).heading??0)};
   if(!m.vehicleMotionClear(pose,pose,pose)){t.blocked='Выезд занят — освободите площадку';continue;}
   const u=c.unit;Object.assign(u,c.exit,{previousX:c.exit.x,previousY:c.exit.y,heading:pose.heading,previousHeading:pose.heading,path:[],task:null,driveSpeed:0});
   m.state.units.push(u);t.manifest.splice(t.manifest.indexOf(c),1);delete t.blocked;m.emit('transport-unloaded',{id:u.id});
  }
 }
 if(t.manifest.some(c=>c.phase!=='aboard'))return;
 if(t.unloading){
  const c=t.manifest.at(-1);if(!c){t.unloading=false;return;}
  const exit=cargoExit(m,t,c);if(!exit){t.blocked='Выезд занят — освободите площадку';return;}
  const dx=(exit.x-t.site.x)/t.site.scale,dy=(exit.y-t.site.y)/t.site.scale,h=t.site.heading;
  c.exit=exit;c.exitLocal={x:dx*Math.cos(h)+dy*Math.sin(h),y:-dx*Math.sin(h)+dy*Math.cos(h)};c.phase='unloading';c.progress=0;delete t.blocked;return;
 }
 const q=t.queue[0];if(!q)return;
 const u=m.entity(q.id);
 if(!u||u.owner!=='rai'||u.hp<=0||u.factoryVisit){t.queue.shift();return;}
 const slot=Array.from({length:KOROVNIK.capacity},(_,i)=>i).find(i=>!t.manifest.some(c=>c.slot===i)),gate=cargoGate(t.site,slot);
 const approach=transportPoint(t.site,24,-29);
 if(q.issued&&(u.proposedOrder?.revision??u.pendingOrder?.revision??u.commandRevision)!==q.revision){t.queue.shift();return;}
 if(!q.issued){
  const result=m.submitOrder([u.id],'move',q.leg==='gate'?gate:approach,{expandGroup:false});
  if(!result.ok){t.queue.shift();t.blocked=result.reason;return;}
  q.issued=true;q.revision=result.revision;return;
 }
 if(q.leg!=='gate'){
  if(Math.hypot(u.x-approach.x,u.y-approach.y)<t.site.scale*1.1){q.leg='gate';q.issued=false;}
  return;
 }
 if(Math.hypot(u.x-gate.x,u.y-gate.y)>t.site.scale*1.1)return;
 m.stop([u.id],{expandGroup:false});
 const dx=(u.x-t.site.x)/t.site.scale,dy=(u.y-t.site.y)/t.site.scale,h=t.site.heading;
 t.manifest.push({unit:u,slot,phase:'boarding',progress:0,from:{x:dx*Math.cos(h)+dy*Math.sin(h),y:-dx*Math.sin(h)+dy*Math.cos(h),z:0,heading:u.heading-h}});
 t.queue.shift();m.state.units.splice(m.state.units.indexOf(u),1);m.commandPlanner?.cancel([u.id]);delete t.blocked;
}
