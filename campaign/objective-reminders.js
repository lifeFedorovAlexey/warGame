export const OBJECTIVE_REMINDER_MS=30000;
export const OBJECTIVE_REMINDER_MAX_MS=120000;
const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);

// Only known, unfinished locations. Static camp positions can be remembered
// through fog; no live coordinates of unseen enemies are exposed.
export function objectiveTargets(mission,tasks,location){
 const s=mission.state,active=tasks.filter(t=>!t.done),targets=[];
 const known=p=>point(p)&&mission.inBounds(p.x,p.y)&&mission.exploredAt(p.x,p.y);
 const add=(key,kind,p,taskId)=>{if(known(p))targets.push({key,kind,x:p.x,y:p.y,taskId});};
 for(const a of s.artifacts)if(!a.collected)add('artifact:'+a.id,'artifact',a);
 for(const task of active){
  if(task.id.startsWith('pickup-')||task.id==='m02.recover_technologies')continue;
  if(task.id==='security'){
   for(const camp of s.camps)if(!camp.cleared)add('camp:'+camp.id,'enemyObjective',known(camp)?camp:camp.gate,task.id);
  }else if(task.id==='m02.suppress_outposts'){
   for(const base of Object.values(s.m02?.bases??{}))if(base.discovered&&base.state!=='neutralized'){
    const p=known(base.gate)?base.gate:s.buildings.find(b=>base.structureIds?.includes(b.id)&&b.hp>0&&known(b));
    add('camp:'+base.id,'enemyObjective',p,task.id);
   }
  }else if(task.id==='m02.locate_energy_source'){
   const base=s.m02?.bases.energy_hub;if(base?.discovered&&!targets.some(p=>p.key==='camp:'+base.id))add(task.id,'objective',base.gate,task.id);
  }else if(task.id==='m03-objective'){
   const e=s.m03;
   const p=e.location==='home'&&['delivery','research'].includes(e.phase)
    ?s.buildings.find(b=>b.kind==='lab'&&b.owner==='rai'&&b.hp>0)
    :e.location==='home'||e.artifact.state==='carried'?s.transport?.site:null;
   add(task.id+':'+e.phase,'objective',p,task.id);
  }else{
   const p=location(mission,task);if(p)add(task.id+':'+p.key,'objective',p,task.id);
  }
 }
 return targets;
}

export class ObjectiveReminders{
 reset(){this.signature=null;this.last=null;this.elapsed=0;this.sinceReminder=0;this.offset=0;}
 constructor(){this.reset();}
 update(tasks,targets,now,{paused=false,attacking=false}={}){
  const signature=JSON.stringify([tasks.filter(t=>!t.done).map(t=>[t.id,t.name,t.id==='m03-objective'?null:t.progress]),targets.map(t=>t.key)]);
  const dt=this.last===null?0:Math.max(0,Math.min(1000,now-this.last));this.last=now;
  const changed=signature!==this.signature;this.signature=signature;
  if(changed)this.elapsed=0;
  if(!targets.length){this.sinceReminder=0;return [];}
  if(paused)return [];
  this.elapsed+=changed?0:dt;this.sinceReminder+=dt;
  // Progress restarts the normal delay, but cannot keep moving the hard limit.
  const overdue=this.sinceReminder>=OBJECTIVE_REMINDER_MAX_MS,combatProtected=attacking&&overdue;
  if(!overdue&&(this.elapsed<OBJECTIVE_REMINDER_MS||attacking))return [];
  this.elapsed=0;this.sinceReminder=0;
  // Rotate bounded batches if a future mission has more than sixteen goals.
  const batch=Array.from({length:Math.min(16,targets.length)},(_,i)=>({...targets[(i+this.offset)%targets.length],combatProtected}));
  this.offset=(this.offset+batch.length)%targets.length;return batch;
 }
}
