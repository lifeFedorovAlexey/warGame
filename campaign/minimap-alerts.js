export const MINIMAP_COLORS={friendlyUnit:'#43c768',friendlyBuilding:'#adeba2',enemyUnit:'#e34c43',enemyBuilding:'#e34c4399',artifact:'#62b7ff',objective:'#64ed84',attack:'#ff514b'};
export const MINIMAP_PING_MS=3000;
const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);

export function objectiveLocation(mission,task){
 const {state:s,config:c,field:f}=mission,owned=kind=>s.buildings.find(b=>b.owner==='rai'&&b.hp>0&&b.kind===kind);
 const known=p=>point(p)&&mission.inBounds(p.x,p.y)&&mission.exploredAt(p.x,p.y);
 const site=kind=>owned(kind)??c.baseSites?.filter(s=>s.kind===kind).map(s=>f.gridToWorld(s.grid)).find(known);
 let target;
 if(['generator','factory','lab'].includes(task.id))target=site(task.id);
 else if(task.id==='power')target=owned('derrick')??c.oilFields.map(g=>f.gridToWorld(g)).find(known);
 else if(task.id==='production')target=owned('factory');
 else if(task.id.startsWith('research-'))target=owned('lab');
 else if(task.id.startsWith('pickup-'))target=s.artifacts.find(a=>!a.collected&&a.key===task.id.slice(7));
 else if(task.id==='defense')target=site('bunker');
 else if(task.id==='defend')target=c.raidApproachGrid?f.gridToWorld(c.raidApproachGrid):f.gridToWorld(c.startGrid);
 else if(task.id==='security')target=s.camps.find(c=>!c.cleared&&known(c));
 return known(target)?{x:target.x,y:target.y,key:target.id??task.id+':'+target.x+':'+target.y}:null;
}

// Presentation clocks use real milliseconds, independently of simulation speed.
// Only discovery history is saved; expired alerts never replay after loading.
export class MinimapAlerts{
 constructor(notify=()=>{}){this.notify=notify;this.reset();}
 reset(silent=false){this.state=null;this.silent=silent;this.pings=[];this.attacks=[];this.signals=new Set();this.lastMessage=new Map();}
 message(kind,text,now){if(now-(this.lastMessage.get(kind)??-Infinity)<MINIMAP_PING_MS)return;this.lastMessage.set(kind,now);this.notify(text,MINIMAP_PING_MS);}
 ping(kind,p,now){
  if(!point(p))return;
  this.active(now);
  if(this.pings.some(a=>a.kind===kind&&Math.hypot(a.x-p.x,a.y-p.y)<72))return;
  if(this.pings.length>=16)this.pings.shift();
  this.pings.push({kind,x:p.x,y:p.y,born:now,until:now+MINIMAP_PING_MS});
 }
 active(now){this.pings=this.pings.filter(p=>now<p.until);return this.pings;}
 observe(mission,tasks,now){
  const s=mission.state;if(s.status!=='running')return;
  if(this.state!==s){
   this.state=s;this.pings=[];this.attacks=[];this.signals.clear();
   const saved=s.minimapNotices??={artifacts:[],objectives:[],locations:[]};
   this.saved=saved;this.artifacts=new Set(saved.artifacts);this.objectives=new Set(saved.objectives);this.locations=new Set(saved.locations);
  }
  const remember=(set,key,list)=>{set.add(key);list.push(key);};
  for(const a of s.artifacts){
   if(a.collected||!mission.exploredAt(a.x,a.y)||this.artifacts.has(a.id))continue;
   remember(this.artifacts,a.id,this.saved.artifacts);
   if(!this.silent){this.ping('artifact',a,now);this.message('artifact','Обнаружен артефакт',now);}
  }
  for(const task of tasks){
   // Discovery already has its blue alert; do not cover it with a green one.
   if(task.id.startsWith('pickup-'))continue;
   const fresh=!this.objectives.has(task.id),p=objectiveLocation(mission,task),key=p&&task.id+'|'+p.key;
   if(fresh){remember(this.objectives,task.id,this.saved.objectives);if(!this.silent)this.message('objective','Новая цель: '+task.name,now);}
   if(p&&!this.locations.has(key)){remember(this.locations,key,this.saved.locations);if(!this.silent)this.ping('objective',p,now);}
  }
  this.silent=false;
 }
 event(event,now){
  if(event.type!=='under-attack'||!point(event))return;
  this.attacks=this.attacks.filter(a=>now-a.born<6000);
  if(this.attacks.some(a=>Math.hypot(a.x-event.x,a.y-event.y)<100))return;
  if(this.attacks.length>=32)this.attacks.shift();
  this.attacks.push({x:event.x,y:event.y,born:now});
  this.ping('attack',event,now);this.message('attack',event.building?'Здание под огнём':'Наши под огнём',now);
 }
 signal(signal,chapter,now){
  if(!point(signal)||!chapter||signal.kind==='anomaly')return;
  if(this.signals.has(chapter))return;this.signals.add(chapter);
  this.ping('objective',signal,now);
 }
}
