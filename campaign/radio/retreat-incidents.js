export const RETREAT_RULES=['traffic.retreat_contact','traffic.panic_blocked','traffic.panic_escaped','damage.panic_failed'];
export function mergeRetreatLibrary(library,seed){
 const existing=new Set(library.rules.map(r=>r.id));
 for(const rule of seed.rules.filter(r=>RETREAT_RULES.includes(r.id)&&!existing.has(r.id))){
  library.rules.push(structuredClone(rule));
  for(const tier of rule.tiers)for(const graph of tier.graphs)for(const node of graph.nodes)library.phrases[node.phraseId]??=structuredClone(seed.phrases[node.phraseId]);
 }
 return library;
}
const crew=(m,id)=>{
 const p=m.state.campaign?.personnel;
 return p?.crews[id]?.memberIds.map(id=>p.soldiers[id]).find(s=>s&&!s.death);
};
export class RetreatIncidents{
 constructor(saved={}){this.records=new Map(saved.records??[]);this.serial=saved.serial??0;}
 begin(m,u){
  let r=this.records.get(u.id);
  if(!r){r={id:'panic-'+u.id+'-'+(++this.serial),started:m.state.time,revision:u.commandRevision,contacts:[],blocked:false};this.records.set(u.id,r);}
  while(this.records.size>128)this.records.delete(this.records.keys().next().value);return r;
 }
 participants(m,u,r){
  const driver=crew(m,u.id),candidates=m.nearbyUnits(u,300).filter(v=>v!==u&&v.owner==='rai'&&v.hp>0&&crew(m,v.id));
  const witness=candidates.find(v=>r.contacts.includes(v.id))??candidates.sort((a,b)=>a.id.localeCompare(b.id))[0];
  return {driver,witness,witnessCrew:witness&&crew(m,witness.id)};
 }
 contact(m,event,emit){
  const a=m.entity(event.unit),b=m.entity(event.target);if(!a||!b)return;
  const u=a.combatRetreat?a:b.combatRetreat?b:null;if(!u||u.owner!=='rai')return;
  const other=u===a?b:a,r=this.begin(m,u);r.contacts=[...new Set([...r.contacts,other.id])].slice(-8);
  const driver=crew(m,u.id),bumped=other.owner==='rai'&&crew(m,other.id);
  if(!driver)return;
  emit('traffic.retreat_contact',{incidentId:r.id+':contact',actorIds:[u.id],affectedIds:[u.id,...(bumped?[other.id]:[])],targetIds:[other.id],
   facts:{panickedId:driver.id,bumpedId:bumped?.id,urgency:1-u.hp/u.maxHp,closingSpeed:event.closingSpeed,retreating:true},flags:{confirmed:true}});
 }
 observe(m,u,emit){
  let r=this.records.get(u.id);
  if(u.hp<=0)return;
  if(!u.combatRetreat&&!u.factoryVisit){if(r)this.records.delete(u.id);return;}
  if(!r&&u.hp/u.maxHp<=.35&&u.combatRetreat&&u.combatRetreat.status!=='arrived'&&u.path?.length&&u.factoryVisit?.phase!=='inside')r=this.begin(m,u);
  if(!r)return;
  if(r.revision!==u.commandRevision){this.records.delete(u.id);return;}
  const {driver,witness,witnessCrew}=this.participants(m,u,r);
  if(!driver)return;
  if(u.factoryVisit?.phase==='inside'||u.combatRetreat?.status==='arrived'){
   this.records.delete(u.id);
   emit('traffic.panic_escaped',{incidentId:r.id,actorIds:[u.id],affectedIds:[u.id,...(witness?[witness.id]:[])],
    facts:{panickedId:driver.id,witnessId:witnessCrew?.id,escaped:true,wasBlocked:r.blocked,hadContact:r.contacts.length>0},flags:{confirmed:true}});
  }else if(!r.blocked&&(u.navigation?.waitSeconds??0)>=3&&m.state.time-r.started>=3){
   r.blocked=true;
   emit('traffic.panic_blocked',{incidentId:r.id,actorIds:[u.id],affectedIds:[u.id,...(witness?[witness.id]:[])],
    facts:{panickedId:driver.id,witnessId:witnessCrew?.id,alive:true,blocked:true},flags:{confirmed:true}});
  }
 }
 destroyed(m,u,killedIds,emit){
  if(!u)return false;
  // An explicit cancellation is not a failed retreat. Conversely, a fatal
  // hit can land between committing Retreat and the first controller sample.
  if(!u.combatRetreat&&!u.factoryVisit){this.records.delete(u.id);return false;}
  const r=this.records.get(u.id)??(u.combatRetreat&&u.combatRetreat.status!=='arrived'&&u.factoryVisit?.phase!=='inside'?this.begin(m,u):null);
  if(!r)return false;this.records.delete(u.id);
  const {witness,witnessCrew}=this.participants(m,u,r);if(!witness)return false;
  const p=m.state.campaign?.personnel,dead=killedIds.map(id=>p?.soldiers[id]).find(s=>s?.death);
  emit('damage.panic_failed',{incidentId:r.id,actorIds:[witness.id],affectedIds:[witness.id],targetIds:[u.id],
   facts:{witnessId:witnessCrew.id,destroyedIds:[u.id],killedIds,crewKnown:!!p?.crews[u.id],confirmedDeath:!!dead,casualtyGender:dead?.gender??'m',
    casualtyCallSign:dead?.callsign??p?.crews[u.id]?.designation??u.id},flags:{confirmed:true,urgent:true,hasCombat:true}});
  return true;
 }
 save(){return {records:[...this.records],serial:this.serial};}
}
