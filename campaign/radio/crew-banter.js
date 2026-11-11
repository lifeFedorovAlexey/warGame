// A quiet-channel opportunity, not a second random draw after a rare event.
export function banterCrew(m,u){
 return u.owner==='rai'&&u.hp>0&&u.hp/u.maxHp>=.4&&!u.combatRetreat&&!u.pendingOrder&&
  (!u.task||u.task.type==='move'||!!u.factoryVisit);
}
export class CrewBanter{
 constructor(saved={}){this.nextAttemptAt=saved.nextAttemptAt??0;this.serial=saved.serial??0;}
 tick(m,engine,emit){
  const now=m.state.time,interval=engine.settings.bawdyInterval??150;
  if(now<this.nextAttemptAt)return;this.nextAttemptAt=now+5;
  if(m.state.status!=='running'||engine.settings.humorLevel<=0||now-(m.state.m02?.startedAt??0)<90||
   now-(engine.state.lastBawdyAt??-Infinity)<interval||now-(engine.state.lastCombat??-Infinity)<20||
   now-(engine.state.lastLoss??-Infinity)<60||now-(engine.state.lastRemembranceAt??-Infinity)<180||
   now-engine.state.lastChannel<8||m.state.radioStory?.active)return;
  if(engine.active||engine.state.queue.some(q=>q.priority>=40||q.bawdy)||engine.state.batch.length||
   [...engine.pending.values()].some(b=>b.type==='idle.quiet'||engine.index.get(b.type)?.some(r=>r.priority>=80)))return;
  const p=m.state.campaign?.personnel,ids=m.state.units.filter(u=>banterCrew(m,u)&&
   p?.crews[u.id]?.memberIds.some(id=>p.soldiers[id]&&!p.soldiers[id].death)).map(u=>u.id);
  if(ids.length<2)return;
  emit('idle.quiet',{incidentId:'crew-banter-'+(++this.serial),affectedIds:ids,actorIds:ids,facts:{quietChannel:true},flags:{confirmed:true}});
 }
 save(){return {nextAttemptAt:this.nextAttemptAt,serial:this.serial};}
}
