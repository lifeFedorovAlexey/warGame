import {objectiveTargets,ObjectiveReminders} from './objective-reminders.js';
export const MINIMAP_COLORS={friendlyUnit:'#43c768',friendlyBuilding:'#adeba2',enemyUnit:'#e34c43',enemyBuilding:'#e34c4399',artifact:'#62b7ff',objective:'#64ed84',enemyObjective:'#ed685a',attack:'#ff514b'};
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
 constructor(notify=()=>{},mission=null){this.notify=notify;this.mission=mission;this.reset();}
 reset(silent=false){this.state=null;this.silent=silent;this.pings=[];this.focusIndex=0;this.signals=new Set();this.lastMessage=new Map();this.reminders=new ObjectiveReminders();}
 bind(mission=this.mission){
  if(!mission)return;this.mission=mission;const s=mission.state;
  if(this.state===s)return;
  this.state=s;this.pings=[];this.focusIndex=0;this.signals.clear();this.lastMessage.clear();
  this.reminders.reset();
  this.lastCombatAt=mission.lastPlayerCombatAt;this.combatUntil=0;
  const saved=s.minimapNotices??={artifacts:[],objectives:[],locations:[]};
  this.saved=saved;this.artifacts=new Set(saved.artifacts);this.objectives=new Set(saved.objectives);this.locations=new Set(saved.locations);
 }
 message(kind,text,now){if(now-(this.lastMessage.get(kind)??-Infinity)<MINIMAP_PING_MS)return;this.lastMessage.set(kind,now);this.notify(text,MINIMAP_PING_MS);}
 ping(kind,p,now){
  if(!point(p))return;
  this.active(now);
  if(this.pings.some(a=>a.kind===kind&&Math.hypot(a.x-p.x,a.y-p.y)<72))return;
  // A forced reminder has its own bounded allowance for three seconds, so
  // even sixteen simultaneous attacks cannot starve the two-minute deadline.
  const pool=this.pings.filter(a=>!!a.combatProtected===!!p.combatProtected);
  if(pool.length>=16){
   const disposable=pool.find(a=>a.kind!=='attack')??(kind==='attack'?pool[0]:null);
   if(!disposable)return;
   this.pings.splice(this.pings.indexOf(disposable),1);
  }
  const alert={kind,x:p.x,y:p.y,born:now,until:now+MINIMAP_PING_MS};
  if(p.combatProtected)alert.combatProtected=true;
  this.pings.push(alert);return alert;
 }
 active(now){
  this.bind();this.pings=this.pings.filter(p=>now<p.until);
  for(const p of this.pings)if(p.kind==='attack'){
   const target=this.mission?.entity?.(p.target);
   if(target?.owner==='rai'){p.x=target.x;p.y=target.y;}
  }
  return this.pings;
 }
 attackFocus(now){
  const attacks=this.active(now).filter(p=>p.kind==='attack');if(!attacks.length)return null;
  const index=this.focusIndex%attacks.length,p=attacks[index];
  return {...p,kind:'threat',attack:true,distance:420,label:(p.building?'Постройка под огнём':'Техника под огнём')+(attacks.length>1?` · ${index+1}/${attacks.length}`:'')};
 }
 nextAttack(){this.focusIndex++;}
 observe(mission,tasks,now,options={}){
  const s=mission.state;if(s.status!=='running'){this.pings=[];this.reminders.reset();return;}
  this.bind(mission);
  const targets=objectiveTargets(mission,tasks,objectiveLocation),keys=new Set(targets.map(p=>p.key));
  this.pings=this.pings.filter(p=>!p.objectiveKey||keys.has(p.objectiveKey));
  const indicate=(p,reminder=false)=>{const ping=this.ping(p.kind,p,now);if(ping)Object.assign(ping,{objectiveKey:p.key,reminder});};
  const remember=(set,key,list)=>{set.add(key);list.push(key);};
  for(const a of s.artifacts){
   if(a.collected||!mission.inBounds(a.x,a.y)||!mission.exploredAt(a.x,a.y)||this.artifacts.has(a.id))continue;
   remember(this.artifacts,a.id,this.saved.artifacts);
   if(!this.silent){indicate({...a,kind:'artifact',key:'artifact:'+a.id});this.message('artifact','Обнаружен артефакт',now);}
  }
  for(const task of tasks){
   // Discovery already has its blue alert; do not cover it with a green one.
   if(task.done||task.id.startsWith('pickup-'))continue;
   const fresh=!this.objectives.has(task.id);
   if(fresh){remember(this.objectives,task.id,this.saved.objectives);if(!this.silent)this.message('objective','Новая цель: '+task.name,now);}
  }
  for(const p of targets)if(p.kind!=='artifact'&&!this.locations.has(p.key)){
   remember(this.locations,p.key,this.saved.locations);if(!this.silent)indicate(p);
  }
  if(Number.isFinite(mission.lastPlayerCombatAt)&&mission.lastPlayerCombatAt!==this.lastCombatAt){
   this.lastCombatAt=mission.lastPlayerCombatAt;this.combatUntil=now+MINIMAP_PING_MS;
  }
  const underAttack=this.active(now).some(p=>p.kind==='attack'),attacking=now<this.combatUntil||underAttack;
  if(attacking)this.pings=this.pings.filter(p=>!p.reminder||p.combatProtected);
  for(const p of this.reminders.update(tasks,targets,now,{...options,attacking}))indicate(p,true);
  this.silent=false;
 }
 event(event,now){
  if(event.type!=='under-attack'||!point(event))return;
  this.pings=this.pings.filter(p=>!p.reminder||p.combatProtected);
  const active=this.active(now),near=active.find(p=>p.kind==='attack'&&(event.target&&p.target===event.target||Math.hypot(p.x-event.x,p.y-event.y)<100));
  const alert=near??this.ping('attack',event,now);
  if(alert)Object.assign(alert,{x:event.x,y:event.y,target:event.target,building:event.building,until:now+MINIMAP_PING_MS});
 }
 signal(signal,chapter,now){
  if(!point(signal)||!chapter||signal.kind==='anomaly')return;
  if(this.signals.has(chapter))return;this.signals.add(chapter);
  this.ping('objective',signal,now);
 }
}
